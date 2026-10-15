# Day 23 · 心汐 安全审计与错误处理自查清单

> 2026-10-15 ｜ 范围：硬编码密钥 · 裸报错 · 非法输入 · .gitignore 完整性 ｜ 顺序：先审计，后修复
> 截图：`docs/Day23-安全审计截图/01-全仓库密钥排查-0条.png`、`02-三类错误中文提示.png`
> 备份：无需作废任何凭据 —— 全仓库与全部历史都没有真实密钥（下面第 1、2 项）

---

## 0. 一句话结论

| 审计项 | 结论 |
|---|---|
| 硬编码密钥 | **0 条**（已跟踪文件 / 全部 51 笔历史 / 工作区 116 个文件，三处都扫了） |
| 裸报错 | **发现 11 处**，全部改掉：响应体里曾经出现过表名、字段名、SQL 错误码、英文堆栈 |
| 非法输入 | 校验本来就有、文案也是中文，但**有 1 处错误码贴错**（写入失败被标成 INVALID_INPUT） |
| .gitignore | **发现 1 个真漏项**：只忽略 `.env` / `.env.local` / `.env.*.local`，`.env.production` 这类会漏进去 |

**没有真实密钥，所以不需要作废与重新生成；该做的是把「以后可能写死」的口子先堵上（`.env.example` + 忽略规则 + 契约约束）。**

---

## 1. 今日要掌握的那句话（改前 → 改后）

**问：你把哪句裸报错改成了人话？**

答：把 `'RDB_ERR:' + JSON.stringify(r.error)` 改成了人话（它还有个兄弟 `'THROW:' + e.message`，
在 `cloudfunctions/moods|notes/index.js` 里一共出现 4 次）。

**改前** —— `GET /api/moods` 遇到数据库报错时，用户实际收到的响应体：

```json
{"ok":false,"error":{"code":"INTERNAL","message":"RDB_ERR:{\"message\":\"relation \\\"public.moods\\\" does not exist\",\"code\":\"42P01\"}"}}
```

**改后** —— 同一场景：

```json
{"ok":false,"error":{"code":"INTERNAL","message":"服务出了点小状况，请稍后再试。","requestId":"mv9q2lx19wjwd6"}}
```

差别不只是「好看」：改前那句话里带着**表名、字段名、PostgreSQL 错误码**，
等于告诉扫描者「你的库长什么样、哪一步挂了」。改后内部细节只进服务端日志，
日志行里带同一个 `requestId`，排障的人拿这个号就能对上号：

```
[error] [moods:GET] relation "public.moods" does not exist reqId=mv9q2lx19wjwd6
[log]   [req] 2026-10-15T15:57:29.845Z GET /api/moods → INTERNAL 0ms reqId=mv9q2lx19wjwd6
```

**第二句同样要记住**：前端 `GET /api/moods 失败（500）`、以及断网时浏览器原样抛出的
`Failed to fetch`，改成了「网络连接失败，请检查网络后重试。」——
状态码和英文原文都不再上屏。

---

## 2. 审计方法（可复现）

```bash
# ① 已跟踪文件（工作区 + 索引）
git grep -n -I -E "ghp_|github_pat_|AKIA|AIza|xoxb-|sk-[A-Za-z0-9]{16,}|BEGIN (RSA|OPENSSH|PRIVATE)|mongodb(\+srv)?://|postgres(ql)?://[^\"' ]*:[^\"' ]*@|(secret|passwd|password|api_?key|apikey|access_?token|private_key|client_secret)\s*[:=]\s*['\"][^'\"]{6,}" -- .
# → 无输出

# ② 全部历史提交（逐笔扫，共 51 笔）
git grep -I -l -E "<同上特征词>" $(git rev-list --all) -- | wc -l
# → 0

# ③ 工作区全部文件（含被忽略的，排除 node_modules/.git/dist）—— PowerShell
Get-ChildItem 心汐 -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\dist\\' } |
  Select-String -Pattern "<同上特征词>"
# → 扫描文件数 116，命中条数 0

# ④ 忽略规则与裸报错
git check-ignore -v .env .env.production cloudbaserc.json   # 都应有输出
git grep -n -E "RDB_ERR|THROW:|JSON\.stringify\([a-z]*\.?error\)" -- cloudfunctions
```

