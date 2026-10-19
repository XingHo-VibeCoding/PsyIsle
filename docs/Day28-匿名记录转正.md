# Day 28 · 匿名记录转正（注册后「之前写的」还在）

> 2026-10-19 · 提交见 `git log --grep=转正` · 未部署（见文末「上线步骤」）

## 1. 要解决的问题

注册走的是 `auth.signUp`，它会发一个**新的 uid**。匿名身份名下写过的记录 `owner_id` 还指着旧 uid，
于是注册完回到「写一写」——列表是空的。数据一直在库里，是人找不回它。

用户不会说「我的数据没跟过来」，只会说「我写的东西没了」。在这类应用里，这句话等于信任崩塌。

## 2. 为什么不能「前端记住旧 uid，登录后按它查」

那等于让客户端自己声明「这些行是我的」：任何人填别人的 uid，就能读到别人的记录。
**搬哪些行必须由服务端决定**，客户端说了不算。

## 3. 做法：一次性凭证 + 服务端搬家

```
匿名时写完一条  ──POST /api/claim {action:'issue'}──▶  库里存 sha256(code)，owner_id = 匿名 uid
注册 / 登录成功 ──POST /api/claim {action:'redeem', code}──▶  服务端把 owner_id=旧 uid 的行 UPDATE 成新 uid
```

- **code 只在签发时回给客户端一次**，库里只有 `sha256`。表被翻出来也兑不了（同「不存明文密码」）。
- **一次性**：`claimed_by` 一旦写上就不能再兑；重兑返回 `NOT_FOUND`。
- **1 小时有效**：够「写完 → 注册 → 点邮箱确认链接 → 回来」这一整段。
- **搬，不是复制**：`UPDATE owner_id`，不会出现两份；此后写的东西直接落在新账号下。
- **同名日期冲突**（`moods` 有 `unique(owner_id, date)`）：以**账号自己那行**为准，匿名那行留在原处不搬，
  计入 `skipped`。不覆盖用户已经写下的任何一条内容。
- **失败不拦人**：领不到券照样能注册；兑换那一刻断网就把券留在本地，下次打开页面在正式账号下再试一次。

## 4. 落点

| 层 | 文件 | 做了什么 |
|---|---|---|
| 表 | `db/schema.sql` §5 | 新增 `account_claims`（`code_hash` 主键 / `owner_id` / `expires_at` / `claimed_by`） |
| 接口 | `api-contract.md` §4.10 | `POST /api/claim` 两个 action 的请求、响应、错误表 |
| 云函数 | `cloudfunctions/claim/` | `index.js` 分发与错误信封；`db.js` 签发 / 兑换 / 搬家 |
| 前端 | `lib/api.ts` | `issueClaimTicket` / `redeemClaim` |
| 前端 | `lib/claim.ts` | 领券（有缓存、有并发去重）、兑换、失败留券、事件通知 |
| 前端 | `components/AuthPanel.tsx` | 注册 / 密码登录 / 验证码三条路径：换身份前领、换完后兑；搬到了就留一句结果 |
| 前端 | `pages/Daily.tsx` | 写完一条顺手领券；兑换成功 / 身份变化时重新取数 |

「写完才领券」是刻意的：只逛不写的人不该为这件事多烧一次数据库写入；没有数据也没有可搬的东西。

## 5. 验证记录

- **云函数单测**（`cd cloudfunctions/claim && node --test`）：6 例全过 —— code 32 位十六进制、两次不重复、
  入库是 sha256 且不可逆、有效期 1 小时、同日冲突只跳过冲突那几条。
- **后端错误口径自检**（`node scripts/check-error-messages.cjs`）：21 例全过，新增 7 例覆盖 `/api/claim`
  —— 库报错只回「服务出了点小状况」、未知 action / 缺 code / code 形状不对 / 券不存在 / 券过期 / 身份缺失
  各自的码与中文；另加成功形状检查（code 形状、`expiresAt`、三个计数齐全）。
- **浏览器端到端**（`.workbuddy/_claim_flow.py`，用 CDP 拦截 `/api/*`）：
  - 正常路径：点心情 → 提交 → 发 `POST /api/moods` → 发 `POST /api/claim` → `localStorage.xinyu.pendingClaim`
    里留下 code 与过期时间，表单回「记下了」。
  - 失败路径（`/api/claim` 一律 500）：写入照常成功、表单照常回「记下了」、localStorage 不留残缺值。
- **构建**：`tsc --noEmit` 通过；`npm run build` 通过；`npm run lint` 0 error。

## 6. 上线步骤（**尚未执行**，需先确认）

1. 建表（控制台 SQL 或 `tcb db execute`）：跑 `db/schema.sql` §5 那一段。
2. 部署云函数：
   ```
   tcb fn deploy claim -e psyisle-prod-d9g109suw53257aed \
     --dir cloudfunctions/claim --force --deployMode zip --install-dependency true
   ```
   （`--force` 必加：非 TTY 会卡在交互确认；一次只发一个函数。）
3. 加网关路由：`/api/claim` → SCF `claim`，**开启身份认证**（与 `/api/moods` 同款）。
4. 前端三步：`npm run build` → `node scripts/spa-fallback.mjs` → `tcb hosting deploy frontend/dist -e <env> --verify`。

## 7. 已知限制

- `progress_notes` 没有 `DELETE` 接口，转正后「小进步」仍然删不掉（与本次无关，登记在案）。
- 三张业务表（`profiles` / `moods` / `progress_notes`）的 RLS 仍是「登录收尾时统一收」的状态；
  `account_claims` 因为只存哈希，即使漏网也不会直接泄漏记录。
- 「提建议」的问卷仍是本地存储，「关于」页已经按这件事分开写了：云端的是什么、只在本机的是什么。
