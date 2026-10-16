// Day 24 · 核心流程测试脚本（同一份脚本，修复前后各跑一遍）
//
// 跑的完整链路：探活 → 读两张表 → 写入打卡 → 刷新确认 → 修改 → 再确认 → 删除 → 再确认，
// 外加刁钻输入（空值 / 越界 / 非法枚举 / 坏 JSON）与快速连点。
//
// 用法：
//   node scripts/flow-test.mjs                # 默认 TEST_DATE=2026-10-16
//   TEST_DATE=2026-10-17 node scripts/flow-test.mjs
//   BASE=https://其他环境 node scripts/flow-test.mjs
//
// 输出：stdout 一份纯文本证据，可直接重定向存档：
//   node scripts/flow-test.mjs > docs/Day24-证据/修复前.txt
//
// 两个刻意的设计：
//  1) 测试日期用「明天」而不是今天 —— moods 同一天重复提交是覆盖（契约 §4.4 幂等），
//     拿今天跑会把当天的演示数据抹掉。
//  2) 收尾把测试日期产生的行软删掉，跑完库里不留下垃圾行。

const BASE = process.env.BASE || 'https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com'
const TEST_DATE = process.env.TEST_DATE || '2026-10-16'

async function req(method, path, body) {
  const t0 = Date.now()
  const init = { method, headers: { Accept: 'application/json' } }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  const res = await fetch(BASE + path, init)
  const ms = Date.now() - t0
  let json = null
  try {
    json = await res.json()
  } catch (_) {
    json = { __notJson: true }
  }
  return { http: res.status, ms, json }
}

const log = (s) => process.stdout.write(s + '\n')

// 长 JSON 只留前 n 个字符：证据要能读，不要被 200 个「字」字刷屏
function brief(o, n = 260) {
  const s = JSON.stringify(o)
  return s.length > n ? s.slice(0, n) + '…' : s
}

async function getMoods() {
  const r = await req('GET', '/api/moods?limit=200')
  const items = (r.json && r.json.ok && r.json.data && r.json.data.items) || []
  return { ...r, items }
}

const rowsOfDate = (items, date) => items.filter((i) => i.date === date)

