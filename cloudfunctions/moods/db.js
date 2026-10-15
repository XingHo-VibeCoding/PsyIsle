'use strict'

// 心汐 · moods 表的数据访问层（Day 19 从 index.js 拆出）。
//
// 拆分前：index.js 一个文件同时干 HTTP 分发、参数校验、数据库查询三件事。
// 拆分后：这个文件是 moods 表与云端 SDK 的唯一接触点——
//   · app.rdb() 的初始化与 public schema 注入，只在这里出现一次；
//   · 表字段名（snake_case）只在这里出现，出去的就是契约里的 camelCase
//     （契约 §2：「数据库的 snake_case 只在数据层转换，转换只允许有一个点」）；
//   · 以后换 SDK、改表结构、接登录，只改这一个文件，入口层无感。
// 入口层（index.js）不许再出现 app.rdb()。
//
// 访问方式：@cloudbase/node-sdk 的 app.rdb()（CloudBase PG 模式数据 API 的 Supabase 式查询器）。
// 云端全局 SDK 版本较旧：rdb() 有，但 setHeader / schema() 方法缺失，且把 schema 写死成环境 ID。
// 所以这里用「包裹构造器自身的 fetch」手动注入 Accept-Profile: public（PostgREST 用它选 schema）。
//
// 身份（Day 18 暂态）：本环境云函数身份拿不到 service_role，也没有真实登录态，
// auth.uid() 在函数上下文里是 null —— 而 moods.owner_id 是 NOT NULL 且有外键指向 profiles。
// 所以这里先用一个固定的演示身份写入（与 Day 17「函数作为可信后端读全部演示数据」同一思路）。
// TODO(Day 18 接登录)：登录接通后，把 DEMO_OWNER_ID 换成 auth.uid()，并恢复 profiles/moods 的 RLS。
const DEMO_OWNER_ID = '00000000-0000-4000-8000-000000000099'

const { init } = require('@cloudbase/node-sdk')

const app = init({ env: process.env.TCB_ENV || 'psyisle-prod-d9g109suw53257aed' })

// 旧版 SDK 没有 setHeader：包裹 fetch，给每一次请求注入 public schema
function withPublicSchema(q) {
  const orig = q.fetch ? q.fetch.bind(q) : null
  if (orig) {
    q.fetch = (input, init) => {
      init = init || {}
      init.headers = Object.assign({}, init.headers, {
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      })
      return orig(input, init)
    }
  }
  return q
}

// 表 → 接口：snake_case → camelCase（契约 §2 / §6.2 的「对不上」落点）。
// 导出只为让单元测试锁形状（db.test.js），入口层不直接用。
function rowToItem(r) {
  return {
    id: r.id,
    date: r.date,
    emoji: r.emoji,
    level: r.level, // 可空：没打分的人就是 null，原样透出
    note: r.note, // 可空
    createdAt: r.created_at, // ← 表的 created_at 映射到接口的 createdAt
  }
}

// 读列表：按 date 倒序，最多 limit 条。成功回 { items }，失败回 { error }（原始库错误）。
// Day 22：只返回「没被软删」的行（is_deleted = false），被删的不会进列表、但库里还在、可找回。
async function listMoods(limit) {
  const q = withPublicSchema(
    app
      .rdb()
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .eq('is_deleted', false)
      .order('date', { ascending: false })
      .limit(limit)
  )
  const { data, error } = await q
  if (error) return { error }
  return { items: (data || []).map(rowToItem) }
}

