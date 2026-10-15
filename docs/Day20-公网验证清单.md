# Day 20 公网验证清单

> 2026-10-15 ｜ 前端从 mock 切到公网接口 + 重新部署后的逐项验证
> 公网首页：`https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com/`
> 公网接口：`https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com/api/*`

---

## 一、今天做了什么（一句话版）

前端「写一写」页（Day 17 已接线）之外，**首页门卡新增一行真实数据回放**、**新增检查台 `/check`**（健康状态 / 核心表真实数据 / 写入测试 / 最后更新时间），修复了情绪 id 直接显示成英文的问题；重新构建并上传静态托管。**后端代码一行未改**——CORS 由 CloudBase 网关的白名单机制解决，前端零 CORS 代码。

---

## 二、逐项验证清单

### 2.1 本地（部署前）

| # | 检查 | 命令 / 操作 | 预期 | 实际 |
|---|---|---|---|---|
| 1 | 类型 + 构建 | `cd frontend && npm run build` | tsc + vite 全过 | ✅ 1945 模块，无报错 |
| 2 | 代码检查 | `npm run lint` | 0 error | ✅ 0 error（warning 均为既有：Breathe.tsx 6 条 + useListData 1 条，Day 8/13 遗留） |
| 3 | 本地页面调通 | `npm run dev` → 开 `localhost:5173/daily` | 显示数据库真实数据 | ✅ 11 条心情 + 15 条小进步，情绪显示「平静/不安」而非原始 id |
| 4 | 本地首页数据行 | 开 `localhost:5173/` | 写一写门卡出现真实数据行 | ✅ 「最近一次 · 2026-10-15 平静『把窗户打开了一会儿』」 |
| 5 | 本地检查台 | 开 `localhost:5173/check` | 三块内容 + 最后更新时间 | ✅ 管道正常 / 两表计数 / 写入测试 |
| 6 | 本地写入测试 | 点「写一条测试小进步」 | 真写一条，列表跟着刷新 | ✅ 返回 `n_7ae546…`，notes 15→16，库里确认真只有 1 条测试记录 |

### 2.2 公网（部署后）

| # | 检查 | 操作 | 预期 | 实际 |
|---|---|---|---|---|
| 7 | 首页真实数据 | 开公网首页 | 页面上有数据库真实数据 | ✅ 门卡数据行（截图 1） |
| 8 | F12 请求地址 | 首页 F12 → Network | 请求打到公网接口域名 | ✅ `…service.tcloudbase.com/api/moods?limit=1`（见 §三 抓包） |
| 9 | 写一写页 | 开 `/daily` | 全量真实数据 | ✅ 11 + 17 条（截图 2） |
| 10 | 检查台 | 开 `/check` | 健康 + 核心表 + 写入入口 | ✅（截图 3） |
| 11 | 数据会跟着变 | 公网 `/check` 点写入测试 | 计数 +1、新行入列、时间跳动 | ✅ notes 16→17，`n_5678c9ce…` 入列，「数据更新于 19:40:31」 |
| 12 | 子路由直开 | 地址栏直输 `/daily`、`/check` | 200，不 404 | ✅ 均 200（spa-fallback 生效） |
| 13 | 控制台改数据刷新跟着变 | 数据库改一行 → 刷新页面 | 页面显示改后内容 | 机制同 #11（页面只经接口读库）；演示期改库走检查台写入测试或 SQL 编辑器均可 |

> **给同伴的说明**：把公网首页链接发给对方即可。第一次打开会撞上腾讯云「风险提醒」页（测试域名特有），点一次「**确定访问**」就进得去——提前告诉对方，别以为链接坏了。

---

## 三、跨域（CORS）实测记录——今天真正要掌握的那一项

**结论：CloudBase HTTP 网关是白名单制，不是 `*`，也不是无条件回显。** 前端零 CORS 代码，也不需要任何代理。

用 `curl -H "Origin: <origin>" …/api/health` 逐个 Origin 探（2026-10-15 19:0x 实测）：

| 请求 Origin | 响应 `access-control-allow-origin` | 放行？ |
|---|---|---|
| `http://localhost:5173`（Vite dev） | 回显该 Origin | ✅ |
| `http://localhost:4173`（Vite preview） | 回显该 Origin | ✅ |
| `https://psyisle-prod-…tcloudbaseapp.com`（我们的静态托管域名） | 回显该 Origin | ✅ |
| `https://another-app-12345.tcloudbaseapp.com`（别的托管子域） | **无该头** | ❌ |
| `https://evil.example.com` | **无该头** | ❌ |
| `null`（file:// 等无 Origin 场景） | **无该头** | ❌ |

**浏览器内的真实抓包**（Edge DevTools Protocol 抓 App 自己发出的请求）：

```
REQ  https://…service.tcloudbase.com/api/moods?limit=1
     Referer: https://…tcloudbaseapp.com/
RESP access-control-allow-origin: https://…tcloudbaseapp.com   ← 我们自己的域名，不是 *
     access-control-allow-credentials: true
     vary: Origin
     cache-control: no-store, no-cache, must-revalidate, max-age=0
```

**「怎么认出问题出在哪」的方法论（今天的知识点）**：

