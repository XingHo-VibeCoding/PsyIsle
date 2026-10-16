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

// limit 只接受 1 以上的整数（与 moods/index.js 同一口径，理由见那里的注释）。
// 2026-10-16 修：`?limit=-1` 原来会一路喂到 PostgreSQL，把用户输入错变成服务端错。
function pickLimit(event) {
  if (!event) return { ok: true, value: 50 }
  const cands = [
    event.limit,
    event.queryString && event.queryString.limit,
    event.queryStringParameters && event.queryStringParameters.limit,
  ]
  for (const c of cands) {
    if (c != null && c !== '') {
      const n = Number(c)
      if (!Number.isInteger(n) || n < 1) return { ok: false }
      return { ok: true, value: n }
    }
  }
  return { ok: true, value: 50 }
}

function fail(code, message) {
  return { ok: false, error: { code, message } }
}

// ---- Day 23：三类错误，各有一句人话 ----
// 改之前这里是裸报错：'RDB_ERR:' + JSON.stringify(r.error)、'THROW:' + e.message、
// '写入失败：' + JSON.stringify(w.error)（还被误标成 INVALID_INPUT）。
// 那些字符串里可能带表名、字段、SQL 片段、英文堆栈，不该给用户看。现在三类分开说人话：
//   1) 输入错 INVALID_INPUT：说清哪一项不对、怎么改（文案留在各校验点）
//   2) 服务端错 INTERNAL：一句「出了点状况，稍后再试」，细节只进日志
//   3) 网络错：前端的事（fetch 失败 / 超时），后端不产生这一类
const SERVER_ERROR_MESSAGE = '服务出了点小状况，请稍后再试。'

function newRequestId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function errText(e) {
  if (e == null) return 'unknown'
  if (typeof e === 'string') return e
  if (e.message) return e.message
  try {
    return JSON.stringify(e)
  } catch (_) {
    return String(e)
  }
}

// 服务端错的唯一出口：细节进日志，响应里只有中文短句 + requestId
function serverError(tag, err, reqId) {
  console.error('[' + tag + '] ' + errText(err) + ' reqId=' + reqId)
  return { ok: false, error: { code: 'INTERNAL', message: SERVER_ERROR_MESSAGE, requestId: reqId } }
}

// 请求日志（Day 23 余力加练）：时间、方法、路径、结果、耗时、requestId。只记路径不记查询串。
function logRequest(event, method, reqId, t0, result) {
  const path = (event && (event.path || (event.requestContext && event.requestContext.path))) || '/api/notes'
  console.log(
    '[req] ' +
      new Date().toISOString() +
      ' ' + method +
      ' ' + path +
      ' → ' + result +
      ' ' + (Date.now() - t0) + 'ms' +
      ' reqId=' + reqId
  )
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

async function handleGet(event = {}, reqId = '-') {
  try {
    const picked = pickLimit(event)
    if (!picked.ok) return fail('INVALID_INPUT', 'limit 必须是 1 到 200 之间的整数，或留空不传')
    const limit = Math.min(picked.value, 200)
    const r = await db.listNotes(limit)

    // 库出错 = 服务端错：细节进日志，用户只看到一句人话
    if (r.error) return serverError('notes:GET', r.error, reqId)

    return { ok: true, data: { items: r.items, nextCursor: null } }
  } catch (e) {
    return serverError('notes:GET', e, reqId)
  }
}

async function handlePost(event = {}, reqId = '-') {
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
    // 写入失败是服务端的事，不是用户填错了 —— 之前误标 INVALID_INPUT 还把库错误原文
    // 拼进文案，等于把内部细节说给用户听。现在归位到服务端错。
    if (w.error) return serverError('notes:POST:insert', w.error, reqId)
    console.log('[notes:POST] 新增成功 date=' + date)
  } catch (e) {
    return serverError('notes:POST', e, reqId)
  }

  // —— 读回刚写的那一行（按 owner + 最新 created_at 定位）——
  const got = await db.findLatestNoteByDate(date)
  if (got.error) return serverError('notes:POST:readback', got.error, reqId)
  console.log('[notes:POST] 完成 耗时=' + (Date.now() - t0) + 'ms id=' + (got.item && got.item.id))
  return { ok: true, data: { item: got.item } }
}

exports.main = async (event = {}) => {
  const t0 = Date.now()
  const reqId = newRequestId()
  const method = ((event && event.httpMethod) || (event && event.method) || 'GET').toUpperCase()

  let res
  if (method === 'POST') res = await handlePost(event, reqId)
  else res = await handleGet(event, reqId)

  // 一条请求一行日志：成功写 ok，失败写错误码，永远带 requestId 便于回查
  logRequest(event, method, reqId, t0, res && res.ok ? 'ok' : (res && res.error && res.error.code) || 'unknown')
  return res
}
