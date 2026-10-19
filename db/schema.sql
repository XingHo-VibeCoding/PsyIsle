-- 心汐 · 数据模型 v1（Day 16）
--
-- 三张表：profiles（主对象）+ moods / progress_notes（两张记录表），
-- 推导自 api-contract.md §5.1 / §5.2，不另造一套字段。
--
-- 在哪执行：CloudBase 控制台 → 数据库 → SQL 编辑器。
--   控制台里以 cloudbase_admin 身份跑，能执行 DDL（建表/策略/授权）。
--   注意：云函数里的 SDK（$runSQL）只支持 SELECT/INSERT/UPDATE/DELETE，建表必须在控制台跑。
--
-- 可重复执行：全程只用「不存在才建」「存在就先删策略再建」。
--   本文件不写 drop table —— 重跑不会丢数据。
--   代价是：表已存在时本文件不会帮你改结构。以后再改表，新增 alter 语句另写，
--   不要回头改下面的列定义（改过的表不会因为你重跑本文件而跟着变，只会让文件和库不一致）。
--
-- 本环境实测事实（2026-10-15 在 psyisle-prod 上用 CLI 实测，不是推测）：
--   · PostgreSQL 17.11；public schema 起初是空的
--   · auth.uid() 与 auth.role() 返回 **text**（不是 uuid），auth.jwt() 返回 jsonb
--   · anon / authenticated / service_role 三个角色都已存在
--   · 执行 SQL 的角色**不是**超级用户：装扩展会报权限错，DDL 与 GRANT 没问题
-- 这几条决定了下面两件事：owner_id 用 text、本文件不写 create extension。

-- 本环境是 PostgreSQL 17，gen_random_uuid() 已内置，不需要装扩展。
-- 这里刻意不写 create extension pgcrypto —— 执行 SQL 的角色不是超级用户，
-- 那行会直接报权限错，把后面该建的表全拦下来。
-- 若以后换到 PG 13 以下、且报 function gen_random_uuid() does not exist，再补：
--   create extension if not exists pgcrypto;


-- ===============================================================
-- 1. profiles —— 主对象：一个人一行
-- ===============================================================
-- 为什么主键是 owner_id 而不是自增 id：这一行代表「一个人」，而平台账号体系里
-- 人的唯一标识就是登录凭证里的 sub（SQL 里取作 auth.uid()）。主键即身份，
-- 同一个用户在结构上就不可能占两行 —— 靠代码去防重复，总有防漏的一天。
-- 契约 GET /api/me 返回的 profile 里也没有 id 字段，是同一个意思：对外只认登录态。
create table if not exists public.profiles (
  owner_id   text        primary key default auth.uid(),
  nickname   text        not null default '',
  themes     text[]      not null default '{}',
  settings   jsonb       not null default '{"reminderTime":null,"modules":{"talk":true,"guide":true,"daily":true},"showStreak":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 24 字：够写「今天也没出门」这类花名，又不至于长到把列表撑破
  constraint profiles_nickname_len   check (char_length(nickname) <= 24),
  -- 白名单与 frontend/src/data/themes.ts 的 5 个 id 共用一份。库里再设一道，
  -- 是为了让「前端漏校验」不构成数据污染 —— 越靠后的关卡越不该依赖前面的关卡自觉。
  constraint profiles_themes_known  check (themes <@ array['lonely','meaning','worth','relation','loss']::text[])
);

comment on table  public.profiles            is '一个人一行：花名、关心的主题、管家设置。契约 §5.1 的 GET/POST /api/me';
comment on column public.profiles.owner_id   is '登录用户标识（auth.uid()）。主键即身份，一个用户永远只有一行';
comment on column public.profiles.nickname   is '花名。未设置时是空字符串而不是 NULL —— 前端少写一个判空分支';
comment on column public.profiles.themes     is '关心的主题 id 数组，可多选可为空。空数组 = 不筛选，不是「没选所以报错」';
comment on column public.profiles.settings   is '管家设置。showStreak 默认 false：压力机制必须由用户主动打开，服务端不许替他开';
comment on column public.profiles.created_at is '首次建档时刻（UTC）';
comment on column public.profiles.updated_at is '最后一次改动时刻。POST /api/me 每次都要更新它';


