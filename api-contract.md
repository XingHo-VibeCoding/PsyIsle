# 心汐 · 接口契约

> Day 15 起生效（2026-10-15 扩写）｜ Day 16 补表结构 ｜ Day 17 落地两支读接口 ｜ 前端与云端之间的**唯一**约定
> 任何接口的路径、入参、返回结构，**先写在这里，再写代码**。

---

## 1. 这份文件管什么

- **管**：云端接口对外的形态——路径、方法、请求体、响应体、错误、鉴权。
- **不管**：数据库表结构——**已另立**，唯一源是 `db/schema.sql`（Day 16 建，含建表、约束、行级权限）；页面结构见 `PRD.md` 与 `docs/设计规范.md`。
- **现状**：**7 个已实现**（`GET /api/health`、`GET /api/moods`、`GET /api/notes`、`POST /api/moods`、`POST /api/notes`、`PATCH /api/moods`、`DELETE /api/moods`，第 4 节）+ 占位接口见第 5 节；数据库**3 张表已建**（`profiles` / `moods` / `progress_notes`），`moods` 另加 `is_deleted` 软删列（Day 22）。
- 占位的意思是：**名字、路径、形状今天定下来，代码一行不写**。它是 Day 16 起建表写接口的唯一依据——先按这份文件建表，再按这份文件写接口。
- 这条约束不是形式主义：**契约是唯一一处同时约束前端和云端的东西**。改一个字段名，两边都知道要改哪里；没有契约，两边各自猜，最后对不上。

---

## 2. 通用约定

| 项 | 约定 |
|---|---|
| 基础地址 | `https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com`（环境 `psyisle-prod`，上海地域）。这是「HTTP 访问服务」的默认域名，云函数的路由挂在它下面 |
| 前端怎么拿地址 | 从 `VITE_API_BASE` 读（真值写 `frontend/.env`，**不入库**）。**代码里不写死域名**——写死了，换环境就得改代码 |
| 路径前缀 | 所有接口都在 `/api` 下 |
| 方法 | 读用 `GET`，写用 `POST`。**Day 22 起 `moods` 扩展 `PATCH`（改一条）+ `DELETE`（软删一条）**，目标 id 走查询参数 `?id=`（同一 HTTP 路由 `/api/moods`，按方法分流，见 §4.7 / §4.8）；其余接口本阶段仍只用 GET/POST——少方法，少写错的地方 |
| 编码 | UTF-8，请求体与响应体一律 JSON |
| 字段命名 | camelCase。数据库的 snake_case 只在数据层转换，**转换只允许有一个点** |
| id 形态 | 记录表的主键是**带前缀的字符串**（`m_` / `n_` + 32 位十六进制），**在库里就长这样**，接口原样透出——不在接口层拼前缀，少一处能拼错的地方。`profiles` 不对外给 id：它的主键就是登录身份 |
| 长度上限 | `nickname` 24 字 / `note` 200 字 / `text`（小进步）200 字。**数据库层也设了同值的 CHECK**，不只靠接口拦——接口漏拦一次，就是一条永远进不了页面的数据 |
| 时刻 | ISO 8601 UTC 字符串，例 `2026-10-14T15:20:00.000Z`。不用时间戳数字 |
| 「哪一天」 | `YYYY-MM-DD` 本地日期，**按东八区（+08:00）判定**。打卡、小进步、测评的日期都是这一类，与「时刻」分开表达 |
| 分页 | **游标分页**：请求带 `cursor`，响应带 `nextCursor`（`null` = 到底了）✅ Day 27 落地（§4.2/§4.3）。不用 `offset`——记录只会不断新增，翻页时 offset 会漏读和重读 |
| 鉴权 | 用户数据接口**必须带登录态**；**任何用户读不到别人的数据**。接口**一律不接受 `userId` 参数**——身份只能从登录态来，从参数来就等于谁都能冒充谁 |
| 空状态 | 「没有数据」是**成功**，不是错误：回 `200` + 空数组 / `null`。**不要用 404 表达空** |
| 错误码 | `INVALID_INPUT`(400) / `UNAUTHORIZED`(401) / `FORBIDDEN`(403) / `NOT_FOUND`(404) / `INTERNAL`(500) |

**⚠️ 一处与课程的显式偏离（已落档，不再反复）**

课程 Day 16 的建议是「不登录、不建用户表」。本项目**不采纳**——`PRD.md` §3 决策③ 已把「接受登录注册」写成显式例外，理由：社区与个性化必须有身份，且「任何用户读不到别人的数据」是安全底线，不是可选项。
**代价**：Day 16–19 的工作量比课程要求多一层（账号 + 数据隔离）。这是主动选的，不是漏了。

---

## 3. 统一信封

**业务接口**一律用这套信封。

**成功**（HTTP 200）

```json
{ "ok": true, "data": {} }
```

**失败**（HTTP 4xx / 5xx）

```json
{ "ok": false, "error": { "code": "INVALID_INPUT", "message": "给人看的短句", "requestId": "m3k9x2ab1" } }
```

