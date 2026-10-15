# 心汐 · 第 3 周验收表（Day 21 填报）

> 2026-10-15 ｜ 环境 `psyisle-prod`（上海 · PostgreSQL 17）｜ 接口域名 `psyisle-prod-d9g109suw53257aed.service.tcloudbase.com`
> 实测人：秘书（本机公网实测，命令与原始输出全部可复现，非转述）｜ 仓库 github.com/XingHo-VibeCoding/PsyIsle
> 配图：`Day21-周验收截图/图1-周验收表.png`（与本文件同源）

**判定标准**：PASS = 当场复现通过；FAIL = 当场复现不通过；未执行 = 今天没跑，不猜、不补写。
本周验收项对应产出：schema/seed 脚本 · GET/POST 公网接口 · 分层重构 · 公网检查台 URL · api-contract.md 完整性。

---

## 1. schema/seed 脚本 —— PASS

**验证方法**

1. 仓库核对三个文件存在且内容完整：`db/schema.sql`（3 张表 + 约束 + 索引 + RLS + GRANT，171 行）、`db/seed.sql`（可重复执行，删除范围锁死 5 个演示 uuid，115 行）、`db/README.md`（跑法 + 验证语句）。
2. tcb CLI 直连生产库查三表实时行数（证明脚本跑出来的东西此刻仍在库里）。

**命令与原始输出**

```bash
tcb db execute -e psyisle-prod-d9g109suw53257aed --sql \
  "select 'profiles' as tbl, count(*) as rows from public.profiles
   union all select 'moods', count(*) from public.moods
   union all select 'progress_notes', count(*) from public.progress_notes"
```

```
┌────────────────┬──────┐
│      tbl       │ rows │
├────────────────┼──────┤
│    profiles    │  6   │   ← 5 个种子身份 + 1 个演示写入身份
│     moods      │  11  │   ← 9 条种子 + 演示身份覆盖写入
│ progress_notes │  18  │   ← 12 条种子 + 6 次演示/验收写入
└────────────────┴──────┘
i 3 record(s), completed in 8 ms        （2026-10-15 21:05）
```

**证据**：github.com/XingHo-VibeCoding/PsyIsle/blob/main/db/schema.sql · …/db/seed.sql · …/db/README.md

---

## 2. GET/POST 公网接口 —— PASS

**验证方法**：curl 五枪——health GET · moods GET · notes GET · notes POST（真实写入一条）· moods POST 非法入参（错误路径）；写入后立即全量重读，验「刷新持久化」。

**命令与原始输出**（2026-10-15 20:57–21:03，全部 `--noproxy '*'`）

```bash
# ① 探活
curl -sS -w '\nHTTP %{http_code} | %{content_type} | %{time_total}s\n' \
  "https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com/api/health"
# → {"ok":true,"service":"PsyIsle","version":"0.1.0","time":"2026-10-15T13:00:14.199Z"}
#   HTTP 200 | application/json; charset=utf-8 | 0.909771s

# ② 心情列表（date 倒序，真实库数据）
curl -sS ".../api/moods?limit=3"
# → 200；items[0] = m_seed_08（2026-10-15 · anxious · 强度 3），含契约 §5.2 全部字段

# ③ 小进步列表
curl -sS ".../api/notes?limit=3"
# → 200；返回 progress_notes 真实演示数据

# ④ 真实写入（date 省略 = 服务端按 +08:00 取今天）
curl -sS -X POST -H 'Content-Type: application/json' \
  -d '{"text":"Day 21 周验收：公网真实写入 + 刷新持久化验证"}' \
  ".../api/notes"
# → {"ok":true,"data":{"item":{"id":"n_5d60e4f4a72546be9238a073626d200f",
#     "date":"2026-10-15","text":"Day 21 周验收：公网真实写入 + 刷新持久化验证",
#     "createdAt":"2026-10-15T21:00:52.946496+08:00"}}}      POST HTTP 200

# ⑤ 写入后全量重读（刷新持久化）
curl -sS ".../api/notes?limit=50"
# → 200；全量 18 条，新行 n_5d60e4f4a72546be9238a073626d200f 在列 → 刷新不丢

# ⑥ 错误路径（非法 emoji，不写库）
curl -sS -X POST -H 'Content-Type: application/json' -d '{"emoji":"happy","level":3}' \
  ".../api/moods"
# → {"ok":false,"error":{"code":"INVALID_INPUT",
#     "message":"情绪不在允许范围内，请选择：calm / warm / tired / low / anxious / upset / empty"}}
#   HTTP 200（信封式业务错误，符合契约 §3；中文提示，无堆栈、无英文原文）
```

