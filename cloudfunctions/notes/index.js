'use strict'

// 小进步接口（HTTP 网关路由 /api/notes）—— 入口层。
//   GET  —— 读列表
//   POST —— 记一件小事
// 同一路径靠 httpMethod 分流。
//
// Day 19 重构：这个文件现在只做入口层该做的事——按方法分发、校验参数、套错误信封。
// 「查数据库」的代码已全部移到同目录 db.js（数据访问层）：本文件不出现 app.rdb()，
// 也不出现表字段名。以后换库、接登录，入口层不用动。
const db = require('./db.js')

function pickLimit(event) {
  if (!event) return 50
  const cands = [
    event.limit,
    event.queryString && event.queryString.limit,
    event.queryStringParameters && event.queryStringParameters.limit,
  ]
  for (const c of cands) {
    if (c != null && c !== '') {
      const n = Number(c)
      if (!Number.isNaN(n)) return n
    }
  }
  return 50
}

function fail(code, message) {
  return { ok: false, error: { code, message } }
}

// 解析 POST 请求体：CloudBase HTTP 事件里 body 是字符串，也可能已 base64
function parseBody(event) {
  if (!event || event.body == null) return {}
  let raw = event.body
  if (event.isBase64Encoded && typeof raw === 'string') {
    raw = Buffer.from(raw, 'base64').toString('utf8')
  }
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

// 服务端本地日期（东八区），用作 date 省略时的默认值（契约 §2：不信客户端时钟）
function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function handleGet(event = {}) {
  try {
    const limit = Math.min(pickLimit(event), 200)
    const r = await db.listNotes(limit)

    if (r.error) {
      return { ok: false, error: { code: 'INTERNAL', message: 'RDB_ERR:' + JSON.stringify(r.error) } }
    }

    return { ok: true, data: { items: r.items, nextCursor: null } }
  } catch (e) {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'THROW:' + (e && e.message ? e.message : String(e)) },
    }
  }
}

async function handlePost(event = {}) {
  const t0 = Date.now()
  const body = parseBody(event)
  if (body === null) {
    console.warn('[notes:POST] 请求体不是合法 JSON')
    return fail('INVALID_INPUT', '请求体必须是合法 JSON')
  }

  // —— 校验 ——（契约 §5.2 POST /api/notes：text 为空或超长 → 400）
  if (body.text == null || typeof body.text !== 'string' || body.text.trim() === '') {
    console.warn('[notes:POST] 缺少必填 text')
    return fail('INVALID_INPUT', 'text 不能为空：记一件今天做了的小事')
  }
  if (body.text.length > 200) {
    console.warn('[notes:POST] text 超长: ' + body.text.length)
    return fail('INVALID_INPUT', '小进步内容不能超过 200 字（当前 ' + body.text.length + ' 字）')
  }

  // date：可空 → 今天（东八区）；给了就必须是 YYYY-MM-DD
  let date = body.date
  if (date === undefined || date === null || date === '') {
    date = todayInShanghai()
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    console.warn('[notes:POST] date 格式错误: ' + date)
    return fail('INVALID_INPUT', 'date 格式应为 YYYY-MM-DD（省略则默认今天）')
  }

  // —— 写入 ——（progress_notes 不限一天一条，故不防重复）
  try {
    const w = await db.insertNote({ date, text: body.text })
    if (w.error) {
      console.error('[notes:POST] insert 失败: ' + JSON.stringify(w.error))
      return fail('INVALID_INPUT', '写入失败：' + JSON.stringify(w.error))
    }
    console.log('[notes:POST] 新增成功 date=' + date)
  } catch (e) {
    console.error('[notes:POST] THROW: ' + (e && e.message ? e.message : String(e)))
    return fail('INTERNAL', '服务器写入异常')
  }

  // —— 读回刚写的那一行（按 owner + 最新 created_at 定位）——
  const got = await db.findLatestNoteByDate(date)
  if (got.error) {
    return fail('INTERNAL', '写入成功但读回失败：' + JSON.stringify(got.error))
  }
  console.log('[notes:POST] 完成 耗时=' + (Date.now() - t0) + 'ms id=' + (got.item && got.item.id))
  return { ok: true, data: { item: got.item } }
}

exports.main = async (event = {}) => {
  const method = (event && event.httpMethod) || (event && event.method) || 'GET'
  if (method === 'POST' || method === 'post') return handlePost(event)
  return handleGet(event)
}
