'use strict'

// 小进步接口（HTTP 网关路由 /api/notes）。
//   GET  —— 读列表（Day 17 已实现，见下方 handleGet，原逻辑未动）
//   POST —— 记一件小事（Day 18 新增，见下方 handlePost）
// 同一路径靠 httpMethod 分流。
//
// 访问方式同上：@cloudbase/node-sdk 的 app.rdb()，包裹 fetch 注入 public schema。
// 这张表没有 level / note / emoji —— 单项只有 id / date / text / created_at。
//
// 身份同 moods（Day 18 暂态）：先用固定演示身份写入，登录接通后换 auth.uid() 并恢复 RLS。
const DEMO_OWNER_ID = '00000000-0000-4000-8000-000000000099'

const { init } = require('@cloudbase/node-sdk')

const app = init({ env: process.env.TCB_ENV || 'psyisle-prod-d9g109suw53257aed' })

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

function rowToItem(r) {
  return {
    id: r.id,
    date: r.date,
    text: r.text,
    createdAt: r.created_at, // ← 表的 created_at 映射到接口的 createdAt
  }
}

function fail(code, message) {
  return { ok: false, error: { code, message } }
}

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
    const q = withPublicSchema(
      app
        .rdb()
        .from('progress_notes')
        .select('id,date,text,created_at')
        .order('date', { ascending: false })
        .limit(limit)
    )

    const { data, error } = await q

    if (error) {
      return { ok: false, error: { code: 'INTERNAL', message: 'RDB_ERR:' + JSON.stringify(error) } }
    }

    const items = (data || []).map(rowToItem)
    return { ok: true, data: { items, nextCursor: null } }
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
    const ins = await withPublicSchema(
      app.rdb().from('progress_notes').insert({ owner_id: DEMO_OWNER_ID, date, text: body.text })
    )
    if (ins.error) {
      console.error('[notes:POST] insert 失败: ' + JSON.stringify(ins.error))
      return fail('INVALID_INPUT', '写入失败：' + JSON.stringify(ins.error))
    }
    console.log('[notes:POST] 新增成功 date=' + date)
  } catch (e) {
    console.error('[notes:POST] THROW: ' + (e && e.message ? e.message : String(e)))
    return fail('INTERNAL', '服务器写入异常')
  }

  // —— 读回刚写的那一行（按 owner + 最新 created_at 定位）——
  const sel = await withPublicSchema(
    app
      .rdb()
      .from('progress_notes')
      .select('id,date,text,created_at')
      .eq('owner_id', DEMO_OWNER_ID)
      .eq('date', date)
      .order('created_at', { ascending: false })
      .limit(1)
  )
  if (sel.error) {
    return fail('INTERNAL', '写入成功但读回失败：' + JSON.stringify(sel.error))
  }
  const item = rowToItem((sel.data || [])[0])
  console.log('[notes:POST] 完成 耗时=' + (Date.now() - t0) + 'ms id=' + (item && item.id))
  return { ok: true, data: { item } }
}

exports.main = async (event = {}) => {
  const method = (event && event.httpMethod) || (event && event.method) || 'GET'
  if (method === 'POST' || method === 'post') return handlePost(event)
  return handleGet(event)
}
