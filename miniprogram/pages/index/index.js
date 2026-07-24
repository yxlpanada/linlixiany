const { request } = require('../../utils/request');
const { CATS, catOf, dealOf, timeAgo } = require('../../utils/util');

Page({
  data: { kw: '', cat: 'all', cats: CATS, items: [], loading: true },

  onShow() { this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },

  async load(cb) {
    const q = this.data.cat === 'all' ? '' : '?cat=' + this.data.cat;
    const items = await request('/api/items' + q).catch(() => []);
    const list = (items || []).map(i => ({
      ...i,
      catName: catOf(i.cat).name,
      emoji: catOf(i.cat).emoji,
      dealName: dealOf(i.deal).name,
      dealEmoji: dealOf(i.deal).emoji,
      time: timeAgo(i.created_at),
      cover: (i.images && i.images[0]) || ''
    }));
    this.setData({ items: list, loading: false });
    cb && cb();
  },

  onKw(e) { this.setData({ kw: e.detail.value }); },
  doSearch() {
    const kw = this.data.kw.trim();
    if (!kw) return this.load();
    this.setData({ items: this.data.items.filter(i => (i.title + i.desc).includes(kw)) });
  },
  pickCat(e) { this.setData({ cat: e.currentTarget.dataset.c }); this.load(); },
  openDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },
  goPublish() { wx.navigateTo({ url: '/pages/publish/publish' }); }
});
