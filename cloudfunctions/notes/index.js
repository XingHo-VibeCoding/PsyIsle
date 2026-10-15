'use strict'

// 小进步读接口。路由 /api/notes，返回形状见 api-contract.md §5.2（GET /api/notes）。
//
// 同 moods：经 @cloudbase/node-sdk 的 app.rdb() 读 progress_notes（包裹 fetch 注入 public schema）。
// 这张表没有 level / note / emoji —— 单项只有 id / date / text / created_at。
// 表字段映射同 moods：created_at → createdAt。text 列名正好是接口字段名，不用改名。
// RLS 处理同 moods（Day 17 演示期临时关闭，Day 18 接登录再恢复）。

const { init } = require('@cloudbase/node-sdk')

const app = init({ env: process.env.TCB_ENV || 'psyisle-prod-d9g109suw53257aed' })

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

exports.main = async (event = {}) => {
  try {
    const limit = Math.min(pickLimit(event), 200)
    const q = app
      .rdb()
      .from('progress_notes')
      .select('id,date,text,created_at')
      .order('date', { ascending: false })
      .limit(limit)

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

    const { data, error } = await q

    if (error) {
      return { ok: false, error: { code: 'INTERNAL', message: 'RDB_ERR:' + JSON.stringify(error) } }
    }

    const items = (data || []).map((r) => ({
      id: r.id,
      date: r.date,
      text: r.text,
      createdAt: r.created_at, // ← 表的 created_at 映射到接口的 createdAt
    }))

    return { ok: true, data: { items, nextCursor: null } }
  } catch (e) {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'THROW:' + (e && e.message ? e.message : String(e)) },
    }
  }
}
