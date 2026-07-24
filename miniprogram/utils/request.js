const { API_BASE } = require('../config');

const TOKEN_KEY = 'll_token';

function getToken() { return wx.getStorageSync(TOKEN_KEY) || ''; }
function setToken(t) { wx.setStorageSync(TOKEN_KEY, t); }
function clearToken() { wx.removeStorageSync(TOKEN_KEY); }

// 统一请求封装：自动带 token、解析 {ok,data,msg}、401 跳登录
function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path,
      method,
      data,
      header: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
      success(res) {
        const j = res.data || {};
        if (res.statusCode === 401) {
          clearToken();
          wx.reLaunch({ url: '/pages/login/login' });
          return reject(new Error('未登录'));
        }
        if (!j.ok) {
          wx.showToast({ title: j.msg || '请求失败', icon: 'none' });
          return reject(new Error(j.msg || '请求失败'));
        }
        resolve(j.data);
      },
      fail() {
        wx.showToast({ title: '网络异常', icon: 'none' });
        reject(new Error('网络异常'));
      }
    });
  });
}

module.exports = { request, getToken, setToken, clearToken };