- 前端只判 `ok`，不解析 `message` 做逻辑。
- `error.message` 不出现堆栈、SQL、内部路径、英文报错原文——它是给用户看的。
- `code` 用大写下划线，先定五个：`INVALID_INPUT` / `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `INTERNAL`。
- `error.requestId`（Day 23 起，**可选字段**）：只在出错时给，值与云函数日志里的 `reqId=` 一致。用处是——用户看到的是一句人话，排障的人拿这个号去日志里查完整细节。**它不参与前端逻辑，缺省不算破坏契约。**

**四类错误各说一句人话（Day 23 起硬性约定，Day 27 补第四类）**

| 类别 | 谁什么时候遇到 | 后端 | 前端 |
|---|---|---|---|
| 输入错 | 提交的内容没通过检查 | `INVALID_INPUT` / `NOT_FOUND`，message 说清哪一项不对、怎么改 | 直接把后端的中文 message 上屏 |
| 身份缺失 | 会话过期 / token 作废 / 网关没认出是谁 | `UNAUTHORIZED` + 固定短句「登录状态没取到，刷新一下页面再试。」**且不执行任何数据库查询** | 先自动清 token 缓存、重建会话重试一次；仍失败才显示这句 |
| 服务端错 | 请求到了，但对岸出了状况 | `INTERNAL` + 固定短句「服务出了点小状况，请稍后再试。」+ `requestId`；**细节只进 `console.error`，绝不回进响应** | `HTTP >= 500 / 408 / 429` 或信封 `INTERNAL` → 固定短句 |
| 网络错 | 请求根本没发出去（断网 / DNS / 被拦截） | 后端没有这一类 | `fetch` 抛错 → 「网络连接失败，请检查网络后重试。」 |

- **身份缺失为什么必须单独一类**：它是用户能自己处理的事（刷新 / 重新登录）。说成「服务出了点小状况」会让人一直等一个不会来的结果；而 `HTTP 401` 若被归进「输入错」，用户会去改文案——改一百遍也发不出去。
- **没有身份就不许有默认身份（Day 27 定死）**：服务端**禁止**在取不到 uid 时回退到任何固定 owner_id。曾经存在的共享演示身份 `000…099` 已删除——它把「谁都没身份」翻译成「大家都是同一个人」，网关鉴权一旦失效，所有访客会读写同一个数据空间。

- **红线**：响应体里不得出现 `RDB_ERR:`、`THROW:`、`JSON.stringify(库错误)`、表名、字段名、SQL、英文堆栈。排障看日志，不看响应。
- 前端同理：界面上不出现 `Failed to fetch`、`undefined`、`（500）` 这类原文，一律走 `frontend/src/lib/errors.ts` 的三类文案。
- **成功态怎么落（2026-10-14 实测）**：云函数是 Event 型，`exports.main` **直接 return 一个对象**，HTTP 访问服务把它原样当响应体发出去，`Content-Type: application/json; charset=utf-8`、HTTP 200。**不用写 `statusCode` / `headers` / `body` 那层集成响应外壳**——少一层壳，就少一个以后会写错的地方。

**例外：探活接口不套信封。** `GET /api/health` 回扁平字段（见第 4 节）。理由：它是给人和监控扫一眼的，不是给前端解析的；多一层 `data` 只让人多拆一次。**只有它一个例外**，业务接口不跟着学。

---

## 4. 已实现接口

### 4.1 `GET /api/health`

**用途**：确认「前端 → 云端」这条管道通不通。**不是给用户看的页面。**

**请求**：无参数、无请求体、无请求头要求。

**200 响应**

```json
{
  "ok": true,
  "service": "PsyIsle",
  "version": "0.1.0",
  "time": "2026-10-14T16:07:01.966Z"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | 固定 `true` |
| `service` | string | 固定 `PsyIsle`，用来确认地址没打错 |
| `version` | string | 接口版本，随契约变更递增 |
| `time` | string | 服务端当前时间（ISO 8601 UTC），用来排除缓存 |

**刻意不返回**：环境 ID、地域、数据库地址、任何密钥。这是公网无鉴权接口，不给陌生人画基础设施地图。（域名本身自带环境 ID，藏不住——但接口自己一句都不说。）

**实测（2026-10-15 对齐后重测）**

```
GET https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com/api/health
200 OK  ·  application/json; charset=utf-8  ·  639ms
{"ok":true,"service":"PsyIsle","version":"0.1.0","time":"2026-10-14T16:07:01.966Z"}
```

---

### 4.2 `GET /api/moods`

**用途**：读回心情打卡列表，给「写一写」页展示。形状同 §5.2 的定义，**今天正式落地**。

**请求参数**（全部可选）

| 参数 | 类型 | 说明 |
|---|---|---|
| `limit` | number | 返回条数，默认 `50`，上限 `200` |
| `cursor` | string | 上一页返回的 `nextCursor`，**原样带回**。不传 = 第一页。(Day 27 实现) |

> **游标而不是 offset**（§3 已写死）：记录只会不断新增，offset 是「跳过前 N 条」的相对位置，
> 用户翻到第二页时新写一条，整张表往后挪一位 → 重复读到上一页的最后一条；中间删一条又会漏读。
> 游标记的是「上一页最后一行在哪」这个绝对位置，插入和软删都不会错位。

**200 响应**：`{ "ok": true, "data": { "items": [ … ], "nextCursor": null } }`，单项字段见 §5.2。
按 `date` 倒序；同日按 `created_at` 倒序（moods 有 `unique(owner_id, date)`，一天一行，date 已唯一）。

- `nextCursor` 是**不透明字符串**：客户端只负责原样带回来，不许解析、不许拼装。
  内部装的是 `{ date, createdAt, id }` 三个排序键，改排序方式时前端不用跟着改。
- `nextCursor: null` = 到底了。**有下一页时必须是字符串** —— 恒为 `null` 会让前端以为「只有这些」，
  而这正是 Day 27 修的那个问题：字段在、值恒为 null，比字段不存在更难发现。

**错误**：`limit` 非法 / `cursor` 解不开 → `INVALID_INPUT` + 中文说明（**不静默退回第一页**：
那样用户点「看更早」会反复看到同一页，以为记录只剩这些）。库/网络异常 → `INTERNAL`。

**实测（2026-10-15 Day 17）**

```
GET https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com/api/moods
200 OK  ·  application/json; charset=utf-8
{"ok":true,"data":{"items":[{"id":"m_seed_08","date":"2026-10-15","emoji":"anxious","level":3,
"note":"明天要交东西（Day17联动验证）","createdAt":"2026-10-15T03:25:00.000+08:00"}, …],
"nextCursor":null}}
```

### 4.3 `GET /api/notes`

**用途**：读回「小进步」列表，给「写一写」页展示。形状同 §5.2 定义。

**请求参数**：同 `GET /api/moods`（`limit` + `cursor`）。`progress_notes` 不限一天一条，
所以游标比较是 `date` → `created_at` → `id` 三级，缺一级会出现同日多行在两页之间来回读。

**200 响应**：`{ "ok": true, "data": { "items": [ { "id": "n_…", "date": "…", "text": "…", "createdAt": "…" } ], "nextCursor": null } }`，按 `date` 倒序。

**实测（2026-10-15 Day 17）**：公网 200，返回 `progress_notes` 真实演示数据 12 条。

---

### 4.4 `POST /api/moods` —— 心情打卡写入　✅ **Day 18 已实现**

**用途**：向 `public.moods` 写入一次心情打卡。

**请求体**：`{ "date": "2026-10-15", "emoji": "tired", "level": 3, "note": "..." }`

- `date` 可省略 = **今天**（服务端按 +08:00 判定，不信客户端时钟）。
- `emoji` **必填**，必须是 §5.2 白名单 7 个 id 之一。
- `level` 可空；给值必须是 1–5 的整数。
- `note` 可空；给值不能超过 200 字。

**200 响应**：`{ "ok": true, "data": { "item": { …与列表里单项同形… } } }`

**幂等（防重复）**：同一天同一身份重复提交 = **覆盖**，不报错、不新增第二条。
数据库层 `unique (owner_id, date)` 是最终保证，接口实现**不能**写成「先查有没有、没有就插」。

**错误**

| 情况 | 返回 |
|---|---|
| `emoji` 为空 / 不在白名单 | `400 INVALID_INPUT`（中文提示） |
| `level` 越界 | `400 INVALID_INPUT` |
| `note` 超过 200 字 | `400 INVALID_INPUT` |
| `date` 格式不对 | `400 INVALID_INPUT` |
| 未登录 | `401 UNAUTHORIZED`（演示期登录暂未接通，见 §7） |

**实测（2026-10-15 Day 18）**

```
POST https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com/api/moods
200 OK  ·  application/json; charset=utf-8
{"ok":true,"data":{"item":{"id":"m_fc1390bfe3fb44b79d38f34f5b642636","date":"2026-10-15",
"emoji":"calm","level":4,"note":"Day18 真实写入验证：把窗户打开了一会儿",
"createdAt":"2026-10-15T17:34:42.580168+08:00"}}}
```

---

### 4.5 `POST /api/notes` —— 记一件小事　✅ **Day 18 已实现**

与 `POST /api/moods` 对称，写入 `public.progress_notes`。

- `text` **必填**，1–200 字。
- `date` 可省略 = 今天。
- 一天可记多件，**不设重复限制**（契约 §7 仍把它列为「阶段 2 收尾时」产品未定项）。

**200 响应**：`{ "ok": true, "data": { "item": { "id", "date", "text", "createdAt" } } }`

**错误**：`text` 为空或超长 → `400 INVALID_INPUT`（中文提示）；未登录 → `401 UNAUTHORIZED`。

**实测（2026-10-15 Day 18）**

```
POST https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com/api/notes
200 OK  ·  application/json; charset=utf-8
{"ok":true,"data":{"item":{"id":"n_99b2c87f970341978b0c9f0ab75c0720","date":"2026-10-15",
"text":"Day18 记一件小事：把袜子洗了","createdAt":"2026-10-15T17:35:30.827883+08:00"}}}
```

---

### 4.7 `PATCH /api/moods?id={id}` —— 改一条心情打卡　✅ **Day 22 已实现**

改一条已存在的打卡记录。目标 id 通过查询参数 `?id=` 传递（HTTP 网关按路径 `/api/moods` 路由，PATCH/DELETE 复用同一云函数，故 id 走查询参数最稳；请求体里带 `id` 也认）。

- 可改字段（契约 §5.2）：`emoji`（情绪 id）、`level`（强度 1–5）、`note`（附言 ≤200 字）。**三者都可选，只改调用方真正传了的字段**，没传的保持原值——不会把「没传」误写成 `null`。
- ⚠️ **「没传」与「传了 `null`」是两件事（Day 24 修 Bug 时定的规则）**：`level` 与 `note` 本身允许为空（§5.2「level 可空」「note 可为 null」），所以 `PATCH {"note": null}` 的含义是**把附言清掉**、`{"level": null}` 是**取消这次的评分**；只有请求体里压根没有这个 key 时才表示「不动它」。`emoji` 不可为空，`{"emoji": null}` → `INVALID_INPUT`。
  > 为什么要单独立这条：修复前，入口层用 `body.note !== undefined` 判「有没有传」、校验层又用 `body.note !== null` 跳过 `null`——三层各自看起来都对，组合起来 `null` 被当成「没传」吞掉，于是**接口回 `ok:true` 而数据没动**，连一句报错都没有。判定「有没有传」只能看**请求体里有没有这个 key**，不能看值。
- `emoji` 必须在白名单内；`level` 给了必须是 1–5 整数；`note` 给了 ≤200 字；三项一个都没传 → `400 INVALID_INPUT`（中文提示）。
- `date` **不可改**（它是「一天一行」唯一键的一部分，改它会撞唯一约束，交给用户「删了重记」即可）。
- **id 不存在（或已被软删）→ `200` + 信封 `ok:false`、`code: NOT_FOUND`、中文提示「找不到这条打卡记录：id 不存在，或它已经被删除」**。这是「删除比新增更容易出事」的第一道防线：先确认目标存在，再动手。
- 被软删的某天若重新编辑，PATCH 会同时把 `is_deleted` 复位为 false（等于找回）。

**200 响应**：`{ "ok": true, "data": { "item": { "id", "date", "emoji", "level", "note", "createdAt" } } }`（返回改后那一行）

**错误**：字段越界/格式错 → `INVALID_INPUT`；id 不存在 → `NOT_FOUND`；未登录 → `401 UNAUTHORIZED`（接登录、恢复 RLS 后生效；当前演示期 anon 直通）。

---

### 4.8 `DELETE /api/moods?id={id}` —— 软删除一条心情打卡　✅ **Day 22 已实现（软删除）**

删除一条打卡记录。**不真删数据**：只把 `moods.is_deleted` 置 `true`，列表查询 `.eq(is_deleted, false)` 会跳过它，所以 `GET /api/moods` 立刻不再返回这条——但库里还在，删错了后台把 `is_deleted` 改回 false 就能找回。

为什么是软删除而不是物理 `DELETE`：

1. 当前云函数身份是 `anon`，`schema.sql` 只把 `delete` 授给 `authenticated`（`anon` 仅有 `select/insert/update`），**硬删会被权限拒绝**；软删走 `update`，复用 `anon` 已有的权限，零新增权限债。
2. 直接呼应本课主题——**删除比新增更容易出事**，软删除把「出事」变成可逆。

- 目标 id 同样走 `?id=`（请求体 `id` 也认）。
- **id 不存在（或已被软删）→ `200` + 信封 `ok:false`、`code: NOT_FOUND`、中文提示「找不到这条打卡记录：id 不存在，或它已经被删除」**。
- 前端「写一写」页每条心情带「删除」按钮，点击后 **`window.confirm` 二次确认**才发请求（Day 22 在 `Daily.tsx` 的 `handleDeleteMood` 里）。

**200 响应**：`{ "ok": true, "data": { "id": "...", "deleted": true } }`

**错误**：id 不存在 → `NOT_FOUND`；未登录 → `401 UNAUTHORIZED`（接登录、恢复 RLS 后生效；当前演示期 anon 直通）。

#### 4.8.1 软删的 select 前后对比验证法（删错能找回）

- 删前：`select id, date, emoji, is_deleted from public.moods where id = '{id}';` → 看到这一行，`is_deleted = false`。
- 调 `DELETE /api/moods?id={id}` → 返回 `ok:true`。
- 删后（同一条 SQL）→ 这一行**还在**，但 `is_deleted = true`；而 `GET /api/moods` 的返回里它**已消失**（查询跳过）。
- 找回：`update public.moods set is_deleted = false where id = '{id}';` → `GET /api/moods` 又能看到它（或重新编辑这条也会复位）。

---

### 4.10 `POST /api/claim` —— 匿名记录转正（一次性凭证）　✅ **Day 28 已实现**

**用途**：注册（`auth.signUp`）会发一个新的 `uid`。匿名身份名下写过的记录 `owner_id` 还指着旧 `uid`，
注册完界面上一条都看不见 —— 数据没丢，是人找不回。这个接口把旧身份名下的行**搬到当前登录账号**名下。

**为什么是「凭证」而不是「前端报旧 uid」**：如果让前端说「这些行属于哪个 uid」，任何人填别人的 uid
就能读别人的记录。凭证这条路里，「搬哪些行」只由服务端根据凭证记录里的 `owner_id` 决定，
客户端拿到并交回的只是一张随机串（128 位、1 小时过期、兑一次即废）。库里存的是它的 **sha256**，
明文不落库 —— 表被翻出来也兑不了。

**请求体**：两个动作共用一个路径，不额外占网关路由。

```json
{ "action": "issue" }
{ "action": "redeem", "code": "<签发时拿到的 32 位十六进制串>" }
```

**`issue` 的 200 响应**

```json
{ "ok": true, "data": { "code": "5f2c…（32 位十六进制）", "expiresAt": "2026-10-19T12:15:00.000Z" } }
```

- 只有**匿名身份写东西之后**才需要领（没有数据就没有可搬的东西）。
- 1 小时内有效；过期只能重新领。

**`redeem` 的 200 响应**

```json
{ "ok": true, "data": { "moods": 3, "notes": 2, "skipped": 0 } }
```

- `moods` / `notes`：搬过去的行数。`skipped`：因**同一天已有记录**没搬的行数。
- 搬完即 `UPDATE owner_id`，不是复制 —— 不会出现两份；此后写的东西直接落在新账号下。
- `moods` 有 `unique(owner_id, date)`：新账号那天已有记录时，**以账号自己的那行为准**，
  匿名那行留在原处不搬（`skipped` 计数），不覆盖用户任何一条已写的内容。
- 同一张凭证兑换第二次 → `NOT_FOUND`（「已经用过了」），不会重复搬。

**错误**

| 情况 | 返回 |
|---|---|
| `action` 缺失 / 不是 `issue`、`redeem` | `INVALID_INPUT`（中文说明） |
| `code` 缺失或形状不对 | `INVALID_INPUT` |
| 凭证不存在 / 已被兑换 | `NOT_FOUND` |
| 凭证过期（签发后 1 小时） | `INVALID_INPUT` |
| 未登录 | `401 UNAUTHORIZED` |
| 库/网络异常 | `INTERNAL` + `requestId` |

**前端落点**：`frontend/src/lib/claim.ts`（领券 / 兑换 / 失败留着下次再试）+ `components/AuthPanel.tsx`（注册、登录、验证码三条路径都在换身份前领、换完后兑换）。

**注意**：这是**搬家**，不是同步。兑换之前写在新账号下的记录不受影响；兑换之后旧匿名身份不再写任何东西
（浏览器里的会话已经换成新账号）。前端如果在兑换那一刻网络断了，会把凭证留在本地，下次打开页面自动重试一次
（过期即作废）。

---

### 4.6 今天踩到的三件事（Day 17 记）

**① 「表字段和接口字段对不上」——这就是今天要掌握的那一项。**
`public.moods` 的列叫 `created_at`（snake_case），契约里接口字段叫 `createdAt`（camelCase）。云函数若把查出的行原样 `return`，前端拿到的是 `created_at`，按契约取 `item.createdAt` 就是 `undefined`，页面日期直接空白。
**怎么发现的**：先按契约写前端取值 `createdAt`，接口返回里却找不到这个 key——名字对不上，不是数据错了。
**落点**：两支云函数都显式 `select` 出契约规定的列，并逐字段改名（`created_at → createdAt`）。
另外 `moods` 表里还有一个 `updated_at` 列，**契约里根本没有**——接口故意不选它，是「表里有的、接口不一定给」的落点。

**② 云函数读 PG 的可行方式。**
本环境是**体验版**，不支持 `pg` 直连（无内网地址）；经 HTTP 网关的 PostgREST 才是可用路径。最终用 `@cloudbase/node-sdk` 的 `app.rdb()`，并手动注入 `Accept-Profile: public`（云端全局 SDK 版本较旧，`schema()` / `setHeader()` 缺失，且默认把 schema 写成环境 ID → 会报 `Invalid schema`）。

**③ RLS（行级权限）与「函数即可信后端」。**
`moods` / `progress_notes` 的策略是 `owner_id = auth.uid()`，而云函数的调用身份不是 `service_role`（本环境拿不到），导致 `select` 回来 **0 行**——数据在库里（`moods` 9 行、`notes` 12 行），是被权限过滤掉的。
Day 17 的定位是「函数作为可信后端读**全部演示数据**、前端只经函数读库」，因此这两张表**在 Day 17 演示期临时关闭 RLS**；**Day 18 接登录、按调用者身份过滤时恢复**（`db/schema.sql` 仍保留原始策略定义，恢复时按它重开）。

---


## 5. 占位接口（今天只登记，代码一行不写）

### 5.0 总表

| # | 接口 | 方法 | 对应表 | 阶段 | 状态 |
|---|---|---|---|---|---|
| 1 | `/api/health` | GET | — | 2 | ✅ 已实现 |
| 2 | `/api/me` | GET | `profiles` | 2 | 占位 |
| 3 | `/api/me` | POST | `profiles` | 2 | 占位 |
| 4 | `/api/moods` | GET | `moods` | 2 | ✅ **已实现（列表读取）** |
| 5 | `/api/moods` | POST | `moods` | 2 | ✅ **Day 18 已实现** |
| 6 | `/api/notes` | GET | `progress_notes` | 2 | ✅ **已实现（列表读取）** |
| 7 | `/api/notes` | POST | `progress_notes` | 2 | ✅ **Day 18 已实现** |
| 20 | `/api/moods` | PATCH | `moods` | 2 | ✅ **Day 22 已实现（改一条）** |
| 21 | `/api/moods` | DELETE | `moods` | 2 | ✅ **Day 22 已实现（软删一条）** |
| 8 | `/api/assessments` | POST | `assessments` | 2 | 占位（算法未裁定） |
| 9 | `/api/assessments/latest` | GET | `assessments` | 2 | 占位（算法未裁定） |
| 10 | `/api/library` | GET | —（内容层） | 3+ | **暂缓**，见 5.4 |
| 11 | `/api/tasks` | GET | —（内容层） | 3+ | **暂缓**，见 5.4 |
| 12 | `/api/chat/messages` | GET | `chat_messages` | 3 | 占位 |
| 13 | `/api/chat/messages` | POST | `chat_messages` | 3 | 占位 |
| 14 | `/api/chat/messages/clear` | POST | `chat_messages` | 3 | 占位 |
| 15 | `/api/crisis/events` | POST | `crisis_events` | 3 | 占位（**只写不读**） |
| 16 | `/api/posts` | GET | `posts` | 4 | 占位（**列表读取**） |
| 17 | `/api/posts` | POST | `posts` | 4 | 占位 |
| 18 | `/api/posts/like` | POST | `post_likes` | 4 | 占位 |
| 19 | `/api/posts/report` | POST | `reports` | 4 | 占位 |

**为什么每条记录表都要有一个 GET**：写进去看不到，用户不会认为功能存在。管家页要展示「这些天的打卡」，列表读取接口是**主接口**，写入是它的配套——不是反过来。

---

### 5.1 身份与偏好（阶段 2）

这一组对应 `PRD.md` §5 的 `profiles` 表：「花名、关心主题（多选）、管家设置」。

#### `GET /api/me`

**请求**：无参数。身份从登录态取。

**200 响应**

```json
{
  "ok": true,
  "data": {
    "profile": {
      "nickname": "夜里的树",
      "themes": ["lonely", "meaning"],
      "settings": {
        "reminderTime": null,
        "modules": { "talk": true, "guide": true, "daily": true },
        "showStreak": false
      },
      "createdAt": "2026-10-15T01:20:00.000Z"
    }
  }
}
```

- `themes` 取值必须是 `frontend/src/data/themes.ts` 里那 5 个 id：`lonely` / `meaning` / `worth` / `relation` / `loss`。**契约与前端共用同一份枚举**，不另起一套。
- `settings.showStreak` **默认 `false`**——这是 `PRD.md` §2「压力机制默认关闭」在接口层的落点：**服务端不许默认帮用户打开**。
- 还没建过 `profiles` 行时：回 `200` + 一份**默认 profile**（不报 404）。理由同第 2 节「空状态」条。
- **落在哪张表**：`db/schema.sql` 的 `public.profiles`。**一个人一行**，主键就是登录身份（`owner_id` = 凭证里的 `sub`）——所以「还没建过」= 表里还没有你那一行，不是「另一个用户的行」。
- `nickname` 未设置时是**空字符串**（不是 `null`）：前端少一个判空分支。
- `themes` 里出现白名单外的 id、或 `nickname` 超 24 字，**数据库层也会拒绝**（`profiles_themes_known` / `profiles_nickname_len`）。接口按下面的错误表返回 `400`，别让数据库的 CHECK 报错直接冒到用户面前。

**错误**：`401 UNAUTHORIZED`（没登录）。

#### `POST /api/me`

**请求体**（**部分更新**：只提交要改的字段，没提交的字段不动）

```json
{ "nickname": "夜里的树", "themes": ["lonely"], "settings": { "showStreak": true } }
```

**200 响应**：返回更新后的**完整** profile，形状与 `GET /api/me` 的 `data` 完全一致。
（为什么不只回改动的字段：前端拿回整份，就不必自己拼状态——少一处能拼错的地方。）

**错误**
| 情况 | 返回 |
|---|---|
| `themes` 里有未知 id | `400 INVALID_INPUT` |
| `nickname` 超长或含控制字符 | `400 INVALID_INPUT` |
| 没登录 | `401 UNAUTHORIZED` |

> ⚠️ 「花名」是否允许重复、是否需要敏感词过滤——**未裁定**，见第 7 节。

---

### 5.2 日常管家 · 两张记录表（阶段 2）

这一组是 `PRD.md` §5 里「主对象 + 记录表」模式的两处落点，**也是课程第 3 周的主要交付**。

#### `GET /api/moods` —— 心情打卡列表　✅ **Day 17 已实现**（见 §4.2）

**请求参数**（全部可选）

| 参数 | 类型 | 说明 |
|---|---|---|
| `from` | `YYYY-MM-DD` | 起始日期（含）｜**未实现**，登记备用 |
| `to` | `YYYY-MM-DD` | 结束日期（含）｜**未实现**，登记备用 |
| `limit` | number | ✅ 已实现。**实际默认 `50`、上限 `200`**（本节早先写的「默认 31、上限 100」是 Day 15 的草案数字，Day 17 落地时改成了 50/200；以本节这行为准） |
| `cursor` | string | 上一页返回的 `nextCursor`（不透明串，原样带回）✅ **Day 27 已实现**，见 §4.2 |

> 「今天打过卡没有」**不另开接口**，用 `from=to=今天` 查——一个接口能回答的事，不开第二个。

**200 响应**

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "m_8f3a…",
        "date": "2026-10-15",
        "emoji": "tired",
        "level": 3,
        "note": "今天话很少",
        "createdAt": "2026-10-15T13:40:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

- `emoji` 是**白名单里的 id**（不是 emoji 字符本身）——字符在不同设备上渲染不一样，id 不会。
- `level` 1–5，**可空**；`note` 可为 `null`（**可以不写文字**，`PRD.md` §2 模块三原话）。
- 列表**默认按 `date` 倒序**，最新在前。

**错误**：`401 UNAUTHORIZED`；`from`/`to` 格式不对 → `400 INVALID_INPUT`。

> **情绪白名单（2026-10-15 Day 16 定，原第 7 节待定项已销）**
>
> 契约与前端**共用同一份 id**：前端落地位置 `frontend/src/data/moods.ts`（Day 17 建该文件时照抄下表，**不另起名**）；数据库的 `moods_emoji_known` 约束用的是同一串 id。
>
> | id | 界面文字 | id | 界面文字 |
> |---|---|---|---|
> | `calm` | 平静 | `anxious` | 不安 |
> | `warm` | 温暖 | `upset` | 烦躁 |
> | `tired` | 疲惫 | `empty` | 空空的 |
> | `low` | 低落 | | |
>
> 存 id 不存 emoji 字符：字符在不同设备上渲染得不一样，id 不会。
> ⚠️ **`level` 的语义**：它是「这股感觉有多强」（1–5），**不是好坏打分**——1 和 5 只是强度两端，没有哪端更好。前端文案不许写成「心情指数」「得分」。

#### `POST /api/moods` —— 打一次卡

**请求体**

```json
{ "date": "2026-10-15", "emoji": "tired", "level": 3, "note": "今天话很少" }
```

- `date` 可省略 = **今天**（服务端按 +08:00 判定，不信客户端时钟）。
- **幂等规则：同一天重复提交 = 覆盖**，不报错、不新增第二条。
  理由：打卡是「今天感觉怎么样」的快照，不是流水账；报错只会让用户以为自己做错了事——**这个产品不惩罚任何操作**。
  **落点**：数据库层有 `unique (owner_id, date)` 兜底（`db/schema.sql`）。接口实现**不能**写成「先查有没有、没有就插」——两个请求同时进来会同时认为「还没有」。用 `on conflict (owner_id, date) do update`。
- `note` 最长 200 字、`level` 只能空或 1–5、`emoji` 只能是上表白名单——三项在数据库层都有同名 CHECK。

**200 响应**：`{ "ok": true, "data": { "item": { …与列表里单项同形… } } }`

**错误**
| 情况 | 返回 |
|---|---|
| `emoji` 不在白名单 | `400 INVALID_INPUT` |
| `level` 不在 1–5 | `400 INVALID_INPUT` |
| `note` 超 200 字 | `400 INVALID_INPUT` |
| 没登录 | `401 UNAUTHORIZED` |

#### `GET /api/notes` —— 一个小进步列表　✅ **Day 17 已实现**（见 §4.3）

参数与形状同 `GET /api/moods`，`items[]` 单项为：

```json
{ "id": "n_2c91…", "date": "2026-10-15", "text": "把袜子洗了", "createdAt": "2026-10-15T14:02:00.000Z" }
```

顺带说明为什么这里没有 `level`：**小进步不评分**。「小到不用努力的事」一旦能打分，就变成了考核。

**排序（Day 24 补）**：`items[]` 先按 `date` 倒序，同日多行再按 `created_at` 倒序做次级排序键——`progress_notes` 不限一天一条，只按 `date` 倒序会让同日多行的先后在不同调用间跳变（Day 21 周验收登记的遗留），补上 `created_at` 后顺序稳定。

#### `POST /api/notes` —— 记一件小事

**请求体**：`{ "text": "把袜子洗了", "date": "2026-10-15" }`（`date` 省略 = 今天）
**200**：`{ "ok": true, "data": { "item": { … } } }`
**错误**：`text` 为空或超长 → `400 INVALID_INPUT`；未登录 → `401 UNAUTHORIZED`。

> **一天能记几件？** 不限。契约不设上限，也不做「今天已经记过了」的提示——见第 7 节待裁定项。

---

### 5.3 指路灯 · 测评（阶段 2 起，**算法尚未裁定**）

`PRD.md` §4.3 的边界必须在接口层就锁死：**不给总分、不给档位、不给分级**。
所以下面这个形状里**根本没有** `score` / `total` / `level` / `percentile` 这些字段——**不是还没定，是刻意不设**。以后谁想加，必须先改这一节。

#### `POST /api/assessments` —— 交一份作答

**请求体**

```json
{
  "type": "rses",
  "answers": [ { "itemId": 1, "value": 4 }, { "itemId": 2, "value": 2 } ],
  "durationMs": 96000
}
```

- `type` 只能取四个之一：`ipip` / `rses` / `gse` / `nfc18`（`PRD.md` §4.3 白名单，**授权未核实的量表一个不上**）。
- 只存 `answers` 与完成时间，**不存分数、不存档位**（`PRD.md` §5 `assessments` 表原话）。

> ⚠️ **这张表 Day 16 刻意没建**（`db/schema.sql` 里没有它）。理由不是遗漏：字段名定了、**算法没定**，现在建表等于把没定的东西先固化成列——等算法裁定时会发现列的形状是猜的。**表随裁定一起建。**

**200 响应**

```json
{
  "ok": true,
  "data": {
    "id": "a_5e77…",
    "type": "rses",
    "completedAt": "2026-10-15T15:10:00.000Z",
    "dimensions": [
      { "key": "self_worth", "label": "你怎么看自己", "description": "两三句描述，不下判断" }
    ],
    "themes": ["worth", "relation"],
    "recommendations": { "libraryIds": ["lib_012"], "taskIds": ["task_004"] }
  }
}
```

- `dimensions[].description` 是**描述**，不是结论；不许出现程度词排序（禁「偏高 / 偏低」这类相对位置表述）。
- `recommendations` 只给 **id**，正文仍由内容层提供——接口不复制内容。
- ⚠️ **`dimensions` 与 `themes` 具体怎么从 `answers` 算出来，尚未裁定**（4 个量表的结果怎么落到 5 个主题，见 `docs/MVP实施计划.md` 冲突 6）。**字段名定了，算法没定** —— 这一条没裁定前，本接口不写代码。

**错误**：题目缺失或有值越界 → `400 INVALID_INPUT`（**错误里不回显用户答案**）；`type` 不在白名单 → `400 INVALID_INPUT`；未登录 → `401 UNAUTHORIZED`。

#### `GET /api/assessments/latest`

**请求**：无参数。
**200**：

```json
{ "ok": true, "data": { "item": null } }
```

- 做过 → `item` 是最近一份（形状与 `POST` 的 `data` 同）；没做过 → `item: null` + `200`。**没做过不是错误**，前端据此渲染「你还没做过」的引导，不弹错误提示。

> 要不要让用户回看**历史**测评（`GET /api/assessments?limit=`）：**未定**，见第 7 节。

---

### 5.4 内容层（书影音 / 行动小任务）—— 暂缓，不是遗漏

阶段 1 的决定是：**内容随构建打包**（`frontend/src/data/library.ts`、`tasks.ts`），接口做成异步 Promise，但取数实现在本地。
所以 `GET /api/library` 与 `GET /api/tasks` **现在不做**——不是因为不需要，是因为现在做等于把一份静态数据绕一圈网络再回来，只增加了故障点。

**什么时候开**：当「内容要改，但不想发一次版」这个需求真的出现时（运营/自己加条目频繁到发版嫌麻烦）。那一天按下面的形状直接开，不用重新设计：

```
GET /api/library?kind=book|movie|music|podcast&themes=lonely,meaning
GET /api/tasks?themes=lonely,meaning
200 → { "ok": true, "data": { "items": [ … ] } }
```

`items[]` 的字段**与 `frontend/src/data/*.ts` 里现有的类型一一对应**（`LibraryItem` / `MicroTask`），**不另起名**——同一个东西在两处叫两个名字，是后面所有对不上的源头。

---

### 5.5 倾诉树洞 · AI 会话（阶段 3）

#### `GET /api/chat/messages` —— 会话消息列表

**参数**：`limit`（默认 50，上限 200）、`cursor`。
**200**：

```json
{
  "ok": true,
  "data": {
    "items": [
      { "id": "c_11aa…", "role": "user", "content": "……", "createdAt": "2026-10-15T15:20:00.000Z" },
      { "id": "c_11ab…", "role": "assistant", "content": "……", "createdAt": "2026-10-15T15:20:03.000Z" }
    ],
    "nextCursor": null
  }
}
```

- `role` 只有 `user` / `assistant` 两种。
- **软删除**：用户「一键清空」后，旧消息对任何读接口都不再出现（`deletedAt` 打标，不物理删——但**接口层看不见这件事**）。

#### `POST /api/chat/messages` —— 说一句

**请求体**：`{ "content": "……", "clientId": "本地生成的 uuid" }`

- `clientId` 用于**重试去重**：网络抖动时同一条不会被记两遍，AI 也不会答两遍。

**200 响应**

```json
{
  "ok": true,
  "data": {
    "userMessage": { "id": "c_11aa…", "role": "user", "content": "……", "createdAt": "…" },
    "reply": { "id": "c_11ab…", "role": "assistant", "content": "……", "createdAt": "…" },
    "degraded": false,
    "crisis": null
  }
}
```

- `crisis` 不为 `null` 时形状：`{ "triggered": true, "resources": [ { "number": "12356", "organizer": "…", "label": "…" } ] }`。
  **命中即必须返回**——前端拿到就浮出资源卡，不隐藏、不软化、不「我们聊聊别的」（`PRD.md` §4.1）。
- **`degraded: true` = 模型没答上来**（超时/报错）。此时 `reply.content` 仍是**固定安全文案**，绝不是空白、乱码或英文报错。
  **契约强制**：模型失败也**必须**回 `200` 且带可渲染的 `reply`——**不允许**把 `5xx` 直出给用户。
  理由：用户正在倾诉，这时候弹一个错误框，比他说了没人应还糟。
- **不做流式**（先整句返回）。理由：先跑通再说；要改成流式，改的是这一条的行为，不需要动前端的数据结构。
- 对话内容**不用于任何画像分析**（`PRD.md` §4.1）。

**错误**：`content` 为空/超长 → `400 INVALID_INPUT`；未登录 → `401 UNAUTHORIZED`。
（**注意**：模型侧的失败走上面的 `degraded`，**不走** `INTERNAL`。`INTERNAL` 只留给信道本身坏了。）

#### `POST /api/chat/messages/clear` —— 一键清空

**请求体**：无。
**200**：`{ "ok": true, "data": { "cleared": 128 } }`
**错误**：`401 UNAUTHORIZED`。（清自己的，永远只需要登录态。）

#### `POST /api/crisis/events` —— 危机触发记录（**只写不读**）

**请求体**

```json
{ "source": "chat", "signal": "self_harm", "sessionRef": "cs_88f1…" }
```

- **不接收、不存储用户原文**——只记「什么时候、哪条链路、命中了哪类信号」。
- `signal` 只有 `self_harm` / `suicide` 两种；`source` 只有 `chat` / `community` 两种。
- **这份契约里没有对应的 GET 接口，也永远不会有**（`PRD.md` §5 明写：仅用于安全兜底，**禁止用于分析或统计**）。
  不给读接口，是让这条红线有技术上的形状——想统计，得先说服自己加一个 GET，而不是「顺手查一下」。

**200**：`{ "ok": true, "data": { "recorded": true } }`

---

### 5.6 匿名社区（阶段 4）

#### `GET /api/posts` —— 帖子列表

**参数**：`limit`（默认 20，上限 50）、`cursor`。
**200**：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "p_31c0…",
        "alias": "路过的风",
        "content": "……",
        "createdAt": "2026-10-15T16:00:00.000Z",
        "likeCount": 3,
        "likedByMe": false,
        "reportedByMe": false
      }
    ],
    "nextCursor": null
  }
}
```

- **没有 `authorId`**。匿名不是「前端不显示名字」，是**接口不给出身份**——给出去了，前端藏不藏只取决于有没有人打开控制台。
- 没有关注、没有排行、没有热度排序（`PRD.md` §2 模块一）：**按时间倒序**，只有这一种排序。

#### `POST /api/posts` —— 匿名发帖

**请求体**：`{ "content": "……" }`
**200**：

```json
{ "ok": true, "data": { "accepted": true, "item": { "id": "p_31c0…", "alias": "路过的风", "content": "……" }, "crisis": null } }
```

- **命中危机词不是拒绝**：仍然 `accepted: true`，但 `crisis` 带上资源，**给发帖人浮出求助信息，而不是删帖了事**（`PRD.md` §4.2）。
- **命中违规词**（辱骂 / 广告 / 引流）：`{ "ok": true, "data": { "accepted": false, "reason": "给人看的短句" } }`——**`reason` 是用户文案，不是审核术语**，不能出现「策略命中」这类词。
- 未过审就发不出去的另一种可能（先审后发）：**未定**，见第 7 节。

#### `POST /api/posts/like` —— 点赞 / 取消

**请求体**：`{ "postId": "p_31c0…", "liked": true }`

- **传目标状态，不传 toggle**。理由：toggle 在网络重试时会翻回去——用户点了一次赞，重试后变成取消，他不知道自己错在哪。
- **幂等**：重复提交同一个目标状态，结果一样。

**200**：`{ "ok": true, "data": { "postId": "p_31c0…", "liked": true, "likeCount": 4 } }`
**错误**：帖子不存在 → `404 NOT_FOUND`；未登录 → `401 UNAUTHORIZED`。

#### `POST /api/posts/report` —— 举报

**请求体**：`{ "postId": "p_31c0…", "reason": "self_harm", "note": "" }`

- `reason` 枚举：`self_harm` / `suicide` / `abuse` / `spam` / `other`。
- **幂等**：同一个人重复举报同一帖，返回同样的结果，不报错、不叠加计数。
- 举报**自己的帖子** → `403 FORBIDDEN`（要删就删，走举报是绕路）。
- ⚠️ 举报后**运营方有干预义务**（`PRD.md` §4.2）：命中 `self_harm` / `suicide` 时，除了记录，**必须同时给举报人一处求助资源**——他刚读完一段危机内容，是这个页面上最需要被接住的人。

**200**：`{ "ok": true, "data": { "reported": true, "resources": [ … ] | null } }`

---

## 6. 表 ↔ 接口对应（建表那天的对照表）

| 表（`PRD.md` §5） | 接口 | 阶段 | 表 | 接口 |
|---|---|---|---|---|
| `users` | **不建接口** —— 走平台账号体系，**不自存密码** | 2 | **永不建**（平台自带 `auth` schema） | 用平台能力 |
| `profiles` | `GET` / `POST /api/me` | 2 | ✅ **Day 16 已建** | 占位 |
| `moods` | `GET` / `POST` / `PATCH` / `DELETE /api/moods` | 2 | ✅ **Day 16 已建** | **GET ✅ Day 17 / POST ✅ Day 18 / PATCH ✅ Day 22 / DELETE（软删）✅ Day 22**；含 `is_deleted` 软删列（Day 22） |
| `progress_notes` | `GET` / `POST /api/notes` | 2 | ✅ **Day 16 已建** | **GET ✅ Day 17 / POST ✅ Day 18** |
| `assessments` | `POST /api/assessments`、`GET /api/assessments/latest` | 2 | ⏸ **刻意未建**（算法未裁定，见 5.3） | 占位 |
| `chat_sessions` / `chat_messages` | `GET` / `POST /api/chat/messages`、`POST /api/chat/messages/clear` | 3 | 未建 | 占位 |
| `posts` / `post_likes` / `reports` | `GET` / `POST /api/posts`、`POST /api/posts/like`、`POST /api/posts/report` | 4 | 未建 | 占位 |
| `crisis_events` | `POST /api/crisis/events`（**只写不读**） | 3 | 未建 | 占位 |
| —（内容层，不建表） | `GET /api/library`、`GET /api/tasks` | 3+ | **暂缓**，见 5.4 | **暂缓**，见 5.4 |

数据库类型 = **PostgreSQL**（建环境时选定，**事后不可改**）。建表语句、约束、行级权限全部在 `db/schema.sql`；演示数据在 `db/seed.sql`；跑法与验证语句见 `db/README.md`。

### 6.1 Day 16 建表纪要（2026-10-15）

**「两张表分别存什么？靠哪个字段关联？」**

| 表 | 行粒度 | 主键 | 与谁关联 |
|---|---|---|---|
| `profiles` | **一个人一行**（主对象） | `owner_id`（= 登录身份） | — |
| `moods` | **一次打卡一行**，一人一天至多一行（记录表） | `id`（`m_` 前缀） | `owner_id → profiles.owner_id` |
| `progress_notes` | **一件小事一行**（与 `moods` 同构的第二张记录表） | `id`（`n_` 前缀） | `owner_id → profiles.owner_id` |

**关联字段是 `owner_id`。** 同一个字段同时干三件事，缺一件都有漏：

| 作用 | 落点 |
|---|---|
| 表之间关联 | 外键 `moods.owner_id → profiles.owner_id`（`on delete cascade`） |
| 数据隔离 | RLS 策略 `owner_id = auth.uid()`，**读不到别人的行** |
| 自动归属 | 列默认值 `auth.uid()`，新行的归属由库从登录凭证里填，前端没机会传别人的 id |

**几个刻意的选择**：

- **外键指向 `profiles`，而不是「不设外键」**：代价是写 `moods` 前必须先有 `profiles` 行。这是主动认下的：Day 17 的写接口需要**先保证档案存在**（一句 `on conflict do nothing` 的 upsert 即可），换来的是「不可能存在没有主人的打卡」。
- **`id` 用带前缀字符串**（`m_…` / `n_…`）而非 uuid 类型：库里生成的形状就是契约写给前端的形状，接口层零转换。以后要换，改的是默认值表达式，前端无感。
- **`moods` 建了 `unique (owner_id, date)`**：「重复打卡 = 覆盖」由数据库保证，不靠接口先查再写。
- **`progress_notes` 没有 `updated_at`**：契约里没有「改一条小进步」的接口，没有对应写操作的列，加了就是没人维护的陌生字段。
- **`assessments` 没建**：见 5.3。

**Day 17 的走法**：挑一行 → 写云函数读接口（表已经在了）→ 前端把 `frontend/src/lib/api.ts` 里对应的 `load()` 换成真实请求。
**先做 `moods`**：它最好验证（读回来、看列表），且不依赖任何未裁定的算法。

### 6.2 Day 17 读接口纪要（2026-10-15）

**「接口返回的数据里，哪一项和表对不上？怎么发现的？」——答案是 `createdAt`。**

| | 表 `public.moods` | 契约 §5.2 | 结论 |
|---|---|---|---|
| 建表时间 | `created_at`（snake_case，`timestamptz`） | `createdAt`（camelCase） | **对不上** |
| 备注列 | `updated_at` | **没有这个字段** | 表有的，接口不给 |

**怎么发现的**：前端按契约取 `item.createdAt`，接口原样返回数据库行时是 `created_at` → 日期读不到、显示为空。名字对不上，会表现成「功能坏了」，但其实数据一条没少。

**落点**：云函数显式 `select('id,date,emoji,level,note,created_at')` 并逐字段映射 → `createdAt`；`updated_at` 压根不选。

**今天完成的两个交付**
- `GET /api/moods`、`GET /api/notes` 部署到 CloudBase（Event 云函数 + HTTP 路由 `/api/moods`、`/api/notes`），公网 200、返回真库数据。
- 真库验证：`update public.moods set note=… where id='m_seed_08'` 改一行 → 接口刷新后跟着变（列表顶部那一条即改后内容）。
- 前端「写一写」页（`frontend/src/pages/Daily.tsx`）接真实接口，走 `loading / error / empty / ready` 四态。
- 余力加练：`limit` 查询参数（默认 50、上限 200）。

**Day 18 实际完成**：`POST /api/moods`、`POST /api/notes` 已部署并公网验证通过；登录态与 RLS 恢复不在今日板块，仍待后续接入。

---

### 6.3 Day 18 写入接口纪要（2026-10-15）

**「防重复：怎么保证同一天不会变成两行？」**

答案是数据库层的 `unique (owner_id, date)`，不是接口先查再写。
接口实现：先 `insert`；如果命中唯一约束冲突，再 `update` 覆盖内容。
连续 POST 同一个日期，返回的是**同一个 id**，`moods` 表里该身份仍然只有 1 行。

**「接口里的身份是从哪来的？」**

Day 26 接登录后：网关（`enableAuth`）校验 `Authorization: Bearer <token>`，通过后把用户身份注入函数运行时，
数据层用 `app.auth().getUserInfo().uid` 取真实 uid（匿名用户也有稳定的匿名 uid）。
所有查询都带 `.eq('owner_id', owner)`，写入都带 `owner_id`。

**取不到 uid 怎么办（Day 27 修订，与 Day 18 的做法相反）**

Day 18 演示期为了让写入跑通，曾用固定演示身份 `00000000-0000-4000-8000-000000000099` 兜底，
代码里叫 `DEMO_OWNER_ID`。**这个做法已废止并删除。**

原因：兜底把「谁都没身份」翻译成了「大家都是同一个人」。只要网关鉴权失效、被关掉或换了触发器，
所有访客就会落进同一个 `owner_id` 空间，互相看得见对方写的东西——那不是可用性问题，是隐私事故。

现在：`requireOwner()` 取不到 uid 就抛，入口层在所有 handler 之前先探测一次，
失败直接返回 `{ ok:false, error:{ code:'UNAUTHORIZED', message:'登录状态没取到，刷新一下页面再试。' } }`，
**一次数据库查询都不发**。宁可整页报错并告诉用户「刷新一下」，也不让两个人共用一个身份。

**「写入时报 permission denied 怎么解决的？」**

部署后实测发现云函数的 rdb 身份是 `anon`，`anon` 在 `moods`/`progress_notes` 上只有 `SELECT`。
为打通演示期写入，临时执行：

```sql
grant insert, update on public.moods to anon;
grant insert, update on public.progress_notes to anon;
```

**这条授权必须在接登录、恢复 RLS 时收回**（见 §7）。

**「业务错误的状态码怎么落？」**

实测确认：Event 型云函数 `exports.main` 直接 `return { ok:false, error:{code:'INVALID_INPUT',message:'...'} }` 时，
HTTP 访问服务仍返回 200，错误信息放在统一信封里。
这与 Day 17 的 `INTERNAL` 错误表现一致，也符合契约 §3「业务接口用 {ok,data} 信封」。

**今天完成的三件事**

1. `POST /api/moods`、`POST /api/notes` 部署到 CloudBase，公网 200。
2. 输入校验全中文错误：`emoji` 必填/白名单、`level` 1–5、`note` ≤200、`text` 必填 1–200。
3. 防重复：同一天 mood 覆盖，不新增第二行；服务端加了 `[moods:POST]` / `[notes:POST]` 前缀日志。

---

### 6.4 Day 19 重构纪要（2026-10-15）

**「查数据库这段代码从哪移到了哪？」**

从 `cloudfunctions/moods/index.js` 和 `cloudfunctions/notes/index.js` 里，移到各自同目录的新文件 `db.js`。

| | 改之前 | 改之后 |
|---|---|---|
| `index.js` | 分发 + 校验 + `app.rdb()` 查询 + 字段映射，一个文件全包 | 只留入口层：按 `httpMethod` 分发、校验参数、套错误信封 |
| `db.js` | 不存在 | 数据访问层：SDK 初始化、public schema 注入、表的全部增查、snake_case → camelCase 映射 |

**为什么拆**：契约 §2 要求「数据库的 snake_case 只在数据层转换，转换只允许有一个点」。拆分前字段映射躺在入口层，换 SDK、接登录要动两个文件；拆分后数据库的唯一接触点是 `db.js`——入口层不出现 `app.rdb()`，也不出现表字段名。

**对外形状零变化**：路径、字段、错误码、信封全部没动（契约不许动）。回归覆盖 5 个端点的 17 项检查：GET × 4、POST 成功 × 2、同日重复幂等 × 1（两次返回同一个 id）、错误路径 × 10，全部通过。

**新增测试**：`cloudfunctions/moods/db.test.js`、`cloudfunctions/notes/db.test.js` 锁字段映射形状（照 `health/index.test.js` 的模式；`health` 不查库，没有数据访问层可拆）。

---

### 6.5 Day 20 前端接线与公网验证纪要（2026-10-15）

**「跨域那一下，你是怎么认出问题出在哪的？」——先给症状分类，再用 curl 复现，不猜。**

三类症状对应三类根因，长得像但修的地方完全不同：

| 症状 | 根因 | 修哪 |
|---|---|---|
| Console 报 `No 'Access-Control-Allow-Origin' header is present` | 服务端放行名单里没有当前页面 Origin | 服务端策略（本项目 = 网关白名单，前端零代码） |
| Network 里根本没有这条请求 / `Failed to fetch` | 请求没发出去（代码没跑到 fetch，或被预检拦） | 前端代码 |
| 请求打到了**页面自己的域名** `/api/…` 返回 404 | `VITE_API_BASE` 没配（构建期内联失败） | 构建配置，**不是跨域** |

**CORS 实测（curl 带 Origin 探 + 浏览器内抓包双重确认）**：CloudBase HTTP 网关是**白名单制**——`http://localhost:5173` / `http://localhost:4173` / 本环境静态托管域名会被回显放行（含 `allow-credentials: true`）；其他任何 Origin（别的 tcloudbaseapp.com 子域、外部域名、`null`）**拿不到 ACAO 头**。不是 `*`，也不是无条件回显（Day 17 纪要里「自动回显请求 Origin」的说法据此修正为白名单制，见 §7）。前端因此**零 CORS 代码、零代理**。

