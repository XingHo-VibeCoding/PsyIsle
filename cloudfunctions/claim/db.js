'use strict'

// 心汐 · 匿名记录「转正」的数据访问层（Day 28）。
//
// 要解决的问题：注册走的是 auth.signUp，会发一个新的 uid；匿名身份名下写过的记录
// owner_id 还指着旧 uid，于是注册完界面上一条都看不见。数据没丢，是人找不回。
//
// 做法：**搬家在服务端发生**，前端只拿到一张「一次性凭证」。
//   1. 还在匿名时（第一次写东西之后）POST /api/claim {action:'issue'} 领一张；
//   2. 注册 / 登录成功后 POST /api/claim {action:'redeem', code} 兑换；
//   3. 服务端把旧 uid 名下的行 UPDATE 成新 uid —— 记录从此跟着账号走。
//
// 为什么不让前端「记住旧 uid、登录后按它查」：那等于让客户端自己声明「这些数据是我的」，
// 任何人填别人的 uid 就能读别人的记录。这条路里客户端能拿到的只有一张兑完即废的随机串，
// 「搬哪些行」永远由服务端根据凭证里的 owner_id 决定。
//
// 为什么库里存的是 sha256 而不是 code 本身：这张表的读权限跟着云函数走的，
// 而库里其他表目前还没恢复 RLS（那是登录收尾时要一起收的）。万一凭证表被翻出来，
// 存哈希意味着**拿到表也兑不了**——和存密码是同一个道理。code 只在签发时回给客户端一次。
//
// 身份口径与 moods / notes 完全一致：只认网关注入的真实 uid，取不到就抛。
class AuthMissingError extends Error {
  constructor() {
    super('no authenticated owner')
    this.name = 'AuthMissingError'
    this.code = 'UNAUTHORIZED'
  }
}

function hasOwner() {
  try {
    const info = app.auth().getUserInfo()
    return !!(info && info.uid)
  } catch (_) {
    return false
  }
}

const crypto = require('crypto')
const { init } = require('@cloudbase/node-sdk')

// 环境 ID 优先从环境变量来（Day 23 口径，同 moods/db.js）。兜底值不是密钥。
const sdkApp = init({ env: process.env.TCB_ENV || 'psyisle-prod-d9g109suw53257aed' })

const rdb = sdkApp.rdb()
const app = {
  rdb: () => rdb,
  auth: () => sdkApp.auth(),
}

function ownerFromInfo(info) {
  if (info && info.uid) return info.uid
  throw new AuthMissingError()
}

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

// 旧版 SDK 没有 setHeader：包裹 fetch 注入 public schema（同 moods/db.js）
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

// ---- 凭证 ----

// 1 小时：够「写完 → 注册 → 点邮箱里的确认链接 → 回来」这一整段（有些配置下注册不会立刻登录），
// 又不至于让一张凭证能放一整天。凭证一次性、库里只有哈希，窗口长一点带来的风险可以忽略。
const TICKET_TTL_MS = 60 * 60 * 1000
// 16 字节 = 128 位随机。猜中的概率与这个数字一样不现实。
const CODE_BYTES = 16

function newCode() {
  return crypto.randomBytes(CODE_BYTES).toString('hex')
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code), 'utf8').digest('hex')
}

function ticketDeadline(now) {
  return new Date(now + TICKET_TTL_MS).toISOString()
}

// 同日已有记录的行不能搬（moods 有 unique(owner_id, date) 约束）。
// 抽成纯函数只为一件事：这条分支必须在测试里被钉住 —— 它是「部分搬成功」的唯一来源。
function splitMovable(rows, takenDates) {
  const move = []
  const skip = []
  for (const r of rows) {
    if (takenDates.has(r.date)) skip.push(r)
    else move.push(r)
  }
  return { move, skip }
}

// 确保新账号在 profiles 里有一行：moods / progress_notes 的 owner_id 有外键指向它。
// 口径同 moods/db.js 的 ensureProfile（重复插入报唯一冲突 = 已存在，算成功）。
async function ensureProfile(owner) {
  const r = await withPublicSchema(app.rdb().from('profiles').insert({ owner_id: owner }))
  if (!r.error) return { ok: true }
  const msg = JSON.stringify(r.error)
  if (/duplicate|unique|23505|profiles_pkey/i.test(msg)) return { ok: true }
  return { ok: false, error: r.error }
}

// 领一张凭证：只写一行，返回明文 code（库里只有它的哈希）。
async function issueTicket(event) {
  const owner = requireOwner(event)
  const code = newCode()
  const expiresAt = ticketDeadline(Date.now())
  const ins = await withPublicSchema(
    app.rdb().from('account_claims').insert({
      code_hash: hashCode(code),
      owner_id: owner,
      expires_at: expiresAt,
    })
  )
  if (ins.error) return { error: ins.error }
  return { code, expiresAt }
}

