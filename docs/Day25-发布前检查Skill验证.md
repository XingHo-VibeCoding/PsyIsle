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