**今天发现并修掉的两个前端问题**（都属于「接线没调通」，不是接口问题）：

1. **情绪 id 直接显示成英文**：`Daily.tsx` 把契约白名单 id（`calm`）当界面文字渲染。落点：新建 `frontend/src/data/moods.ts`（契约 §5.2 白名单 7 个 id → 界面文字 + 装饰字形，全站唯一映射点），页面改引它。这正是 §4.6①「表字段和接口字段对不上」的前端镜像——**接口给的 id 和界面要显示的字，是两回事，中间必须有一个映射点**。
2. **`level` 文案「心情 x/5」**：契约 §5.2 明确 level 是「这股感觉有多强」，不是好坏打分。文案改「强度 x/5」。

**新增的前端落点**：

- 首页「写一写」门卡一行真实数据回放（`GET /api/moods?limit=1`，取不到不渲染——首页不承担报错职责）；
- 检查台 `/check`（不进主导航，页脚入口）：健康状态、`moods` / `progress_notes` 真实数据、写入测试入口、最后更新时间；
- `lib/useListData.ts` 新增 `useFetch`（单对象版请求四态，与 `useListData` 同源，探活接口用它）；
- ⚠️ 检查台写入测试**真写库**（`POST /api/notes`，带「检查台写入测试 · 时间」标注）。刻意不测 `moods`——同日重复是覆盖（§4.4），会抹掉当天演示数据。**接登录后给检查台加权限或下线**（§7 已登记）。（后续：已于 2026-10-16 Day21 收尾下线，见 §7）

