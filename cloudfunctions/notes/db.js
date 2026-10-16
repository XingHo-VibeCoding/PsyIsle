'use strict'

// 心汐 · progress_notes 表的数据访问层（Day 19 从 index.js 拆出）。
// 分层理由、SDK 用法、演示身份与 moods/db.js 完全相同，那里有详细注释，这里不复述。
// 这张表没有 level / note / emoji —— 单项只有 id / date / text / created_at。
//
// 身份同 moods（Day 18 暂态）：先用固定演示身份写入，登录接通后换 auth.uid() 并恢复 RLS。
const DEMO_OWNER_ID = '00000000-0000-4000-8000-000000000099'

const { init } = require('@cloudbase/node-sdk')

// Day 23：环境 ID 优先从环境变量来（本地 .env / 云端平台注入）。
// 兜底值不是密钥——它就写在公网域名里，也写在 api-contract.md §2，属于公开配置。
// 真密钥一律不进代码：本仓库没有任何密钥，变量名见仓库根 .env.example。
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

// 表 → 接口：snake_case → camelCase（契约 §2，全项目只此一处）。
// 导出只为让单元测试锁形状（db.test.js），入口层不直接用。
function rowToItem(r) {
  return {
    id: r.id,
    date: r.date,
    text: r.text,
    createdAt: r.created_at, // ← 表的 created_at 映射到接口的 createdAt
  }
}

// 读列表：按 date 倒序，同日多行再用 created_at 倒序做次级排序键，避免同日 tie 顺序在多次调用间跳变
// （Day 21 周验收登记的遗留：progress_notes 不限一天一条，只按 date 倒序时同日多行的先后不稳定）。
// 成功回 { items }，失败回 { error }（原始库错误）。
async function listNotes(limit) {
  const q = withPublicSchema(
    app
      .rdb()
      .from('progress_notes')
      .select('id,date,text,created_at')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
  )
  const { data, error } = await q
  if (error) return { error }
  return { items: (data || []).map(rowToItem) }
}

// 记一件小事。progress_notes 不限一天一条（契约 §5.2），直接 insert，不防重复。
// 成功回 { ok: true }，失败回 { ok: false, error }。
async function insertNote({ date, text }) {
  const ins = await withPublicSchema(
    app.rdb().from('progress_notes').insert({ owner_id: DEMO_OWNER_ID, date, text })
  )
  if (ins.error) return { ok: false, error: ins.error }
  return { ok: true }
}

// 读回刚写的那一行：表不限一天一条，故按 owner + date 取 created_at 最新的一条。
// 成功回 { item }，失败回 { error }。
async function findLatestNoteByDate(date) {
  const q = withPublicSchema(
    app
      .rdb()
      .from('progress_notes')
      .select('id,date,text,created_at')
      .eq('owner_id', DEMO_OWNER_ID)
      .eq('date', date)
      .order('created_at', { ascending: false })
      .limit(1)
  )
  const { data, error } = await q
  if (error) return { error }
  return { item: rowToItem((data || [])[0]) }
}

module.exports = { listNotes, insertNote, findLatestNoteByDate, rowToItem }
