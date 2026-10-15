---
name: verify-project
description: 心汐发布前的统一检查。上线 / 部署 / 交作业前跑一遍，逐项给出 PASS/FAIL 与证据：密钥有没有进仓库、构建过不过、环境变量有没有真的内联、子路由 fallback 齐不齐、公网接口通不通、跨域白名单对不对、接口字段形不形状、错误提示有没有漏内部细节、重复写入会不会变两行、软删生不生效、危机入口在不在、文档链接有没有失效。当有人说「发布前检查」「上线前验一遍」「跑一遍 verify」「检查一下能不能发」「verify-project」时使用。
---

# 发布前检查 verify-project

## 一句话
把「上线前要过一遍的那些事」从人肉记忆变成一条命令：`node scripts/verify-project.mjs`，逐项给 PASS/FAIL 和证据，FAIL 不许靠感觉放行。

## 为什么要有它
这个项目的坑有个共同点：**每一条都踩过，每一条都还会再踩**——因为它们都不是「代码写错了」，而是「漏了一步」：

- 忘了跑 `spa-fallback.mjs` → 子路由直接输地址 404，但从首页点进去永远发现不了；
- `.env` 改了没重新 build → Vite 是构建期内联，页面请求打到自己域名；
- `.gitignore` 漏了 `.env.production` → 某天一句 `git add .` 就把真值推上去；
- 错误提示写成 `'RDB_ERR:' + JSON.stringify(...)` → 把 SQL 和堆栈甩给用户；
- 同一天重复提交变成两行 → 唯一约束没兜住。

这些事靠「记得」是靠不住的。这个 Skill 把它们钉成 12 条可执行的判据，跑完落一份报告，和上一次对照就知道有没有退步。

## 怎么跑

```
node scripts/verify-project.mjs                 # 用现有 dist + 公网接口检查（快，约 20 秒）
node scripts/verify-project.mjs --with-build    # 先重新构建再检查（慢，结论最硬，发版前用这个）
node scripts/verify-project.mjs --skip-net      # 断网时只跑本地 6 项
node scripts/verify-project.mjs --out <路径>    # 指定报告落点
```

- 退出码：`0` = 无 FAIL；`1` = 有 FAIL。**有 FAIL 就不要发。**
- 报告默认落在 `skills/verify-project/runs/YYYY-MM-DD.md`（同一天多次跑自动加序号）。
- 前置：仓库根执行；公网项需要网络；`git` 与 `npm` 可用（本机 git 不在 PATH，脚本内置了兜底路径）。

## 检查项（12 条）

### 一、仓库与构建（本地，不用网络）

| # | 检查 | 怎么判 | 通过标准 | 踩坑出处 |
|---|---|---|---|---|
| V1 | 密钥与敏感文件没进仓库 | `git ls-files` + `git diff --cached` 拿入库清单；`git check-ignore` 探 7 个易漏名字；内容扫强/弱密钥特征 | 入库清单里没有 `.env*`（`.env.example` 除外）/ `cloudbaserc*.json` / 私钥；7 个探测名全被拦；内容 0 命中 | Day 23：`.gitignore` 只写了 `.env/.env.local`，漏了 `.env.production` |
| V2 | 构建能过、产物在（且不旧于源码） | `--with-build` 时跑 `npm run build` 看退出码；否则比对 `dist/index.html` 与 `src/` 最新 mtime | 构建退出码 0；`dist/index.html` 存在；**产物 mtime ≥ 源码最新 mtime** | Day 20：构建失败还照样部署；补的判据：拿旧产物判 PASS 不算数 |
| V3 | `VITE_API_BASE` 真的进构建产物 | 在 `dist/assets/*.js` 里搜接口域名 | 至少 1 个 bundle 命中 | Day 20：改了 `.env` 没重新 build，页面请求打到自己域名 404 |
| V4 | 每条子路由都有 fallback 入口 | 从 `App.tsx` 解析顶层路由，逐个查 `dist/<route>/index.html` | 一条都不缺 | Day 20：静态托管不做 fallback，忘了跑脚本时 `/daily` 直开 404 |

### 二、公网接口（要网络）

