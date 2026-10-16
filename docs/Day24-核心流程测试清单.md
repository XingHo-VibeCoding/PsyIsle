# Day 24 · 核心流程测试清单

> 2026-10-15 ｜ 第 4 周「找到Bug、修掉它、留下证据」
> **同一份清单，修复前后各跑一遍**，两份证据存档在 `docs/Day24-证据/`。

---

## 0. 先说这套清单覆盖哪条链路

你的原话是「打开检查台 → 读取 plan_days/checkins → 写入打卡 → 刷新确认 → 修改 → 删除」。
仓库里**没有** `plan_days` / `checkins` 这两张表——本项目的对应物是：

| 你清单里的名字 | 本项目实际的落点 | 说明 |
|---|---|---|
| 「检查台」 | `/check` 页面 + `GET /api/health` | Day 20 上线，页脚进入 |
| `plan_days` | `public.moods`（心情打卡，一天一行） | 契约 §5.2， Day 16 建表、Day 17 读、Day 18 写 |
| `checkins` | `GET/POST /api/notes`（一件件小事，一天可多件） | 契约 §5.2 |
| 写入打卡 | `POST /api/moods` | 同日重复＝**覆盖**（幂等） |
| 修改 | `PATCH /api/moods?id=` | Day 22 上线 |
| 删除 | `DELETE /api/moods?id=`（**软删**，可找回） | Day 22 上线 |

形状是完全一样的：**读 → 写 → 刷新确认 → 改 → 删**。所以清单照着这条真实链路写，不改名。

---

## 1. 跑之前的三件事

| 项 | 值 |
|---|---|
| 接口地址 | `https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com` |
| 前端地址 | `https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com/` |
| 测试日期 | `2026-10-16`（**明天**，不是今天） |

**为什么测试日期用明天**：`moods` 有 `unique (owner_id, date)`，同一天重复提交＝覆盖（契约 §4.4）。拿今天跑会把当天的演示打卡抹掉。这不是洁癖，是 Day 20 就踩过的坑。

脚本自带收尾：跑完把测试日期产生的行软删掉，库里不留垃圾。

```bash
# 修复前
node scripts/flow-test.mjs > docs/Day24-证据/修复前.txt

# 修复后（同一份脚本、同一批用例，只换输出文件）
node scripts/flow-test.mjs > docs/Day24-证据/修复后.txt
```

---

## 2. A 段 · 完整链路（主干）

| # | 步骤 | 操作 | 期望 | 判定点 |
|---|---|---|---|---|
| T1 | 检查台通不通 | `GET /api/health` | `ok:true`、`service=PsyIsle` | HTTP 200 |
| T2 | 读「plan_days」 | `GET /api/moods?limit=200` | 返回列表，按 `date` 倒序 | HTTP 200 + `items` 是数组 |
| T3 | 读「checkins」 | `GET /api/notes?limit=200` | 返回列表 | HTTP 200 + `items` 是数组 |
| T4 | **写入打卡** | `POST /api/moods {date,emoji,level,note}` | `ok:true` + 回 item | 拿到 `id` |
| T5 | **刷新确认** | `GET /api/moods` | 条数 +1，能看到刚写的那一行 | 有值且同 `id` |
| T6 | **修改** | `PATCH /api/moods?id= {emoji,level,note}` | `ok:true` + 回改后那行 | 三个字段跟着变 |
| T7 | 刷新确认修改 | `GET /api/moods` | 列表里是改后的值 | 与 T6 一致 |
| T8 | 刁钻：清空附言 | `PATCH {note:null}` | **附言应该消失，回读= `null`** | 回读 `note === null` |
| T9 | 刁钻：取消评分 | `PATCH {level:null}` | **强度应该消失，回读= `null`** | 回读 `level === null` |
| T10 | 幂等：同日再写 | `POST /api/moods` 同一天第二次 | id **不变**、行数仍然 1 | 覆盖而非新增 |
| T11 | **删除** | `DELETE /api/moods?id=` | `ok:true` + `deleted:true` | 列表里消失 |
| T12 | 重复删除 | `DELETE` 同一 id 第二次 | 信封 `NOT_FOUND` + 中文 | 不允许静默成功 |

---

## 3. B 段 · 刁钻输入（20 项）

空值 / 越界 / 非法枚举 / 边界值 / 坏 JSON / 缺参数：

