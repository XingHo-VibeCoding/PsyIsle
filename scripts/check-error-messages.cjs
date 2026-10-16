'use strict'

// Day 23 自检脚本（后端）：验证两类错误（输入错 / 服务端错）都只回中文、且不回内部细节。
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

const fakeDb = {
  listMoods: async () => ({
    error: { message: 'relation "public.moods" does not exist', code: '42P01' },
  }),
  upsertMood: async () => ({ error: { message: 'permission denied for table moods', code: '42501' } }),
  findMoodByDate: async () => ({ item: { id: 'm_1', date: '2026-10-15', emoji: 'calm', level: null, note: null, createdAt: 'x' } }),
  patchMood: async () => ({ error: { message: 'connection to server at "10.0.0.5" failed', code: '08006' } }),
  softDeleteMood: async () => ({ notFound: true }),
  listNotes: async () => ({ error: { message: 'SSL connection has been closed unexpectedly', code: 'XX000' } }),
  insertNote: async () => ({ error: { message: 'new row violates check constraint "progress_notes_text_len_chk"', code: '23514' } }),
  findLatestNoteByDate: async () => ({ item: { id: 'n_1', date: '2026-10-15', text: 'x', createdAt: 'x' } }),
}

const origLoad = Module._load
Module._load = function (req, parent, isMain) {
  if (req === './db.js') return fakeDb
  return origLoad.apply(this, arguments)
}

const moods = require(base + 'moods' + require('path').sep + 'index.js')
const notes = require(base + 'notes' + require('path').sep + 'index.js')

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
  ['服务端错 · GET /api/moods 数据库报错', 'INTERNAL', () => moods.main({ httpMethod: 'GET', path: '/api/moods' })],
  ['服务端错 · PATCH /api/moods 数据库报错', 'INTERNAL', () => moods.main({ httpMethod: 'PATCH', path: '/api/moods', queryStringParameters: { id: 'm_1' }, body: JSON.stringify({ emoji: 'calm' }) })],
  ['服务端错 · GET /api/notes 数据库报错', 'INTERNAL', () => notes.main({ httpMethod: 'GET', path: '/api/notes' })],
  ['服务端错 · POST /api/notes 数据库报错', 'INTERNAL', () => notes.main({ httpMethod: 'POST', path: '/api/notes', body: JSON.stringify({ text: '今天走了一步' }) })],
]

;(async () => {
  const problems = []
  const rows = []

  for (const [label, wantCode, fn] of CASES) {
    const res = await fn()
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

  if (problems.length) {
    process.stdout.write('\n✗ 未通过 ' + problems.length + ' 项：\n')
    problems.forEach((p) => process.stdout.write('  - ' + p + '\n'))
    process.exit(1)
  }
  process.stdout.write('\n✓ 全部通过：两类错误都只回中文，响应体无表名/字段/SQL/英文堆栈\n\n')
})()
