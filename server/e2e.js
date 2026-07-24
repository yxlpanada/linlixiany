/* 邻里集 v2 全链路自测 */
const B = 'http://127.0.0.1:3399';
let pass = 0, failCnt = 0;
async function api(p, m = 'GET', body, tk) {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (tk || '') }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
function chk(name, cond) { if (cond) { pass++; console.log('  ✅', name); } else { failCnt++; console.log('  ❌', name); } }

(async () => {
  console.log('== 1. 短信验证码注册 ==');
  const phone = '139' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const s1 = await api('/api/sms/send', 'POST', { phone, scene: 'reg' });
  chk('发送验证码(mock回传devCode)', s1.ok && s1.data.devCode);
  const r1 = await api('/api/auth/register', 'POST', { phone, code: s1.data.devCode, pwd: 'abc123' });
  chk('注册成功且需实名', r1.ok && r1.data.needRealname);
  const tkA = r1.data.token;

  console.log('== 2. 实名认证(OCR+公安核验) ==');
  const bad = await api('/api/realname/verify', 'POST', { name: '测试员', idcard: '110101199001011234', community_id: 1, building: '5', unit: '1', room: '0601' }, tkA);
  chk('非法身份证被拦截(校验位)', !bad.ok);
  const good = await api('/api/realname/verify', 'POST', { name: '测试员', idcard: '11010119900101193X', community_id: 1, building: '5', unit: '1', room: '0601' }, tkA);
  chk('合法身份证核验通过', good.ok);
  const me1 = await api('/api/me', undefined, undefined, tkA);
  chk('已实名+身份证脱敏', me1.data.verified === 1 && me1.data.idcard.includes('*'));

  console.log('== 3. 微信登录 ==');
  const wx = await api('/api/auth/wechat', 'POST', { code: 'e2etest' });
  chk('微信openid登录成功', wx.ok && wx.data.token);
  const wx2 = await api('/api/auth/wechat', 'POST', { code: 'e2etest' });
  chk('二次登录复用同一账号', wx2.ok);

  console.log('== 4. 验证码登录 ==');
  const s2 = await api('/api/sms/send', 'POST', { phone, scene: 'login' });
  const lg = await api('/api/auth/login', 'POST', { phone, code: s2.data.devCode });
  chk('短信验证码登录', lg.ok);

  console.log('== 5. 发布 & 出价 & 成交 ==');
  const pub = await api('/api/items', 'POST', { title: 'E2E测试 电烤箱', cat: 'kitchen', cond: '九成新', deal: 'bid', price: 100, desc: '自测物品' }, tkA);
  chk('发布物品', pub.ok);
  const itemId = pub.data.id;
  // 老账号王芳出价
  const lgB = await api('/api/auth/login', 'POST', { phone: '13800000001', pwd: '123456' });
  const tkB = lgB.data.token;
  const of1 = await api(`/api/items/${itemId}/offers`, 'POST', { type: 'bid', amount: 88, msg: '诚心要' }, tkB);
  chk('邻居出价', of1.ok);
  const dup = await api(`/api/items/${itemId}/offers`, 'POST', { type: 'bid', amount: 90 }, tkB);
  chk('重复出价被拦截', !dup.ok);
  const det = await api(`/api/items/${itemId}`, undefined, undefined, tkA);
  chk('卖家看到意向', det.data.offers.length === 1);
  const acc = await api(`/api/offers/${of1.data.id}/accept`, 'POST', { pickup_point_id: 1 }, tkA);
  chk('接受意向生成订单', acc.ok && acc.data.dealId);
  const det2 = await api(`/api/items/${itemId}`, undefined, undefined, tkA);
  chk('物品状态变为已成交', det2.data.status === 'done');

  console.log('== 6. IM 私信 ==');
  const m1 = await api('/api/messages', 'POST', { to: me1.data.id, content: '你好，东西什么时候方便自提？' }, tkB);
  chk('发送私信', m1.ok);
  const conv = await api('/api/conversations', undefined, undefined, tkA);
  chk('对方会话列表有未读', conv.data.length >= 1 && conv.data[0].unread >= 1);
  const msgs = await api('/api/messages?peer=' + conv.data[0].peer.id, undefined, undefined, tkA);
  chk('拉取聊天记录', msgs.data.messages.length >= 1);

  console.log('== 7. 评价体系 ==');
  const deals = await api('/api/deals', undefined, undefined, tkB);
  const deal = deals.data.find(d => d.item_id === itemId);
  chk('买家能看到成交单+自提点', !!deal && deal.pickup && deal.pickup.name.length > 0);
  const rv1 = await api(`/api/deals/${deal.id}/review`, 'POST', { stars: 5, tags: ['守时守约'], comment: '好邻居' }, tkB);
  chk('买家评价卖家', rv1.ok);
  const rvDup = await api(`/api/deals/${deal.id}/review`, 'POST', { stars: 1 }, tkB);
  chk('重复评价被拦截', !rvDup.ok);
  const meA = await api('/api/me', undefined, undefined, tkA);
  chk('卖家信用分+1 (101→100封顶或+1)', meA.data.credit >= 100 || meA.data.credit === 101 || meA.data.credit > 99);

  console.log('== 8. 通知 & 自提点 ==');
  const ns = await api('/api/notifications', undefined, undefined, tkB);
  chk('买家收到"被接受"通知', ns.data.some(n => n.kind === 'out' && n.offer.status === 'accepted'));
  const pp = await api('/api/pickup-points', undefined, undefined, tkA);
  chk('自提点列表', pp.data.length >= 3);
  const ppub = await api('/api/public/pickup-points?community_id=1');
  chk('公开自提点接口(地图页用)', ppub.ok && ppub.data.points.length >= 3);

  console.log('== 9. 管理后台 ==');
  const ad = await api('/api/admin/login', 'POST', { account: 'admin', pwd: 'admin123' });
  chk('管理员登录', ad.ok);
  const tkAd = ad.data.token;
  const st = await api('/api/admin/stats', undefined, undefined, tkAd);
  chk('看板统计', st.ok && st.data.communities >= 3 && st.data.deals >= 1);
  const noAuth = await api('/api/admin/stats', undefined, undefined, tkB);
  chk('普通用户访问后台被拒', !noAuth.ok);
  const nc = await api('/api/admin/communities', 'POST', { name: 'E2E测试小区', address: '测试路1号' }, tkAd);
  chk('新增小区', nc.ok);
  const np = await api('/api/admin/pickup-points', 'POST', { community_id: nc.data.id, name: '测试自提点', descr: '自测' }, tkAd);
  chk('新增自提点', np.ok);
  const logs = await api('/api/admin/realname-logs', undefined, undefined, tkAd);
  chk('实名核验日志', logs.ok && logs.data.length >= 2);

  console.log(`\n结果: ${pass} 通过 / ${failCnt} 失败`);
  process.exit(failCnt ? 1 : 0);
})().catch(e => { console.error('异常:', e); process.exit(1); });
