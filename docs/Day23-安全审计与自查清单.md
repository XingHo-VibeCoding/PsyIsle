# Day 23 · 心汐 安全审计与错误处理自查清单

> 2026-10-15 ｜ 范围：硬编码密钥 · 裸报错 · 非法输入 · .gitignore 完整性 ｜ 顺序：先审计，后修复
> 截图（审计当天）：`docs/Day23-安全审计截图/01-全仓库密钥排查-0条.png`、`02-三类错误中文提示.png`
> 截图（完成后检查 2026-10-16）：`docs/Day23-完成后检查截图/` 五张 —— 密钥 0 命中 / 环境变量 / 输入错 / 网络错 / 服务端错
> 备份：无需作废任何凭据 —— 全仓库与全部历史都没有真实密钥（下面第 1、2 项）
> **完成后检查的结论与修正见第 8 节**（四项检查全过；其中清单可执行性检查查出 4 项写法有问题，已重写）

---

## 0. 一句话结论

| 审计项 | 结论 |
|---|---|
| 硬编码密钥 | **0 条**（已跟踪文件 / 全部历史 / 工作区全部文件，三处都扫了。2026-10-16 复核：历史 56 笔、工作区 185 个文件，仍 0） |
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

### 4.1 三条自检脚本（已入库，随时可重跑）

```bash
# 后端：喂两个云函数「假的数据库错误」，检查响应体只有中文、没有内部细节
node scripts/check-error-messages.cjs
# → ✓ 全部通过：两类错误都只回中文，响应体无表名/字段/SQL/英文堆栈

# 前端：直接跑真实的 src/lib/errors.ts，检查三类文案与状态码边界
# （含两次真发请求：打到没人监听的端口 = 连接被拒，打到 .invalid 域名 = DNS 失败）
cd frontend && node --experimental-strip-types scripts/check-error-messages.mts
# → ✓ 全部通过：三类错误都是中文，英文原文与状态码都没有上屏

# 仓库卫生：密钥特征词 × 三处（已跟踪 / 全部历史 / 工作区全文件）+ 环境变量文件 + 不该入库的类型
node scripts/check-secrets.cjs
# → ✓ 全部通过：仓库与历史里没有密钥，环境变量与不该入库的文件也都干净
```

规格：退出码 0 = 全过，1 = 有断言没过（哪条没过会打印出来）。
以后改错误提示，先跑前两条；动 `.gitignore` / `.env.example` / 加依赖，先跑第三条。

---

## 5. 安全自查清单（每项含验证方法）

> 用法：上线前（或每次改完接口）照下面逐条跑一遍，全部 ✅ 才算过。
> 命令都放在代码块里、可以整行复制。**不要从表格里抄命令** —— 见 5.0 的教训。

### 5.0 先说一个坑：为什么命令不写在表格里

第一版这份清单把命令写在 markdown 表格的单元格里。表格里 `|` 要转义成 `\|`，
于是第 1 项的命令变成了：

```
git grep -n -I -E "ghp_\|AKIA\|sk-[A-Za-z0-9]{16,}\|…" -- .
```

在 `-E` 模式下，`\|` 是**字面竖线**，这行搜的是 `ghp_|AKIA|sk-…` 这么一串字面文本 ——
**永远 0 命中**。结论看着是对的，其实是假阴性：真写了一枚 `ghp_` 开头的令牌也搜不出来。
同理第 2 项写的 `<同上>`，照抄去跑会搜「`<同上>`」这四个字符，返回 5 条垃圾结果，
长得像「有 5 处泄漏」。

所以：**命令一律放代码块**；重复用到的特征词收敛进脚本，只定义一处。

### 5.1 一键项（第 1 / 2 / 3 / 4 / 5 / 11 项）

```bash
# 仓库根目录执行，零依赖
node scripts/check-secrets.cjs
```

退出码 0 = 全过，1 = 有项没过（哪项没过会打出来）。它一次覆盖：

- 已跟踪文件、**全部 Git 历史（逐笔）**、工作区全部文件（含被忽略的）三处搜密钥特征词；
- `.env` 系列有没有进索引 / 被跟踪，三个探针的 `git check-ignore` 判定；
- 两个 `.env.example` 在不在；
- node_modules / dist / 私钥 / `cloudbaserc.json` / `.tsbuildinfo` / 日志 / `hdr.txt` 有没有被跟踪。

期望输出末尾：`✓ 全部通过：仓库与历史里没有密钥，环境变量与不该入库的文件也都干净`

**这脚本会真的报红吗？** 会。2026-10-16 做了一次反向验证：故意写一枚假令牌
`ghp_FAKEPROBE…` + 把 `frontend/.env.production` 用 `git add -f` 强推进暂存区，
脚本报 `✗ 未通过 3 项`（已跟踪命中 1 处、工作区命中 2 处、`.env` 系列进了索引），退出码 1；
清掉之后恢复全过。验完两样东西都已删除。