-- ===============================================================
-- 2. moods —— 记录表：一次心情打卡一行
-- ===============================================================
-- 合同字段：date / emoji / level(可空) / note(可空)，见契约 §5.2。
-- id 的形状（m_ + 32 位十六进制）就是契约里写给前端的形状，由库直接生成。
-- 为什么不改成 uuid 类型：那样接口层就得自己拼前缀，多一处能拼错的地方；
-- 契约 §2 说「转换只允许有一个点」，这一处就是让它零转换。
create table if not exists public.moods (
  id         text        primary key default 'm_' || replace(gen_random_uuid()::text, '-', ''),
  owner_id   text        not null default auth.uid() references public.profiles (owner_id) on delete cascade,
  date       date        not null,
  emoji      text        not null,
  level      smallint,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Day 22 软删除标记：true = 已「删除」（列表查询跳过，可找回），替代物理 DELETE。
  -- 硬 DELETE 在本项目当前 anon 身份下无权限（schema §4 只把 delete 授给 authenticated），
  -- 用 UPDATE 打标记复用 anon 已有的 update 权限，删错了还能复位 is_deleted = false 找回。
  is_deleted boolean     not null default false,

  -- 契约 §5.2 的幂等规则「同一天重复提交 = 覆盖」落在这一条上：
  -- 它是数据库层的保证，不靠接口先查再写（先查再写中间那段时间，两个请求会同时认为「还没有」）。
  constraint moods_one_per_day  unique (owner_id, date),
  constraint moods_emoji_known  check (emoji in ('calm','warm','tired','low','anxious','upset','empty')),
  -- level 是「这股感觉有多强」，不是好坏打分：1 和 5 只是强度两端，没有哪端更好
  constraint moods_level_range  check (level is null or level between 1 and 5),
  constraint moods_note_len     check (note  is null or char_length(note) <= 200)
);

comment on table  public.moods              is '心情打卡：一次一行。契约 §5.2 的 GET/POST /api/moods';
comment on column public.moods.id           is '对外 id（m_ 开头）。由库生成，接口原样返回';
comment on column public.moods.owner_id     is '这行属于谁 —— 它就是与 profiles 关联的字段，也是数据隔离的依据';
comment on column public.moods.date         is '哪一天（本地日期，按东八区判定）。与 created_at 是两个概念：补打卡时它们会不同';
comment on column public.moods.emoji        is '情绪 id，白名单见 moods_emoji_known；存 id 不存 emoji 字符 —— 字符在不同设备上长得不一样';
comment on column public.moods.level        is '强度 1–5，可空。空 = 用户只选了情绪，不强迫他打第二个分';
comment on column public.moods.note         is '想说的话，可空。可以不写文字，这是产品原话，不是容错';
comment on column public.moods.created_at   is '写入时刻（UTC）';
comment on column public.moods.updated_at   is '最后一次覆盖时刻。同一天重复打卡走 update，所以它会变而 date 不变';
comment on column public.moods.is_deleted   is '软删除标记（Day 22）。true=已删除，列表查询 .eq(is_deleted,false) 跳过；复位 false 即找回。不进接口字段';

-- 为什么不再给 (owner_id, date) 单独建索引：unique 约束已经建了一棵 btree，
-- 按 owner_id 过滤 + date 倒序正好能反向扫描它。多建一棵是同内容的第二份维护成本。
-- 注意 unique(owner_id, date) 不含 id，所以「同一用户同一天只能有一行」是库层面的硬约束。


-- ===============================================================
-- 3. progress_notes —— 记录表：一件小事一行
-- ===============================================================
-- 与 moods 同构的一张记录表，所以刻意共享同一套写法（owner_id / 前缀 id / date），
-- 让读代码的人一眼看出这两张表可以套用同一个「查自己、按天倒序」的模板。
create table if not exists public.progress_notes (
  id         text        primary key default 'n_' || replace(gen_random_uuid()::text, '-', ''),
  owner_id   text        not null default auth.uid() references public.profiles (owner_id) on delete cascade,
  date       date        not null,
  "text"     text        not null,
  created_at timestamptz not null default now(),

  -- 下限 1 而不是 0：空内容的小进步不是「小」，是一个点不动就会让页面多一行空白
  constraint progress_notes_text_len check (char_length("text") between 1 and 200)
);

comment on table  public.progress_notes          is '一个小进步：一件小事一行。契约 §5.2 的 GET/POST /api/notes';
comment on column public.progress_notes.id       is '对外 id（n_ 开头）。由库生成，接口原样返回';
comment on column public.progress_notes.owner_id is '同 moods：与 profiles 关联的字段，也是数据隔离的依据';
comment on column public.progress_notes.date     is '这件事发生在哪一天（本地日期），省略时由接口按 +08:00 取今天';
comment on column public.progress_notes."text"   is '做了什么。列名必须加双引号 —— text 同时是 PostgreSQL 的类型名，不加引号解析器会读成「列名 类型名」两个词';
comment on column public.progress_notes.created_at is '写入时刻（UTC）';

