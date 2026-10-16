# Day 24 · Bug 修复报告：PATCH 传 `null` 清空字段不生效

> 2026-10-15 发现 → 2026-10-16 修复并部署验证 ｜ 修复对象：`PATCH /api/moods`
> 配套文件：`docs/Day24-核心流程测试清单.md`（清单）、`docs/Day24-证据/`（前后两份输出 + 两张截图）

---

## 1. 现象（一句话）

`PATCH {"note": null}` 想把已写的附言清掉，接口回 `ok:true`「改好了」，但数据纹丝不动——**没有报错、没有提示、没有变化**。

## 2. 按可能性排序的原因，与每个原因的验证方法

Day 24 的主题是「怎么排除其他原因、锁定真正原因」。当时手里的证据是：**同一支 PATCH 改 `emoji/level/note` 为新值都成功（T6 过），唯独改成 `null` 不动（T8/T9 挂）**。这个形状直接排掉一半的嫌疑：

| 排序 | 嫌疑 | 为什么排前/排后 | 验证方法 | 结果 |
|---|---|---|---|---|
| 1 | **入口层把「传了 null」当成「没传」** | 只有改成 null 失败、改成其他值都成功 → 嫌疑高度集中在「对 null 的判定」上 | 读 `cloudfunctions/moods/index.js`，逐层追 `null` 的流向 | **命中**，见 §3 |
| 2 | 数据库不让写 null | 若 `level`/`note` 列 NOT NULL，写入会被拒 | 查 `db/schema.sql`：`level smallint`（可空）、`note text`（可空），且 CHECK 允许 `is null` | 排除 |
| 3 | 数据访问层丢弃 null 字段 | PostgREST/SDK 可能把 null 从 update payload 里剥掉 | 读 `db.js` 的 `patchMood`：`if (note !== undefined) patch.note = note` —— 只要 null 到得了这一层就会被写 | 排除（null 根本没到这一层） |
| 4 | 网关吞掉 PATCH body | 但 T6（PATCH 新值）成功，body 明明过得了网关 | T6 已顺带验证 | 排除 |
| 5 | 前端没传 | 前端目前没有「编辑」入口，本轮直接用脚本打接口 | 脚本 T8/T9 就是服务端实测 | 不适用 |

**验证方法汇总**：改值成功 / 改 null 失败的对照组（T6 vs T8/T9）＋ 逐层读代码追 null 流向 ＋ schema 确认列可空。三条证据合起来，唯一剩下的解释就是 1。

## 3. 真正的原因（一条链上三层「各自都对」）

`null` 的旅程，走到一半就消失：

```
请求体 {"note": null}
  → 校验层 validateMoodFields：if (body.note !== undefined && body.note !== null)  ← null 在这里被跳过，note 保持 undefined
  → 入口层 handlePatch：if (body.note !== undefined) fields.note = v.value.note    ← 拿到的是 undefined，等于「没传」
  → 数据层 patchMood：if (note !== undefined) patch.note = note                    ← undefined 不写，字段保持原值
```

三层各自的判断单看都自洽（「null 不算有效输入」「没传就不改」），组合起来却是：**「有没有传」被看成了「值是不是 null」**。于是接口回了成功，数据没动，也没有任何报错——这类「静默无效」比报错更难发现，因为哪一环都不会喊疼。

## 4. 修复方案（先改契约，再改代码）

**契约先行**（`api-contract.md` §4.7 新增一条）：「没传」与「传了 `null`」是两件事——
`{"note": null}`＝把附言清掉、`{"level": null}`＝取消评分；只有**请求体里压根没有这个 key** 才是「不动它」；`emoji` 不可清空（null → `INVALID_INPUT`）。

**代码**（`cloudfunctions/moods/index.js` 的 `validateMoodFields`，实质改动约 10 行）：

- 判「有没有传」只看 **key 在不在**（`body.note !== undefined`），不看值；
- key 存在且值是 `null`（`level` 的空串同义）→ value 显式给 `null`，一路传到数据层，`UPDATE` 把列写成 `NULL`；
- 形状校验（白名单 / 1–5 整数 / ≤200 字）原样保留，行为不变。

**语义锁**（`cloudfunctions/moods/index.test.js`，新增 7 条）：没传＝undefined、传 null＝null、空串＝null、emoji null 报错、越界照旧拦、POST 缺 emoji 报错。这条语义被悄悄坏过一次，测试把它钉住。

## 5. 回归验证（同一份清单重跑）

- 修复前输出：`docs/Day24-证据/修复前.txt`（T8/T9 两处 **FAIL**）
- 修复后输出：`docs/Day24-证据/修复后.txt`（T8/T9 **PASS**，其余 30 项与修复前逐条一致）
- 单元测试：`node --test cloudfunctions/moods/` → **10/10 通过**
- 部署：`tcb fn deploy moods -e psyisle-prod-d9g109suw53257aed --force`（2026-10-16 17:07），随后**公网**复测通过
- 截图：`docs/Day24-证据/修复前-bug现场.png`、`修复后-回归通过.png`（两张，内容全部来自真实输出，页面上附了可在 F12 控制台粘贴复现的脚本与重跑命令）

## 6. 沉淀

1. **「静默失败」是比报错更贵的 bug**：它不喊疼，只能靠「主动清空」这种刁钻输入才暴露。清单里那 20 项刁钻输入就是为它准备的。
2. **「有没有传」和「值是什么」是两个问题**：判定前者只能看 key 在不在请求体里。JSON 里 `undefined` 和缺 key 在序列化后等价，但 `null` 是真实存在的值。
3. **修行为先修契约**：null 语义在契约里没有约定，代码怎么写都「不算错」。先在 §4.7 写明规则，代码和测试才有据可依。
