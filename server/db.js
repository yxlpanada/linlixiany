/* 邻里集 v2 - 数据库层 (node:sqlite) */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'linli.db'));
db.exec('PRAGMA journal_mode=WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS communities(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, address TEXT DEFAULT '',
  lat REAL, lng REAL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE, pwd TEXT, wechat_openid TEXT UNIQUE,
  nickname TEXT DEFAULT '', name TEXT DEFAULT '', idcard TEXT DEFAULT '',
  verified INTEGER DEFAULT 0,
  community_id INTEGER, building TEXT DEFAULT '', unit TEXT DEFAULT '', room TEXT DEFAULT '',
  credit INTEGER DEFAULT 100, role TEXT DEFAULT 'user',
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER, community_id INTEGER,
  title TEXT, cat TEXT, cond TEXT, deal TEXT,
  price REAL DEFAULT 0, wish TEXT DEFAULT '', desc TEXT DEFAULT '',
  imgs TEXT DEFAULT '[]', status TEXT DEFAULT 'on',
  views INTEGER DEFAULT 0, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS offers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER, bidder_id INTEGER,
  type TEXT, amount REAL DEFAULT 0, swap_item TEXT DEFAULT '', msg TEXT DEFAULT '',
  pickup_point_id INTEGER,
  status TEXT DEFAULT 'pending',
  read_by_owner INTEGER DEFAULT 0, read_by_bidder INTEGER DEFAULT 1,
  created_at INTEGER, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS deals(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER, offer_id INTEGER, seller_id INTEGER, buyer_id INTEGER,
  pickup_point_id INTEGER, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER, from_id INTEGER, to_id INTEGER,
  stars INTEGER, tags TEXT DEFAULT '[]', comment TEXT DEFAULT '',
  created_at INTEGER, UNIQUE(deal_id, from_id)
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER, to_id INTEGER, item_id INTEGER,
  content TEXT, is_read INTEGER DEFAULT 0, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS pickup_points(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER, name TEXT, descr TEXT DEFAULT '',
  lat REAL, lng REAL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS sms_codes(
  phone TEXT, code TEXT, scene TEXT, expires INTEGER
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS realname_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, name TEXT, idcard TEXT,
  ocr_provider TEXT, police_result TEXT, passed INTEGER,
  created_at INTEGER
);
`);

/* ---------- 种子数据 ---------- */
const now = Date.now();
const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (count === 0) {
  const ic = db.prepare('INSERT INTO communities(name,address,lat,lng,created_at) VALUES(?,?,?,?,?)');
  ic.run('阳光花园小区', '海淀区中关村南路88号', 39.9841, 116.3075, now);
  ic.run('翠湖名邸', '海淀区翠湖路16号', 40.0012, 116.2801, now);
  ic.run('幸福里社区', '朝阳区幸福大街5号', 39.9289, 116.4551, now);

  const ip = db.prepare('INSERT INTO pickup_points(community_id,name,descr,lat,lng,created_at) VALUES(?,?,?,?,?,?)');
  ip.run(1, '东门快递驿站', '每日 8:00-21:00 有人值守，可暂存', 39.9845, 116.3090, now);
  ip.run(1, '3栋架空层·共享角', '邻里共享置物架，扫码即取', 39.9838, 116.3068, now);
  ip.run(1, '物业服务中心', '工作日 9:00-18:00，需登记', 39.9835, 116.3080, now);
  ip.run(2, '南门岗亭', '24小时保安值守', 40.0008, 116.2795, now);

  const iu = db.prepare(`INSERT INTO users(phone,pwd,nickname,name,idcard,verified,community_id,building,unit,room,credit,role,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  iu.run('13800000001', '123456', '芳邻', '王芳', '110101198809093366', 1, 1, '3', '2', '1502', 98, 'user', now - 120 * 864e5);
  iu.run('13800000002', '123456', '强哥', '李强', '110101199203035577', 1, 1, '7', '1', '0803', 95, 'user', now - 80 * 864e5);
  iu.run('13800000003', '123456', '晨晨', '陈晨', '110101199511112244', 1, 1, '1', '3', '2201', 100, 'user', now - 30 * 864e5);
  iu.run('admin', 'admin123', '平台管理员', '管理员', '', 1, null, '', '', '', 100, 'admin', now);

  const ii = db.prepare(`INSERT INTO items(owner_id,community_id,title,cat,cond,deal,price,wish,desc,status,views,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  ii.run(1, 1, '九成新 小米空气净化器 Pro', 'digital', '九成新', 'bid', 280, '', '搬家用不上了，滤芯刚换过，除甲醛效果好，楼下自提。', 'on', 132, now - 60 * 36e5);
  ii.run(2, 1, '宜家实木婴儿床（含床垫）', 'kids', '八成新', 'swap', 0, '想换儿童滑板车或平衡车', '宝宝大了用不上，结实无异味，需自提，7栋1单元。', 'on', 89, now - 40 * 36e5);
  ii.run(3, 1, '全新未拆封 保温饭盒', 'kitchen', '全新', 'free', 0, '', '重复购买了，免费送给需要的邻居，先到先得～', 'on', 45, now - 20 * 36e5);
  ii.run(1, 1, '村上春树小说合集 8本', 'book', '九成新', 'bid', 45, '', '看完闲置，无笔记无破损，打包出。', 'on', 66, now - 10 * 36e5);
  ii.run(2, 1, '迪卡侬 折叠自行车', 'sport', '七成新', 'swap', 0, '想换跑步机或哑铃套装', '骑行几次，链条已保养，可小区内当面验车。', 'on', 174, now - 5 * 36e5);
  ii.run(3, 1, '龟背竹大盆栽 带花盆', 'plant', '九成新', 'bid', 60, '', '长太大搬不动了，叶片油亮，喜光好养。', 'on', 51, now - 2 * 36e5);
}

module.exports = db;