审计过程中另外确认了三件事：

- 本机唯一的部署配置 `cloudbaserc.json`（263 字节）里**只有环境 ID、地域、函数名**，没有 SecretId/SecretKey，
  且已被 `.gitignore` 忽略。
- 仓库里没有 `.env` 真文件（`git ls-files` 里出现的 `.env*` 只有 `.gitignore` 自己的规则行）。
- 环境 ID `psyisle-prod-…` 虽然是硬编码兜底值，但它**印在公网域名里、写在契约 §2 里**，属于公开配置，
  不是密钥；本轮仍把它改成「优先读环境变量」（见第 5 节第 6 项）。

---

## 3. 审计明细（发现 → 处置）

| # | 发现 | 位置 | 处置 |
|---|---|---|---|
| 1 | 4 处 `RDB_ERR:` / `THROW:` 裸报错（含 SQL 错误码、英文原文） | `moods/index.js`（handleGet ×2）、`notes/index.js`（handleGet ×2） | 改为统一的中文兜底 `服务出了点小状况，请稍后再试。` + `requestId`，细节进日志 |
| 2 | 4 处把库错误原文直接拼进响应 | `moods/index.js`（POST 写入失败、读回失败、PATCH、DELETE）、`notes/index.js`（同前两处） | 同上，统一归到服务端错 |
| 3 | 1 处错误码贴错：写入失败标成 `INVALID_INPUT` | `moods/index.js`、`notes/index.js` 的 POST 分支 | 归位为 `INTERNAL`（是服务端的事，不是用户填错） |
| 4 | 前端 6 处 `GET/POST/DELETE … 失败（状态码）` 自拼文案；断网时英文原文上屏 | `frontend/src/lib/api.ts`、`Daily.tsx`、`Check.tsx` | 新增 `frontend/src/lib/errors.ts` 统一三类文案，所有请求走同一个出口 |
| 5 | `.gitignore` 只忽略 `.env` / `.env.local` / `.env.*.local`，漏 `.env.production` 等 | `.gitignore` | 改为 `.env.*` + `!.env.example`；补 `*.tsbuildinfo`、`cloudbaserc.*.json`、`.tcb/`、`.cloudbase/` |
| 6 | 没有 `.env.example`（只有 `frontend/.env.example`） | 仓库根 | 新增根 `.env.example`（纯占位符，含「真值外泄时先作废再改配置」的处置顺序） |
| 7 | 没有请求日志，出问题只能靠猜 | `moods/index.js`、`notes/index.js` | 每个请求一行：时间 / 方法 / 路径 / 结果 / 耗时 / requestId（余力加练） |

改动前后**业务逻辑一行没动**：接口形态、字段、软删除行为、状态码口径都保持原样。

---

## 4. 三类错误统一口径（改完之后的实际表现）

| 类别 | 什么时候出现 | 后端返回 | 前端呈现 | 实测证据 |
|---|---|---|---|---|
| **输入错** | 提交的内容没通过检查 | `INVALID_INPUT` / `NOT_FOUND` + 说清哪一项不对、怎么改 | 后端中文原文直接上屏 | 公网 POST `{"emoji":"zzz"}` → `情绪不在允许范围内，请选择：calm / warm / tired / low / anxious / upset / empty` |
| **服务端错** | 请求到了，但对岸出了状况 | `INTERNAL` + 「服务出了点小状况，请稍后再试。」+ `requestId` | 同一句中文，不含状态码 | 后端自检 4 例（GET / PATCH / notes GET / notes POST）全部同一句，泄漏检查：无 |
| **网络错** | 请求根本没发出去 | 后端不产生这一类 | 「网络连接失败，请检查网络后重试。」 | 前端自检 `Failed to fetch` / `NetworkError…` → 同一句中文 |
| （兜底） | 未知错误 / 非 Error | —— | 「出了点问题，请稍后再试。」 | 前端自检 `Unexpected token < …` → 兜底句，英文不上屏 |

