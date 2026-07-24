const { request } = require('../../utils/request');
const { maskName, timeAgo } = require('../../utils/util');

Page({
  data: { peer: 0, item: 0, peerName: '邻居', msgs: [], input: '' },

  onLoad(o) {
    this.setData({ peer: +o.peer, item: o.item ? +o.item : 0 });
    this.load();
    // 小程序不支持 SSE，用轮询实现 IM 实时（3s）；正式版建议接入 WebSocket
    this._t = setInterval(() => this.load(true), 3000);
  },
  onUnload() { if (this._t) clearInterval(this._t); },

  async load(silent) {
    const d = await request('/api/messages?peer=' + this.data.peer).catch(() => null);
    if (!d) return;
    this.setData({
      peerName: maskName(d.peer.name),
      msgs: (d.messages || []).map(m => ({ ...m, mine: m.from_id !== this.data.peer, time: timeAgo(m.created_at) }))
    });
    if (!silent) wx.pageScrollTo({ selector: '.bottom' });
  },

  onInput(e) { this.setData({ input: e.detail.value }); },

  async send() {
    const t = this.data.input.trim();
    if (!t) return;
    await request('/api/messages', 'POST', { to: this.data.peer, content: t, item_id: this.data.item || null }).catch(() => null);
    this.setData({ input: '' });
    this.load();
    wx.pageScrollTo({ selector: '.bottom' });
  }
});
