'use strict'

// 心情打卡接口（HTTP 网关路由 /api/moods）—— 入口层。
//   GET  —— 读列表
//   POST —— 打一次卡
// 同一路径靠 httpMethod 分流，不另开函数、不抢路由。
//
// Day 19 重构：这个文件现在只做入口层该做的事——按方法分发、校验参数、套错误信封。
// 「查数据库」的代码已全部移到同目录 db.js（数据访问层）：本文件不出现 app.rdb()，
// 也不出现表字段名。以后换库、接登录，入口层不用动。
const db = require('./db.js')

// 契约 §5.2 情绪白名单（与 db/schema.sql 的 moods_emoji_known、前端 moods.ts 共用同一串 id）
const EMOJI_WHITELIST = ['calm', 'warm', 'tired', 'low', 'anxious', 'upset', 'empty']

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

// 统一错误信封（契约 §3）：业务错误也走 ok:false 信封，HTTP 仍是 200（Event 函数直接 return 对象）
function fail(code, message) {
  return { ok: false, error: { code, message } }
}

// ---- Day 23：三类错误，各有一句人话 ----
// 改之前，这个文件的错误提示是裸的：'RDB_ERR:' + JSON.stringify(r.error)、
// 'THROW:' + e.message、'数据库写入异常：' + JSON.stringify(...)。
// 那几句话里可能有表名、字段名、SQL 片段、英文堆栈——全是给用户看的内部细节。
// 现在按三类分开说人话：
//   1) 输入错 INVALID_INPUT：说清哪一项不对、怎么改（具体文案留在各校验点，见下）
//   2) 服务端错 INTERNAL：只说「出了点状况，稍后再试」，细节一律进日志，不回给用户
//   3) 网络错：前端的事（fetch 失败 / 超时），后端不产生这一类，见 frontend/src/lib/errors.ts
const SERVER_ERROR_MESSAGE = '服务出了点小状况，请稍后再试。'

// requestId：给用户的是一句人话 + 一个号；号用来回查日志，完整细节只在日志里。
function newRequestId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// 把任意错误体压成一行可进日志的文本（只进日志，不出响应）
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

// 请求日志（Day 23 余力加练）：时间、方法、路径、结果、耗时、requestId。
// 只记路径不记查询串——查询串里可能有 id 与日期，日志不需要它们。
function logRequest(event, method, reqId, t0, result) {
  const path = (event && (event.path || (event.requestContext && event.requestContext.path))) || '/api/moods'
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
    return null // 解析失败 → 交给上层报 INVALID_INPUT
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

// 从事件里取目标记录 id：优先查询参数 ?id=，回退到请求体里的 id。
// HTTP 网关按路径 /api/moods 路由，PATCH/DELETE 复用同一函数，故 id 走查询参数最稳。
function pickId(event) {
  if (!event) return null
  const cands = [
    event.queryString && event.queryString.id,
    event.queryStringParameters && event.queryStringParameters.id,
  ]
  for (const c of cands) {
    if (c != null && c !== '') return String(c)
  }
  const body = parseBody(event)
  if (body && typeof body === 'object' && body.id) return String(body.id)
  return null
}

// 校验 emoji / level / note 三个字段的形状。POST 必填 emoji；PATCH 三个都可选，给了才校验。
// 返回 { ok:true, value:{emoji,level,note} }（未提供的字段保持 undefined，调用方据此「只改传了的」）
// 或 { ok:false, fail:{code,message} }。错误信息全中文（契约 §5.2 错误表）。
//
// ⚠️ Day 24 的 Bug 就长在这一段里——「有没有传这个字段」只能看 key 在不在请求体里，不能看值：
//   改之前 level / note 的判定写成了 `body.level !== undefined && body.level !== null`，
//   于是「传了 null」（＝用户想清空）被当成「没传」，值又回到 undefined 往下传；
//   入口层再判一次 `!== undefined` 把它丢掉，最后数据库压根没收到这个字段。
//   三层各自的判断都自洽，组合起来 null 被悄悄吞了：接口回 ok:true，数据一动没动，也没有一句报错。
//   现在的规定：key 存在且值是 null → 视为「清空」，value 显式给 null；key 不在 → 才是不动它。
//   （契约 §4.7 补的那条「「没传」与「传了 null」是两件事」就是这里的实现依据）
function validateMoodFields(body, { requireEmoji }) {
  let emoji = undefined
  if (body.emoji !== undefined) {
    if (body.emoji == null || body.emoji === '') {
      return { ok: false, fail: { code: 'INVALID_INPUT', message: 'emoji 不能为空：必须是 calm / warm / tired / low / anxious / upset / empty 之一' } }
    }
    if (EMOJI_WHITELIST.indexOf(body.emoji) === -1) {
      return { ok: false, fail: { code: 'INVALID_INPUT', message: '情绪不在允许范围内，请选择：calm / warm / tired / low / anxious / upset / empty' } }
    }
    emoji = body.emoji
  } else if (requireEmoji) {
    return { ok: false, fail: { code: 'INVALID_INPUT', message: '未选择情绪：emoji 是必填项，且必须是 calm / warm / tired / low / anxious / upset / empty 之一' } }
  }

  // level 可空（契约 §5.2「level 可空」）：显式传 null 或空串 = 取消这次的强度评分，
  // 不是「没传」。空串归到 null：前端表单里「清空选项」最容易递出来的是 ''。
  let level = undefined
  if (body.level !== undefined) {
    if (body.level === null || body.level === '') {
      level = null
    } else {
      const n = Number(body.level)
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return { ok: false, fail: { code: 'INVALID_INPUT', message: 'level 只能是 1 到 5 的整数，或留空不评分' } }
      }
      level = n
    }
  }

  // note 可空：显式传 null = 把已经写的话擦掉（同一套规则，见上面 level 的说明）
  let note = undefined
  if (body.note !== undefined) {
    if (body.note === null) {
      note = null
    } else if (typeof body.note !== 'string') {
      return { ok: false, fail: { code: 'INVALID_INPUT', message: '想说的话必须是文字' } }
    } else if (body.note.length > 200) {
      return { ok: false, fail: { code: 'INVALID_INPUT', message: '想说的话不能超过 200 字（当前 ' + body.note.length + ' 字）' } }
    } else {
      note = body.note
    }
  }

  return { ok: true, value: { emoji, level, note } }
}

