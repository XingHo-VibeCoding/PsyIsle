# Day 25 · 发布前检查 Skill（verify-project）验证记录

> 2026-10-16 00:0x 完成三轮实跑 ｜ 交付物：`skills/verify-project/SKILL.md` + `scripts/verify-project.mjs`
> 今天要掌握的一句：**你故意弄坏哪一项来验证 Skill 不会虚报通过？——弄坏了两个：① 伪造一个含密钥的 `.env.production` 并 `git add -f` 强推进暂存区；② 构建后故意不跑 `spa-fallback.mjs`。两个都被查出来了（V1、V4 双 FAIL）。**

---

## 一、检查项从哪来（全部来自本项目踩坑记录）

12 条检查项，每条都能指出它防的是哪次坑：

| 组 | 项 | 防的坑（出处） |
|---|---|---|
| 仓库与构建 | V1 密钥没进仓库 | Day 23：`.gitignore` 漏 `.env.production` |
| | V2 构建能过且产物不旧于源码 | Day 20：构建失败照样部署 |
| | V3 `VITE_API_BASE` 内联生效 | Day 20：改 `.env` 没重新 build |
| | V4 子路由 fallback 齐备 | Day 20：忘了跑 `spa-fallback.mjs` → 直开 404 |
| 公网接口 | V5 探活与契约形状 | Day 15：部署完第一件事 |
| | V6 跨域白名单 | Day 20：白名单制，不是 `*` |
| | V7 字段形状 camelCase | Day 17：`created_at` vs `createdAt` |
| | V8 错误不外泄内部细节 | Day 23：`RDB_ERR:`/`THROW:` 直接给用户 |
| | V9 写入幂等 | Day 18：同日重复变两行 |
| | V10 软删生效、删错能知道 | Day 22：删除比新增更容易出事 |
| 红线与文档 | V11 危机入口常驻 | PRD §2 不可破底线 |
| | V12 文档链接没失效 | AGENTS §10：改口径防漂移 |

另有 **3 项脚本给不出证据、只打印提醒不判 PASS**（契约 §7 三条 🔴：收回 anon 写授权 / 恢复 RLS / 检查台加权限）——不给证据的事不许虚报通过。

## 二、三轮实跑

### 第 1 轮（00:01）—— 摸底，暴露 1 真 FAIL + 1 漏报

`node scripts/verify-project.mjs`（用现有 dist）→ **11 PASS / 1 FAIL**

- **真 FAIL（V4）**：dist 里 7 条子路由入口全缺——因为当时 dist 是刚 build 完、还没跑 spa-fallback 的状态。查得对，这就是 Day 20 的坑原样复现。
- **漏报（自己复盘发现的）**：V2 只看「dist 在不在」，会放过「源码改了、产物还是上一版」的假通过。
- **修正**：V2 补产物新鲜度判据（`dist/index.html` 的 mtime 必须 ≥ `src/` 最新 mtime），并在报告里写明补它的原因。

### 第 2 轮（00:05）—— 故意弄坏两项，验证不虚报

`node scripts/verify-project.mjs --with-build` → **10 PASS / 2 FAIL**（截图 1）

| 故意留的问题 | 查出情况 |
|---|---|
| ① 伪造 `frontend/.env.production`（内含假密钥 `sk-verifyproject…`）并 `git add -f` 强推进暂存区 | **V1 三处证据全中**：已入库的敏感文件 / 忽略规则没拦住 / 内容命中「疑似 OpenAI 风格密钥」 |
| ② 构建后故意不跑 `spa-fallback.mjs` | **V4 FAIL**：缺 7 条 `dist/<route>/index.html`，并给出修法 |

其余 10 项照常 PASS（公网接口、幂等、软删、危机入口等在真实链路上验证）。

### 第 3 轮（00:09）—— 修复后确认