### 5.2 逐项对照

| # | 检查项 | 合格标准 | 本次结果 |
|---|---|---|---|
| 1 | 仓库里没有密钥特征词 | 命中 0 条 | ✅ 0 |
| 2 | Git 历史里没有密钥 | 命中 0 个文件 | ✅ 0（**56 笔**逐笔扫） |
| 3 | `.env` 不进仓库且被忽略 | `.env` 不在索引、不被跟踪；`check-ignore` 判定为已忽略 | ✅ |
| 4 | `.env.example` 入库、里面没有真值 | 模板在仓库里；内容全是占位符 | ✅ |
| 5 | 部署配置与凭据文件不入库 | 0 个被跟踪 | ✅ 0 |
| 6 | 敏感配置走环境变量 | 代码里没有密钥；环境相关值优先读 `process.env` | ✅ 只有 `TCB_ENV`（环境 ID，公开配置） |
| 7 | 响应体不含内部细节 | 无表名 / 字段名 / SQL / 英文堆栈 / 状态码 | ✅ 7/7 无泄漏 |
| 8 | 三类错误都有中文提示 | 三类各一句中文；无英文原文 | ✅ 后端 7 例 / 前端 **13 例** + 4 条边界 |
| 9 | 前端错误文案只有一个出处 | 页面里不自己拼文案 | ✅ |
| 10 | 非法输入在接口层被拦且有中文原因 | 非法值返回中文 + `INVALID_INPUT` | ✅ 4 例中文 |
| 11 | 依赖与构建产物不入库 | 0 个被跟踪 | ✅ 0 / 0 |
| 12 | 提交前跑一遍「入库红线」（`AGENTS.md` §8） | 无 `.env` / 令牌 / 数据库凭据进 diff | ✅ |
| 13 | 真值外泄的处置顺序正确 | **先作废重生成，再改配置** | ✅ 已写入 `.env.example` 顶部 |

### 5.3 第 3 项单独跑（想看原样输出时）

```bash
git check-ignore -v .env
# 期望输出（有输出 = 已被忽略，提交不出去）：
#   .gitignore:5:.env	.env
#
# 没有任何输出 = 没被忽略，要改 .gitignore

git check-ignore -v .env.production
# 期望输出：
#   .gitignore:6:.env.*	.env.production

# 仓库里被跟踪的 env 文件 —— 期望只有两个模板
git ls-files | grep -i env
#   .env.example
#   frontend/.env.example
```

⚠️ **判据是「有没有进索引/被跟踪」，不是「磁盘上有没有这个文件」**。
本地磁盘上存在 `frontend/.env` 是正常且必需的（不然没法开发），它被 `.gitignore` 拦住就够了。

### 5.4 第 7 / 8 项（三类错误口径的回归测试）

```bash
# 后端：喂两个云函数「假的数据库错误」（里面故意塞了表名、42P01、内网 IP），
# 断言它们不出现在响应体里
node scripts/check-error-messages.cjs
# → ✓ 全部通过：两类错误都只回中文，响应体无表名/字段/SQL/英文堆栈

# 前端：直接跑真实的 src/lib/errors.ts（含两次真发请求：连接被拒 / DNS 失败）
cd frontend && node --experimental-strip-types scripts/check-error-messages.mts
# → ✓ 全部通过：三类错误都是中文，英文原文与状态码都没有上屏
```

退出码 0 = 全过，1 = 有断言没过。改错误提示先跑这两条。

### 5.5 第 9 项（前端只剩一个文案出处）

```bash
git grep -n -E "失败（|Failed to fetch|未知错误" -- frontend/src
```

期望：命中的都是**注释**，外加 `api.ts` 里那句开发模式专用的
`列表接口失败（由 ?listState=error 强制触发）`（`import.meta.env.DEV` 为 false 时整段不存在，
产品里没有这条路径）。**不要期待「零命中」** —— 那样会误判。

### 5.6 第 6 / 10 / 12 / 13 项

```bash
# 第 6 项：代码里的环境变量读取点
git grep -n "process.env" -- cloudfunctions
# 期望：只有 TCB_ENV（环境 ID，公开配置，不是密钥）；变量名对照仓库根 .env.example

# 第 10 项：公网非法输入
BASE=https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com
curl -s -X POST "$BASE/api/moods" -H "Content-Type: application/json" -d '{"emoji":"zzz"}'
# → {"ok":false,"error":{"code":"INVALID_INPUT","message":"情绪不在允许范围内，请选择：calm / warm / tired / low / anxious / upset / empty"}}
curl -s -X POST "$BASE/api/notes" -H "Content-Type: application/json" -d '{"text":""}'
# → {"ok":false,"error":{"code":"INVALID_INPUT","message":"text 不能为空：记一件今天做了的小事"}}

# 第 12 项：提交前（跑了 git add 之后、commit 之前）
git diff --cached --name-only | git grep -E "\.env$|\.env\.|hdr\.txt|\.pem|\.key|cloudbaserc"
# 期望：无输出
```

