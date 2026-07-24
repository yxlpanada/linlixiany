const { getToken, request } = require('./utils/request');

App({
  globalData: {
    me: null,
    communities: []
  },
  onLaunch() {
    // 已登录则预拉取个人资料，供「我的」页与发布页使用
    if (getToken()) {
      request('/api/me').then(me => { this.globalData.me = me; })
        .catch(() => {});
      request('/api/communities').then(list => { this.globalData.communities = list; })
        .catch(() => {});
    }
  }
});