1. 页面白屏 / 列表转圈 → F12 看 Console：如果是 `CORS policy: No 'Access-Control-Allow-Origin' header…`，问题在**服务端放行名单**，不在前端代码；
2. 如果是 `Failed to fetch` / `net::ERR_…` 且 Network 里根本没有这条请求 → 请求根本没发出去（被浏览器预检拦或代码没跑到 fetch）；
3. 用 `curl -H "Origin: <你的页面地址>"` 复现：能复现就是服务端策略，和浏览器无关；不能复现看请求头差异；
4. 对照「请求地址是不是公网地址」——`/api/…` 打到了同源（页面域名）而不是接口域名，是 `VITE_API_BASE` 没配，不是跨域问题。**三类问题症状不同，先分类再动手。**

**残余风险（登记在案）**：白名单由网关维护，目前放行「localhost + 本环境托管域名」。若以后换了托管域名或绑了自定义域名，需要确认新域名也在放行范围内（联系途径：CloudBase 控制台 HTTP 访问服务配置 / 工单）。本仓库代码里没有任何 CORS 头可改——这是网关行为，改它属于后端范畴（Day 20 明确不改后端）。

---

## 四、卡点预案（按今天实际风险排序）

| 卡点 | 症状 | 定位方法 | 处理 |
|---|---|---|---|
| **跨域** | Console 报 `No 'Access-Control-Allow-Origin'`；接口在 Network 里是红色 | 按 §三 第 1–4 步；curl 带 Origin 探白名单 | 确认页面地址在白名单（localhost:5173/4173 或托管域名）；**别用 `file://` 直接开构建产物**（Origin=null，不在白名单）；不要用 `*` 自己写头（本项目也不该有自写 CORS 头） |
| **环境变量** | 页面能开但两个列表全 error；或请求打到 `页面域名/api/…` 返回 404 | `grep service.tcloudbase.com dist/assets/*.js`——bundle 里没有 = `VITE_API_BASE` 构建时没读到 | `frontend/.env` 里配 `VITE_API_BASE`（真值只在本地，`.gitignore` 已拦截）；改完必须重新 `npm run build`（Vite 是构建期内联，不是运行时读） |
| **构建报错** | `npm run build` 中途退出 | 看第一个 error（tsc 类型错 / vite 解析错） | 类型错改代码；`oxlint` 的 warning 不拦构建，不用管；`dist` 被清空是正常的，**记得构建后紧跟着跑 `node scripts/spa-fallback.mjs`**，否则子路由刷新 404 |
| **部署像没生效** | 页面还是旧的 | `curl 公网址` 看引用的 bundle hash 变没变 | CDN 有缓存：等几分钟或 `curl -H "Cache-Control: no-cache"` 验证；确认部署命令在仓库根跑过（`tcb hosting deploy frontend/dist -e psyisle-prod-d9g109suw53257aed`） |
| **写入测试没反应** | 点了按钮没动静 | F12 Network 看 POST /api/notes 的状态与响应体 | 业务错误在信封里（`{ok:false,error:{code,message}}`），HTTP 仍是 200——看响应体不要看状态码 |

---

## 五、重新部署流程（与 Day 15 相同，备查）

```
cd frontend && npm run build
cd .. && node scripts/spa-fallback.mjs
tcb hosting deploy frontend/dist -e psyisle-prod-d9g109suw53257aed --verify
```

- `--verify`：上传后逐文件比对远端与本地，本次 10 个入口全部 ✅。
- CLI 全路径：`C:\Users\24486\.workbuddy\binaries\node\workspace\node_modules\.bin\tcb.cmd`（登录态有效至 2026-11-13）。

---

## 六、密钥与硬编码自查

| 项 | 结论 |
|---|---|
| `frontend/.env`（含 `VITE_API_BASE`） | 被仓库根 `.gitignore` 拦截，`git ls-files` 无此文件 ✅ |
| 前端源码 / bundle | 无任何密钥；唯一内联的是公网接口域名（公开端点，非机密）✅ |
| `cloudbaserc.json`（含环境配置） | 被 `.gitignore` 拦截，只在本地 ✅ |
| 数据库连接串 / 密码 | 只存在于云函数侧环境与本地工具，仓库零出现 ✅ |

---

## 七、给同伴的验证消息（可复制转发）

> 帮我个忙，大概 3 分钟 🙏
>
> 我在做一个网页小东西（大学生心理陪伴，叫心汐），想请你从你手机/电脑上打开看看还顺不顺手。
>
> 打开这个链接：https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com/
>
> **第一次打开会有一个「风险提醒」页面，点「确定访问」就行**——那是平台对测试域名的提示，不是链接出错。
>
> 随便看，然后告诉我三件事：
> 1. 首页能打开吗？下面三张卡片（听你说 / 找方向 / 写一写）点进去都打得开吗？
> 2. 「写一写」页能看到一些记录吗？（那是我数据库里的真实数据）
> 3. 页面拉到最下面，点「检查台（开发验收用）」进去，能看到「管道正常」绿字和两个列表吗？
>
> 最后拍一张你屏幕上的页面发我（要交作业用）。卡住随时说，卡住不是你的问题，是我没做清楚。

---

## 八、已知边界（不是 bug）

- 检查台的写入测试会真的往数据库加一条「检查台写入测试 · 时间」记录——演示期刻意如此（要验真写）。**接登录后应给检查台加权限或下线**，已在代码注释与契约登记。
- 写入测试只测 `POST /api/notes`：`moods` 同日重复提交是覆盖（契约 §4.4 幂等），拿它做测试会抹掉当天的演示打卡。
- 首页数据行取不到时不渲染（首页不承担报错职责）；管道真出问题看 `/check`。
- 两个默认域名都是 CloudBase 测试域名，首次访问有风险提醒页（程序化请求不受影响）。
