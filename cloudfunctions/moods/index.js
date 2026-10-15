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

async function handleGet(event = {}) {
  try {
    const limit = Math.min(pickLimit(event), 200)
    const r = await db.listMoods(limit)

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
    console.warn('[moods:POST] 请求体不是合法 JSON')
    return fail('INVALID_INPUT', '请求体必须是合法 JSON')
  }

  // —— 校验 ——（顺序：缺必填 → 格式，错误信息全中文，见契约 §5.2 错误表）
  if (body.emoji == null || body.emoji === '') {
    console.warn('[moods:POST] 缺少必填 emoji')
    return fail('INVALID_INPUT', '未选择情绪：emoji 是必填项，且必须是 calm / warm / tired / low / anxious / upset / empty 之一')
  }
  if (EMOJI_WHITELIST.indexOf(body.emoji) === -1) {
    console.warn('[moods:POST] emoji 不在白名单: ' + body.emoji)
    return fail('INVALID_INPUT', '情绪不在允许范围内，请选择：calm / warm / tired / low / anxious / upset / empty')
  }

  // level：可空；给了就必须是 1–5 的整数
  let level = null
  if (body.level !== undefined && body.level !== null && body.level !== '') {
    const n = Number(body.level)
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      console.warn('[moods:POST] level 越界: ' + body.level)
      return fail('INVALID_INPUT', 'level 只能是 1 到 5 的整数，或留空不评分')
    }
    level = n
  }

  // note：可空；给了就 ≤ 200 字
  let note = null
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      return fail('INVALID_INPUT', '想说的话必须是文字')
    }
    if (body.note.length > 200) {
      console.warn('[moods:POST] note 超长: ' + body.note.length)
      return fail('INVALID_INPUT', '想说的话不能超过 200 字（当前 ' + body.note.length + ' 字）')
    }
    note = body.note
  }

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
    const w = await db.upsertMood({ date, emoji: body.emoji, level, note })
    if (w.error) {
      const isUpdate = w.step === 'update'
      console.error('[moods:POST] ' + (isUpdate ? '覆盖更新失败' : 'insert 失败') + ': ' + JSON.stringify(w.error))
      return fail('INVALID_INPUT', (isUpdate ? '覆盖更新失败' : '写入失败') + '：' + JSON.stringify(w.error))
    }
    if (w.overwritten) {
      console.log('[moods:POST] 同日已存在，已覆盖 date=' + date)
    } else {
      console.log('[moods:POST] 新增成功 date=' + date + ' emoji=' + body.emoji)
    }
  } catch (e) {
    console.error('[moods:POST] THROW: ' + (e && e.message ? e.message : String(e)))
    return fail('INTERNAL', '服务器写入异常')
  }

  // —— 读回刚写的那一行 ——
  const got = await db.findMoodByDate(date)
  if (got.error) {
    return fail('INTERNAL', '写入成功但读回失败：' + JSON.stringify(got.error))
  }
  console.log('[moods:POST] 完成 耗时=' + (Date.now() - t0) + 'ms id=' + (got.item && got.item.id))
  return { ok: true, data: { item: got.item } }
}

exports.main = async (event = {}) => {
  const method = (event && event.httpMethod) || (event && event.method) || 'GET'
  if (method === 'POST' || method === 'post') return handlePost(event)
  return handleGet(event)
}