**公网验证结论**：首页展示真实数据（截图带地址栏存工作台 `Day20-公网验证截图/`）；F12 抓包确认请求打到公网接口域名；公网点写入测试，notes 16→17、新行入列、「数据更新于」跳动——「改数据刷新跟着变」在公网链路成立。逐项清单与卡点预案见 `docs/Day20-公网验证清单.md`。

---

### 6.6 Day 22 PATCH / DELETE 与软删除纪要（2026-10-15）

**今天要掌握的一句：删除为什么比新增更容易出事？——因为删是「让已经存在、可能重要的东西消失」，且没有回头键。** 所以两件事：① 改/删前先校验 id 存在性，不存在就报 `NOT_FOUND`（中文），绝不静默；② 删除用**软删除**，不真删数据。

**改了什么（代码落点）**：

- `cloudfunctions/moods/index.js`：入口层新增 `PATCH` / `DELETE` 分发（复用 `/api/moods` 路由，id 走查询参数 `?id=`，回退请求体 `id`）。抽出共享校验器 `validateMoodFields`（emoji/level/note 形状，POST 必填 emoji、PATCH 全可选）。PATCH 只改调用方传了的字段；DELETE 走软删。
- `cloudfunctions/moods/db.js`：新增 `findMoodById`（带 owner 隔离 + 排除软删）、`patchMood`（只改传入字段 + 复位 `is_deleted=false`）、`softDeleteMood`（置 `is_deleted=true`）；`listMoods` 加 `.eq(is_deleted, false)` 过滤；`upsertMood` 覆盖分支同时复位 `is_deleted`。
- `db/schema.sql`：`moods` 建表语句补 `is_deleted boolean not null default false`；新增迁移 `db/migration-001-soft-delete-moods.sql`（实际执行的 `ALTER` + 过滤索引，可重复跑）。
- 前端 `frontend/src/lib/api.ts`：新增 `deleteMood`（DELETE + `?id=`）；`Daily.tsx`：每条心情加「删除」按钮，`handleDeleteMood` 用 `window.confirm` **二次确认**后才发请求，成功刷新列表；`index.css` 补 `.feed-item` / `.feed-del` 样式（中性色，不踩全站禁红色红线）。

