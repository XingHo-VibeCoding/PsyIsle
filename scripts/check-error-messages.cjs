'use strict'

// Day 23 自检脚本（后端）：验证三类错误（输入错 / 服务端错 / 身份缺失）都只回中文、且不回内部细节。
//
// 怎么跑（仓库根目录）：
//   node scripts/check-error-messages.cjs
// 退出码 0 = 全过；1 = 有断言没过（哪条没过会打出来）。
//
// 思路：拦截 require('./db.js')，给两个云函数喂「假的数据库错误」——真实的库错误
// 很难稳定复现，而我们要验的是「错误怎么被翻译给用户」，不是库本身。
// 假错误里故意塞了表名、字段名、SQL 状态码、内网 IP，只要它们出现在响应体里就算泄漏。

const Module = require('module')
const base = require('path').join(__dirname, '..', 'cloudfunctions') + require('path').sep

// 身份开关：默认 true（假装网关认出了调用方），要验「取不到身份」那条路径时临时置 false。
// Day 27 加：数据层不再回退共享演示身份，取不到 uid 一律 UNAUTHORIZED。
let identityOk = true

// 分页开关：true 时假装库里有 51 条，用来验「多取一条判断有没有下一页」那段编排。
// 平时各路都返回库错误，走不到分页分支。
let pageMode = false

// Day 28：转正凭证用例的开关（dbError / ok / notFound / used / expired）
let claimMode = 'dbError'

// 51 条假数据：第一页应该是 50 条 + nextCursor 指向第 50 条。
const fakeRows = Array.from({ length: 51 }, (_, i) => ({
  id: 'm_' + String(2000 + i),
  date: '2026-10-' + String(31 - Math.floor(i / 2)).padStart(2, '0'),
  emoji: 'calm',
  level: null,
  note: null,
  createdAt: '2026-10-01T00:00:00.000Z',
}))

// 游标编解码用真实实现，不在这里复制一份：这份脚本要验的是入口层的分页编排，
// 连编解码都换成脚本自己写的就成了「脚本测脚本」。真实实现另有单测（db.test.js）。
const realMoodsDb = require(base + 'moods' + require('path').sep + 'db.js')

const fakeDb = {
  hasOwner: () => identityOk,
  listMoods: async () =>
    pageMode
      ? { items: fakeRows }
      : { error: { message: 'relation "public.moods" does not exist', code: '42P01' } },
  upsertMood: async () => ({ error: { message: 'permission denied for table moods', code: '42501' } }),
  findMoodByDate: async () => ({ item: { id: 'm_1', date: '2026-10-15', emoji: 'calm', level: null, note: null, createdAt: 'x' } }),
  patchMood: async () => ({ error: { message: 'connection to server at "10.0.0.5" failed', code: '08006' } }),
  softDeleteMood: async () => ({ notFound: true }),
  listNotes: async () =>
    pageMode
      ? { items: fakeRows.map((r) => ({ ...r, id: 'n_' + r.id, text: 'x' })) }
      : { error: { message: 'SSL connection has been closed unexpectedly', code: 'XX000' } },
  insertNote: async () => ({ error: { message: 'new row violates check constraint "progress_notes_text_len_chk"', code: '23514' } }),
  findLatestNoteByDate: async () => ({ item: { id: 'n_1', date: '2026-10-15', text: 'x', createdAt: 'x' } }),
  // 入口层的 handleGet 会调这两个：不给的话会 TypeError，被 catch 成 INTERNAL —— 用例就假过了
  encodeCursor: realMoodsDb.encodeCursor,
  decodeCursor: realMoodsDb.decodeCursor,
  // Day 28：匿名记录转正的凭证接口。入口层只做 action 分发 + 错误信封，
  // 数据层返回哪种结果由 claimMode 控制（默认「库报错」）。
  issueTicket: async () =>
    claimMode === 'ok'
      ? { code: 'a'.repeat(32), expiresAt: '2026-10-19T12:15:00.000Z' }
      : { error: { message: 'permission denied for table account_claims', code: '42501' } },
  redeemTicket: async () => {
    if (claimMode === 'ok') return { moods: 2, notes: 1, skipped: 0 }
    if (claimMode === 'notFound') return { notFound: true }
    if (claimMode === 'used') return { used: true }
    if (claimMode === 'expired') return { expired: true }
    return { error: { message: 'relation "public.account_claims" does not exist', code: '42P01' } }
  },
}