撤销两个故意问题（`git rm --cached` + 删文件；跑 `spa-fallback.mjs`）→ 重新 build + fallback → **12 PASS / 0 FAIL，可以发**（截图 2）

> 期间还白捡一次新判据的实战：中间一轮 V2 报「产物比源码旧」——当时 Day 24 板块正在改云函数源码，判据如实拦下，说明新鲜度检查不是摆设。

## 三、误报与漏报的处理结论

- **误报**：本轮无。V1 内容扫描一开始就排除了占位值（`你的…`/`xxx`/`${`），`.env.example` 模板没被误杀。
- **漏报**：1 条（V2 产物新鲜度），已补判据并在脚本注释里写明原因。
- 处理原则已写进 SKILL.md：误报放松判据要说清为什么；漏报补判据；检查项只增不删。

## 四、改动清单（全部属于 Day 25）

| 文件 | 干什么 |
|---|---|
| `skills/verify-project/SKILL.md` | Skill 定义：12 项检查的命令 / 通过标准 / 踩坑出处 + 误报漏报处理原则 |
| `scripts/verify-project.mjs` | 检查脚本（纯 Node 零依赖），跑完落报告、FAIL 时退出码 1 |
| `skills/verify-project/runs/2026-10-16*.md` | 四轮实跑报告存档 |
| `docs/Day25-验证截图/01-…png` | 第 2 轮：故意留的两个问题被查出（V1 + V4 FAIL） |
| `docs/Day25-验证截图/02-…png` | 第 3 轮：修复后 12 PASS / 0 FAIL |
| `README.md` | 「发布前检查」用法写进 README（余力加练） |

## 五、怎么用（下次发布前）

```
node scripts/verify-project.mjs --with-build
node scripts/spa-fallback.mjs     # 如果上一步带了 build
tcb hosting deploy frontend/dist -e psyisle-prod-d9g109suw53257aed --verify
```

第一条命令 12 项全 PASS 才走后面两步。

---

## 六、「完成后检查」四条实测（2026-10-16 00:1x 补做）

### 1. 真实工作检测（防走形式）——坏→FAIL、好→PASS 两张截图

把 `frontend/.env` 的 `VITE_API_BASE` 故意改成不存在的环境 `psyisle-wrong-env-000000`：

| | 结果 |
|---|---|
| 坏（截图 3） | **5 PASS / 8 FAIL / 2 SKIP**：V3「环境变量内联」FAIL（产物里搜不到错域名）、V5「公网探活」FAIL（404 INVALID_ENV），依赖公网地址的 V6–V9/V12 连锁 FAIL，V10/V11 如实 SKIP（拿不到测试 id，写明原因） |
| 好（截图 4） | `.env` 改回后重跑：**V3/V5 恢复 PASS**（对应项坏→FAIL、好→PASS ✓） |

结论：Skill 不是摆设——它真读 `.env`、真打公网，改坏立刻见红。

### 2. 输出可信检测——随机抽 2 项亲手重做

抽 **V6（跨域白名单）** 与 **V10（软删+NOT_FOUND）**，另写一份独立命令（不走 verify-project.mjs）手工重做：

- V6 三个 Origin（托管域名回显自身 / localhost:5173 回显自身 / 陌生域名无 ACAO 头）→ **3/3 与 Skill 结论一致**；
- V10 四步（写入拿到 id → 删除 ok+deleted:true → 列表复查已消失 → 再删报 `NOT_FOUND`+中文）→ **4/4 一致**；
- 结论：两项的「怎么算通过」都能照着落地，不是虚标准。

### 3. 复用性检测——新对话能接得住

- Skill 已存为仓库内 `skills/verify-project/SKILL.md`，并补了**「新对话怎么用（本文件自足）」**一节：粘贴全文说「按这份清单逐项检查」，或直接说「运行 verify-project」→ 执行 `node scripts/verify-project.mjs`，对照检查项表核验输出；并写明「只认 PASS/FAIL/SKIP 三种结果，出现模糊表述＝没跑对」。