| # | 用例 | 期望 |
|---|---|---|
| C1 | POST 缺 `emoji` | `INVALID_INPUT` + 中文提示哪个字段少了 |
| C2 | POST `emoji: ""` | `INVALID_INPUT` |
| C3 | POST `emoji: "happy"`（白名单外） | `INVALID_INPUT` |
| C4 | POST `level: 0` | `INVALID_INPUT` |
| C5 | POST `level: 6` | `INVALID_INPUT` |
| C6 | POST `level: 2.5` | `INVALID_INPUT` |
| C7 | POST `level: "3"`（字符串） | 观察项：当前放宽为接受（见 §5 ❗2） |
| C8 | POST `note` 201 字 | `INVALID_INPUT`，提示带上当前字数 |
| C9 | POST `note` 200 字（边界内） | 成功 |
| C10 | POST `date: "2026/10/16"` 格式错 | `INVALID_INPUT` |
| C11 | POST 请求体不是 JSON | `INVALID_INPUT`「请求体必须是合法 JSON」 |
| C12 | PATCH 缺 `id` | `INVALID_INPUT` |
| C13 | PATCH 一个字段都不传 | `INVALID_INPUT` |
| C14 | PATCH 不存在的 id | `NOT_FOUND` + 中文 |
| C15 | DELETE 缺 `id` | `INVALID_INPUT` |
| C16 | DELETE 不存在的 id | `NOT_FOUND` + 中文 |
| C17 | POST notes `text: ""` | `INVALID_INPUT` |
| C18 | POST notes 201 字 | `INVALID_INPUT` |
| C19 | `GET /api/moods?limit=abc` | 回落到默认 50，不报错（空状态不是错误） |
| C20 | `GET /api/moods?limit=999` | 被上限 200 夹住 |

---

## 4. C 段 · 快速连点（并发）

同一天**同时**发 5 次 `POST /api/moods`：

- **必须**：该 owner 这一天最后只有 **1 行**（唯一约束 + upsert 兜住）。
- **允许**：5 次写入互相覆盖，最终内容是其中任意一次的内容（并发顺序不确定）。
- **不允许**：出现 2 行以上，或报出 `INTERNAL`/英文原文。

---

## 5. 本轮结果

### 修复前（2026-10-15 16:03，`docs/Day24-证据/修复前.txt`）

| 段 | 结果 |
|---|---|
| A 段 T1–T7, T10–T12 | ✅ 全部符合期望 |
| **T8 PATCH {note:null}** | ❌ **FAIL** —— 接口回 `ok:true`，回读 `note` 仍是 `"Day24 修改·已改"`，没被清掉 |
| **T9 PATCH {level:null}** | ❌ **FAIL** —— 同上，回读 `level` 仍是 `5` |
| B 段 20 项 | ✅ 全部符合期望 |
| C 段 连点 | ✅ 5 发后仍只有 1 行 |

**T8/T9 就是本轮要修的那个 Bug**：接口说「改好了」，数据没动，且**一句报错都没有**。

### 修复后（2026-10-16 17:08，`docs/Day24-证据/修复后.txt`）

| 段 | 结果 |
|---|---|
| **T8 PATCH {note:null}** | ✅ **PASS** —— 回读 `note = null`，附言真的没了 |
| **T9 PATCH {level:null}** | ✅ **PASS** —— 回读 `level = null`，评分真的取消了 |
| A 段其余（T1–T7 / T10–T12） | ✅ 与修复前逐条一致，没有因为这次修复变差 |
| B 段 20 项 | ✅ 与修复前逐条一致 |
| C 段 连点 | ✅ 5 发后仍只有 1 行 |
| 单元测试 | ✅ `node --test cloudfunctions/moods/` 10/10 过（含新加的 7 条「null=清空」语义锁） |

修复后的云函数已部署公网并实测（`tcb fn deploy moods --force`，2026-10-16 17:07）。
定位与修复的完整过程见 `docs/Day24-Bug修复报告.md`；截图在 `docs/Day24-证据/修复前-bug现场.png` 与 `修复后-回归通过.png`。

### 观察项（今天不修，登记在 §6）

1. **同一天在列表里出现多行**：`GET /api/moods` 现在返回**所有演示身份**的行（10-15 有 3 行），因为演示期刻意关闭了 RLS、函数读全量数据（契约 §4.6③）。接登录后务必按 owner 过滤，届时这一节要改。
2. **`level: "3"` 字符串被接受**：校验器用 `Number()` 做了宽松转换，契约 §5.2 写的是「整数」。属于宽松而非错误，改动契约才动得了，登记给「阶段 2 收尾」。
3. **notes 同日多行顺序不稳**（Day 21 遗留）：只按 `date` 倒序，缺次级排序键，同日两行的先后在不同调用之间会跳。本周清单覆盖到了读 notes 这一步但没复现出来，等补 `created_at desc` 次级排序键时一并修。

---

## 6. 反馈模板（发现问题时照这个填给我）

```
现象：屏幕上/接口里你实际看到的样子（一句话，不含猜测）
复现步骤：1) 打开___ 2) 点___ 3) 输入___
报错原文：控制台或接口返回的**完整原文**（不要改写一个字，截图也行）
已尝试动作：你已经试过什么、结果分别是什么
```

把「报错原文」一栏留**原样**最重要——它是我定位的唯一入口，改写后的报错会把人带到错的地方去。

---

## 7. 回归验证清单（修复后必跑）

- [x] `node scripts/flow-test.mjs > docs/Day24-证据/修复后.txt`（2026-10-16 17:08）
- [x] T8 显示 `PASS 已清空`
- [x] T9 显示 `PASS 已清空`
- [x] T1–T7、T10–T12 保持和修复前一致（**不得**因为修这个 Bug 而变差）
- [x] B 段 20 项结果与修复前逐条一致
- [x] C 段连点后行数仍为 1
- [x] 单元测试 `node --test cloudfunctions/moods/` 全过（10/10）
- [x] 公网（不是本地）复测同一条链路（部署后实测）
