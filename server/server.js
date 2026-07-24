/* 邻里集 v2 - API服务（零依赖：node:http + node:sqlite + SSE） */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { sms, wechat, realname } = require('./providers');

const PORT = +(process.env.PORT || 3399);
const WEB = path.join(__dirname, '..', 'web');
const now = () => Date.now();
const uid = () => crypto.randomBytes(16).toString('hex');

/* ---------- SSE 实时推送 ---------- */
const sseClients = new Map(); // userId -> Set<res>
function push(userId, event, data) {
  const set = sseClients.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(payload); } catch (e) {} }
}

/* ---------- 工具 ---------- */
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
const ok = (res, data) => json(res, 200, { ok: true, data });
const fail = (res, msg, code = 400) => json(res, code, { ok: false, msg });

function auth(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '') || new URL(req.url, 'http://x').searchParams.get('token');
  if (!t) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(t);
  if (!s) return null;
  return db.prepare('SELECT * FROM users WHERE id=?').get(s.user_id);
}
function makeToken(userId) {
  const token = uid();
  db.prepare('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)').run(token, userId, now());
  return token;
}
const pubUser = u => u && ({ id: u.id, nickname: u.nickname || (u.name ? u.name[0] + '**' : '邻居'),
  nameMasked: u.name ? u.name[0] + '*'.repeat(u.name.length - 1) : '',
  verified: !!u.verified, community_id: u.community_id, building: u.building, unit: u.unit, credit: u.credit });

function itemFull(i, viewer) {
  if (!i) return null;
  const owner = db.prepare('SELECT * FROM users WHERE id=?').get(i.owner_id);
  const out = { ...i, imgs: JSON.parse(i.imgs || '[]'), owner: pubUser(owner) };
  if (viewer) {
    out.isMine = i.owner_id === viewer.id;
    const offers = db.prepare('SELECT * FROM offers WHERE item_id=? ORDER BY created_at DESC').all(i.id);
    out.offerCount = offers.length;
    if (out.isMine) out.offers = offers.map(o => ({ ...o, bidder: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(o.bidder_id)) }));
    out.myOffer = offers.find(o => o.bidder_id === viewer.id) || null;
  }
  return out;
}

/* ---------- 路由表 ---------- */
const routes = [];
function route(method, pattern, handler, needAuth = true, needAdmin = false) {
  routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, needAuth, needAdmin });
}

/* ============ 认证 ============ */
route('POST', '/api/sms/send', async (req, res, b) => {
  if (!/^1\d{10}$/.test(b.phone || '')) return fail(res, '手机号格式不正确');
  const code = ('' + Math.floor(100000 + Math.random() * 900000));
  db.prepare('DELETE FROM sms_codes WHERE phone=?').run(b.phone);
  db.prepare('INSERT INTO sms_codes(phone,code,scene,expires) VALUES(?,?,?,?)').run(b.phone, code, b.scene || 'login', now() + 5 * 60e3);
  const r = await sms.send(b.phone, code, b.scene);
  ok(res, { sent: true, devCode: r.devCode }); // devCode 仅mock模式返回
}, false);

function checkSms(phone, code) {
  const r = db.prepare('SELECT * FROM sms_codes WHERE phone=? AND code=?').get(phone, code);
  if (!r || r.expires < now()) return false;
  db.prepare('DELETE FROM sms_codes WHERE phone=?').run(phone);
  return true;
}

route('POST', '/api/auth/register', (req, res, b) => {
  const { phone, code, pwd } = b;
  if (!checkSms(phone, code)) return fail(res, '验证码错误或已过期');
  const ex = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (ex) { ok(res, { token: makeToken(ex.id), needRealname: !ex.verified }); return; } // 已注册则直接登录，验证码一键打通
  if ((pwd || '').length < 6) return fail(res, '密码至少6位');
  const r = db.prepare('INSERT INTO users(phone,pwd,nickname,created_at) VALUES(?,?,?,?)').run(phone, pwd, '邻友' + phone.slice(-4), now());
  ok(res, { token: makeToken(r.lastInsertRowid), needRealname: true });
}, false);

route('POST', '/api/auth/login', (req, res, b) => {
  const { phone, pwd, code } = b;
  const u = db.prepare('SELECT * FROM users WHERE phone=?').get(phone || '');
  if (code) { // 验证码登录
    if (!checkSms(phone, code)) return fail(res, '验证码错误或已过期');
    if (!u) return fail(res, '该手机号未注册');
  } else {
    if (!u || u.pwd !== pwd) return fail(res, '手机号或密码错误');
  }
  ok(res, { token: makeToken(u.id), needRealname: !u.verified });
}, false);