| # | 检查 | 怎么判 | 通过标准 | 踩坑出处 |
|---|---|---|---|---|
| V5 | 公网探活与契约形状 | `GET /api/health` | 200 + JSON + `ok/service/version/time` 四项齐，`service='PsyIsle'` | Day 15：部署完第一件事 |
| V6 | 跨域白名单生效 | 带 `Origin` 探三个：托管域名 / `localhost:5173` / `evil.example.com` | 前两个回显自身 ACAO，陌生域名**没有** ACAO 头 | Day 20：网关是白名单制，不是 `*` |
| V7 | 接口字段形状对得上契约 | `GET /api/moods?limit=1` 看单行 | 有 `createdAt`（camelCase）、无 `created_at`、emoji 在 7 个白名单内 | Day 17：库里 `created_at`、契约 `createdAt`，前端取到 undefined |
| V8 | 错误给人话，不外泄 | `POST /api/moods {emoji:'__not_a_mood__'}` | HTTP 200 + `ok:false` + `INVALID_INPUT` + 中文提示 + 不含 SQL/堆栈/英文原文 | Day 23：以前直接把 `RDB_ERR`/`THROW` 原文给用户 |
| V9 | 写入幂等 | 同一日期 POST 两次（换情绪），再 GET 数行数 | 两次同一个 id；该日期只有 1 行；内容是后一次 | Day 18：同日重复要靠 `unique(owner_id,date)` 兜底 |
| V10 | 软删生效、删错能知道 | `DELETE ?id=` → GET 复查 → 再删一次 | 删后列表查不到；第二次明确报 `NOT_FOUND`（不静默成功） | Day 22：删除比新增更容易出事 |

> V9/V10 只写固定测试日期 **2020-01-01**（演示数据都在 2026-10），跑完自己软删清理，不碰演示数据。

### 三、产品红线与文档

| # | 检查 | 怎么判 | 通过标准 | 踩坑出处 |
|---|---|---|---|---|
| V11 | 危机入口常驻 | 扫 `App.tsx` 与 `src/` | `to="/help"` ≥2 处（导航 + 页脚）；源码里有 `12356`；号码带 `tel:` | PRD §2 三条不可破底线之一 |
| V12 | 文档里的相对链接没失效 | 扫全仓 `.md` 的站内相对链接（排除 `docs/备查/`） | 0 个失效 | AGENTS §10：改口径要全文搜旧说法 |

### 脚本查不了、发之前必须人确认的三件事

这三项需要数据库权限与登录态，脚本给不出证据，**不自动判 PASS**——每次跑完会在结尾打印出来：

1. 收回 `anon` 的 insert/update 授权（Day 18 演示期临时开的）；
2. 恢复 `moods` / `progress_notes` 的 RLS（Day 17 临时关的）；
3. 检查台 `/check` 的写入入口加权限或下线（现在公网任何人可点、会真写库）。

## 输出格式

控制台逐项三行：结论（PASS/FAIL/SKIP）、一句话判词、证据行（真实命令输出与响应片段）。
报告落 `runs/YYYY-MM-DD.md`：一张总表（# / 检查项 / 结果 / 一句话 / 踩坑出处）+ 逐项证据 + 人工确认清单。

**结果只有三种**：`PASS` 有证据、`FAIL` 有证据、`SKIP` 写明为什么跳过。**不允许「看不出问题就算通过」**——拿不到证据就 FAIL。

## 误报与漏报怎么处理

第一次实跑（2026-10-16）的两条经验，改判据时照这个思路：

- **误报**（判成 FAIL 但其实没问题）：放松判据要写清「为什么这个不算问题」，别直接删掉检查项。例：V1 的内容扫描要排除占位值（`你的…`/`xxx`/`${`），否则模板文件会被误杀。
- **漏报**（有问题却判 PASS）：补判据，并在报告里写明补它的原因。例：V2 原来只看「dist 在不在」，放过「源码改了、产物是上一版」的假通过，于是加了产物新鲜度比对。
- **新踩一个坑，就加一条检查项**：在 `scripts/verify-project.mjs` 里加一个 `vN()`，把「怎么判 / 通过标准 / 踩坑出处」写进本文件的表格。检查项只增不删——删掉的检查项，就是下次会踩的坑。

## 已知边界

- 不部署、不修改任何文件（除了写报告），**只做检查**；
- 公网项依赖 CloudBase 在线；测试域名首次访问的风险提醒页不影响程序化请求；
- V9/V10 会真写库（固定测试日期 + 软删清理），库里会留一行 `is_deleted=true` 的占位数据；
- 不替代人工验收：页面好不好看、文案对不对，得人来看。