**结论**：五个端点公网全部 200；写入落库、重读可见（刷新持久化成立）；非法输入被拦在接口层并给中文提示。
**遗留观察**（不判 FAIL，记录到下周）：notes 同日多行并非稳定按 `createdAt` 倒序——`limit=3` 一次返回 18:14 → 19:23 → 17:56，全量一次返回 17:56 → 18:14 → 19:23 → 19:40 → 21:00，tie 次序在两次调用间不一致。契约 §4.2 只要求 `date` 倒序，故本周不判 FAIL；下周补次级排序键（`created_at desc`）。

---

## 3. 分层重构 —— PASS

**验证方法**：① 结构核对（入口层与数据访问层是否真的分开）② 当场重跑单元测试。

**结构核对**（cloudfunctions/）

| 文件 | 职责 |
|---|---|
| `moods/index.js` `notes/index.js` | 入口层：按 `httpMethod` 分发、参数校验、套错误信封。不出现 `app.rdb()`，不出现表字段名 |
| `moods/db.js` `notes/db.js` | 数据访问层：SDK 初始化、`Accept-Profile: public` 注入、表的全部增查、snake_case → camelCase 映射（全库唯一转换点，契约 §2） |
| `moods/db.test.js` `notes/db.test.js` `health/index.test.js` | 锁形状：字段映射、信封、探活口不吐基础设施线索 |

**命令与原始输出**（2026-10-15 21:06）

```bash
cd cloudfunctions/health && npm test   # → # tests 3  # pass 3  # fail 0
cd cloudfunctions/moods && npm test    # → # tests 3  # pass 3  # fail 0
cd cloudfunctions/notes  && npm test   # → # tests 2  # pass 2  # fail 0
```

**证据**：提交 6a5399d（Day 19，github.com/XingHo-VibeCoding/PsyIsle/commit/6a5399d）；契约 §6.4 重构纪要；上方当场重跑输出。

---

## 4. 公网检查台 URL —— PASS

**验证方法**：curl 探 `/check` 与 `/ 可达性；浏览器实拍沿用 Day 20 带地址栏截图。

**命令与原始输出**（2026-10-15 21:04）

```bash
curl -o /dev/null -w 'GET /check → HTTP %{http_code} | %{content_type} | %{size_download} bytes\n' \
  "https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com/check"
# → GET /check → HTTP 200 | text/html | 459 bytes
curl -o /dev/null -w 'GET / → HTTP %{http_code} | %{content_type} | %{size_download} bytes\n' \
  "https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com/"
# → GET / → HTTP 200 | text/html | 459 bytes
```

**证据**：检查台 URL `https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com/check`；Day 20 浏览器实拍（带地址栏）存于工作台 `Day20-公网验证截图/`；检查台能力清单见契约 §6.5 与 `docs/Day20-公网验证清单.md`。

---

## 5. api-contract.md 完整性 —— PASS

**验证方法**：逐节核对——该有的都有、没定的如实登记，而不是「全部已实现」。

| 核对项 | 结果 |
|---|---|
| §4 已实现 5 个端点（health / moods GET·POST / notes GET·POST）与线上行为一致 | ✅ 与本文第 2 项实测逐条对上 |
| §5 占位 17 条状态标注齐全（已实现 / 占位 / 暂缓） | ✅ 总表 + 分节均有状态 |
| §6 表 ↔ 接口对照与 `db/schema.sql` 一致（含「assessments 刻意未建」） | ✅ |
| §7 未定项如实登记，含 3 条 🔴（RLS 恢复 / 收回 anon 授权 / 检查台权限） | ✅ 未伪装成已完成 |
| §8 改契约的规矩（先契约后代码、顺序不能倒） | ✅ 纪律在文 |

**说明**：「完整性」验收的是**契约作为唯一源是否缺失或说谎**，不是「功能全部做完」——未定项如实标记正是完整性的一部分。

**证据**：github.com/XingHo-VibeCoding/PsyIsle/blob/main/api-contract.md（830 行）。

---

## 遗留与未执行项（如实标记，记录到下周，本周不修）

| # | 事项 | 归属 |
|---|---|---|
| 1 | notes 同日多行排序不稳定 → 补次级排序键 `created_at desc` | 下周（顺手修复） |
| 2 | 登录态未接通 → RLS 未恢复 · anon 的 insert/update 授权未收回 · /check 写入测试未加权限（契约 §7 三条 🔴） | 接登录时同步做，不在第 3 周范围 |
| 3 | 3 分钟演示视频：未执行 | 余力加练，今天未录 |

**下周第一件事**：接登录态——登录一通，第 2 项三条 🔴 一起收。