// 搬 moods：先赌一次「整体 UPDATE」（新账号通常还没有任何记录，1 次往返搬完）；
// 只有撞上 unique(owner_id, date) 才退化成逐条搬 —— 那天账号里已有记录，以账号自己的为准。
async function moveMoods(from, to) {
  const got = await withPublicSchema(app.rdb().from('moods').select('id,date').eq('owner_id', from))
  if (got.error) return { error: got.error }
  const rows = got.data || []
  if (rows.length === 0) return { moved: 0, skipped: 0 }

  const bulk = await withPublicSchema(app.rdb().from('moods').update({ owner_id: to }).eq('owner_id', from))
  if (!bulk.error) return { moved: rows.length, skipped: 0 }

  // 整体失败不当作失败处理：多半是同日冲突。列一遍账号已有的日期，能搬的逐条搬。
  // 注意要连软删的行一起看 —— 唯一约束不看 is_deleted，只看 (owner_id, date)。
  const mine = await withPublicSchema(app.rdb().from('moods').select('date').eq('owner_id', to))
  if (mine.error) return { error: mine.error }
  const taken = new Set((mine.data || []).map((r) => r.date))
  const { move, skip } = splitMovable(rows, taken)

  let moved = 0
  for (const r of move) {
    const u = await withPublicSchema(
      app.rdb().from('moods').update({ owner_id: to }).eq('id', r.id).eq('owner_id', from)
    )
    if (u.error) continue // 单条失败不拖垮整批：其余行照搬，这一条留在原处
    moved += 1
  }
  return { moved, skipped: skip.length }
}

// 搬 progress_notes：这张表没有同日唯一约束，一次 UPDATE 就够，不会有冲突分支。
async function moveNotes(from, to) {
  const got = await withPublicSchema(app.rdb().from('progress_notes').select('id').eq('owner_id', from))
  if (got.error) return { error: got.error }
  const rows = got.data || []
  if (rows.length === 0) return { moved: 0 }

  const upd = await withPublicSchema(
    app.rdb().from('progress_notes').update({ owner_id: to }).eq('owner_id', from)
  )
  if (upd.error) return { error: upd.error }
  return { moved: rows.length }
}

// 划掉这张凭证。写失败只记日志：行已经搬完了，这时候回错误反而让前端以为没成功、
// 下次再兑一次（第二次会被 claimed_by 拦住，但用户会白等一轮）。
async function markClaimed(codeHash, owner) {
  const upd = await withPublicSchema(
    app.rdb().from('account_claims').update({ claimed_by: owner, claimed_at: new Date().toISOString() }).eq('code_hash', codeHash)
  )
  if (upd.error) console.warn('[claim] 凭证标记失败（数据已搬完）: ' + JSON.stringify(upd.error))
  return !upd.error
}

// 兑换：把 owner_id = 旧 uid 的记录搬到「当前登录的这个账号」名下。
// 返回 { moods, notes, skipped } 或 { notFound } / { used } / { expired } / { error }。
async function redeemTicket(code, event) {
  const owner = requireOwner(event)
  const h = hashCode(code)
  const got = await withPublicSchema(
    app.rdb().from('account_claims').select('code_hash,owner_id,expires_at,claimed_by').eq('code_hash', h)
  )
  if (got.error) return { error: got.error }
  const row = (got.data || [])[0]
  if (!row) return { notFound: true }
  if (row.claimed_by) return { used: true }
  const exp = Date.parse(row.expires_at)
  if (!isNaN(exp) && exp < Date.now()) return { expired: true }

  // 同一个 uid 兑自己的券（理论上不会发生）：直接划掉，不搬。
  if (row.owner_id === owner) {
    await markClaimed(row.code_hash, owner)
    return { moods: 0, notes: 0, skipped: 0 }
  }

  const p = await ensureProfile(owner)
  if (!p.ok) return { error: p.error }

  const m = await moveMoods(row.owner_id, owner)
  if (m.error) return { error: m.error }
  const n = await moveNotes(row.owner_id, owner)
  if (n.error) return { error: n.error }

  await markClaimed(row.code_hash, owner)
  return { moods: m.moved, notes: n.moved, skipped: m.skipped }
}

module.exports = {
  issueTicket,
  redeemTicket,
  newCode,
  hashCode,
  ticketDeadline,
  splitMovable,
  TICKET_TTL_MS,
  ownerFromInfo,
  requireOwner,
  hasOwner,
  AuthMissingError,
}