route('POST', '/api/auth/wechat', async (req, res, b) => {
  const { openid, nickname } = await wechat.codeToOpenid(b.code || 'demo');
  let u = db.prepare('SELECT * FROM users WHERE wechat_openid=?').get(openid);
  if (!u) {
    const r = db.prepare('INSERT INTO users(wechat_openid,nickname,created_at) VALUES(?,?,?)').run(openid, b.nickname || nickname, now());
    u = { id: r.lastInsertRowid, verified: 0 };
  }
  ok(res, { token: makeToken(u.id), needRealname: !u.verified });
}, false);

route('GET', '/api/me', (req, res, b, u) => {
  const c = u.community_id ? db.prepare('SELECT * FROM communities WHERE id=?').get(u.community_id) : null;
  const stats = {
    pub: db.prepare('SELECT COUNT(*) c FROM items WHERE owner_id=?').get(u.id).c,
    done: db.prepare('SELECT COUNT(*) c FROM deals WHERE seller_id=? OR buyer_id=?').get(u.id, u.id).c,
    offers: db.prepare('SELECT COUNT(*) c FROM offers WHERE bidder_id=?').get(u.id).c,
  };
  const reviews = db.prepare('SELECT AVG(stars) s, COUNT(*) c FROM reviews WHERE to_id=?').get(u.id);
  ok(res, { ...u, pwd: undefined, idcard: u.idcard ? u.idcard.slice(0, 4) + '**********' + u.idcard.slice(-2) : '', community: c, stats, avgStars: reviews.s ? +reviews.s.toFixed(1) : null, reviewCount: reviews.c });
});

