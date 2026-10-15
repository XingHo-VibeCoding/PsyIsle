'use strict'

// 心情打卡接口（HTTP 网关路由 /api/moods）。
//   GET  —— 读列表（Day 17 已实现，见下方 handleGet，原逻辑未动）
//   POST —— 打一次卡（Day 18 新增，见下方 handlePost）
// 同一路径靠 httpMethod 分流，不另开函数、不抢路由。
//
// 访问方式：@cloudbase/node-sdk 的 app.rdb()（CloudBase PG 模式数据 API 的 Supabase 式查询器）。
// 云端全局 SDK 版本较旧：rdb() 有，但 setHeader / schema() 方法缺失，且把 schema 写死成环境 ID。
// 所以这里用「包裹构造器自身的 fetch」手动注入 Accept-Profile: public（PostgREST 用它选 schema）。
//
// 关于身份（重要，Day 18 暂态）：本环境云函数身份拿不到 service_role，也没有真实登录态，
// auth.uid() 在函数上下文里是 null —— 而 moods.owner_id 是 NOT NULL 且有外键指向 profiles。
// 所以这里先用一个固定的演示身份写入（与 Day 17「函数作为可信后端读全部演示数据」同一思路）。
// TODO(Day 18 接登录)：登录接通后，把 DEMO_OWNER_ID 换成 auth.uid()，并恢复 profiles/moods 的 RLS。
const DEMO_OWNER_ID = '00000000-0000-4000-8000-000000000099'

// 契约 §5.2 情绪白名单（与 db/schema.sql 的 moods_emoji_known、前端 moods.ts 共用同一串 id）
const EMOJI_WHITELIST = ['calm', 'warm', 'tired', 'low', 'anxious', 'upset', 'empty']

const { init } = require('@cloudbase/node-sdk')

const app = init({ env: process.env.TCB_ENV || 'psyisle-prod-d9g109suw53257aed' })

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

// 表 → 接口：snake_case → camelCase（契约 §2 / §6.2 的「对不上」落点）
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

// 按 owner_id + date 把刚写好的那一行读回来（用唯一键定位，不依赖 insert 的返回结构）
async function selectByOwnerDate(date) {
  const q = withPublicSchema(
    app
      .rdb()
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .eq('owner_id', DEMO_OWNER_ID)
      .eq('date', date)
  )
  const { data, error } = await q
  if (error) return { error }
  return { item: rowToItem((data || [])[0]) }
}

async function handleGet(event = {}) {
  try {
    const limit = Math.min(pickLimit(event), 200)
    const q = withPublicSchema(
      app
        .rdb()
        .from('moods')
        .select('id,date,emoji,level,note,created_at')
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
  // 防重复（契约 §5.2「同一天重复提交 = 覆盖」）：数据库 unique(owner_id, date) 是最终保证。
  // 先 insert；若命中唯一约束冲突，再 update 覆盖（不报错、不新增第二行）。
  const row = { owner_id: DEMO_OWNER_ID, date, emoji: body.emoji, level, note }
  try {
    const ins = await withPublicSchema(app.rdb().from('moods').insert(row))
    if (ins.error) {
      const msg = JSON.stringify(ins.error)
      const isDup = /duplicate|unique|23505|moods_one_per_day/i.test(msg)
      if (!isDup) {
        console.error('[moods:POST] insert 失败: ' + msg)
        return fail('INVALID_INPUT', '写入失败：' + msg)
      }
      // 同日已存在 → 覆盖（更新内容 + updated_at）
      const upd = await withPublicSchema(
        app
          .rdb()
          .from('moods')
          .update({ emoji: body.emoji, level, note, updated_at: new Date().toISOString() })
          .eq('owner_id', DEMO_OWNER_ID)
          .eq('date', date)
      )
      if (upd.error) {
        console.error('[moods:POST] 覆盖更新失败: ' + JSON.stringify(upd.error))
        return fail('INVALID_INPUT', '覆盖更新失败：' + JSON.stringify(upd.error))
      }
      console.log('[moods:POST] 同日已存在，已覆盖 date=' + date)
    } else {
      console.log('[moods:POST] 新增成功 date=' + date + ' emoji=' + body.emoji)
    }
  } catch (e) {
    console.error('[moods:POST] THROW: ' + (e && e.message ? e.message : String(e)))
    return fail('INTERNAL', '服务器写入异常')
  }

  // —— 读回刚写的那一行 ——
  const got = await selectByOwnerDate(date)
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
