'use strict'

// 心汐 · progress_notes 表的数据访问层（Day 19 从 index.js 拆出）。
// 分层理由、SDK 用法、演示身份与 moods/db.js 完全相同，那里有详细注释，这里不复述。
// 这张表没有 level / note / emoji —— 单项只有 id / date / text / created_at。
//
// 身份同 moods（Day 26 接登录）：只认网关注入的真实 uid。
//
// Day 27：删掉了回退演示身份（原来取不到 uid 会返回固定的 000…099）。
// 理由见 moods/db.js 里那段长注释——简言之，「没有身份」被翻译成「所有人共用一个身份」
// 是隐私事故，不是兜底。现在取不到就抛，由入口层回 UNAUTHORIZED。
class AuthMissingError extends Error {
  constructor() {
    super('no authenticated owner')
    this.name = 'AuthMissingError'
    this.code = 'UNAUTHORIZED'
  }
}

// 只探测、不抛：入口层开头用一次，失败就提前返回（口径同 moods/db.js）。
function hasOwner() {
  try {
    const info = app.auth().getUserInfo()
    return !!(info && info.uid)
  } catch (_) {
    return false
  }
}

const { init } = require('@cloudbase/node-sdk')

// Day 23：环境 ID 优先从环境变量来（本地 .env / 云端平台注入）。
// 兜底值不是密钥——它就写在公网域名里，也写在 api-contract.md §2，属于公开配置。
// 真密钥一律不进代码：本仓库没有任何密钥，变量名见仓库根 .env.example。
const sdkApp = init({ env: process.env.TCB_ENV || 'psyisle-prod-d9g109suw53257aed' })

// Day 27 省资源点：查询器单例，口径同 moods/db.js（那里的注释有完整说明）。
// auth() 刻意不单例 —— getUserInfo() 依赖单次调用上下文。
const rdb = sdkApp.rdb()
const app = {
  rdb: () => rdb,
  auth: () => sdkApp.auth(),
}

// 从 getUserInfo() 的结果里取 uid；取不到就抛（口径同 moods/db.js，那里有完整理由）。
function ownerFromInfo(info) {
  if (info && info.uid) return info.uid
  throw new AuthMissingError()
}

// 当前 owner：只认真实登录 uid，取不到就抛（口径同 moods/db.js）。
function requireOwner(event) {
  void event
  let info = null
  try {
    info = app.auth().getUserInfo()
  } catch (_) {
    info = null
  }
  return ownerFromInfo(info)
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

// 表 → 接口：snake_case → camelCase（契约 §2，全项目只此一处）。
// 导出只为让单元测试锁形状（db.test.js），入口层不直接用。
function rowToItem(r) {
  return {
    id: r.id,
    date: r.date,
    text: r.text,
    createdAt: r.created_at, // ← 表的 created_at 映射到接口的 createdAt
  }
}

// 确保该 owner 在 public.profiles 里有一行（外键 REFERENCES profiles(owner_id)，
// 新用户首次写入必须有落点，否则撞 23503；口径同 moods/db.js）。
// Day 27 省资源点：同一实例内一个 owner 只保证一次（口径同 moods/db.js）。
const profileReady = new Set()

async function ensureProfile(owner) {
  if (profileReady.has(owner)) return { ok: true }
  const r = await withPublicSchema(app.rdb().from('profiles').insert({ owner_id: owner }))
  if (!r.error) {
    profileReady.add(owner)
    return { ok: true }
  }
  const msg = JSON.stringify(r.error)
  if (/duplicate|unique|23505|profiles_pkey/i.test(msg)) {
    profileReady.add(owner)
    return { ok: true }
  }
  console.warn('[ensureProfile] ' + msg)
  return { ok: false, error: r.error }
}

// 读列表：按 date 倒序，同日多行再用 created_at 倒序做次级排序键，避免同日 tie 顺序在多次调用间跳变
// （Day 21 周验收登记的遗留：progress_notes 不限一天一条，只按 date 倒序时同日多行的先后不稳定）。
// 只返回「当前登录用户」的行。成功回 { items }，失败回 { error }（原始库错误）。
async function listNotes(limit, event) {
  const owner = requireOwner(event)
  const q = withPublicSchema(
    app
      .rdb()
      .from('progress_notes')
      .select('id,date,text,created_at')
      .eq('owner_id', owner)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
  )
  const { data, error } = await q
  if (error) return { error }
  return { items: (data || []).map(rowToItem) }
}

// 记一件小事。progress_notes 不限一天一条（契约 §5.2），直接 insert，不防重复。
// 成功回 { ok: true }，失败回 { ok: false, error }。
async function insertNote({ date, text }, event) {
  const owner = requireOwner(event)
  await ensureProfile(owner) // 先保证外键有落点（新用户首次写入必须）
  const ins = await withPublicSchema(
    app.rdb().from('progress_notes').insert({ owner_id: owner, date, text })
  )
  if (ins.error) return { ok: false, error: ins.error }
  return { ok: true }
}

// 读回刚写的那一行：表不限一天一条，故按 owner + date 取 created_at 最新的一条。
// 成功回 { item }，失败回 { error }。
async function findLatestNoteByDate(date, event) {
  const owner = requireOwner(event)
  const q = withPublicSchema(
    app
      .rdb()
      .from('progress_notes')
      .select('id,date,text,created_at')
      .eq('owner_id', owner)
      .eq('date', date)
      .order('created_at', { ascending: false })
      .limit(1)
  )
  const { data, error } = await q
  if (error) return { error }
  return { item: rowToItem((data || [])[0]) }
}

module.exports = {
  listNotes,
  insertNote,
  findLatestNoteByDate,
  rowToItem,
  ownerFromInfo,
  requireOwner,
  hasOwner,
  AuthMissingError,
}
