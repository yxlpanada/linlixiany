const { request } = require('../../utils/request');
const { maskName, timeAgo } = require('../../utils/util');

Page({
  data: { list: [] },
  onShow() { this.load(); },
  async load() {
    const list = await request('/api/conversations').catch(() => []);
    this.setData({
      list: (list || []).map(c => ({
        ...c,
        name: maskName(c.peer.name),
        last: (c.last && c.last.content) || '',
        time: timeAgo((c.last && c.last.created_at) || Date.now()),
        unread: c.unread
      }))
    });
  },
  open(e) {
    wx.navigateTo({ url: '/pages/chat/chat?peer=' + e.currentTarget.dataset.peer + '&item=' + (e.currentTarget.dataset.item || '') });
  }
});