async function handleGet(event = {}, reqId = '-') {
  try {
    const limit = Math.min(pickLimit(event), 200)
    const r = await db.listMoods(limit)

    // 库出错 = 服务端错：细节进日志，用户只看到一句人话
    if (r.error) return serverError('moods:GET', r.error, reqId)

    return { ok: true, data: { items: r.items, nextCursor: null } }
  } catch (e) {
    return serverError('moods:GET', e, reqId)
  }
}

async function handlePost(event = {}, reqId = '-') {
  const t0 = Date.now()
  const body = parseBody(event)
  if (body === null) {
    console.warn('[moods:POST] 请求体不是合法 JSON')
    return fail('INVALID_INPUT', '请求体必须是合法 JSON')
  }

  // —— 校验 ——（emoji/level/note 的形状交给共享校验器，错误信息全中文，见契约 §5.2 错误表）
  const v = validateMoodFields(body, { requireEmoji: true })
  if (!v.ok) {
    console.warn('[moods:POST] 字段校验失败: ' + v.fail.message)
    return fail(v.fail.code, v.fail.message)
  }
  const { emoji, level, note } = v.value

  // date：可空 → 今天（东八区）；给了就必须是 YYYY-MM-DD
  let date = body.date
  if (date === undefined || date === null || date === '') {
    date = todayInShanghai()
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    console.warn('[moods:POST] date 格式错误: ' + date)
    return fail('INVALID_INPUT', 'date 格式应为 YYYY-MM-DD（省略则默认今天）')
  }

  // —— 写入 ——
  // 防重复（契约 §5.2「同一天重复提交 = 覆盖」）的落点在 db.js 的 upsertMood：
  // 数据库 unique(owner_id, date) 是最终保证，先 insert、命中冲突再 update。
  try {
    const w = await db.upsertMood({ date, emoji, level, note })
    if (w.error) {
      // 写入失败是服务端的事，不是用户填错了 —— 之前这里误标成 INVALID_INPUT，
      // 还把库错误原文拼进了文案，等于把内部细节直接说给用户听。现在归位到服务端错。
      return serverError('moods:POST:' + (w.step || 'insert'), w.error, reqId)
    }
    if (w.overwritten) {
      console.log('[moods:POST] 同日已存在，已覆盖 date=' + date)
    } else {
      console.log('[moods:POST] 新增成功 date=' + date + ' emoji=' + body.emoji)
    }
  } catch (e) {
    return serverError('moods:POST', e, reqId)
  }

  // —— 读回刚写的那一行 ——
  const got = await db.findMoodByDate(date)
  if (got.error) return serverError('moods:POST:readback', got.error, reqId)
  console.log('[moods:POST] 完成 耗时=' + (Date.now() - t0) + 'ms id=' + (got.item && got.item.id))
  return { ok: true, data: { item: got.item } }
}