第 13 项是一次「读一遍确认」：仓库根 `.env.example` 顶部是否写着
**先去控制台作废/重新生成，再改本地配置**（只删代码 = 泄露的凭据仍然有效）。已写入。

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
| `scripts/check-error-messages.cjs` | **新增**：后端错误提示自检脚本（7 例） | Day 23 |
| `frontend/scripts/check-error-messages.mts` | **新增**：前端错误提示自检脚本（13 例 + 4 条边界） | Day 23 |
| `docs/Day23-安全审计截图/*.png` | **新增**：两张实测截图 | Day 23 |
| `scripts/check-secrets.cjs` | **新增**（2026-10-16）：一键密钥与仓库卫生自查（覆盖清单第 1/2/3/4/5/11 项） | Day 23 完成后检查 |
| `frontend/src/lib/errors.ts` | 网络错兜底补 Node 措辞（`fetch failed`）与 `cause.code`（ECONNREFUSED / ENOTFOUND 等） | Day 23 完成后检查 |
| `docs/Day23-完成后检查截图/*.png` | **新增**（2026-10-16）：五张验收截图 | Day 23 完成后检查 |

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
| 6 | 本次提交里有两笔「不是我今天的改动」 | `scripts/verify-project.mjs`、`skills/verify-project/runs/2026-10-16.md` —— 是发布前检查脚本并行跑出来的产物，被 `git add -A` 一起带进了 Day 23 的提交。**归属说明放这里，避免以后误以为它们是 Day 23 写的** | 不影响功能；下次 `git add` 只加自己动过的文件 |
| 7 | `frontend/dist` 与源码的一致性 | 今天跑过两次 `npm run build`，`dist` 会被清空重建，**子路由的 fallback 目录必须紧跟着跑 `node scripts/spa-fallback.mjs` 补回来**（今天就补了一次：9 条子路由 / 10 个入口） | 部署前固定按「build → spa-fallback → deploy」三步走 |

**本轮的诚实边界**：这次证明的是「代码与仓库层面没有密钥、错误提示已统一」。
它**不能**证明云端控制台侧的权限配置是安全的 —— RLS、`anon` 授权、环境变量注入这些
属于控制台配置，需要单独对照检查（第 3 条已登记）。

---

## 8. 完成后检查（2026-10-16）

按四条检查项重跑了一遍。**四项全过**，但过程中抓到 **1 处红线问题**和 **4 项清单写法问题**，
都已处理。截图在 `docs/Day23-完成后检查截图/`。

### 8.1 检查一：密钥搜查 —— 通过，但抓到一处

| 扫描面 | 范围 | 结果 |
|---|---|---|
| 已跟踪文件 | 118 个（排除 3 个自引用文件） | **0 命中** |
| 全部 Git 历史 | 56 笔提交，逐笔扫 | **0 命中** |
| 工作区全部文件 | 185 个，含被 `.gitignore` 忽略的 | **0 命中** |

**抓到的那一处**：`frontend/.env.production`（内容 `TCB_SECRET_KEY=sk-verifyproject000000000000fake`）
是发布前检查脚本埋的测试夹具，被 `git add -f` **强推进了暂存区**。

- 处置：`git rm --cached` 移出索引 + 删除文件；
- 查证：**从未进入任何提交（0 笔）**，远端 `origin/main` 上也没有（远端只有两个 `.env.example`）；
- 是否需要作废凭据：**不需要**。值是假的（自带 `fake` 字样），不是真实密钥；
- 为什么原来的扫描没抓到：前两次扫的是「已跟踪文件」和「历史」，它当时还没被 `git add -f`；
  这次多扫了「工作区全部文件（含被忽略的）」，才露出来。**这也说明必须扫第三面。**

不作废的依据不只是「看着像假的」：本地真跑一次连库，SDK 直接报
`TcbError: missing secretId or secretKey of tencent cloud` —— 这台机器上根本没有云 API 凭据可用。

> 教训：`.gitignore` 拦得住 `git add -A`，**拦不住 `git add -f`**。所以「别用 `-f`」是纪律，
> 而「每次都扫一遍」才是兜底。

### 8.2 检查二：环境变量 —— 通过

