const { request, clearToken } = require('../../utils/request');
const { maskName, timeAgo } = require('../../utils/util');
const app = getApp();
const DEAL_NAME = { bid: '出价', swap: '换物', free: '免费' };

Page({
  data: { me: null, mine: [], deals: [] },

  onShow() { this.load(); },

  async load() {
    const me = await request('/api/me').catch(() => null);
    app.globalData.me = me;
    const mine = await request('/api/items/mine').catch(() => []);
    const deals = await request('/api/deals').catch(() => []);
    this.setData({
      me,
      mine: (mine || []).map(i => ({ ...i, dealName: DEAL_NAME[i.deal], time: timeAgo(i.created_at), cover: (i.images && i.images[0]) || '' })),
      deals: (deals || []).map(d => ({ ...d, time: timeAgo(d.created_at) }))
    });
  },

  goRealname() { wx.navigateTo({ url: '/pages/realname/realname' }); },

  async toggle(e) {
    const id = e.currentTarget.dataset.id, st = e.currentTarget.dataset.st;
    await request('/api/items/' + id + '/status', 'POST', { status: st === 'on' ? 'off' : 'on' }).catch(() => null);
    this.load();
  },

  async review(e) {
    const id = e.currentTarget.dataset.id;
    const comment = await new Promise(res => wx.showModal({ title: '评价本次交易', editable: true, placeholderText: '说点什么…', success: rr => res(rr.confirm ? rr.content : null) }));
    if (comment === null) return;
    const stars = await new Promise(res => wx.showActionSheet({ itemList: ['1星', '2星', '3星', '4星', '5星'], success: rr => res(5 - rr.tapIndex), fail: () => res(5) }));
    await request('/api/deals/' + id + '/review', 'POST', { stars, comment: comment || '' }).catch(() => null);
    wx.showToast({ title: '评价成功', icon: 'success' }); this.load();
  },

  logout() { clearToken(); wx.reLaunch({ url: '/pages/login/login' }); }
});
