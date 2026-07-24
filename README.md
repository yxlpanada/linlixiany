# 邻里集 · 小区闲置交换平台

基于「同小区 + 实名邻居」的闲置物品流转平台：花钱买 / 以物换物 / 免费赠送三种成交方式，
配套短信验证码、微信登录、身份证 OCR/公安接口实名、IM 私信、地图自提点、评价体系、多小区管理后台。

---

## 一、项目结构

```
linlixiany/
├─ server/                # 后端（Node + node:sqlite，零第三方依赖）
│  ├─ server.js           # REST API + SSE 实时推送 + 静态托管（端口 3399）
│  ├─ db.js               # 数据库初始化与种子数据（小区、自提点）
│  ├─ providers.js        # 短信/微信/OCR实名 服务商抽象层（dev 模拟 + env 切真实）
│  ├─ e2e.js              # 端到端自测脚本
│  └─ .env.example        # 真实服务商配置样例
├─ web/                   # H5 用户端 + 管理后台 + 合规地图
│  ├─ index.html          # 用户端 App（对接 API，可 ?api= 指定后端）
│  ├─ admin.html          # 多小区管理后台
│  └─ map.html            # 自提点实景地图（腾讯地图合规代理模式）
├─ miniprogram/           # 微信小程序（WXML/WXSS/JS，复用同一套后端 API）
│  ├─ app.js / app.json / app.wxss
│  ├─ config.js           # API base 可配置
│  ├─ utils/request.js    # wx.request 封装（带 token、轮询兜底）
│  └─ pages/              # login / index / realname / publish / detail / message / chat / mine
└─ README.md
```

## 二、本地运行

```bash
cd server
node --experimental-sqlite --no-warnings server.js
# 打开 http://127.0.0.1:3399        （用户端）
#      http://127.0.0.1:3399/admin.html （管理后台）
```

- 后端首次启动会建库并写入种子数据（小区、自提点）。
- dev 模式下：短信验证码接口返回 `devCode`（e2e 脚本直接读取，免真实短信）；
  微信登录用 `code:"demo"` 即可；身份证实名走本地校验位算法（不联网，仅格式/校验位校验）。

## 三、切换真实服务商（上线必做）

复制 `server/.env.example` 为 `server/.env` 并填写：

| 变量 | 说明 |
|---|---|
| `SMS_PROVIDER` | `dev`（默认）/ `aliyun` / `tencent` |
| `SMS_ALIYUN_*` / `SMS_TENCENT_*` | 对应服务商的 AccessKey 与签名模板 |
| `WX_APPID` / `WX_SECRET` | 微信小程序/公众号 appid、secret（微信登录 code 换 openid） |
| `REALNAME_PROVIDER` | `dev`（默认）/ `aliyun`（阿里云实人认证）/ `gov`（公安接口） |
| `REALNAME_*` | OCR + 人脸核身 + 公安比对所需密钥 |

`providers.js` 已预留所有接入点，填好 env 即可从 dev 切换到生产，无需改业务代码。

## 四、上云部署（前端 + 后端一个进程）

后端 `server.js` 已经**同进程托管 `web/` 前端**（同源，无需 `?api=`）。所以上线 = 部署这一个 Node 服务，前端页面自动跟着走。

**本机 / 内网**
```bash
cd server && node --experimental-sqlite --no-warnings server.js
# 浏览器开 http://<服务器IP>:3399  （/ 是用户端，/admin.html 是后台）
```

**方式 A：Docker（任意云主机 / CloudBase 云托管 / 阿里云 ACK 通用）**
```bash
cd server
docker build -t linliji .
docker run -d --name linliji -p 3000:3000 linliji
# 服务监听 0.0.0.0:3000，前端页面与 API 同源可达
```
`server/Dockerfile` 已就绪（基于 node:22-alpine，内置 node:sqlite）。

**方式 B：Render（海外，免费，GitHub 一键）**
项目根已附 `render.yaml`：在 Render 导入本仓库 → 服务类型 `web`、rootDir `server`、runtime `docker`，
部署后 `https://<你的服务>.onrender.com` 即可用。注意：免费版文件系统临时，**数据重启会重置**，
正式运营请换持久磁盘或 CloudBase。

**方式 C：腾讯云 CloudBase 云托管（国内，推荐）**
1. 开通云开发，拿到环境 ID，填入 `cloudbaserc.json`。
2. 直接用控制台「云托管 → 新建服务 → 使用 Dockerfile」指向 `server/`；或装 `@cloudbase/cli` 执行 `tcb framework deploy`。
3. 部署后获得公网域名，打开即是可用平台。

> 数据库：`server/linli.db`（SQLite / node:sqlite）。可用 `DB_PATH` 环境变量改路径；生产建议挂持久盘或换云数据库。
> 若前后端分离部署，前端仍支持 `?api=https://后端域名` 或注入 `window.__API_BASE__` 指定后端地址。
> 资质：微信小程序上架二手交易需企业主体 + ICP 证；H5 链接分享无此限制，适合先验证需求。

## 五、微信小程序（传播主力）

1. 下载安装「微信开发者工具」。
2. 导入项目，目录选择 `miniprogram/`，AppID 填你自己的（或用测试号）。
3. 打开 `miniprogram/config.js`，把 `API_BASE` 改成你的公网后端地址。
4. 小程序后台「开发管理 → 开发设置 → 服务器域名」里，把后端域名加入
   **request 合法域名** 与 **uploadFile 合法域名**。
5. 编译预览；真机扫码即可在微信里打开，一键分享到业主群。

小程序与 H5 共用同一套后端 API，后端基本零改动。

## 六、核心接口一览

| 功能 | 方法 & 路径 |
|---|---|
| 短信验证码 | `POST /api/sms/send {phone, scene}` |
| 注册/登录 | `POST /api/auth/register` `POST /api/auth/login` `POST /api/auth/wechat` |
| 实名认证 | `POST /api/realname/verify {name, idcard, community_id, building, unit, room}` |
| 物品列表/发布 | `GET /api/items` `POST /api/items` |
| 出价/换物/领取 | `POST /api/items/:id/offers {type, amount, swap_item, msg}` |
| 接受意向 | `POST /api/offers/:id/accept {pickup_point_id}` |
| 会话/消息 | `GET /api/conversations` `GET /api/messages?peer=` `POST /api/messages` |
| 成交评价 | `GET /api/deals` `POST /api/deals/:id/review` |
| 自提点 | `GET /api/pickup-points` `GET /api/public/pickup-points`（地图用） |
| 管理后台 | `POST /api/admin/login` + 各管理接口（`/api/admin/*`） |

## 七、数据模型

- **User**：phone, pwd, nickname, name, idcard, realname_status, community_id, building, unit, room, credit
- **Item**：owner_id, title, cat, cond, deal(bid/swap/free), price, swap_want, desc, images, status(onsale/deal/off), views
- **Offer**：item_id, from_id, type(bid/swap/free), amount, swap_item, msg, status(pending/accepted/rejected)
- **Deal**：item_id, buyer_id, seller_id, offer_id, pickup_point_id, status, review_stars, review_comment
- **PickupPoint / Community / Message / Conversation**

## 八、已知边界（dev 版）

- 身份证实名为本地校验位算法，未联网公安；上线须接 `REALNAME_PROVIDER`。
- IM 实时性：H5 用 SSE，小程序用轮询（小程序不支持 SSE）；生产建议升级 WebSocket。
- 图片以 base64 存库，仅适合 demo；生产应接对象存储（COS/OSS）。
