// 后端 API 基地址。
// 开发阶段：保持 http://127.0.0.1:3399 并在微信开发者工具勾选「不校验合法域名」。
// 上线阶段：改成你的公网 HTTPS 地址（必须有 SSL），并在微信公众平台 -> 开发管理 -> 服务器域名 中
// 把该域名加入 request 合法域名（以及 uploadFile/downloadFile 如用到图片）。
module.exports = {
  API_BASE: 'https://linliji.onrender.com'
};