async function main() {
  log('=== Day 24 核心流程测试 ' + new Date().toISOString() + ' ===')
  log('BASE=' + BASE)
  log('TEST_DATE=' + TEST_DATE + '（避开今天的演示数据）')
  log('')

  const h = await req('GET', '/api/health')
  log('T1 GET /api/health → HTTP ' + h.http + ' ' + h.ms + 'ms')
  log('   ' + brief(h.json))
  log('')

  const m0 = await getMoods()
  log('T2 GET /api/moods?limit=200 → HTTP ' + m0.http + ' ' + m0.ms + 'ms  条数=' + m0.items.length)
  const n0 = await req('GET', '/api/notes?limit=200')
  const n0c = (n0.json && n0.json.ok && n0.json.data && n0.json.data.items) || []
  log('T3 GET /api/notes?limit=200 → HTTP ' + n0.http + ' ' + n0.ms + 'ms  条数=' + n0c.length)
  log('')

  let id = null
  const p1 = await req('POST', '/api/moods', {
    date: TEST_DATE,
    emoji: 'calm',
    level: 3,
    note: 'Day24 写入·原始',
  })
  log('T4 POST /api/moods（写入打卡）→ HTTP ' + p1.http + ' ' + p1.ms + 'ms')
  log('   ' + brief(p1.json))
  if (p1.json && p1.json.ok) id = p1.json.data && p1.json.data.item && p1.json.data.item.id
  log('')

  const m1 = await getMoods()
  log('T5 GET /api/moods（刷新确认）→ 条数 ' + m0.items.length + ' → ' + m1.items.length)
  log('   ' + TEST_DATE + ' 的行：' + brief(rowsOfDate(m1.items, TEST_DATE), 400))
  log('')

  if (!id) {
    log('!! 没拿到 id，后续 PATCH/DELETE 用例跳过')
  } else {
    const pa = await req('PATCH', '/api/moods?id=' + encodeURIComponent(id), {
      emoji: 'warm',
      level: 5,
      note: 'Day24 修改·已改',
    })
    log('T6 PATCH /api/moods?id=' + id + ' → HTTP ' + pa.http + ' ' + pa.ms + 'ms')
    log('   ' + brief(pa.json))
    log('')

    const m2 = await getMoods()
    log('T7 GET /api/moods（确认修改生效）')
    log('   ' + brief(rowsOfDate(m2.items, TEST_DATE), 400))
    log('')

    // T8：把附言清掉（刁钻输入之「空值」）—— 修复前的证据就在这里
    const pn = await req('PATCH', '/api/moods?id=' + encodeURIComponent(id), { note: null })
    log('T8 PATCH {note:null}（把附言清掉）→ HTTP ' + pn.http + ' ' + pn.ms + 'ms')
    log('   响应里的 note = ' + brief(pn.json && pn.json.data && pn.json.data.item && pn.json.data.item.note))
    const m3 = await getMoods()
    const after8 = rowsOfDate(m3.items, TEST_DATE)[0]
    log('   回读后的 note = ' + brief(after8 && after8.note))
    log('   ' + (after8 && after8.note === null ? 'PASS 已清空' : 'FAIL 还在原地'))
    log('')

    // T9：强度也清掉
    const pl = await req('PATCH', '/api/moods?id=' + encodeURIComponent(id), { level: null })
    log('T9 PATCH {level:null}（取消强度评分）→ HTTP ' + pl.http)
    const m3b = await getMoods()
    const after9 = rowsOfDate(m3b.items, TEST_DATE)[0]
    log('   回读后的 level = ' + brief(after9 && after9.level))
    log('   ' + (after9 && after9.level === null ? 'PASS 已清空' : 'FAIL 还在原地'))
    log('')

    const p2 = await req('POST', '/api/moods', {
      date: TEST_DATE,
      emoji: 'tired',
      level: 2,
      note: 'Day24 同日覆盖',
    })
    const id2 = p2.json && p2.json.ok && p2.json.data.item && p2.json.data.item.id
    log('T10 POST 同一天第二次（应覆盖，id 不变）→ HTTP ' + p2.http)
    log('   id: ' + id + ' → ' + id2 + '（应相同）')
    const m4 = await getMoods()
    log('   该日行数=' + rowsOfDate(m4.items, TEST_DATE).length + '（同一 owner 应为 1）')
    log('')

    const d1 = await req('DELETE', '/api/moods?id=' + encodeURIComponent(id))
    log('T11 DELETE /api/moods?id=' + id + ' → HTTP ' + d1.http + ' ' + d1.ms + 'ms')
    log('   ' + brief(d1.json))
    const m5 = await getMoods()
    log('   删除后该日行数=' + rowsOfDate(m5.items, TEST_DATE).length)
    log('')

    const d2 = await req('DELETE', '/api/moods?id=' + encodeURIComponent(id))
    log('T12 DELETE 同一 id 第二次 → HTTP ' + d2.http)
    log('   ' + brief(d2.json))
    log('')
  }

  log('=== 刁钻输入 ===')
  const cases = [
    ['C1  POST 缺 emoji', 'POST', '/api/moods', { date: TEST_DATE, level: 3 }],
    ['C2  POST emoji 空串', 'POST', '/api/moods', { date: TEST_DATE, emoji: '' }],
    ['C3  POST emoji 非法值', 'POST', '/api/moods', { date: TEST_DATE, emoji: 'happy' }],
    ['C4  POST level=0', 'POST', '/api/moods', { date: TEST_DATE, emoji: 'calm', level: 0 }],
    ['C5  POST level=6', 'POST', '/api/moods', { date: TEST_DATE, emoji: 'calm', level: 6 }],
    ['C6  POST level=2.5', 'POST', '/api/moods', { date: TEST_DATE, emoji: 'calm', level: 2.5 }],
    ['C7  POST level="3" 字符串', 'POST', '/api/moods', { date: TEST_DATE, emoji: 'calm', level: '3' }],
    ['C8  POST note 201 字', 'POST', '/api/moods', { date: TEST_DATE, emoji: 'calm', note: '字'.repeat(201) }],
    ['C9  POST note 200 字（边界内）', 'POST', '/api/moods', { date: TEST_DATE, emoji: 'calm', note: '字'.repeat(200) }],
    ['C10 POST date 格式错', 'POST', '/api/moods', { date: '2026/10/16', emoji: 'calm' }],
    ['C11 POST 非法 JSON', 'POST', '/api/moods', '{不是 json'],
    ['C12 PATCH 缺 id', 'PATCH', '/api/moods', { emoji: 'calm' }],
    ['C13 PATCH 空字段', 'PATCH', '/api/moods?id=m_not_exist_0001', {}],
    ['C14 PATCH id 不存在', 'PATCH', '/api/moods?id=m_not_exist_0001', { emoji: 'calm' }],
    ['C15 DELETE 缺 id', 'DELETE', '/api/moods', undefined],
    ['C16 DELETE id 不存在', 'DELETE', '/api/moods?id=m_not_exist_0001', undefined],
    ['C17 POST notes 空 text', 'POST', '/api/notes', { text: '' }],
    ['C18 POST notes 201 字', 'POST', '/api/notes', { text: '字'.repeat(201) }],
    ['C19 GET moods limit=abc', 'GET', '/api/moods?limit=abc', undefined],
    ['C20 GET moods limit=999（应被上限 200 夹住）', 'GET', '/api/moods?limit=999', undefined],
  ]
  for (const [name, m, p, b] of cases) {
    const r = await req(m, p, b)
    log(name + ' → HTTP ' + r.http + ' ' + r.ms + 'ms')
    log('   ' + brief(r.json, 240))
  }
  log('')

  log('=== 快速连点：同一天并发写 5 次 ===')
  const burst = await Promise.all(
    [1, 2, 3, 4, 5].map((i) =>
      req('POST', '/api/moods', { date: TEST_DATE, emoji: 'calm', level: i, note: '连点#' + i })
    )
  )
  burst.forEach((r, i) => {
    const it = r.json && r.json.ok && r.json.data && r.json.data.item
    log('  第' + (i + 1) + '发：HTTP ' + r.http + ' id=' + (it ? it.id : '-') + ' level=' + (it ? it.level : '-'))
  })
  const m6 = await getMoods()
  log('  连点后 ' + TEST_DATE + ' 行数=' + rowsOfDate(m6.items, TEST_DATE).length + '（同一 owner 应只有 1 行）')
  log('  详情：' + brief(rowsOfDate(m6.items, TEST_DATE), 500))
  log('')

  log('=== 收尾：软删测试日期的全部行 ===')
  const left = rowsOfDate((await getMoods()).items, TEST_DATE)
  for (const r of left) {
    const dd = await req('DELETE', '/api/moods?id=' + encodeURIComponent(r.id))
    log('  删 ' + r.id + ' → ' + brief(dd.json, 120))
  }
  const mFinal = await getMoods()
  log('  收尾后 moods 条数=' + mFinal.items.length + '（测试前为 ' + m0.items.length + '）')
  log('  收尾后 ' + TEST_DATE + ' 行数=' + rowsOfDate(mFinal.items, TEST_DATE).length)
  log('')
  log('=== 结束 ' + new Date().toISOString() + ' ===')
}

main().catch((e) => {
  log('!! 脚本异常: ' + (e && e.message))
  process.exit(1)
})