三类文案的**唯一定义点**是 `frontend/src/lib/errors.ts`；后端同一口径写在
`cloudfunctions/moods|notes/index.js` 的 `SERVER_ERROR_MESSAGE`。契约同步更新见 `api-contract.md` §3。

---

## 5. 安全自查清单（每项含验证方法）

> 用法：上线前（或每次改完接口）照下面逐条跑一遍，全部 ✅ 才算过。

| # | 检查项 | 合格标准 | 怎么验证 | 本次结果 |
|---|---|---|---|---|
| 1 | 仓库里没有密钥特征词 | 命中 0 条 | `git grep -n -I -E "ghp_\|AKIA\|sk-[A-Za-z0-9]{16,}\|BEGIN PRIVATE\|(secret\|password\|api_?key\|token)\s*[:=]\s*['\"].{6,}" -- .` | ✅ 0 |
| 2 | Git 历史里没有密钥 | 命中 0 个文件 | `git grep -I -l -E "<同上>" $(git rev-list --all) -- \| wc -l` | ✅ 0（51 笔逐笔扫） |
| 3 | `.env` 不存在于仓库且被忽略 | `check-ignore` 有输出；`ls-files` 里没有真 `.env` | `git check-ignore -v .env .env.production` + `git ls-files -- '*.env' '.env*'` | ✅ |
| 4 | `.env.example` 入库、里面没有真值 | 模板可被 add；内容全是占位符 | `git check-ignore -q .env.example; echo $?` → **1**；再读一遍文件确认无真值 | ✅ |
| 5 | 部署配置与凭据文件不入库 | 0 个被跟踪 | `git ls-files -- '*.pem' '*.key' '*.p12' 'secrets.*' 'credentials*.json' 'cloudbaserc.json' \| wc -l` → 0 | ✅ 0 |
| 6 | 敏感配置走环境变量 | 代码里没有密钥；环境相关值优先读 `process.env` | `git grep -n "process.env" -- cloudfunctions`；对照仓库根 `.env.example` 的变量名 | ✅ 只有 `TCB_ENV`（环境 ID，公开配置） |
| 7 | 响应体不含内部细节 | 无表名 / 字段名 / SQL / 英文堆栈 / 状态码 | 后端自检脚本喂假库错误，断言响应串里不含 `does not exist`、`42P01`、`permission denied`、`SSL`、`RDB_ERR`、`THROW` | ✅ 7/7 无泄漏 |
| 8 | 三类错误都有中文提示 | 三类各一句中文；无英文原文 | 后端：`node backend-check.cjs`（喂假库错误）；前端：`node --experimental-strip-types` 跑 `errors.ts` 自检 | ✅ 后端 7 例 / 前端 9 例 |
| 9 | 前端错误文案只有一个出处 | 页面里不自己拼文案 | `git grep -n "失败（\|Failed to fetch" -- frontend/src` → 只应出现在 `errors.ts` 的注释里 | ✅ |
| 10 | 非法输入在接口层被拦且有中文原因 | 非法值返回中文 + `INVALID_INPUT` | 公网：`curl -s -X POST <base>/api/moods -H "Content-Type: application/json" -d '{"emoji":"zzz"}'`；`…/api/notes -d '{"text":""}'` | ✅ 两句中文 |
| 11 | 依赖与构建产物不入库 | 0 个被跟踪 | `git ls-files -- '*node_modules*' \| wc -l`；`git ls-files -- '*dist/*' \| wc -l` | ✅ 0 / 0 |
| 12 | 提交前跑一遍「入库红线」（`AGENTS.md` §8） | 无 `.env` / 令牌 / 数据库凭据进 diff | `git diff --cached` 里搜 `token`、`secret`、`password`、`postgres://`；确认 `.workbuddy/hdr.txt` 之类的凭据文件不在改动里 | ✅ |
| 13 | 真值外泄的处置顺序正确 | **先作废重生成，再改配置** | 演练：确认 `.env.example` 顶部写了这条顺序（只删代码 = 泄露的凭据仍然有效） | ✅ 已写入 |