**为什么是软删除（关键决策）**：当前云函数身份是 `anon`，`schema.sql` 只把 `delete` 授给 `authenticated`——**硬删 `DELETE` 会被权限拒绝**。软删走 `update`，复用 `anon` 已有的权限，零新增权限债；且删错可找回（`is_deleted` 改回 false，或重新编辑该天即复位）。`tcb db execute` 可执行 DDL/SELECT，是加列与做「select 前后对比」验证的钥匙。

**验证（公网 curl + select 前后对比）**：见 `docs/Day22-验证截图/` 两张截图——PATCH 改前/改后字段对比、`DELETE` 后 `GET` 不再返回该条（同时 `select` 显示 `is_deleted=true` 证明软删）。增删改查四类操作闭环达成。

---

## 7. 还没定的（别照着猜）

| 还没定 | 卡在哪 | 什么时候定 |
|---|---|---|
| **跨域（CORS）** | ✅ **已解决**：Day 20 实测（修正 Day 17 的说法）——CloudBase HTTP 网关是**白名单制**：`localhost:5173` / `localhost:4173` / 本环境静态托管域名被放行（回显对应 Origin，含 `allow-credentials: true`），其他 Origin 无 ACAO 头。**不是 `*`，也不是无条件回显**。前端零 CORS 代码。换托管域名/绑自定义域名时需确认新域名在放行范围 | 2026-10-15 Day 20 复核 |
| 登录态怎么带（Header 还是 Cookie） | 取决于云服务账号能力的默认方式 | 与第一个用户数据接口同时定 |
| ✅ ~~`emoji` 白名单~~ | **已定**：§5.2「情绪白名单」7 个 id，库约束与前端共用一份 | 2026-10-15 已定 |
| ✅ ~~`note` / `text` / `nickname` 的长度上限~~ | **已定**：`note` 200 / `text` 200 / `nickname` 24（§2 通用约定） | 2026-10-15 已定 |
| 长度上限：`content`（树洞消息、社区帖子） | 聊天与社区还没开工，先不拍数字 | 阶段 3 开工前 |
| `settings.reminderTime` 有值时的形状 | 契约只写了 `null`；是 `"21:30"` 还是带时区？**做到「提醒」功能时才有真需求** | 做提醒功能时 |
| `themes` 的 id 要不要给库里也加一层「新用户默认选哪几个」 | 现在默认是空数组（= 不筛选） | 阶段 2 收尾时 |
| 内容是否先审后发（社区） | 产品 + 合规 | 阶段 4 开工前 |
| 测评的 `dimensions` / `themes` 怎么算 | **4 个量表结果 → 5 个主题的映射未裁定**（`docs/MVP实施计划.md` 冲突 6） | 裁定后 |
| 用户能不能**删**自己的一条打卡 | 产品问题，不是接口问题 | 阶段 2 收尾时 |
| 一天能记几件小进步 | 产品 | 阶段 2 收尾时 |
| 要不要回看历史测评 | 产品 | 阶段 2 收尾时 |
| 时区（现在只按 +08:00 判定「哪一天」） | 只有国内用户就不必做 | 有真实需求再说 |
| 限流（`429`） | 社区与 AI 接口都需要 | 阶段 3–4，上线前必须定 |
| 「AI 陪你复盘」 | `PRD.md` §6 四个阶段里**从未排期** | **待排**，排期定了再登记接口 |
| 🔴 **恢复 `moods` / `progress_notes` 的 RLS** | Day 17 为读演示数据**临时关闭**（见 §4.6③）；接登录后必须按 `owner_id = auth.uid()` 重开 | 接登录时同步做（不在 Day 18 板块） |
| ✅ ~~错误响应状态码怎么落~~ | **已实测确认**：Event 型云函数直接 `return { ok:false, error:{...} }` 时，HTTP 访问服务仍返回 200，业务错误放在统一信封里。这与 Day 17 `INTERNAL` 错误表现一致 | 2026-10-15 Day 18 |
| 🔴 **收回 `anon` 的 insert/update 授权** | Day 18 演示期临时执行 `grant insert, update on public.moods/progress_notes to anon`（见 §6.3）。接登录、恢复 RLS 时必须收回，否则 anon 仍可绕过 RLS 写数据 | 接登录时同步做（不在 Day 18 板块） |
| ✅ ~~检查台（`/check`）的写入测试入口要加权限或下线~~ | **已下线**（2026-10-16 Day21 收尾）：路由、页脚入口与 `pages/Check.tsx` 已移除，`spa-fallback.mjs` ROUTES 同步；写入验证由 `/daily` 的写入 UI 与 API 级测试承担。恢复须先接登录加权限（git 历史可找回） | 2026-10-16 Day21 收尾（Day 20 登记） |

---

## 8. 改契约的规矩

1. **先改本文件，再改 `db/schema.sql`，再改云函数，再改前端**——顺序不能倒。
2. 契约里每一条，云函数与前端各只允许有**一处**对应实现，不许多处各写一份。
3. 云函数侧有单元测试锁形状（`cloudfunctions/health/index.test.js`），新增接口照这个模式补测试。
4. 加了字段要问一句：**这个字段能不能让前端少做一次判断？** 不能就别加。
5. 删字段要问一句：**谁在用它？**——契约里的字段一旦发出去，前端就可能已经写死了。
6. **表结构以 `db/schema.sql` 为唯一源**，本文件只写它在接口层的形状。改表走 `alter` 追加，不要回头改 `db/schema.sql` 里已有的列定义——重跑那个文件不会改动已存在的表，只会让文件和库越走越远（原因写在文件抬头）。
7. **`db/schema.sql` 与 `db/seed.sql` 必须可重复执行**：改它们之前先自问一句「再跑一遍会不会报错、会不会丢数据」。`seed.sql` 的删除范围必须始终锁在演示身份上。