/* ============ 实名认证（OCR + 公安核验） ============ */
route('POST', '/api/realname/ocr', async (req, res, b) => {
  ok(res, await realname.ocr(b.image || ''));
});
route('POST', '/api/realname/verify', async (req, res, b, u) => {
  const { name, idcard, community_id, building, unit, room } = b;
  if (!name || !idcard) return fail(res, '请填写姓名与身份证号');
  if (!community_id || !building || !room) return fail(res, '请完整填写小区/楼栋/房号');
  const dup = db.prepare('SELECT id FROM users WHERE idcard=? AND id<>? AND verified=1').get(idcard, u.id);
  if (dup) return fail(res, '该身份证已被其他账号认证');
  const pv = await realname.policeVerify(name, idcard);
  db.prepare('INSERT INTO realname_logs(user_id,name,idcard,ocr_provider,police_result,passed,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(u.id, name, idcard, 'mock-ocr', pv.reason, pv.passed ? 1 : 0, now());
  if (!pv.passed) return fail(res, '实名核验未通过：' + pv.reason);
  db.prepare('UPDATE users SET name=?,idcard=?,verified=1,community_id=?,building=?,unit=?,room=? WHERE id=?')
    .run(name, idcard, +community_id, building, unit || '', room, u.id);
  ok(res, { verified: true });
});

route('GET', '/api/communities', (req, res) => {
  ok(res, db.prepare('SELECT id,name,address FROM communities ORDER BY id').all());
}, false);

/* ============ 物品 ============ */
route('GET', '/api/items', (req, res, b, u) => {
  const q = new URL(req.url, 'http://x').searchParams;
  let sql = 'SELECT * FROM items WHERE community_id=? AND status=?', args = [u.community_id, q.get('status') || 'on'];
  if (q.get('cat') && q.get('cat') !== 'all') { sql += ' AND cat=?'; args.push(q.get('cat')); }
  if (q.get('kw')) { sql += ' AND (title LIKE ? OR desc LIKE ?)'; args.push(`%${q.get('kw')}%`, `%${q.get('kw')}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  ok(res, db.prepare(sql).all(...args).map(i => itemFull(i, u)));
});
route('GET', '/api/items/mine', (req, res, b, u) => {
  ok(res, db.prepare('SELECT * FROM items WHERE owner_id=? ORDER BY created_at DESC').all(u.id).map(i => itemFull(i, u)));
});
route('GET', '/api/items/:id', (req, res, b, u, p) => {
  const i = db.prepare('SELECT * FROM items WHERE id=?').get(+p.id);
  if (!i) return fail(res, '物品不存在', 404);
  db.prepare('UPDATE items SET views=views+1 WHERE id=?').run(i.id);
  ok(res, itemFull(i, u));
});
route('POST', '/api/items', (req, res, b, u) => {
  if (!u.verified) return fail(res, '请先完成实名认证', 403);
  if (!b.title) return fail(res, '请填写标题');
  if (b.deal === 'bid' && !+b.price) return fail(res, '请填写期望价格');
  if (b.deal === 'swap' && !b.wish) return fail(res, '请填写想换的物品');
  const r = db.prepare(`INSERT INTO items(owner_id,community_id,title,cat,cond,deal,price,wish,desc,imgs,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(u.id, u.community_id, b.title, b.cat || 'other', b.cond || '九成新', b.deal || 'bid',
      +b.price || 0, b.wish || '', b.desc || '', JSON.stringify((b.imgs || []).slice(0, 4)), now());
  ok(res, { id: r.lastInsertRowid });
});
route('POST', '/api/items/:id/status', (req, res, b, u, p) => {
  const i = db.prepare('SELECT * FROM items WHERE id=?').get(+p.id);
  if (!i || i.owner_id !== u.id) return fail(res, '无权限', 403);
  if (i.status === 'done') return fail(res, '已成交物品不可修改');
  db.prepare('UPDATE items SET status=? WHERE id=?').run(b.status === 'on' ? 'on' : 'off', i.id);
  ok(res, {});
});

/* ============ 意向（出价/换物/领取） ============ */
route('POST', '/api/items/:id/offers', (req, res, b, u, p) => {
  if (!u.verified) return fail(res, '请先完成实名认证', 403);
  const i = db.prepare('SELECT * FROM items WHERE id=?').get(+p.id);
  if (!i || i.status !== 'on') return fail(res, '物品不可交易');
  if (i.owner_id === u.id) return fail(res, '不能对自己的物品出价');
  if (db.prepare("SELECT id FROM offers WHERE item_id=? AND bidder_id=? AND status='pending'").get(i.id, u.id))
    return fail(res, '你已提交过意向，请等待确认');
  if (b.type === 'bid' && !+b.amount) return fail(res, '请填写出价金额');
  if (b.type === 'swap' && !b.swap_item) return fail(res, '请填写交换物品');
  const r = db.prepare(`INSERT INTO offers(item_id,bidder_id,type,amount,swap_item,msg,pickup_point_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(i.id, u.id, b.type, +b.amount || 0, b.swap_item || '', b.msg || '', b.pickup_point_id || null, now(), now());
  push(i.owner_id, 'offer_new', { itemId: i.id, title: i.title });
  ok(res, { id: r.lastInsertRowid });
});
route('POST', '/api/offers/:id/accept', (req, res, b, u, p) => {
  const o = db.prepare('SELECT * FROM offers WHERE id=?').get(+p.id);
  const i = o && db.prepare('SELECT * FROM items WHERE id=?').get(o.item_id);
  if (!i || i.owner_id !== u.id) return fail(res, '无权限', 403);
  if (o.status !== 'pending') return fail(res, '该意向已处理');
  const pp = b.pickup_point_id || o.pickup_point_id || null;
  db.prepare("UPDATE offers SET status='accepted',updated_at=?,read_by_bidder=0,pickup_point_id=? WHERE id=?").run(now(), pp, o.id);
  db.prepare("UPDATE items SET status='done' WHERE id=?").run(i.id);
  db.prepare("UPDATE offers SET status='rejected',updated_at=?,read_by_bidder=0 WHERE item_id=? AND status='pending'").run(now(), i.id);
  const d = db.prepare('INSERT INTO deals(item_id,offer_id,seller_id,buyer_id,pickup_point_id,created_at) VALUES(?,?,?,?,?,?)')
    .run(i.id, o.id, u.id, o.bidder_id, pp, now());
  push(o.bidder_id, 'offer_update', { itemId: i.id, title: i.title, status: 'accepted' });
  ok(res, { dealId: d.lastInsertRowid });
});
route('POST', '/api/offers/:id/reject', (req, res, b, u, p) => {
  const o = db.prepare('SELECT * FROM offers WHERE id=?').get(+p.id);
  const i = o && db.prepare('SELECT * FROM items WHERE id=?').get(o.item_id);
  if (!i || i.owner_id !== u.id) return fail(res, '无权限', 403);
  db.prepare("UPDATE offers SET status='rejected',updated_at=?,read_by_bidder=0 WHERE id=?").run(now(), o.id);
  push(o.bidder_id, 'offer_update', { itemId: i.id, title: i.title, status: 'rejected' });
  ok(res, {});
});

/* ============ 通知 ============ */
route('GET', '/api/notifications', (req, res, b, u) => {
  const list = [];
  db.prepare(`SELECT o.*,i.title,i.owner_id FROM offers o JOIN items i ON i.id=o.item_id
    WHERE i.owner_id=? ORDER BY o.created_at DESC LIMIT 50`).all(u.id).forEach(o => {
    const bd = pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(o.bidder_id));
    list.push({ t: o.created_at, read: !!o.read_by_owner, kind: 'in', itemId: o.item_id, offer: o, bidder: bd });
  });
  db.prepare(`SELECT o.*,i.title FROM offers o JOIN items i ON i.id=o.item_id
    WHERE o.bidder_id=? AND o.status<>'pending' ORDER BY o.updated_at DESC LIMIT 50`).all(u.id).forEach(o => {
    list.push({ t: o.updated_at, read: !!o.read_by_bidder, kind: 'out', itemId: o.item_id, offer: o });
  });
  list.sort((a, b2) => b2.t - a.t);
  ok(res, list);
});
route('POST', '/api/notifications/read', (req, res, b, u) => {
  db.prepare('UPDATE offers SET read_by_owner=1 WHERE item_id IN (SELECT id FROM items WHERE owner_id=?)').run(u.id);
  db.prepare('UPDATE offers SET read_by_bidder=1 WHERE bidder_id=?').run(u.id);
  ok(res, {});
});

/* ============ 自提点 ============ */
route('GET', '/api/pickup-points', (req, res, b, u) => {
  const cid = new URL(req.url, 'http://x').searchParams.get('community_id') || u.community_id;
  ok(res, db.prepare('SELECT * FROM pickup_points WHERE community_id=?').all(+cid));
});

route('GET', '/api/public/pickup-points', (req, res) => {
  const cid = +(new URL(req.url, 'http://x').searchParams.get('community_id') || 1);
  const c = db.prepare('SELECT * FROM communities WHERE id=?').get(cid);
  ok(res, { community: c, points: db.prepare('SELECT * FROM pickup_points WHERE community_id=?').all(cid) });
}, false);

/* ============ IM 私信 ============ */
route('GET', '/api/conversations', (req, res, b, u) => {
  const rows = db.prepare(`SELECT * FROM messages WHERE from_id=? OR to_id=? ORDER BY created_at DESC`).all(u.id, u.id);
  const map = new Map();
  rows.forEach(m => {
    const peer = m.from_id === u.id ? m.to_id : m.from_id;
    if (!map.has(peer)) map.set(peer, { peer: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(peer)), last: m, unread: 0 });
    if (m.to_id === u.id && !m.is_read) map.get(peer).unread++;
  });
  ok(res, [...map.values()]);
});
route('GET', '/api/messages', (req, res, b, u) => {
  const peer = +new URL(req.url, 'http://x').searchParams.get('peer');
  db.prepare('UPDATE messages SET is_read=1 WHERE from_id=? AND to_id=?').run(peer, u.id);
  const rows = db.prepare(`SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
    ORDER BY created_at ASC LIMIT 200`).all(u.id, peer, peer, u.id);
  ok(res, { peer: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(peer)), messages: rows });
});
route('POST', '/api/messages', (req, res, b, u) => {
  if (!b.to || !b.content) return fail(res, '参数缺失');
  const r = db.prepare('INSERT INTO messages(from_id,to_id,item_id,content,created_at) VALUES(?,?,?,?,?)')
    .run(u.id, +b.to, b.item_id || null, ('' + b.content).slice(0, 500), now());
  const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(r.lastInsertRowid);
  push(+b.to, 'message_new', { from: pubUser(u), msg });
  ok(res, msg);
});

/* ============ 评价体系 ============ */
route('GET', '/api/deals', (req, res, b, u) => {
  const rows = db.prepare(`SELECT d.*,i.title,i.deal AS deal_type FROM deals d JOIN items i ON i.id=d.item_id
    WHERE d.seller_id=? OR d.buyer_id=? ORDER BY d.created_at DESC`).all(u.id, u.id);
  ok(res, rows.map(d => {
    const peerId = d.seller_id === u.id ? d.buyer_id : d.seller_id;
    return { ...d, role: d.seller_id === u.id ? 'seller' : 'buyer',
      peer: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(peerId)),
      pickup: d.pickup_point_id ? db.prepare('SELECT * FROM pickup_points WHERE id=?').get(d.pickup_point_id) : null,
      myReview: db.prepare('SELECT * FROM reviews WHERE deal_id=? AND from_id=?').get(d.id, u.id) || null,
      peerReview: db.prepare('SELECT * FROM reviews WHERE deal_id=? AND to_id=?').get(d.id, u.id) || null };
  }));
});
route('POST', '/api/deals/:id/review', (req, res, b, u, p) => {
  const d = db.prepare('SELECT * FROM deals WHERE id=?').get(+p.id);
  if (!d || (d.seller_id !== u.id && d.buyer_id !== u.id)) return fail(res, '无权限', 403);
  if (db.prepare('SELECT id FROM reviews WHERE deal_id=? AND from_id=?').get(d.id, u.id)) return fail(res, '已评价过');
  const stars = Math.min(5, Math.max(1, +b.stars || 5));
  const toId = d.seller_id === u.id ? d.buyer_id : d.seller_id;
  db.prepare('INSERT INTO reviews(deal_id,from_id,to_id,stars,tags,comment,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(d.id, u.id, toId, stars, JSON.stringify(b.tags || []), b.comment || '', now());
  const delta = stars >= 5 ? 1 : stars >= 4 ? 0 : stars >= 3 ? -1 : -3; // 信用分规则
  db.prepare('UPDATE users SET credit=MIN(100,MAX(0,credit+?)) WHERE id=?').run(delta, toId);
  push(toId, 'review_new', { dealId: d.id, stars });
  ok(res, {});
});
route('GET', '/api/users/:id/reviews', (req, res, b, u, p) => {
  const rows = db.prepare('SELECT * FROM reviews WHERE to_id=? ORDER BY created_at DESC LIMIT 50').all(+p.id);
  ok(res, rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'), from: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(r.from_id)) })));
});

/* ============ 管理后台（多小区） ============ */
const admin = h => (req, res, b, u, p) => { if (u.role !== 'admin') return fail(res, '需要管理员权限', 403); h(req, res, b, u, p); };
route('POST', '/api/admin/login', (req, res, b) => {
  const u = db.prepare("SELECT * FROM users WHERE phone=? AND role='admin'").get(b.account || '');
  if (!u || u.pwd !== b.pwd) return fail(res, '账号或密码错误');
  ok(res, { token: makeToken(u.id) });
}, false);
route('GET', '/api/admin/stats', admin((req, res) => {
  const c1 = s => db.prepare(s).get().c;
  ok(res, {
    communities: c1('SELECT COUNT(*) c FROM communities'),
    users: c1("SELECT COUNT(*) c FROM users WHERE role='user'"),
    verified: c1('SELECT COUNT(*) c FROM users WHERE verified=1 AND role=\'user\''),
    items: c1('SELECT COUNT(*) c FROM items'),
    onSale: c1("SELECT COUNT(*) c FROM items WHERE status='on'"),
    deals: c1('SELECT COUNT(*) c FROM deals'),
    reviews: c1('SELECT COUNT(*) c FROM reviews'),
    msgs: c1('SELECT COUNT(*) c FROM messages'),
    byCommunity: db.prepare(`SELECT c.id,c.name,
      (SELECT COUNT(*) FROM users u WHERE u.community_id=c.id) users,
      (SELECT COUNT(*) FROM items i WHERE i.community_id=c.id) items,
      (SELECT COUNT(*) FROM deals d JOIN items i2 ON i2.id=d.item_id WHERE i2.community_id=c.id) deals
      FROM communities c ORDER BY c.id`).all(),
  });
}));
route('GET', '/api/admin/communities', admin((req, res) => ok(res, db.prepare('SELECT * FROM communities ORDER BY id').all())));
route('POST', '/api/admin/communities', admin((req, res, b) => {
  if (!b.name) return fail(res, '请填写小区名称');
  const r = db.prepare('INSERT INTO communities(name,address,lat,lng,created_at) VALUES(?,?,?,?,?)')
    .run(b.name, b.address || '', +b.lat || null, +b.lng || null, now());
  ok(res, { id: r.lastInsertRowid });
}));
route('GET', '/api/admin/users', admin((req, res) => {
  ok(res, db.prepare(`SELECT u.id,u.phone,u.nickname,u.name,u.verified,u.credit,u.building,u.unit,u.room,u.created_at,c.name community
    FROM users u LEFT JOIN communities c ON c.id=u.community_id WHERE u.role='user' ORDER BY u.id DESC`).all());
}));
route('POST', '/api/admin/users/:id/credit', admin((req, res, b, u, p) => {
  db.prepare('UPDATE users SET credit=MIN(100,MAX(0,credit+?)) WHERE id=?').run(+b.delta || 0, +p.id);
  ok(res, {});
}));
route('GET', '/api/admin/items', admin((req, res) => {
  ok(res, db.prepare(`SELECT i.*,u.name owner_name,c.name community FROM items i
    LEFT JOIN users u ON u.id=i.owner_id LEFT JOIN communities c ON c.id=i.community_id
    ORDER BY i.created_at DESC LIMIT 200`).all().map(i => ({ ...i, imgs: JSON.parse(i.imgs || '[]') })));
}));
route('POST', '/api/admin/items/:id/off', admin((req, res, b, u, p) => {
  db.prepare("UPDATE items SET status='off' WHERE id=?").run(+p.id); ok(res, {});
}));
route('GET', '/api/admin/pickup-points', admin((req, res) => {
  ok(res, db.prepare(`SELECT p.*,c.name community FROM pickup_points p LEFT JOIN communities c ON c.id=p.community_id ORDER BY p.community_id`).all());
}));
route('POST', '/api/admin/pickup-points', admin((req, res, b) => {
  if (!b.community_id || !b.name) return fail(res, '参数缺失');
  const r = db.prepare('INSERT INTO pickup_points(community_id,name,descr,lat,lng,created_at) VALUES(?,?,?,?,?,?)')
    .run(+b.community_id, b.name, b.descr || '', +b.lat || null, +b.lng || null, now());
  ok(res, { id: r.lastInsertRowid });
}));
route('POST', '/api/admin/pickup-points/:id/delete', admin((req, res, b, u, p) => {
  db.prepare('DELETE FROM pickup_points WHERE id=?').run(+p.id); ok(res, {});
}));
route('GET', '/api/admin/realname-logs', admin((req, res) => {
  ok(res, db.prepare('SELECT * FROM realname_logs ORDER BY created_at DESC LIMIT 100').all()
    .map(l => ({ ...l, idcard: l.idcard.slice(0, 4) + '**********' + l.idcard.slice(-2) })));
}));
route('GET', '/api/admin/reviews', admin((req, res) => {
  ok(res, db.prepare(`SELECT r.*,uf.name from_name,ut.name to_name FROM reviews r
    LEFT JOIN users uf ON uf.id=r.from_id LEFT JOIN users ut ON ut.id=r.to_id
    ORDER BY r.created_at DESC LIMIT 100`).all());
}));

/* ---------- HTTP 服务 ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  /* SSE */
  if (url.pathname === '/api/events') {
    const u = auth(req);
    if (!u) return fail(res, '未登录', 401);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('event: hello\ndata: {}\n\n');
    if (!sseClients.has(u.id)) sseClients.set(u.id, new Set());
    sseClients.get(u.id).add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(ping); sseClients.get(u.id)?.delete(res); });
    return;
  }

  /* API */
  if (url.pathname.startsWith('/api/')) {
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) { chunks.push(c); if (Buffer.concat(chunks).length > 8e6) { return fail(res, '请求体过大', 413); } }
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return fail(res, 'JSON格式错误'); }
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      let u = null;
      if (r.needAuth) { u = auth(req); if (!u) return fail(res, '请先登录', 401); }
      try { return await r.handler(req, res, body, u, m.groups || {}); }
      catch (e) { console.error(e); return fail(res, '服务异常：' + e.message, 500); }
    }
    return fail(res, '接口不存在', 404);
  }

  /* 静态文件 */
  let fp = path.join(WEB, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fp.startsWith(WEB)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(WEB, 'index.html');
  res.writeHead(200, { 'Content-Type': (MIME[path.extname(fp)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(fp).pipe(res);
});

server.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`邻里集服务已启动: http://${process.env.HOST || '0.0.0.0'}:${PORT}  (用户端 /  管理后台 /admin.html)`));
server.on('error', e => {
  if (e.code === 'EACCES' || e.code === 'EADDRINUSE') {
    const next = PORT + 1 + Math.floor(Math.random() * 50);
    console.error(`端口 ${PORT} 不可用(${e.code})，请改用: set PORT=${next} 后重启`);
    process.exit(1);
  }
  throw e;
});
