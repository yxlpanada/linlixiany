const { request } = require('../../utils/request');
const { CATS, CONDS, DEALS } = require('../../utils/util');

Page({
  data: { CATS, CONDS, DEALS, title: '', catIdx: 0, condIdx: 2, deal: 'bid', price: '', want: '', desc: '', images: [], submitting: false },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onDesc(e) { this.setData({ desc: e.detail.value }); },
  onPrice(e) { this.setData({ price: e.detail.value }); },
  onWant(e) { this.setData({ want: e.detail.value }); },
  pickCat(e) { this.setData({ catIdx: e.detail.value }); },
  pickCond(e) { this.setData({ condIdx: e.detail.value }); },
  pickDeal(e) { this.setData({ deal: e.currentTarget.dataset.d }); },

  fileToBase64(path) {
    return new Promise((resolve) => {
      wx.getFileSystemManager().readFile({
        filePath: path, encoding: 'base64',
        success: r => resolve('data:image/jpeg;base64,' + r.data), fail: () => resolve('')
      });
    });
  },
  chooseImg() {
    wx.chooseMedia({
      count: 6, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: async (r) => {
        const b64s = await Promise.all(r.tempFiles.map(f => this.fileToBase64(f.tempFilePath)));
        this.setData({ images: this.data.images.concat(b64s).slice(0, 6) });
      }
    });
  },
  delImg(e) {
    const images = this.data.images.slice();
    images.splice(e.currentTarget.dataset.i, 1);
    this.setData({ images });
  },
  async submit() {
    const { title, catIdx, condIdx, deal, price, want, desc, images } = this.data;
    if (!title) { wx.showToast({ title: '请填写标题', icon: 'none' }); return; }
    if (deal === 'bid' && !price) { wx.showToast({ title: '请填写期望价格', icon: 'none' }); return; }
    if (deal === 'swap' && !want) { wx.showToast({ title: '请填写想换什么', icon: 'none' }); return; }
    this.setData({ submitting: true });
    const res = await request('/api/items', 'POST', {
      title, cat: CATS[catIdx].id, cond: CONDS[condIdx].id, deal,
      price: price ? +price : null, want, desc, images
    }).catch(() => null);
    this.setData({ submitting: false });
    if (res) { wx.showToast({ title: '发布成功', icon: 'success' }); setTimeout(() => wx.navigateBack(), 700); }
  }
});
