const { request } = require('../../utils/request');
const { catOf, dealOf, condOf, timeAgo, maskName } = require('../../utils/util');
const app = getApp();
const TYPE_NAME = { bid: '出价', swap: '换物', free: '领取' };

Page({
  data: { id: 0, item: null, offers: [], isOwner: false, me: null },

  onLoad(o) { this.setData({ id: +o.id }); },
  onShow() { this.load(); },

  async load() {
    const item = await request('/api/items/' + this.data.id).catch(() => null);
    if (!item) return;
    const me = app.globalData.me || await request('/api/me').catch(() => null);
    app.globalData.me = me;
    const offers = (item.offers || []).map(x => ({
      ...x,
      typeName: TYPE_NAME[x.type] || x.type,
      line: x.type === 'bid' ? ('出价 ¥' + x.price) : x.type === 'swap' ? ('想换：' + x.want) : '免费领取',
      time: timeAgo(x.created_at),
      bidder: maskName(x.bidder_name)
    }));
    this.setData({
      item: {
        ...item, catName: catOf(item.cat).name, emoji: catOf(item.cat).emoji,
        dealName: dealOf(item.deal).name, dealEmoji: dealOf(item.deal).emoji,
        condName: condOf(item.cond).name, time: timeAgo(item.created_at),
        ownerMask: maskName(item.owner_name), cover: (item.images && item.images[0]) || ''
      },
      offers, isOwner: me && item.owner_id === me.id, me
    });
  },

  contact() { wx.navigateTo({ url: '/pages/chat/chat?peer=' + this.data.item.owner_id + '&item=' + this.data.id }); },

  inputModal(title, placeholder) {
    return new Promise((resolve) => {
      wx.showModal({ title, editable: true, placeholderText: placeholder, success: r => resolve(r.confirm ? (r.content || '') : null) });
    });
  },

  async act() {
    const item = this.data.item;
    if (item.deal === 'free') { this.send('free', null, null); return; }
    if (item.deal === 'swap') { const want = await this.inputModal('你想换什么', '如：儿童自行车'); if (want === null) return; this.send('swap', null, want); return; }
    const price = await this.inputModal('你的出价（元）', '如：50'); if (price === null) return; this.send('bid', +price);
  },

  async send(type, price, want) {
    const msg = await this.inputModal('留言（可选）', '如：周末可自提'); if (msg === null) return;
    const body = { type, msg: msg || '' };
    if (type === 'bid') body.amount = price;
    if (type === 'swap') body.swap_item = want;
    await request('/api/items/' + this.data.id + '/offers', 'POST', body).catch(() => null);
    wx.showToast({ title: '意向已发送', icon: 'success' }); this.load();
  },

  async accept(e) {
    const id = e.currentTarget.dataset.id;
    const pps = await request('/api/pickup-points').catch(() => []);
    let pid = null;
    if (pps && pps.length) {
      const names = pps.map(p => p.name);
      pid = await new Promise(res => wx.showActionSheet({ itemList: names, success: rr => res(pps[rr.tapIndex].id), fail: () => res(null) }));
    }
    await request('/api/offers/' + id + '/accept', 'POST', { pickup_point_id: pid }).catch(() => null);
    wx.showToast({ title: '已成交', icon: 'success' }); this.load();
  },

  async reject(e) {
    await request('/api/offers/' + e.currentTarget.dataset.id + '/reject', 'POST', {}).catch(() => null);
    wx.showToast({ title: '已拒绝', icon: 'none' }); this.load();
  }
});