// PATCH —— 改一条已存在的打卡（Day 22）。可改字段 emoji / level / note（契约 §5.2），
// 只改调用方真正传了的字段，没传的保持原值。id 不存在或被软删 → 中文 NOT_FOUND。
async function handlePatch(event = {}, reqId = '-') {
  const id = pickId(event)
  if (!id) {
    return fail('INVALID_INPUT', '缺少 id：PATCH 需要目标记录 id（查询参数 ?id= 或请求体 id）')
  }

  const body = parseBody(event)
  if (body === null) {
    console.warn('[moods:PATCH] 请求体不是合法 JSON')
    return fail('INVALID_INPUT', '请求体必须是合法 JSON')
  }

  const v = validateMoodFields(body, { requireEmoji: false })
  if (!v.ok) {
    console.warn('[moods:PATCH] 字段校验失败: ' + v.fail.message)
    return fail(v.fail.code, v.fail.message)
  }

  // 只把「调用方真的传了」的字段交给数据层（未传的保持原值，不会被写成 null）。
  // 注意这里判的是请求体里有没有这个 key，不看值：值是 null 表示「要清空」，照传。
  const fields = {}
  if (body.emoji !== undefined) fields.emoji = v.value.emoji
  if (body.level !== undefined) fields.level = v.value.level
  if (body.note !== undefined) fields.note = v.value.note
  if (Object.keys(fields).length === 0) {
    return fail('INVALID_INPUT', '没有可修改的字段：emoji / level / note 至少传一个')
  }

  try {
    const r = await db.patchMood(id, fields)
    if (r.error) return serverError('moods:PATCH', r.error, reqId)
    if (r.notFound) {
      return fail('NOT_FOUND', '找不到这条打卡记录：id 不存在，或它已经被删除')
    }
    console.log('[moods:PATCH] 完成 id=' + id)
    return { ok: true, data: { item: r.item } }
  } catch (e) {
    return serverError('moods:PATCH', e, reqId)
  }
}

// DELETE —— 软删除一条打卡（Day 22）。不真删，只打 is_deleted 标记，列表查询会跳过、可找回。
// id 不存在或被软删 → 中文 NOT_FOUND。这是「删除比新增更容易出事」的解法：删错能找回。
async function handleDelete(event = {}, reqId = '-') {
  const id = pickId(event)
  if (!id) {
    return fail('INVALID_INPUT', '缺少 id：DELETE 需要目标记录 id（查询参数 ?id= 或请求体 id）')
  }

  try {
    const r = await db.softDeleteMood(id)
    if (r.error) return serverError('moods:DELETE', r.error, reqId)
    if (r.notFound) {
      return fail('NOT_FOUND', '找不到这条打卡记录：id 不存在，或它已经被删除')
    }
    console.log('[moods:DELETE] 完成（软删） id=' + id)
    return { ok: true, data: { id, deleted: true } }
  } catch (e) {
    return serverError('moods:DELETE', e, reqId)
  }
}

exports.main = async (event = {}) => {
  const t0 = Date.now()
  const reqId = newRequestId()
  const method = ((event && event.httpMethod) || (event && event.method) || 'GET').toUpperCase()

  let res
  if (method === 'POST') res = await handlePost(event, reqId)
  else if (method === 'PATCH') res = await handlePatch(event, reqId)
  else if (method === 'DELETE') res = await handleDelete(event, reqId)
  else res = await handleGet(event, reqId)

  // 一条请求一行日志：成功写 ok，失败写错误码，永远带 requestId 便于回查
  logRequest(event, method, reqId, t0, res && res.ok ? 'ok' : (res && res.error && res.error.code) || 'unknown')
  return res
}

// 导出只为让单元测试锁「null = 清空」这条语义（Day 24），云函数入口仍是 exports.main。
// 这条语义改过一次就悄悄坏过一次，不容再退回去。
exports.validateMoodFields = validateMoodFields
