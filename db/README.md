# 心汐 · 数据库

阶段 2（课程第 3 周）的数据层。两张脚本文件是**唯一源**：表结构以 `schema.sql` 为准，接口形状以 `api-contract.md` 为准，两者必须对得上。

---

## 1. 今天那两个问题

> **你的两张表分别存什么？它们靠哪个字段关联？**

**主对象 `profiles`** —— 存「一个人是谁」：花名、关心的主题、管家设置。**一个人一行**，主键就是登录身份（`owner_id`）。

**记录表 `moods`** —— 存「发生过什么」：哪一天、什么情绪、多强、想说的一句话。**一个人多行**，一天最多一行。

**靠 `owner_id` 关联。** `moods.owner_id` 是指向 `profiles.owner_id` 的外键。同一个字段还同时干三件事：

| 作用 | 怎么落 |
|---|---|
| 表之间关联 | 外键 `moods.owner_id → profiles.owner_id` |
| 数据隔离 | RLS 策略 `owner_id = auth.uid()`，读不到别人的行 |
| 自动归属 | 列默认值 `auth.uid()`，前端根本没机会传别人的 id |

第三张表 `progress_notes`（小进步）与 `moods` 完全同构，同一个 `owner_id`，只是没有 `level`——因为**小进步不评分**。

---

## 2. 文件

| 文件 | 干什么 | 重复执行会怎样 |
|---|---|---|
| `schema.sql` | 建 3 张表 + 约束 + 索引 + 行级权限 | 安全。只做「不存在才建」，**不删表、不丢数据** |
| `seed.sql` | 造演示数据（每张表 ≥5 行） | 安全。先按演示身份删干净再插，跑一百遍结果一样 |

**顺序不能反**：先 `schema.sql`，再 `seed.sql`。

---

## 3. 怎么跑（控制台）

CloudBase 环境 `psyisle-prod` → 控制台左侧 **数据库** → **SQL 编辑器**。

> 为什么必须用控制台的 SQL 编辑器：云函数里的数据库 SDK 只支持 `SELECT / INSERT / UPDATE / DELETE`，**不支持建表**。DDL 只能在控制台（或控制面的 `ExecutePGSql` 接口）执行。

1. 打开 SQL 编辑器，把 `db/schema.sql` **全文**粘进去，执行。
   - 看到一串 `CREATE TABLE` / `CREATE POLICY` / `GRANT` 之类的成功提示即为通过。
2. 清空编辑器，把 `db/seed.sql` 全文粘进去，执行。
   - 最后会返回一张自查表，三行的「行数」都该 **≥ 5**。
3. 左侧表列表里应该出现 `profiles` / `moods` / `progress_notes` 三张表；点进去是可以用表格方式看数据的页面。

**要如实执行的验证**：把 `seed.sql` 再跑一遍，结果应与第一次完全一致（这就是「可重复执行」的验收动作，别跳过）。

### 3.1 命令行跑法（2026-10-15 实测走通，Day 17 以后常用）

除了控制台，本机已登录的 CLI 也能直接执行 SQL（包括 DDL），省去每次开浏览器粘贴：

```bash
# 单条查询
tcb db execute -e psyisle-prod-d9g109suw53257aed --sql "select count(*) from public.moods"

# 整个文件（实测支持多语句；一次调用里 begin/commit 才是真事务）
python .workbuddy/_apply.py db/schema.sql
python .workbuddy/_apply.py db/seed.sql
```

- `_apply.py` 在 `.workbuddy/`（助手目录，不入库）。它把文件**整份**经 `subprocess` 传给 CLI，不过 shell，所以长 SQL 不会被截断。加 `--split` 可切成逐条执行，用来定位「整份失败时到底哪条不行」。
- ⚠️ **不要用 `--sql "$(< 文件)"` 这种写法**：SQL 太长会把 node 参数撑爆直接崩。要么整份交给脚本，要么拆条。
- ⚠️ Git Bash 下先 `export MSYS_NO_PATHCONV=1`，否则 `-e` 后面的环境 ID 可能被路径转换改写。

> 两条路等价，验证结果一致。**今天交的截图仍然要在控制台里截**（课程要的是「控制台数据库的表数据页」）。

