const { request, setToken } = require('../../utils/request');
const app = getApp();

Page({
  data: { mode: 'code', phone: '', code: '', pwd: '', counting: 0, devCode: '' },

  switchMode(e) { this.setData({ mode: e.currentTarget.dataset.m }); },
  onPhone(e) { this.setData({ phone: e.detail.value }); },
  onCode(e) { this.setData({ code: e.detail.value }); },
  onPwd(e) { this.setData({ pwd: e.detail.value }); },

  async sendCode() {
    const { phone } = this.data;
    if (!/^1\d{10}$/.test(phone)) { wx.showToast({ title: '手机号格式不正确', icon: 'none' }); return; }
    const r = await request('/api/sms/send', 'POST', { phone, scene: 'login' }).catch(() => null);
    if (r && r.devCode) { this.setData({ devCode: r.devCode }); wx.showToast({ title: '验证码 ' + r.devCode, icon: 'none', duration: 3000 }); }
    let c = 60; this.setData({ counting: c });
    this._t = setInterval(() => { c--; if (c <= 0) { clearInterval(this._t); this.setData({ counting: 0 }); } else this.setData({ counting: c }); }, 1000);
  },

  // 验证码模式：统一走 register 接口（后端已支持已注册直接登录）
  async submit() {
    const { mode, phone, code, pwd } = this.data;
    if (!/^1\d{10}$/.test(phone)) { wx.showToast({ title: '手机号格式不正确', icon: 'none' }); return; }
    if (mode === 'code') {
      if (!code) { wx.showToast({ title: '请输入验证码', icon: 'none' }); return; }
      const res = await request('/api/auth/register', 'POST', { phone, code, pwd: pwd || '123456' }).catch(() => null);
      this.afterLogin(res);
    } else {
      if (!pwd) { wx.showToast({ title: '请输入密码', icon: 'none' }); return; }
      const res = await request('/api/auth/login', 'POST', { phone, pwd }).catch(() => null);
      this.afterLogin(res);
    }
  },

  wechatLogin() {
    wx.login({
      success: async (r) => {
        const res = await request('/api/auth/wechat', 'POST', { code: r.code, nickname: '微信邻居' }).catch(() => null);
        this.afterLogin(res);
      }
    });
  },

  afterLogin(res) {
    if (!res || !res.token) return;
    setToken(res.token);
    app.globalData.me = null;
    if (res.needRealname) wx.showToast({ title: '请先完成实名认证', icon: 'none' });
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onUnload() { if (this._t) clearInterval(this._t); }
});
