-- 心汐 · 迁移 001（Day 22）
--
-- 给 public.moods 增加软删除标记 is_deleted，替代物理 DELETE。
--
-- 为什么是迁移而不是改 schema.sql 的建表：schema.sql 用 create table if not exists，
-- 对已存在的表不会改结构（详见 schema.sql 顶部说明）。所以「改表」一律另写迁移，
-- 表已存在时本文件就是唯一能把它改对的脚本。
--
-- 在哪执行：CloudBase CLI（本机已验证通过）
--   tcb db execute -e psyisle-prod-d9g109suw53257aed --sql "$(cat 本文件)"
-- 或用 cloudbaserc.json 同环境，直接把下面语句粘进控制台 SQL 编辑器执行。
--
-- 可重复执行：用 ADD COLUMN IF NOT EXISTS，重跑不会报错也不会重复加列。

alter table public.moods
  add column if not exists is_deleted boolean not null default false;

comment on column public.moods.is_deleted is
  '软删除标记（Day 22）。true=已删除，列表查询 .eq(is_deleted,false) 跳过；复位 false 即找回。不进接口字段';

-- 列表查询只关心「没被删的」，给 (owner_id, date desc) 配一个过滤后的局部索引，
-- 软删除行不会被扫进日常列表，列表查询不随历史删除量变慢。
drop index if exists public.moods_owner_date_active_idx;
create index moods_owner_date_active_idx
  on public.moods (owner_id, date desc)
  where is_deleted = false;