// 写一次打卡。「一天一行」由数据库 unique (owner_id, date) 最终保证（契约 §5.2），
// 所以先 insert；命中唯一约束冲突再 update 覆盖——不写成「先查有没有、没有就插」，
// 两个请求同时进来会同时认为「还没有」。
// 成功回 { ok: true, overwritten }，失败回 { ok: false, step: 'insert' | 'update', error }。
async function upsertMood({ date, emoji, level, note }) {
  const ins = await withPublicSchema(
    app.rdb().from('moods').insert({ owner_id: DEMO_OWNER_ID, date, emoji, level, note })
  )
  if (ins.error) {
    const msg = JSON.stringify(ins.error)
    const isDup = /duplicate|unique|23505|moods_one_per_day/i.test(msg)
    if (!isDup) return { ok: false, step: 'insert', error: ins.error }
    // 同日已存在 → 覆盖（更新内容 + updated_at）。
    // 同时复位 is_deleted=false：被软删的某天若重新打卡，等于把它找回（Day 22）。
    const upd = await withPublicSchema(
      app
        .rdb()
        .from('moods')
        .update({ emoji, level, note, updated_at: new Date().toISOString(), is_deleted: false })
        .eq('owner_id', DEMO_OWNER_ID)
        .eq('date', date)
    )
    if (upd.error) return { ok: false, step: 'update', error: upd.error }
    return { ok: true, overwritten: true }
  }
  return { ok: true, overwritten: false }
}

// 读回刚写的那一行：按 owner_id + date 用唯一键定位，不依赖 insert 的返回结构。
// 成功回 { item }，失败回 { error }。
async function findMoodByDate(date) {
  const q = withPublicSchema(
    app
      .rdb()
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .eq('owner_id', DEMO_OWNER_ID)
      .eq('date', date)
  )
  const { data, error } = await q
  if (error) return { error }
  return { item: rowToItem((data || [])[0]) }
}

// 按 id 查一条（带 owner 隔离，且排除已软删的行）。
// 成功回 { item }；id 不存在或已被软删回 { item: null }；失败回 { error }。
// PATCH / DELETE 的「id 存在性校验」都靠它：软删的行当作不存在，避免「改/删一条不存在的记录」。
async function findMoodById(id) {
  const q = withPublicSchema(
    app
      .rdb()
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .eq('owner_id', DEMO_OWNER_ID)
      .eq('id', id)
      .eq('is_deleted', false)
  )
  const { data, error } = await q
  if (error) return { error }
  const row = (data || [])[0]
  return { item: row ? rowToItem(row) : null }
}

// PATCH：只改调用方传入的字段（emoji / level / note），其余不动（契约 §5.2 可改字段）。
// 同时复位 is_deleted=false（被软删的某天若重新编辑，等于找回）。
// 成功回 { item }（改后那行）；行不存在回 { notFound: true }；失败回 { error }。
async function patchMood(id, { emoji, level, note }) {
  const before = await findMoodById(id)
  if (before.error) return { error: before.error }
  if (before.item === null) return { notFound: true }

  const patch = { updated_at: new Date().toISOString(), is_deleted: false }
  if (emoji !== undefined) patch.emoji = emoji
  if (level !== undefined) patch.level = level
  if (note !== undefined) patch.note = note

  const upd = await withPublicSchema(
    app
      .rdb()
      .from('moods')
      .update(patch)
      .eq('owner_id', DEMO_OWNER_ID)
      .eq('id', id)
  )
  if (upd.error) return { error: upd.error }

  const got = await findMoodById(id)
  if (got.error) return { error: got.error }
  return { item: got.item }
}

// 软删除（Day 22）：不真删数据，只把 is_deleted 置 true，列表查询会跳过它，删错了还能找回。
// 成功回 { ok: true }；行不存在回 { ok: false, notFound: true }；失败回 { ok: false, error }。
async function softDeleteMood(id) {
  const before = await findMoodById(id)
  if (before.error) return { ok: false, error: before.error }
  if (before.item === null) return { ok: false, notFound: true }

  const upd = await withPublicSchema(
    app
      .rdb()
      .from('moods')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('owner_id', DEMO_OWNER_ID)
      .eq('id', id)
  )
  if (upd.error) return { ok: false, error: upd.error }
  return { ok: true }
}

module.exports = { listMoods, upsertMood, findMoodByDate, findMoodById, patchMood, softDeleteMood, rowToItem }