### 4. 覆盖度检测——Day 15–24 的坑逐条对照

| 来源 | 当时的坑 | 对应检查项 |
|---|---|---|
| Day 15 | health 上线要验公网可达与返回形状 | V5 |
| Day 17 | 库里 `created_at` vs 契约 `createdAt` | V7 |
| Day 17 | RLS 临时关闭 / anon 开写授权 | 人工确认清单（契约 §7 三条 🔴） |
| Day 18 | 同日重复提交变两行 | V9 |
| Day 18 | 部署三坑（函数目录内 / zip 模式 / MSYS 路径改写） | SKILL「已知边界」提醒（脚本不部署） |
| Day 19 | 分层重构后全接口回归 | V5–V13 整组接口回归 |
| Day 20 | 跨域白名单不是 `*` | V6 |
| Day 20 | `.env` 改了没重新 build | V3 |
| Day 20 | 构建失败照样部署 | V2（含产物新鲜度） |
| Day 20 | 忘跑 spa-fallback → 子路由 404 | V4（本地）+ V13（线上直开） |
| Day 20 | 部署像没生效 / CDN 缓存 | V13（线上 bundle 与本地逐字节比对） |
| Day 21 | notes 同日多行排序不稳（遗留，未修） | 登记为已知遗留，不设检查项（修了才设） |
| Day 22 | 软删生效、删不存在不许静默成功 | V10 |
| Day 23 | `.gitignore` 漏 `.env.production` | V1（`git check-ignore` 探 7 个变体名） |
| Day 23 | 裸报错外泄 SQL/堆栈 | V8 |
| Day 24 | T8/T9：PATCH 清空「说好了但没改」 | **V11（本次新增）** |
| Day 24 | C 段：并发连点同日仍须 1 行 | **V12（本次新增）** |
| Day 24 | 测试日期不能抹演示数据 | V9–V12 固定用 2020-01-01 |
| Day 21 老板自测 | #7 无触发按钮 / #8 无写入 UI | UI 类，人工验收（SKILL 已知边界写明） |

**对照结论：没有无主之坑。** 自动化覆盖不到的三类（DDL/RLS 控制台操作、UI 体验、部署命令坑）都落在「人工确认清单」或「已知边界」里，不冒充 PASS。

### 覆盖度检测的产出：Skill 从 12 项扩到 15 项

新增 V11（PATCH 清空）、V12（并发连点）、V13（线上与产物一致）后立刻实跑，**抓到两个真问题**（`runs/2026-10-16-4-加三项.md`）：

1. **V11 FAIL**：公网 `PATCH {note:null}/{level:null}` 回 `ok:true` 但数据没动——**Day 24 修的 Bug 在公网云函数上还没生效**（本地代码已改，云函数未重新部署）；
2. **V13 FAIL**：线上跑的 bundle（`index-ClG03SM6.js`）不在本地最新 dist 里——本地新构建还没部署到静态托管。

两个 FAIL 都是「本地已改、线上没更」的真实状态，正是发布前检查该拦的事。消除方法（部署云函数 + 部署前端）涉及把另一板块的在改代码推上线，等老板点头再动。

### 本次检测新增的截图与报告

| 文件 | 内容 |
|---|---|
| `docs/Day25-验证截图/03-真实工作检测-坏-接口地址改错.png` | 坏：V3/V5 及连锁 8 FAIL |
| `docs/Day25-验证截图/04-真实工作检测-好-恢复后V3V5回PASS.png` | 好：V3/V5 恢复 PASS |
| `skills/verify-project/runs/2026-10-16-4-加三项.md` | 新三项首跑，抓到 V11/V13 真问题 |
| `skills/verify-project/runs/2026-10-16-5-故意改坏接口地址.md` | 坏状态报告 |
| `skills/verify-project/runs/2026-10-16-6-恢复后确认.md` | 好状态报告 |
