'use strict'

// 心情打卡读接口。路由 /api/moods，返回形状见 api-contract.md §5.2（GET /api/moods）。
//
// 访问方式：@cloudbase/node-sdk 的 app.rdb()（CloudBase PG 模式数据 API 的 Supabase 式查询器）。
// 云端全局 SDK 版本较旧：rdb() 有，但 setHeader / schema() 方法缺失，且把 schema 写死成环境 ID。
// 所以这里用「包裹构造器自身的 fetch」手动注入 Accept-Profile: public（PostgREST 用它选 schema）。
//
// 关于 RLS（行级权限）：本环境云函数身份拿不到 service_role（用户给的 API Key 对 PG 数据 API 无效，
// 已双端验证），而 moods/progress_notes 的策略是 owner_id = auth.uid()，函数身份对不上 → 0 行。
// Day 17 按契约本就要「函数作为可信后端读全部演示数据」，故这两张表在 Day 17 演示期临时关闭 RLS
// （函数即可信后端，前端只经函数读库，不直接碰库）；Day 18 接登录、按调用者身份过滤时再恢复。
//
// ★ 今天要掌握的「对不上」就在这 ↓
//   表 public.moods 的列叫 created_at（snake_case），契约里接口字段叫 createdAt（camelCase）。
//   如果直接把 rdb 返回的行原样 return，前端拿到的是 created_at，和契约对不上，页面取不到 .createdAt 就空了。
//   所以这里显式只选契约规定的字段，并把 created_at 映射成 createdAt。
//   另外表里还有 updated_at 这一列，契约里根本没有 —— 上面 select 故意不选它，就是「表有的接口不一定给」的落点。

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
      .from('moods')
      .select('id,date,emoji,level,note,created_at')
      .order('date', { ascending: false })
      .limit(limit)

    // 云端旧版 SDK 没有 setHeader，包裹 fetch 注入 public schema
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

    // 表 → 接口：snake_case → camelCase
    const items = (data || []).map((r) => ({
      id: r.id,
      date: r.date,
      emoji: r.emoji,
      level: r.level, // 可空：没打分的人就是 null，原样透出
      note: r.note, // 可空
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