const origLoad = Module._load
Module._load = function (req, parent, isMain) {
  if (req === './db.js') return fakeDb
  return origLoad.apply(this, arguments)
}

const moods = require(base + 'moods' + require('path').sep + 'index.js')
const notes = require(base + 'notes' + require('path').sep + 'index.js')
const claim = require(base + 'claim' + require('path').sep + 'index.js')

// 日志静音（脚本只关心响应体；想看云函数日志把这些行删掉）
const origLog = console.log
const origErr = console.error
const origWarn = console.warn
console.log = () => {}
console.error = () => {}
console.warn = () => {}

const LEAK = ['does not exist', '42P01', 'permission denied', '10.0.0.5', 'SSL', '23514', 'RDB_ERR', 'THROW', 'internal.moods']
const CN = /[\u4e00-\u9fa5]/

// [描述, 期望错误码, 调用]
const CASES = [
  ['输入错 · POST /api/moods 情绪不在白名单', 'INVALID_INPUT', () => moods.main({ httpMethod: 'POST', path: '/api/moods', body: JSON.stringify({ emoji: 'zzz' }) })],
  ['输入错 · POST /api/notes 内容为空', 'INVALID_INPUT', () => notes.main({ httpMethod: 'POST', path: '/api/notes', body: JSON.stringify({ text: '   ' }) })],
  ['输入错 · DELETE /api/moods?id=不存在', 'NOT_FOUND', () => moods.main({ httpMethod: 'DELETE', path: '/api/moods', queryStringParameters: { id: 'm_404' } })],
  // limit 是用户输入，非法要报 INVALID_INPUT。
  // 2026-10-16 公网实测踩到：`?limit=-1` 一路喂到 PostgreSQL，被当成服务端错（INTERNAL）。
  ['输入错 · GET /api/moods?limit=-1（负数）', 'INVALID_INPUT', () => moods.main({ httpMethod: 'GET', path: '/api/moods', queryStringParameters: { limit: '-1' } })],
  ['输入错 · GET /api/moods?limit=abc（不是数字）', 'INVALID_INPUT', () => moods.main({ httpMethod: 'GET', path: '/api/moods', queryStringParameters: { limit: 'abc' } })],
  ['输入错 · GET /api/notes?limit=-1（负数）', 'INVALID_INPUT', () => notes.main({ httpMethod: 'GET', path: '/api/notes', queryStringParameters: { limit: '-1' } })],
  // Day 27：游标是用户可见的输入（在 URL 里），拼坏了要明确报，不能悄悄退回第一页 ——
  // 悄悄退回会让「看更早的记录」变成原地重读，用户以为记录只剩这些。
  ['输入错 · GET /api/moods?cursor=乱码', 'INVALID_INPUT', () => moods.main({ httpMethod: 'GET', path: '/api/moods', queryStringParameters: { cursor: '这不是游标' } })],
  ['输入错 · GET /api/notes?cursor=乱码', 'INVALID_INPUT', () => notes.main({ httpMethod: 'GET', path: '/api/notes', queryStringParameters: { cursor: '%%%' } })],
  ['服务端错 · GET /api/moods 数据库报错', 'INTERNAL', () => moods.main({ httpMethod: 'GET', path: '/api/moods' })],
  ['服务端错 · PATCH /api/moods 数据库报错', 'INTERNAL', () => moods.main({ httpMethod: 'PATCH', path: '/api/moods', queryStringParameters: { id: 'm_1' }, body: JSON.stringify({ emoji: 'calm' }) })],
  ['服务端错 · GET /api/notes 数据库报错', 'INTERNAL', () => notes.main({ httpMethod: 'GET', path: '/api/notes' })],
  ['服务端错 · POST /api/notes 数据库报错', 'INTERNAL', () => notes.main({ httpMethod: 'POST', path: '/api/notes', body: JSON.stringify({ text: '今天走了一步' }) })],
  // Day 27：取不到登录身份必须明确拒绝，且给一句用户能行动的话。
  // 这条防的是「为了别整页崩，又悄悄回退到某个默认身份」——那会让所有访客共用一份数据。
  ['身份缺失 · GET /api/moods 取不到登录身份', 'UNAUTHORIZED', () => { identityOk = false; return moods.main({ httpMethod: 'GET', path: '/api/moods' }) }],
  ['身份缺失 · POST /api/notes 取不到登录身份', 'UNAUTHORIZED', () => { identityOk = false; return notes.main({ httpMethod: 'POST', path: '/api/notes', body: JSON.stringify({ text: '今天走了一步' }) }) }],
  // Day 28：匿名记录转正。这一段防的是「凭证接口把库里的英文错误、或者把
  // 『这个券为什么不能用』的细节原样甩给用户」——券是内部机制，用户只需要知道
  // 「不对/过期了，重新领一张」。
  ['服务端错 · POST /api/claim issue 库报错', 'INTERNAL', () => { claimMode = 'dbError'; return claim.main({ httpMethod: 'POST', path: '/api/claim', body: JSON.stringify({ action: 'issue' }) }) }],
  ['输入错 · POST /api/claim 未知 action', 'INVALID_INPUT', () => claim.main({ httpMethod: 'POST', path: '/api/claim', body: JSON.stringify({ action: 'xx' }) })],
  ['输入错 · POST /api/claim redeem 缺 code', 'INVALID_INPUT', () => claim.main({ httpMethod: 'POST', path: '/api/claim', body: JSON.stringify({ action: 'redeem' }) })],
  ['输入错 · POST /api/claim code 形状不对', 'INVALID_INPUT', () => claim.main({ httpMethod: 'POST', path: '/api/claim', body: JSON.stringify({ action: 'redeem', code: '../../etc/passwd' }) })],
  ['输入错 · POST /api/claim 凭证不存在或已用', 'NOT_FOUND', () => { claimMode = 'notFound'; return claim.main({ httpMethod: 'POST', path: '/api/claim', body: JSON.stringify({ action: 'redeem', code: 'a'.repeat(32) }) }) }],
  ['输入错 · POST /api/claim 凭证过期', 'INVALID_INPUT', () => { claimMode = 'expired'; return claim.main({ httpMethod: 'POST', path: '/api/claim', body: JSON.stringify({ action: 'redeem', code: 'a'.repeat(32) }) }) }],
  ['身份缺失 · POST /api/claim 取不到登录身份', 'UNAUTHORIZED', () => { identityOk = false; return claim.main({ httpMethod: 'POST', path: '/api/claim', body: JSON.stringify({ action: 'issue' }) }) }],
]

