# Day 27 · CloudBase 资源检查任务（心汐）

> 目的：回答三个问题——**现在用着多少、什么时候到期、数据怎么拿出来**。
> 红线：全程不碰任何密钥；控制台复制出来的数据库连接串含密码，只进临时文件/环境变量，**不进仓库、不进对话、不写进任何会提交的文件**。

## 一、看到期时间与套餐（CLI，一条命令）

```bash
tcb env list
```

判读四列：`Package Version`＝套餐、`Expiration time`＝到期时刻、`Environment Status`＝状态、`Creation Time`＝开通日（计费周期按它滚动）。

## 二、看资源点用量（控制台）

体验版**没有**平台版用量 API——实测 `DescribePlatformEnvUsage` 对本环境返回 `platform environment not found`（该接口只覆盖平台版环境）。用量以控制台为准：

1. 打开 CloudBase 控制台 → 选中环境 `psyisle-prod-d9g109suw53257aed`；
2. 进「资源用量」页（菜单名以实际界面为准，可能叫「概览 / 资源与用量」）；
3. 记录三样：**资源点余额、本周期已用、用量大头是哪一项**；
4. 本项目历史结论：用量大头是 PostgreSQL（约占 98%）。省钱只能减数据库往返——token 4 分钟缓存、`rdb()` 模块级单例、`ensureProfile` 进程缓存，都是为此做的。

顺带确认：本计费周期起止日（按开通日滚动，即 10-14 ~ 11-14）。

## 三、看数据库实际用量（CLI + SQL）

```bash
# SQL 放在文件里再执行（中文/引号经命令行传参会被踩坏，历史的坑）
python .workbuddy/_q.py .workbuddy/_q.sql
```

SQL（每次只放一条，`tcb db execute` 只回显最后一条的结果）：

```sql
select pg_size_pretty(pg_database_size(current_database())) as db_size;
```

```sql
select relname as table_name, n_live_tup as approx_rows,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
where relname in ('profiles','moods','progress_notes','account_claims')
order by pg_total_relation_size(relid) desc;
```

```sql
select (select count(*) from moods) as moods_total,
       (select count(*) from moods where is_deleted) as moods_deleted,
       (select count(*) from progress_notes) as notes_total,
       (select count(*) from profiles) as profiles_total,
       (select count(*) from account_claims) as claims_total;
```

## 四、导出数据（两种，任选；建议两种都留一次记录）

**A. 平台备份（控制台，适合灾备）**

1. 控制台 → 数据库 PostgreSQL → 「备份与回档」；
2. 发布 / 迁移 / 批量更新前，先手动建一个备份；
3. 在备份列表里下载或恢复。备份策略与保留周期**以控制台展示为准**。

**B. 逻辑导出（本机 pg_dump，适合审计、迁移、版本化初始化）**

```bash
# 1. 控制台 → 数据库 PostgreSQL → 连接信息 → 复制连接串（含密码，只放临时环境变量）
# 2. 本机执行：
pg_dump "$DATABASE_URL" --format=custom --no-owner --file=cloudbase-postgres.dump
# 3. 用完清掉 shell 历史里的连接串；dump 文件不要提交进仓库
```

## 五、输出

把一至四项的结果填进《Day27-资源与到期说明.md》。必须含：**额度 / 用量、到期日期、用量大头、导出步骤是否真的走过一遍**；不得含任何密钥。
