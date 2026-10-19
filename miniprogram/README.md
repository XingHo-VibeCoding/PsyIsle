# 心汐 · 微信小程序（原生）

心汐的**第二个客户端**。后端复用现有的 CloudBase HTTP API（`/api/moods`、`/api/notes`、…），不另起后端。
目前有两页，同属「日常管家」：

- **心情打卡**（`pages/mood`）：选情绪 →（可选）选强度 1–5 →（可选）写附言 → 提交；列表展示。
- **小进步**（`pages/note`）：写一句今天的小事（1–200 字）→ 提交；列表展示。小进步不评分。

两页通过 `app.json` 里的**纯文字 tabBar** 并列切换。

---

## 鉴权（已接，Day 26 同架构）

后端网关已开 `enableAuth`：**每个 `/api/*` 请求必须带合法 Bearer token**，否则在到达云函数前就被网关 401 挡下。
小程序与网页端用**同一个 CloudBase JS SDK**（`@cloudbase/js-sdk`）：

1. 启动即**匿名自动登录**（零门槛，契合心理陪伴调性；以后要正式账号也只换登录方式）；
2. 取出 `accessToken`，在 `lib/api.js` 的 `wx.request` 里加 `Authorization: Bearer <token>`；
3. 网关注入身份 → 云函数按 `uid` 隔离（见 `cloudfunctions/*/db.js` 的 `currentOwner`）。

页面与接口逻辑不用感知鉴权——它全部封在 `lib/cloudbase.js` + `lib/api.js`。

---

## 怎么跑起来（微信开发者工具）

1. 打开 **微信开发者工具** → 导入项目 → 目录选本 `miniprogram/` 文件夹。
2. **AppID**：填你自己的小程序 AppID（或选「测试号」试跑；正式接 CloudBase 需要能关联环境的 AppID）。
3. **接入 CloudBase**：本项目用 `@cloudbase/js-sdk`，需先装依赖并构建
   npm：
   ```bash
   cd miniprogram
   npm install                # 安装 @cloudbase/js-sdk（package.json 已声明）
   ```
   然后在开发者工具菜单栏点 **工具 → 构建 npm**，构建成功后才能 `require('@cloudbase/js-sdk')`。
4. **填 accessKey**（publishable key，公开、可放前端，非 Secret）：
   把网页端 `frontend/.env.production` 里的 `VITE_CLOUDBASE_ACCESS_KEY` 整个值，
   写进本目录 `lib/secret.js`（已 gitignore，不入库）：
   ```js
   module.exports = { ACCESS_KEY: '粘贴你的 publishable key' }
   ```
   没有这一步 → 匿名登录拿不到 token → 请求被网关 401。
5. **合法域名**：在「微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名」登记
   `https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com`；
   本地开发可在开发者工具「详情 → 本地设置」勾选 **不校验合法域名 / TLS 版本 / HTTPS 证书**
   （本工程 `project.config.json` 已设 `urlCheck: false`）。
6. 编译运行：**心情 / 小进步**两个 tab 都能写能读。

> 演示/调试期间若想快速放行，也可在 `lib/config.js` 把 `ACCESS_KEY` 直接写成 key 字符串（不推荐进仓库）。

---

## 代码结构

```
miniprogram/
├── app.js / app.json / app.wxss      # 小程序全局（注册页面、纯文字 tabBar、全局样式）
├── project.config.json / sitemap.json
├── package.json                      # 声明 @cloudbase/js-sdk 依赖（需 构建 npm）
├── lib/
│   ├── config.js                     # ENV / API_BASE（契约 §2）+ 情绪白名单（契约 §5.2）+ ACCESS_KEY（回退 secret.js）
│   ├── secret.js                     # 本地 accessKey（gitignore，不入库）
│   ├── cloudbase.js                  # @cloudbase/js-sdk 初始化 + 匿名登录 + 取 token（Day 26 同架构）
│   └── api.js                        # 围绕 wx.request 的封装：带 token、走契约信封 { ok,data } / { ok:false,error }
└── pages/
    ├── mood/                         # 心情打卡页（.js/.json/.wxml/.wxss 四件套）
    └── note/                         # 小进步页（四件套）
```

- `lib/api.js` 与网页端 `frontend/src/lib/api.ts` **同构**：统一判 `ok`，业务错误把后端中文 `message` 上屏，不解析 message 做逻辑，不抛原文；多一层 `401` 兜底（「需要先登录才能使用」）。
- 接口返回的情绪是 **id**（如 `calm`），界面要显示中文，所以在 `pages/mood/mood.js` 的 `loadMoods` 里做 id→label 映射（白名单见 `lib/config.js`，与契约 §5.2 共用同一串 id）。

---

## 与契约的关系

小程序**不新增任何接口**，只用现有接口（详见 [`../api-contract.md`](../api-contract.md)）。
改接口形状先改契约，再改 `lib/api.js` 与页面。
