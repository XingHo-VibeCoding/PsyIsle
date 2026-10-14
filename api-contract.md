# 心屿 · 接口契约

> Day 15 起生效 ｜ 前端与云端之间的**唯一**约定
> 任何接口的路径、入参、返回结构，先写在这里，再写代码。

---

## 1. 这份文件管什么

- **管**：云端接口对外的形态——路径、方法、请求体、响应体、错误、鉴权。
- **不管**：数据库表结构（Day 16 起另立）、页面结构（见 `PRD.md` 与 `docs/设计规范.md`）。
- 现在只有 1 个接口：`GET /api/health`。后续接口按同一套约定追加，**不另立风格**。

---

## 2. 通用约定

| 项 | 约定 |
|---|---|
| 基础地址 | `https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com`（环境 `psyisle-prod`，上海地域）。这是「HTTP 访问服务」的默认域名，云函数的路由挂在它下面 |
| 环境 ID 放哪 | 由控制台给出，写进 `frontend/.env` 的 `VITE_TCB_ENV_ID`（`.env` 不入库）；**代码里不写死域名** |
| 路径前缀 | 所有接口都在 `/api` 下 |
| 方法 | 读用 `GET`，写用 `POST`。本阶段不用 `PUT` / `DELETE` |
| 编码 | UTF-8，请求体与响应体一律 JSON |
| 字段命名 | camelCase。数据库的 snake_case 只在数据层转换，**转换只允许有一个点** |
| 时间 | ISO 8601 UTC 字符串，例 `2026-10-14T15:20:00.000Z`。不用时间戳数字 |
| 鉴权 | **本接口无鉴权。** Day 16 起凡是用户数据接口必须带登录态，且**任何用户读不到别人的数据** |

---

## 3. 统一信封

**成功**（HTTP 200）

```json
{ "ok": true, "data": {} }
```

**失败**（HTTP 4xx / 5xx）

```json
{ "ok": false, "error": { "code": "INVALID_INPUT", "message": "给人看的短句" } }
```

- 前端只判 `ok`，不解析 `message` 做逻辑。
- `error.message` 不出现堆栈、SQL、内部路径、英文报错原文——它是给用户看的。
- `code` 用大写下划线，先定四个：`INVALID_INPUT` / `UNAUTHORIZED` / `NOT_FOUND` / `INTERNAL`。
- **成功态怎么落（2026-10-14 实测）**：云函数是 Event 型，`exports.main` **直接 return 一个对象**，HTTP 访问服务把它原样当响应体发出去，`Content-Type: application/json; charset=utf-8`、HTTP 200。**不用写 `statusCode` / `headers` / `body` 那层集成响应外壳**——少一层壳，就少一个以后会写错的地方。

---

## 4. `GET /api/health`

**用途**：确认「前端 → 云端」这条管道通不通。**不是给用户看的页面。**

**请求**：无参数、无请求体、无请求头要求。

**200 响应**

```json
{
  "ok": true,
  "data": {
    "service": "xinyu-api",
    "version": "0.1.0",
    "time": "2026-10-14T15:20:00.000Z"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.service` | string | 固定 `xinyu-api`，用来确认地址没打错 |
| `data.version` | string | 接口版本，随契约变更递增 |
| `data.time` | string | 服务端当前时间（ISO 8601 UTC），用来排除缓存 |

**刻意不返回**：环境 ID、地域、数据库地址、任何密钥。这是公网无鉴权接口，不给陌生人画基础设施地图。（域名本身自带环境 ID，藏不住——但接口自己一句都不说。）

**实测（2026-10-14，Day 15）**

```
GET https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com/api/health
200 OK  ·  application/json; charset=utf-8
{"ok":true,"data":{"service":"xinyu-api","version":"0.1.0","time":"2026-10-14T15:53:24.890Z"}}
```

---

## 5. 本轮还没定的（别照着猜）

| 还没定 | 什么时候定 |
|---|---|
| 跨域（CORS） | Day 16–20，在 HTTP 网关的路由设置里配。**在那之前前端不能直连这个接口**，页面继续用本地 mock 数据 |
| 登录态怎么带（Header 还是 Cookie） | Day 16 起，与第一个用户数据接口一起定 |
| 业务接口（心情 / 小进步 / 测评作答） | Day 16 起，逐个追加到第 4 节 |
| 错误响应状态码怎么落（HTTP 4xx/5xx 具体怎么发出来） | 与第一个业务接口同时实测确认，结果回写第 3 节。成功态已实测（见第 3 节末条） |

---

## 6. 改契约的规矩

1. **先改本文件，再改云函数，再改前端**——顺序不能倒。
2. 契约里每一条，云函数与前端各只允许有一处对应实现，不许多处各写一份。
3. 云函数侧有单元测试锁信封形状（`cloudfunctions/health/index.test.js`），新增接口照这个模式补测试。