- `.env.example`（根 + `frontend/`）都在仓库里，内容全是占位符，无真值；
- `.env` / `.env.local` / `.env.production` 都不在索引、不被跟踪；
- `git check-ignore -v .env` → `.gitignore:5:.env	.env`（有输出 = 已被忽略）；
  `git check-ignore -v .env.production` → `.gitignore:6:.env.*	.env.production`；
- 被跟踪的 `env` 文件只有两个模板。

**一处判据澄清**：本地磁盘上**确实存在** `frontend/.env`（内容只有一行公开域名
`VITE_API_BASE=https://…service.tcloudbase.com`，不是密钥）。这是**正常且必需**的 ——
「仓库里没有 `.env`」指的是**没进索引、没被跟踪**，不是磁盘上不能有这个文件，
否则根本没法开发。写判据时要写清这一点，否则同伴会误判。

### 8.3 检查三：三类错误实测 —— 通过（三类各实测一次）

| 类别 | 怎么触发的 | 看到什么 |
|---|---|---|
| **输入错** | 打线上真实接口 4 次：情绪值不在白名单 / 正文为空 / 日期格式非法 / 强度越界 | 4 句中文，且都说清了**怎么改**（允许哪些值、格式什么样、范围多少） |
| **网络错** | **真发请求**：打到没人监听的端口（= 后端停掉）、打到解析不到的域名（= 断网） | 底层原文是英文 `fetch failed`，给用户的是「网络连接失败，请检查网络后重试。」 |
| **服务端错** | 跑仓库这份真实 `index.js`，把数据层换成会抛「表不存在」（PostgreSQL `42P01`，就是改错表名的报错）的假库 | 给用户「服务出了点小状况，请稍后再试。」+ `requestId`；表名只进服务端日志 |

顺带确认了两件事：

1. **异常不会穿出去变白屏**：让数据层直接 `throw`（不是返回 `{error}`），`handleGet` 的 `try/catch`
   接住了，`main` 正常返回信封，没有未接住的 rejection。
2. **网络错原有一处真缺口，已修**：`errors.ts` 的兜底正则原来只认浏览器的 `Failed to fetch`，
   而 Node 说的是 `fetch failed`（词序反了），`ECONNREFUSED` / `ENOTFOUND` / `ETIMEDOUT` 又藏在
   `cause.code` 里 —— 换个环境就会漏成「出了点问题，请稍后再试。」这句没有任何指向性的话。
   已补上三种环境措辞 + `cause.code` 判定，并把**真断网**写进了常驻自检脚本。

**为什么不是真的去改表名连线上库**：本地没有云 API 凭据（见 8.1 的旁证），真连一次会被 SDK
在鉴权阶段拦下，根本到不了「表不存在」这一步，改表名也触发不到。要验的是
「错误怎么被翻给用户」，不是库本身，所以用注入同样的 `42P01` 来触发同一条代码路径。
（中途试过一次真改表名，是在**临时副本**上改的，仓库文件没动；改完已还原并复查无残留。）

### 8.4 检查四：清单可执行性 —— 查出 4 项写法有问题，已重写

把清单当「别人给的文档」逐条照抄执行，发现 4 项**照抄跑不出正确结论**：

| # | 问题 | 后果 | 修法 |
|---|---|---|---|
| 1 | 命令写在 markdown 表格里，`\|` 变成字面竖线，实际搜 `ghp_\|AKIA\|…` | **永远 0 命中 = 假阴性**（真令牌也搜不出来，但看着像通过） | 命令移出表格进代码块；特征词收敛进 `scripts/check-secrets.cjs`，只定义一处 |
| 2 | 第 2 项写的是「`<同上>`」 | 照抄会搜 `<同上>` 这四个字符，返回 **5 条**垃圾结果，像「有 5 处泄漏」 | 同上，由脚本统一处理 |
| 3 | 第 9 项期望「只应出现在 `errors.ts` 注释里」 | 实际 `api.ts` 里还有一句开发模式专用的文案，照抄会**误判为不合格** | 写清期望包含这一句，并注明「不要期待零命中」 |
| 4 | 第 10 项用 `<base>` 占位符 | 同伴不知道该填什么，跑不了 | 写出真实域名 `BASE=https://psyisle-prod-…service.tcloudbase.com` |

另外把过期的数字（51 笔 → 56 笔、116 文件 → 185 文件）和截图路径都更新了。
第 3 项的判据也补了一句「是看有没有进索引，不是看磁盘上有没有文件」（见 8.2）。

**新脚本反过来验过了**：故意埋一枚假令牌 + 强推一个 `.env.production` 进暂存区，
脚本报 `✗ 未通过 3 项`、退出码 1；清理后恢复全过。验完两样都已删除（`git ls-files` 无残留）。
