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
// 身份（Day 26 接登录）：前端经 Web SDK callFunction 调用时，网关会把当前登录用户的身份注入，
// app.auth().getUserInfo().uid 即可读到真实 uid（匿名用户拿到稳定的匿名 uid）。
// 取不到（极端异常）才回退到固定演示身份，保证过渡期不会因身份缺失而整页崩溃。
// 数据隔离的最终保证：所有查询都 eq('owner_id', owner)，写入也都带 owner_id。
const DEMO_OWNER_ID = '00000000-0000-4000-8000-000000000099'

const { init } = require('@cloudbase/node-sdk')

// Day 23：环境 ID 优先从环境变量来（本地 .env / 云端平台注入）。
// 兜底值不是密钥——它就写在公网域名里，也写在 api-contract.md §2，属于公开配置。
// 真密钥一律不进代码：本仓库没有任何密钥，变量名见仓库根 .env.example。
const app = init({ env: process.env.TCB_ENV || 'psyisle-prod-d9g109suw53257aed' })

// 当前 owner：网关注入的登录用户 uid，取不到回退演示身份。
function currentOwner(event) {
  // 网关（enableAuth）校验通过后会把登录用户身份注入函数运行时，
  // app.auth().getUserInfo() 即可读到真实 uid（匿名用户得到稳定的匿名 uid）。
  // 实测（Day 26）：HTTP 访问服务路径下 getUserInfo() 可用；而网关注入的
  // x-cloudbase-context 头是 gzip+base64 的 accessToken，不是 {uid} JSON，无法直接解析 uid，
  // 故不作为取 uid 的来源（曾按 base64 JSON 解析，永远为 null，是死代码）。
  // 取不到（极端异常）才回退到固定演示身份，保证过渡期不会因身份缺失而整页崩溃。
  void event
  try {
    const info = app.auth().getUserInfo()
    if (info && info.uid) return info.uid
  } catch (_) {
    /* 忽略，回退演示身份 */
  }
  return DEMO_OWNER_ID
}

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

// 确保该 owner 在 public.profiles 里有一行。
// moods.owner_id / progress_notes.owner_id 上有外键 REFERENCES profiles(owner_id)，
// 匿名用户首次写入时 profiles 里还没有他的 uid，会撞 23503 外键错误（Day 26 实测）。
// 所以任何写入前先补一行：除 owner_id 外其余列全走数据库默认值，重复调用靠唯一键冲突忽略。
async function ensureProfile(owner) {
  const r = await withPublicSchema(app.rdb().from('profiles').insert({ owner_id: owner }))
  if (!r.error) return { ok: true }
  // 已存在（唯一键冲突）就是我们要的结果，不算失败
  const msg = JSON.stringify(r.error)
  if (/duplicate|unique|23505|profiles_pkey/i.test(msg)) return { ok: true }
  console.warn('[ensureProfile] ' + msg)
  return { ok: false, error: r.error }
}

// 读列表：按 date 倒序，最多 limit 条。只返回「当前登录用户」且「没被软删」的行。
// 成功回 { items }，失败回 { error }（原始库错误）。
// Day 22：排除已软删（is_deleted = false）。Day 26：加 owner_id 过滤，每人只看自己的。
async function listMoods(limit, event) {
  const owner = currentOwner(event)
  const q = withPublicSchema(
    app
      .rdb()
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .eq('owner_id', owner)
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
async function upsertMood({ date, emoji, level, note }, event) {
  const owner = currentOwner(event)
  await ensureProfile(owner) // 先保证外键有落点（新用户首次写入必须）
  const ins = await withPublicSchema(
    app.rdb().from('moods').insert({ owner_id: owner, date, emoji, level, note })
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
        .eq('owner_id', owner)
        .eq('date', date)
    )
    if (upd.error) return { ok: false, step: 'update', error: upd.error }
    return { ok: true, overwritten: true }
  }
  return { ok: true, overwritten: false }
}

// 读回刚写的那一行：按 owner_id + date 用唯一键定位，不依赖 insert 的返回结构。
// 成功回 { item }，失败回 { error }。
async function findMoodByDate(date, event) {
  const owner = currentOwner(event)
  const q = withPublicSchema(
    app
      .rdb()
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .eq('owner_id', owner)
      .eq('date', date)
  )
  const { data, error } = await q
  if (error) return { error }
  return { item: rowToItem((data || [])[0]) }
}

// 按 id 查一条（带 owner 隔离）。
// includeDeleted=false（默认）：额外排除已软删的行 —— DELETE 用它，所以「删两次」第二次回 NOT_FOUND，
//   也避免「删除一条根本不存在的记录」被当成成功（防呆）。
// includeDeleted=true：不排除软删行 —— PATCH 用它，编辑一条已软删的记录才能把它复位回来（找回）。
//   两者必须分开：若 PATCH 也排除软删行，patchMood 里那句 is_deleted:false 永远执行不到，成了死代码
//   （Day 22 完成后检查发现：契约 §4.7 写着重编辑即找回，代码却把它堵死了）。
// 成功回 { item }；查不到回 { item: null }；失败回 { error }。
async function findMoodById(id, { includeDeleted = false } = {}, event) {
  const owner = currentOwner(event)
  const q = withPublicSchema(
    app
      .rdb()
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .eq('owner_id', owner)
      .eq('id', id)
  )
  if (!includeDeleted) q.eq('is_deleted', false)
  const { data, error } = await q
  if (error) return { error }
  const row = (data || [])[0]
  return { item: row ? rowToItem(row) : null }
}

// PATCH：只改调用方传入的字段（emoji / level / note），其余不动（契约 §5.2 可改字段）。
// 同时复位 is_deleted=false（被软删的某天若重新编辑，等于找回）。
// 成功回 { item }（改后那行）；行不存在回 { notFound: true }；失败回 { error }。
async function patchMood(id, { emoji, level, note }, event) {
  // 必须 includeDeleted：软删的行也要能被编辑到，否则「删错了找回」走不通（契约 §4.7 / §4.8.1）。
  const before = await findMoodById(id, { includeDeleted: true }, event)
  if (before.error) return { error: before.error }
  if (before.item === null) return { notFound: true }

  const patch = { updated_at: new Date().toISOString(), is_deleted: false }
  if (emoji !== undefined) patch.emoji = emoji
  if (level !== undefined) patch.level = level
  if (note !== undefined) patch.note = note

  const owner = currentOwner(event)
  const upd = await withPublicSchema(
    app
      .rdb()
      .from('moods')
      .update(patch)
      .eq('owner_id', owner)
      .eq('id', id)
  )
  if (upd.error) return { error: upd.error }

  const got = await findMoodById(id)
  if (got.error) return { error: got.error }
  return { item: got.item }
}

// 软删除（Day 22）：不真删数据，只把 is_deleted 置 true，列表查询会跳过它，删错了还能找回。
// 成功回 { ok: true }；行不存在回 { ok: false, notFound: true }；失败回 { ok: false, error }。
async function softDeleteMood(id, event) {
  const before = await findMoodById(id, { includeDeleted: false }, event)
  if (before.error) return { ok: false, error: before.error }
  if (before.item === null) return { ok: false, notFound: true }

  const owner = currentOwner(event)
  const upd = await withPublicSchema(
    app
      .rdb()
      .from('moods')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('owner_id', owner)
      .eq('id', id)
  )
  if (upd.error) return { ok: false, error: upd.error }
  return { ok: true }
}

module.exports = { listMoods, upsertMood, findMoodByDate, findMoodById, patchMood, softDeleteMood, rowToItem, currentOwner }
