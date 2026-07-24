const { request } = require('../../utils/request');
const app = getApp();

Page({
  data: { name: '', idcard: '', communities: [], cid: 0, cname: '', building: '', unit: '', room: '' },

  async onLoad() {
    const list = await request('/api/communities').catch(() => []);
    this.setData({ communities: list || [] });
    app.globalData.communities = list || [];
  },
  onName(e) { this.setData({ name: e.detail.value }); },
  onId(e) { this.setData({ idcard: e.detail.value }); },
  onB(e) { this.setData({ building: e.detail.value }); },
  onU(e) { this.setData({ unit: e.detail.value }); },
  onR(e) { this.setData({ room: e.detail.value }); },
  pickCommunity(e) {
    const c = this.data.communities[e.detail.value];
    this.setData({ cid: c.id, cname: c.name });
  },
  fileToBase64(path) {
    return new Promise((resolve) => {
      wx.getFileSystemManager().readFile({
        filePath: path, encoding: 'base64',
        success: r => resolve('data:image/jpeg;base64,' + r.data), fail: () => resolve('')
      });
    });
  },
  async ocr() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
      success: async (r) => {
        const b64 = await this.fileToBase64(r.tempFiles[0].tempFilePath);
        const res = await request('/api/realname/ocr', 'POST', { image: b64 }).catch(() => null);
        if (res) { this.setData({ name: res.name || '', idcard: res.idcard || '' }); wx.showToast({ title: '已识别，请核对', icon: 'none' }); }
      }
    });
  },
  async submit() {
    const { name, idcard, cid, building, unit, room } = this.data;
    if (!name || !idcard || !cid || !building || !room) { wx.showToast({ title: '请补全实名信息', icon: 'none' }); return; }
    if (!/^\d{17}[\dXx]$/.test(idcard)) { wx.showToast({ title: '身份证号格式不正确', icon: 'none' }); return; }
    const res = await request('/api/realname/verify', 'POST', { name, idcard, community_id: cid, building, unit, room }).catch(() => null);
    if (res) { wx.showToast({ title: '实名成功', icon: 'success' }); setTimeout(() => wx.navigateBack(), 800); }
  }
});
