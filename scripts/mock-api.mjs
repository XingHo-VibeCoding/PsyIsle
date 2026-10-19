// 本地 mock API：把前端从云端接口上「摘」下来，开发时零资源点消耗。
//
// 为什么需要它：CloudBase 账单里 PostgreSQL 占资源点的 98%，而每一次页面加载都要打几次
// /api/moods、/api/notes。也就是说「打开本地页面看看效果」这件事本身在烧钱。
// 这个服务按 api-contract.md 的形状回假数据，让 UI、分页、错误态都能在本地验完，
// 只有真正需要「网关鉴权 / 真实写库」的结论才去碰线上。
//
// 用法（两个终端）：
//   终端 A：node scripts/mock-api.mjs
//   终端 B：VITE_API_BASE=http://localhost:5178 npm --prefix frontend run dev
// PowerShell 下第二行写成：
//   $env:VITE_API_BASE="http://localhost:5178"; npm --prefix frontend run dev
//
// 为什么用环境变量而不是改 .env：Vite 的规则是「process.env 里已存在的 VITE_* 优先于 .env 文件」，
// 所以命令行注入能覆盖 .env.production，且不需要往仓库里加任何环境配置文件。
//
// 与真后端的差异（都是刻意的）：
//   · 不校验 Bearer token（本地没有网关），谁调都是同一个 mock 用户
//   · 数据全在内存，重启即重置
//   · 不做 RLS / 外键 —— 那些正是唯一必须去线上验的部分
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT || 5178)
const PAGE_DEFAULT = 50
const EMOJIS = ['calm', 'warm', 'tired', 'low', 'anxious', 'upset', 'empty']

const pad = (n) => String(n).padStart(2, '0')
const dateOf = (offsetDay) => {
  const d = new Date(Date.now() - offsetDay * 86400000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const randId = (prefix) => prefix + randomBytes(12).toString('hex')

// ---- 种子数据：60 天，故意超过一页（50），这样「加载更多」才有东西可翻 ----
const SEED_DAYS = 60
const moods = []
const notes = []
for (let i = 0; i < SEED_DAYS; i++) {
  const date = dateOf(i)
  const createdAt = new Date(Date.parse(date + 'T12:00:00Z') + i * 0).toISOString()
  moods.push({
    id: 'm_' + String(i).padStart(4, '0') + '0'.repeat(22),
    date,
    emoji: EMOJIS[i % EMOJIS.length],
    level: (i % 5) + 1,
    note: i % 3 === 0 ? `第 ${SEED_DAYS - i} 天前写的一句话。` : null,
    createdAt,
    is_deleted: false,
  })
  // 小进步比心情密一些：有几天记了两三条
  const count = i % 4 === 0 ? 2 : 1
  for (let k = 0; k < count; k++) {
    notes.push({
      id: 'n_' + String(i).padStart(4, '0') + k + '0'.repeat(21),
      date,
      text: `那天做的一件小事 #${i}-${k}`,
      createdAt: new Date(Date.parse(createdAt) - k * 3600000).toISOString(),
      is_deleted: false,
    })
  }
}

// ---- 游标：与 cloudfunctions/*/db.js 完全同构（d=date, c=createdAt, i=id）----
function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ d: row.date, c: row.createdAt, i: row.id }), 'utf8').toString(
    'base64url',
  )
}
function decodeCursor(s) {
  if (!s) return null
  try {
    const o = JSON.parse(Buffer.from(String(s), 'base64url').toString('utf8'))
    if (!o || typeof o.d !== 'string' || typeof o.i !== 'string') return null
    return { d: o.d, c: o.c || null, i: o.i }
  } catch {
    return null
  }
}

