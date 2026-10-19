# 心汐 · 微信小程序（原生）

心汐的**第二个客户端**。后端复用现有的 CloudBase HTTP API（`/api/moods`、`/api/notes`、…），不另起后端。

目前只有一页：**日常管家 · 心情打卡**，用来证明「小程序 → 现有 API」这条链路跑得通。

---

## 怎么跑起来（微信开发者工具）

1. 打开 **微信开发者工具** → 导入项目 → 目录选本 `miniprogram/` 文件夹。
2. **AppID**：选「测试号」（或填你自己的小程序 AppID）。`project.config.json` 里默认是 `touristappid`，导入时可改。
3. **合法域名**：小程序要求所有 `wx.request` 的域名在「微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名」里登记；
   本地开发可在开发者工具右上角「详情 → 本地设置」勾选 **不校验合法域名 / TLS 版本 / HTTPS 证书**（本工程 `project.config.json` 已设 `urlCheck: false`）。
4. 编译运行，进「日常管家 · 心情打卡」页：选情绪 →（可选）选强度 →（可选）写一句话 → 点「记下来」。
   提交后列表刷新；下拉可刷新列表。

> 演示期后端按网关注入的身份或固定**演示身份**处理（`cloudfunctions/moods/db.js` 的 `currentOwner`），所以现在不用登录就能读写演示数据。

---

## 代码结构

```
miniprogram/
├── app.js / app.json / app.wxss      # 小程序全局（注册页面、全局样式）
├── project.config.json / sitemap.json
├── lib/
│   ├── config.js                     # API_BASE（契约 §2 基础地址）+ 情绪白名单（契约 §5.2）
│   └── api.js                        # 围绕 wx.request 的封装，走契约信封 { ok,data } / { ok:false,error }
└── pages/mood/                       # 心情打卡页（.js/.json/.wxml/.wxss 四件套）
```

- `lib/api.js` 与网页端 `frontend/src/lib/api.ts` **同构**：统一判 `ok`，业务错误直接把后端中文 `message` 上屏，不解析 message 做逻辑，不抛原文。
- 接口返回的情绪是 **id**（如 `calm`），界面要显示中文，所以在 `pages/mood/mood.js` 的 `loadMoods` 里做 id→label 映射（白名单见 `lib/config.js`，与契约 §5.2 共用同一串 id）。

---

## 鉴权（下一步，还没做）

现在能跑通是因为后端**演示期回退到固定演示身份**。等 Day 26 把登录收口做完、网关正式要求 token 后，小程序需要：

1. `wx.login()` 拿 `code`；
2. 调一个换发 token 的后端接口（或接 CloudBase 小程序 SDK 匿名登录）拿到 `accessToken`；
3. 在 `lib/api.js` 的 `wx.request` 里加请求头 `Authorization: Bearer <token>`。

改动的落点只有一个文件（`lib/api.js`），页面逻辑不用动——这正是「数据访问只在 lib 层」的好处。

---

## 与契约的关系

小程序**不新增任何接口**，只用现有接口（详见 [`../api-contract.md`](../api-contract.md)）。改接口形状先改契约，再改 `lib/api.js` 与页面。