---

## 4. 怎么验证（select）

在 SQL 编辑器里逐条跑。前两条是今天必须看到的，后两条是顺手把明天的路探了。

```sql
-- ① 每张表各有多少行（跑完 seed 应立即 ≠ 0）
select 'profiles' as "表", count(*) as "行数" from public.profiles
union all select 'moods',          count(*) from public.moods
union all select 'progress_notes', count(*) from public.progress_notes;

-- ② 单表直接看：最新在前的打卡流水
select id, owner_id, date, emoji, level, note, created_at
from public.moods
order by date desc;
```

第 ③ 条是今天真正的答案——**关联**不是一句说明，是一条能跑出结果的语句：

```sql
-- ③ 关联读：把心情和它所属的人连起来（靠 owner_id）
select p.nickname, m.date, m.emoji, m.level, m.note
from public.moods m
join public.profiles p on p.owner_id = m.owner_id
order by p.nickname, m.date desc;
```

```sql
-- ④ 顺手验一条约束：同一个人、同一天，插第二行会被库挡下来
--    预期：报唯一约束冲突（这正是「重复打卡 = 覆盖」在库层面的保证）
insert into public.moods (owner_id, date, emoji, level)
values ('00000000-0000-4000-8000-000000000001', '2026-10-15', 'calm', 3);
```

> 控制台的 SQL 编辑器以管理员身份执行，**会绕过行级权限**——所以在这里能看到全部 5 个演示用户的数据。等 Day 17 接口接上以后，同一个查询从用户身份发起时只会看到自己的行；那是下一步要验的事，不是今天。

---

## 5. 今天交的截图

在控制台数据库里点开表数据页，**一张表一张图**，图里要同时有表名和数据行：

- `profiles`：5 行（花名各异）
- `moods`：9 行
- `progress_notes`：6 行

截之前先在 SQL 编辑器里跑一遍第 ① 条，确认数字对得上再截——**图和数据不一致比没有图更麻烦**。

---

## 6. 常见报错

| 报错里出现 | 什么原因 | 怎么办 |
|---|---|---|
| `permission denied` / `must be owner of` | 执行身份不是表的所有者 | 确认是在**控制台 SQL 编辑器**里跑（管理员身份）。`schema.sql` 已刻意不写 `create extension`——本环境 PG 17 内置 `gen_random_uuid()`，那行反而会因非超级用户报权限错 |
| `column "owner_id" is of type uuid but expression is of type text` | 把 `owner_id` 当成 uuid 了 | 这个平台的 `auth.uid()` 返回 **text**（不是 uuid），所以 `owner_id` 是 `text`。照 `schema.sql` 写，别自己改回 uuid |
| `relation "public.profiles" does not exist`（跑 seed 时） | 顺序反了 | 先跑 `schema.sql` |
| `violates foreign key constraint` | 插 `moods` 时对应的 `profiles` 行不存在 | 这是设计使然，不是脚本坏了：检查 `profiles` 是否插成功 |
| `violates check constraint "moods_emoji_known"` | emoji 不在白名单 | 白名单见 `schema.sql` 与契约 §5.2：`calm / warm / tired / low / anxious / upset / empty` |
| `function gen_random_uuid() does not exist` | PG 版本低于 13 且没装 pgcrypto | 执行 `create extension if not exists pgcrypto;` 后重试（本环境 PG 17，不会遇到） |

---

## 7. 没建的，和为什么

| 表 | 状态 | 原因 |
|---|---|---|
| `assessments` | **不建** | `api-contract.md` §5.3：字段名定了、**算法没裁定**（4 个量表结果怎么落到 5 个主题）。现在建表等于把没定的东西先固化 |
| `chat_sessions` / `chat_messages` | 阶段 3 | 课程第 4 周 |
| `posts` / `post_likes` / `reports` | 阶段 4 | 课程第 4 周 |
| `crisis_events` | 阶段 3 | 只写不读，随对话链路一起建 |
| `users` | **永不建** | 账号体系由平台负责，本库不自存密码 |

`auth.uid()` 里的 `auth` schema 是**平台自带的账号体系**，不是我们的表——用户登录态由 CloudBase 签发，我们只存「业务数据属于谁」。
