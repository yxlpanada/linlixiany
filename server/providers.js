/* 邻里集 v2 - 第三方服务商适配层
 * 通过环境变量 / .env 切换「演示模式(mock)」与「真实服务商」。
 * 生产接入时只需在对应 TODO 处填入真实 SDK 调用，前后端接口不变。 */
const fs = require('fs');
const path = require('path');

/* ---------- .env 加载（零依赖） ---------- */
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
}
const MODE = k => (process.env[k] || 'mock').toLowerCase(); // mock | real

/* ============ 1. 短信验证码 ============ */
/* 真实接入：腾讯云 SMS（SMS_MODE=real + 腾讯云 SecretId/Key + 签名模板ID） */
const sms = {
  async send(phone, code, scene) {
    if (MODE('SMS_MODE') === 'real') {
      // TODO: 腾讯云 SDK => tencentcloud.sms.v20210111.SendSms({...})
      // 需要 env: TC_SECRET_ID / TC_SECRET_KEY / SMS_SDK_APPID / SMS_SIGN / SMS_TEMPLATE_ID
      throw new Error('请在 server/.env 配置腾讯云短信密钥后启用 real 模式');
    }
    console.log(`[SMS-mock] 发送验证码 ${code} 到 ${phone} (场景:${scene})`);
    return { ok: true, devCode: code }; // mock 模式把验证码回传给前端演示
  }
};

/* ============ 2. 微信登录 ============ */
/* 真实接入：微信开放平台 OAuth2（WECHAT_MODE=real + AppID/AppSecret，code 换 openid） */
const wechat = {
  async codeToOpenid(code) {
    if (MODE('WECHAT_MODE') === 'real') {
      // TODO: GET https://api.weixin.qq.com/sns/oauth2/access_token?appid=..&secret=..&code=..&grant_type=authorization_code
      throw new Error('请在 server/.env 配置微信 AppID/AppSecret 后启用 real 模式');
    }
    // mock：code 即模拟身份，稳定映射到 openid
    return { openid: 'mock_openid_' + code, nickname: 'wx-user-' + code.slice(-4) };
  }
};

/* ============ 3. 身份证 OCR + 公安实名核验 ============ */
/* 真实接入：腾讯云 OCR IDCardOCR + 公安三要素核验（姓名+身份证+手机号） */
const ID_W = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2];
const ID_C = ['1','0','X','9','8','7','6','5','4','3','2'];
function validIdcard(id) {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 17; i++) s += (+id[i]) * ID_W[i];
  return ID_C[s % 11] === id[17].toUpperCase();
}
const realname = {
  /* OCR：识别身份证照片 → 姓名/身份证号 */
  async ocr(imageBase64) {
    if (MODE('OCR_MODE') === 'real') {
      // TODO: 腾讯云 OCR => IDCardOCR({ ImageBase64 })，返回 Name / IdNum
      throw new Error('请在 server/.env 配置腾讯云 OCR 密钥后启用 real 模式');
    }
    // mock：不做真实识别，前端在演示模式下允许人工确认识别结果
    return { ok: true, mock: true, name: '', idcard: '', tip: '演示模式：请人工确认识别结果' };
  },
  /* 公安核验：姓名+身份证号二要素 */
  async policeVerify(name, idcard) {
    if (MODE('POLICE_MODE') === 'real') {
      // TODO: 腾讯云/翼支付等 实名核验API => IdCardVerification({ IdCard, Name })
      throw new Error('请在 server/.env 配置公安核验接口密钥后启用 real 模式');
    }
    // mock：本地做 GB11643-1999 校验位验证，模拟公安库比对
    if (!name || name.length < 2) return { passed: false, reason: '姓名不合法' };
    if (!validIdcard(idcard)) return { passed: false, reason: '身份证号校验位不通过' };
    return { passed: true, provider: 'mock-police', reason: '二要素一致(演示)' };
  },
  validIdcard
};

module.exports = { sms, wechat, realname };