-- 这张表没有 updated_at：小进步记下就是记下了，契约里也没有「改一条」的接口。
-- 没有对应写操作的列，加了就是没人维护的陌生字段。

-- 与 moods 不同，这张表不限一天一条（契约 §7「一天能记几件」未裁定），
-- 所以它的日期查询走下面这棵普通索引。
create index if not exists progress_notes_owner_date_idx
  on public.progress_notes (owner_id, date desc);


-- ===============================================================
-- 4. 行级权限：任何用户读不到别人的数据
-- ===============================================================
-- 契约 §2 把这条写成约定，这里把它写成数据库拦得住的东西。
-- 三层各管一段，缺一层就有漏：
--   表级 GRANT  —— 未登录的 anon 连表都摸不到
--   行级 RLS    —— 登录用户只看得到 owner_id = 自己 的行
--   列默认值     —— 新行的 owner_id 由库从登录凭证里填，前端根本没机会传别人的 id
-- 这三层都生效时，「接口忘了校验身份」也不会变成数据泄漏。

alter table public.profiles         enable row level security;
alter table public.moods            enable row level security;
alter table public.progress_notes   enable row level security;

-- 先删后建，保证本文件可重复执行（create policy 同名会报错，alter 改不干净）
drop policy if exists profiles_owner_only on public.profiles;
create policy profiles_owner_only on public.profiles
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists moods_owner_only on public.moods;
create policy moods_owner_only on public.moods
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists progress_notes_owner_only on public.progress_notes;
create policy progress_notes_owner_only on public.progress_notes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- anon（未登录）刻意不授权：这个应用的任何一页用户数据都要求先登录。
-- 少给一个角色权限，就少一条以后要反复确认的路径。
grant select, insert, update, delete on public.profiles       to authenticated;
grant select, insert, update, delete on public.moods          to authenticated;
grant select, insert, update, delete on public.progress_notes to authenticated;


-- ===============================================================
-- 5. account_claims —— 匿名记录「转正」的一次性凭证（Day 28）
-- ===============================================================
-- 要解决的问题：注册走的是 auth.signUp，会发一个新的 uid；匿名身份名下写过的记录
-- owner_id 还指着旧 uid，于是注册完界面上一条都看不见，用户以为记录丢了。
-- 做法：写东西时先领一张凭证；注册 / 登录成功后拿凭证兑换，把旧 uid 的行搬到新 uid 名下。
-- 搬家只发生在服务端（cloudfunctions/claim），前端拿到的只是一张兑完即废的随机串 ——
-- 「搬哪些行」由凭证里的 owner_id 决定，客户端说自己是谁不算数。
--
-- 为什么这一列叫 code_hash 而不是 code：这里存的是 sha256，明文只在签发那一刻回给客户端一次。
-- 其他表目前还没恢复 RLS（登录收尾时要一起收），万一这张表被翻出来，
-- 有哈希也兑不了 —— 和「不存明文密码」是同一个道理。
create table if not exists public.account_claims (
  code_hash  text        primary key,
  owner_id   text        not null,           -- 领凭证时的身份（匿名 uid）
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,           -- 签发后 1 小时
  claimed_by text,                           -- 兑到哪个账号；null = 还没兑
  claimed_at timestamptz
);

comment on table  public.account_claims            is '匿名记录转正的一次性凭证。1 小时过期、一次性，只由 /api/claim 云函数读写';
comment on column public.account_claims.code_hash  is '凭证明文的 sha256。明文不落库 —— 库被翻出来也兑不了';
comment on column public.account_claims.owner_id   is '领凭证时的匿名 uid，也就是「要搬哪些行」的依据';
comment on column public.account_claims.claimed_by is '兑换后的账号 uid。非 null 即已用，不允许二次兑换';

-- 清理过期凭证用的索引（历史行不影响功能，只是占地方）
create index if not exists account_claims_expires_idx
  on public.account_claims (expires_at);

-- 授权的口径与 moods / progress_notes 一致：云函数以 anon 角色访问数据库。
-- 这张表刻意不建 RLS 策略，理由见文件头「本文件不写 drop table」那段之外的补充：
-- moods / progress_notes 现在也还没开 RLS（那是接登录收尾时要统一收的三条 🔴 之一），
-- 届时这三张表要一起处理；本表因为只存哈希，即使漏网也不会直接泄漏数据。
grant select, insert, update on public.account_claims to anon;
grant select, insert, update on public.account_claims to authenticated;