---

## 6. 改动文件清单（标注属于哪天的任务）

| 文件 | 改了什么 | 属于哪天的任务 |
|---|---|---|
| `cloudfunctions/moods/index.js` | 4 处裸报错改中文；写入失败错误码归位；加 `requestId` / `serverError` / 请求日志 | **Day 23** |
| `cloudfunctions/notes/index.js` | 同上（2 处裸报错 + 1 处错误码归位 + 日志） | **Day 23** |
| `cloudfunctions/moods/db.js` | 环境 ID 改「优先读环境变量」，补注释说明它不是密钥 | Day 23 |
| `cloudfunctions/notes/db.js` | 同上 | Day 23 |
| `frontend/src/lib/errors.ts` | **新增**：三类错误中文文案 + 类别判定 + 兜底 | Day 23 |
| `frontend/src/lib/api.ts` | 所有请求收敛到 `callApi` 出口；不再自拼「失败（状态码）」，不再上屏英文原文 | Day 23 |
| `frontend/src/pages/Daily.tsx` | 三处错误提示改走 `toUserMessage` | Day 23 |
| `frontend/src/pages/Check.tsx` | 写入失败提示改走 `toUserMessage`（原来会显示「未知错误」） | Day 23 |
| `.gitignore` | `.env.*` + `!.env.example`；补 `*.tsbuildinfo`、`cloudbaserc.*.json`、`.tcb/`、`.cloudbase/` | Day 23 |
| `.env.example` | **新增**：环境变量模板（纯占位符 + 外泄处置顺序） | Day 23 |
| `api-contract.md` | §3 补「三类错误口径」+ `requestId` 字段 + 不得回传内部细节的红线 | Day 23 |
| `docs/Day23-安全审计与自查清单.md` | **新增**：本文件 | Day 23 |
| `docs/Day23-安全审计截图/*.png` | **新增**：两张实测截图 | Day 23 |

**明确没做的事（今天不做）**：不加异常处理框架、不动业务逻辑、不加 notes 的 DELETE 接口（属 Day 22 降级的可选项，留到有余力时补）。

---

## 7. 遗留 / 风险 / 待办

| # | 事项 | 说明 | 建议 |
|---|---|---|---|
| 1 | **后端改动尚未部署到云端** | 改了 `moods` / `notes` 两个云函数，但**没执行 `tcb fn deploy`**（部署属对外动作，按规则先报备）。当前公网接口跑的仍是旧代码，裸报错问题在线上还没消失 | 你说一句「可以部署」，我就发（记得加 `--force`，非 TTY 环境不加会卡住） |
| 2 | 检查台 `/check` 无鉴权 | Day 21 就登记过：接登录后要加权限或下线 | 接登录时一起收 |
| 3 | RLS 未恢复 + `anon` 写授权未收回 | Day 18 的演示期临时授权（`grant insert, update on public.moods to anon`）仍在 | 接登录时收回（这条是上线前必须收的） |
| 4 | 请求日志只在云函数日志里 | 没有集中查询与告警，出问题要人肉翻 | 后续有余力再考虑 |
| 5 | 演示视频未录 | Day 21 起就登记着 | 交付前补 |

**本轮的诚实边界**：这次证明的是「代码与仓库层面没有密钥、错误提示已统一」。
它**不能**证明云端控制台侧的权限配置是安全的 —— RLS、`anon` 授权、环境变量注入这些
属于控制台配置，需要单独对照检查（第 3 条已登记）。