;(async () => {
  const problems = []
  const rows = []

  for (const [label, wantCode, fn] of CASES) {
    const res = await fn()
    identityOk = true // 每条用例独立：身份开关不许漏到下一例
    const raw = JSON.stringify(res)
    const msg = (res && res.error && res.error.message) || ''
    const code = (res && res.error && res.error.code) || ''
    const leaked = LEAK.filter((w) => raw.includes(w))

    if (code !== wantCode) problems.push(label + '：错误码期望 ' + wantCode + '，实际 ' + code)
    if (!CN.test(msg)) problems.push(label + '：给用户的话不是中文 —— ' + msg)
    if (leaked.length) problems.push(label + '：响应体泄漏内部细节 —— ' + leaked.join(', '))
    if (wantCode === 'INTERNAL' && !(res.error && res.error.requestId)) problems.push(label + '：服务端错缺少 requestId')

    rows.push([code, msg, leaked.length ? '泄漏:' + leaked.join(',') : '无', res.error && res.error.requestId ? '有' : '—'])
  }

  // ---- 分页编排自检（Day 27）----
  // 这段防的是「接口带着 nextCursor 字段、却永远回 null」——那正是改之前的状态：
  // 前端以为到底了，用户以为一个月前写的东西丢了。字段在、值恒为 null，是最难被发现的那种错。
  pageMode = true
  const page1 = await moods.main({
    httpMethod: 'GET',
    path: '/api/moods',
    queryStringParameters: { limit: '50' },
  })
  if (!page1 || !page1.ok || !page1.data) {
    problems.push('分页 · GET /api/moods 应成功，实际 ' + JSON.stringify(page1 && page1.error))
  } else {
    if (page1.data.items.length !== 50)
      problems.push('分页 · 第一页应回 50 条，实际 ' + page1.data.items.length)
    if (typeof page1.data.nextCursor !== 'string')
      problems.push('分页 · 还有下一页时 nextCursor 应是字符串，实际 ' + JSON.stringify(page1.data.nextCursor))
    if (page1.data.items.some((r) => 'created_at' in r))
      problems.push('分页 · 响应里不该出现表字段名 created_at（应映射成 createdAt）')
  }

  // 反向：库里正好 50 条时，nextCursor 必须是 null。
  // 不然前端会挂一个永远翻不完的「看更早的记录」，点一次转一次次次没有新内容。
  fakeRows.length = 50
  const page2 = await moods.main({
    httpMethod: 'GET',
    path: '/api/moods',
    queryStringParameters: { limit: '50' },
  })
  if (!page2 || !page2.ok || !page2.data) {
    problems.push('分页 · 正好 50 条时应成功，实际 ' + JSON.stringify(page2 && page2.error))
  } else if (page2.data.nextCursor !== null) {
    problems.push('分页 · 只有 50 条时 nextCursor 应为 null，实际 ' + JSON.stringify(page2.data.nextCursor))
  }
  pageMode = false
  const paged = page1 && page1.ok && page1.data && page1.data.nextCursor ? '50 + 下一页' : '异常'
  const pagedEnd = page2 && page2.ok && page2.data && page2.data.nextCursor === null ? '50 + 到底' : '异常'

  // ---- 转正凭证的成功形状（Day 28）----
  // 这两条防的都是「前端拿不到能用的字段」：code 不是 32 位十六进制就当形状校验写岔了；
  // 兑换结果里三个计数缺一个，前端那句「搬了几条」就会显示 undefined。
  claimMode = 'ok'
  const issued = await claim.main({
    httpMethod: 'POST',
    path: '/api/claim',
    body: JSON.stringify({ action: 'issue' }),
  })
  const redeemed = await claim.main({
    httpMethod: 'POST',
    path: '/api/claim',
    body: JSON.stringify({ action: 'redeem', code: 'a'.repeat(32) }),
  })
  if (!issued || !issued.ok || !issued.data || !/^[0-9a-f]{32}$/.test(issued.data.code))
    problems.push('凭证 · issue 应回 32 位十六进制 code，实际 ' + JSON.stringify(issued))
  if (!issued || !issued.data || typeof issued.data.expiresAt !== 'string')
    problems.push('凭证 · issue 应回 expiresAt，实际 ' + JSON.stringify(issued))
  const rd = redeemed && redeemed.data
  if (!redeemed || !redeemed.ok || !rd || typeof rd.moods !== 'number' || typeof rd.notes !== 'number' || typeof rd.skipped !== 'number')
    problems.push('凭证 · redeem 应回 moods/notes/skipped 三个数字，实际 ' + JSON.stringify(redeemed))
  claimMode = 'dbError'
  const claimOk =
    issued && issued.ok && issued.data && /^[0-9a-f]{32}$/.test(issued.data.code) && rd && typeof rd.moods === 'number'
      ? '发券 + 兑换都成形'
      : '异常'

  console.log = origLog
  console.error = origErr
  console.warn = origWarn
  process.stdout.write('\n后端错误提示自检（' + CASES.length + ' 例）\n')
  CASES.forEach((c, i) => {
    process.stdout.write(
      '  ' + (i + 1) + '. ' + c[0] + '\n' +
        '     码 ' + rows[i][0] + ' ｜ 给用户：' + rows[i][1] + '\n' +
        '     泄漏内部细节：' + rows[i][2] + ' ｜ requestId：' + rows[i][3] + '\n'
    )
  })

  process.stdout.write('  分页编排：51 条 → ' + paged + '；50 条 → ' + pagedEnd + '\n')
  process.stdout.write('  转正凭证：' + claimOk + '\n')

  if (problems.length) {
    process.stdout.write('\n✗ 未通过 ' + problems.length + ' 项：\n')
    problems.forEach((p) => process.stdout.write('  - ' + p + '\n'))
    process.exit(1)
  }
  process.stdout.write('\n✓ 全部通过：三类错误都只回中文，响应体无表名/字段/SQL/英文堆栈\n\n')
})()
