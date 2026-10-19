'use strict'

// 匿名记录转正接口（HTTP 网关路由 /api/claim）—— 入口层。
//   POST { action: 'issue' }            —— 领一张一次性凭证（匿名身份领，1 小时有效）
//   POST { action: 'redeem', code }     —— 兑换：把旧身份名下的记录搬到当前账号
//
// 一个路径两个动作，不另开函数、不多占一条网关路由。
// 分层口径同 moods / notes：本文件只做分发、校验、套错误信封，数据库在 db.js。
const db = require('./db.js')

// 统一错误信封（契约 §3）：业务错误也走 ok:false，HTTP 仍是 200（Event 函数直接 return 对象）
function fail(code, message) {
  return { ok: false, error: { code, message } }
}

const AUTH_MISSING_MESSAGE = '登录状态没取到，刷新一下页面再试。'

function authMissing(tag, reqId) {
  console.warn('[auth] 取不到登录身份，拒绝本次请求 tag=' + tag + ' reqId=' + reqId)
  return fail('UNAUTHORIZED', AUTH_MISSING_MESSAGE)
}

function isAuthMissing(e) {
  return !!(e && e.code === 'UNAUTHORIZED')
}

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

function serverError(tag, err, reqId) {
  console.error('[' + tag + '] ' + errText(err) + ' reqId=' + reqId)
  return { ok: false, error: { code: 'INTERNAL', message: SERVER_ERROR_MESSAGE, requestId: reqId } }
}

function logRequest(event, method, reqId, t0, result) {
  const path = (event && (event.path || (event.requestContext && event.requestContext.path))) || '/api/claim'
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

// 解析 POST 请求体（口径同 moods/index.js：body 是字符串，也可能已 base64）
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

// code 的形状：自己签发的 32 位小写十六进制。形状不对就不必去查库了。
function isCodeShape(code) {
  return typeof code === 'string' && /^[0-9a-f]{32}$/.test(code)
}

async function handlePost(event, reqId) {
  const body = parseBody(event)
  if (body === null) {
    console.warn('[claim:POST] 请求体不是合法 JSON')
    return fail('INVALID_INPUT', '请求体必须是合法 JSON')
  }
  const action = body.action

  if (action === 'issue') {
    try {
      const r = await db.issueTicket(event)
      if (r.error) return serverError('claim:issue', r.error, reqId)
      console.log('[claim:issue] 已签发凭证，有效期至 ' + r.expiresAt)
      return { ok: true, data: { code: r.code, expiresAt: r.expiresAt } }
    } catch (e) {
      if (isAuthMissing(e)) return authMissing('claim:issue', reqId)
      return serverError('claim:issue', e, reqId)
    }
  }

  if (action === 'redeem') {
    if (!isCodeShape(body.code)) {
      return fail('INVALID_INPUT', '缺少或无效的 code：兑换需要领凭证时拿到的 code')
    }
    try {
      const r = await db.redeemTicket(body.code, event)
      if (r.error) return serverError('claim:redeem', r.error, reqId)
      if (r.notFound) return fail('NOT_FOUND', '这个凭证不对，或者已经用过了')
      if (r.used) return fail('NOT_FOUND', '这个凭证已经用过了：记录不会重复搬第二次')
      if (r.expired) return fail('INVALID_INPUT', '这个凭证过期了（领到之后 1 小时内要兑换）')
      console.log('[claim:redeem] 搬完 moods=' + r.moods + ' notes=' + r.notes + ' skipped=' + r.skipped)
      return { ok: true, data: { moods: r.moods, notes: r.notes, skipped: r.skipped } }
    } catch (e) {
      if (isAuthMissing(e)) return authMissing('claim:redeem', reqId)
      return serverError('claim:redeem', e, reqId)
    }
  }

  console.warn('[claim:POST] 未知 action: ' + String(action))
  return fail('INVALID_INPUT', 'action 只能是 issue（领凭证）或 redeem（兑换）')
}

exports.main = async (event = {}) => {
  const t0 = Date.now()
  const reqId = newRequestId()
  const method = ((event && event.httpMethod) || (event && event.method) || 'POST').toUpperCase()

  // 身份前置检查：没有登录身份，一次数据库往返都不发（口径同 moods/index.js）
  if (!db.hasOwner()) {
    const res = authMissing(method + ' ' + (event.path || '/api/claim'), reqId)
    logRequest(event, method, reqId, t0, res.error.code)
    return res
  }

  let res
  if (method !== 'POST') {
    res = fail('INVALID_INPUT', '这个接口只接受 POST')
  } else {
    res = await handlePost(event, reqId)
  }

  logRequest(event, method, reqId, t0, res && res.ok ? 'ok' : (res && res.error && res.error.code) || 'unknown')
  return res
}