// 排序：date desc → createdAt desc → id desc（与真后端 order 一致）
function compare(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

// 「严格排在游标那一行之后」
function afterCursor(row, cur) {
  if (!cur) return true
  if (row.date !== cur.d) return row.date < cur.d
  if (!cur.c) return row.id < cur.i
  if (row.createdAt !== cur.c) return row.createdAt < cur.c
  return row.id < cur.i
}

function pageOf(rows, limit, cursor) {
  const sorted = rows.filter((r) => !r.is_deleted).sort(compare)
  const rest = sorted.filter((r) => afterCursor(r, cursor))
  const slice = rest.slice(0, limit)
  const nextCursor = rest.length > limit ? encodeCursor(slice[slice.length - 1]) : null
  return { items: slice.map(toItem), nextCursor }
}

function toItem(r) {
  const base = { id: r.id, date: r.date, createdAt: r.createdAt }
  if ('emoji' in r) return { ...base, emoji: r.emoji, level: r.level, note: r.note }
  return { ...base, text: r.text }
}

// ---- HTTP ----
const json = (res, code, body) => {
  const text = JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}
const ok = (res, data) => json(res, 200, { ok: true, data })
const fail = (res, code, message) => json(res, 200, { ok: false, error: { code, message } })

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function todayLocal() {
  // 与后端同口径：+08:00 判今天
  const now = new Date(Date.now() + 8 * 3600000)
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
}

const claimCodes = new Map() // code -> expiresAt

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname
  const method = (req.method || 'GET').toUpperCase()

  // CORS：前端在 5173/4173，mock 在 5178，跨端口必须放行
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization,Profile')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  console.log(`[mock] ${method} ${req.url}`)

  // 健康检查是唯一不套信封的接口
  if (path === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'xinxi-mock',
      version: 'local-mock',
      time: new Date().toISOString(),
    })
  }

  if (path === '/api/moods') {
    if (method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || PAGE_DEFAULT, 1), 200)
      return ok(res, pageOf(moods, limit, decodeCursor(url.searchParams.get('cursor'))))
    }
    if (method === 'POST') {
      const b = await readBody(req)
      if (!b.emoji) return fail(res, 'INVALID_INPUT', 'emoji 必须是情绪白名单里的一个')
      const date = b.date || todayLocal()
      const existing = moods.find((m) => m.date === date && !m.is_deleted)
      if (existing) {
        // 同日覆盖（契约 §4.4 幂等），并把软删的找回
        existing.emoji = b.emoji
        existing.level = b.level ?? null
        existing.note = b.note ?? null
        return ok(res, { item: toItem(existing) })
      }
      const row = {
        id: randId('m_'),
        date,
        emoji: b.emoji,
        level: b.level ?? null,
        note: b.note ?? null,
        createdAt: new Date().toISOString(),
        is_deleted: false,
      }
      moods.push(row)
      return ok(res, { item: toItem(row) })
    }
    if (method === 'PATCH') {
      const id = url.searchParams.get('id')
      const row = moods.find((m) => m.id === id)
      if (!row) return fail(res, 'NOT_FOUND', '这条记录不存在')
      const b = await readBody(req)
      if (b.emoji !== undefined) row.emoji = b.emoji
      if (b.level !== undefined) row.level = b.level
      if (b.note !== undefined) row.note = b.note
      row.is_deleted = false // 重编辑即找回
      return ok(res, { item: toItem(row) })
    }
    if (method === 'DELETE') {
      const id = url.searchParams.get('id')
      const row = moods.find((m) => m.id === id && !m.is_deleted)
      if (!row) return fail(res, 'NOT_FOUND', '这条记录不存在')
      row.is_deleted = true
      return ok(res, { id, deleted: true })
    }
  }

  if (path === '/api/notes') {
    if (method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || PAGE_DEFAULT, 1), 200)
      return ok(res, pageOf(notes, limit, decodeCursor(url.searchParams.get('cursor'))))
    }
    if (method === 'POST') {
      const b = await readBody(req)
      const text = typeof b.text === 'string' ? b.text.trim() : ''
      if (text.length < 1 || text.length > 200)
        return fail(res, 'INVALID_INPUT', '内容需要 1 到 200 个字')
      const row = {
        id: randId('n_'),
        date: b.date || todayLocal(),
        text,
        createdAt: new Date().toISOString(),
        is_deleted: false,
      }
      notes.push(row)
      return ok(res, { item: toItem(row) })
    }
  }

  if (path === '/api/claim' && method === 'POST') {
    const b = await readBody(req)
    if (b.action === 'issue') {
      const code = randomBytes(9).toString('hex')
      const expiresAt = new Date(Date.now() + 10 * 60000).toISOString()
      claimCodes.set(code, expiresAt)
      return ok(res, { code, expiresAt })
    }
    if (b.action === 'redeem') {
      if (!claimCodes.has(String(b.code))) return fail(res, 'NOT_FOUND', '凭证无效或已过期')
      claimCodes.delete(String(b.code))
      return ok(res, { moods: 3, notes: 5, skipped: 0 })
    }
    return fail(res, 'INVALID_INPUT', 'action 只能是 issue 或 redeem')
  }

  json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'mock 没有这个接口：' + path } })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock] 已启动 http://localhost:${PORT}`)
  console.log(`[mock] 种子：${moods.length} 条心情 / ${notes.length} 条小进步（一页 ${PAGE_DEFAULT}，可翻页）`)
  console.log('[mock] 前端这样连：VITE_API_BASE=http://localhost:' + PORT + ' npm --prefix frontend run dev')
  console.log('[mock] 这个服务不连云端，请求再多也不消耗资源点。')
})
