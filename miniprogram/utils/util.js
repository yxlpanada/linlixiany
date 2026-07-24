const CATS = [
  { id: 'digital', name: '数码电器', emoji: '📱' },
  { id: 'home', name: '家居日用', emoji: '🛋️' },
  { id: 'kids', name: '母婴儿童', emoji: '🧸' },
  { id: 'book', name: '图书文具', emoji: '📚' },
  { id: 'cloth', name: '服饰鞋包', emoji: '👗' },
  { id: 'kitchen', name: '厨房用品', emoji: '🍳' },
  { id: 'sport', name: '运动户外', emoji: '⚽' },
  { id: 'plant', name: '绿植花艺', emoji: '🪴' },
  { id: 'other', name: '其他', emoji: '📦' }
];
const catOf = id => CATS.find(c => c.id === id) || CATS[8];

const DEALS = [
  { id: 'bid', name: '出价认领', emoji: '💰' },
  { id: 'swap', name: '以物换物', emoji: '🔄' },
  { id: 'free', name: '免费赠送', emoji: '🎁' }
];
const dealOf = id => DEALS.find(d => d.id === id) || DEALS[0];

const CONDS = [
  { id: 'new', name: '全新' },
  { id: 'like', name: '几乎全新' },
  { id: 'good', name: '良好' },
  { id: 'used', name: '有使用痕迹' }
];
const condOf = id => CONDS.find(c => c.id === id) || CONDS[2];

function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + '分钟前';
  if (s < 86400) return Math.floor(s / 3600) + '小时前';
  return Math.floor(s / 86400) + '天前';
}
function maskName(n) { return (n && n.length > 1) ? n[0] + '*' : n; }

module.exports = { CATS, catOf, DEALS, dealOf, CONDS, condOf, timeAgo, maskName };
