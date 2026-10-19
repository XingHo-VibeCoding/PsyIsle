'use strict'

// 锁「凭证」这几条不容退化的性质（Day 28）：
//   · code 够长、够随机；库里只存哈希，且哈希不可逆（存了明文就等于把钥匙和锁放一起）
//   · 有效期是一个确定的 1 小时，不是「看心情」
//   · 同日冲突的行不搬 —— 这是唯一会产生「部分搬成功」的分支，必须被钉住
const test = require('node:test')
const assert = require('node:assert/strict')
const { newCode, hashCode, ticketDeadline, splitMovable, TICKET_TTL_MS } = require('./db.js')

test('code 是 32 位小写十六进制', () => {
  const c = newCode()
  assert.match(c, /^[0-9a-f]{32}$/)
})

test('两次发的 code 不一样', () => {
  const set = new Set(Array.from({ length: 200 }, () => newCode()))
  assert.equal(set.size, 200)
})

test('入库的是 sha256，不是 code 本身', () => {
  const c = newCode()
  const h = hashCode(c)
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.notEqual(h, c)
  // 同一个 code 永远算出同一个哈希（兑换时靠这一点找回那一行）
  assert.equal(hashCode(c), h)
  // 改一个字符就完全是另一个哈希
  assert.notEqual(hashCode(c.slice(0, -1) + (c.endsWith('0') ? '1' : '0')), h)
})

test('有效期是 1 小时', () => {
  const now = Date.parse('2026-10-19T12:00:00.000Z')
  assert.equal(TICKET_TTL_MS, 60 * 60 * 1000)
  assert.equal(ticketDeadline(now), '2026-10-19T13:00:00.000Z')
})

test('同日已有记录的行不搬，其余都搬', () => {
  const rows = [
    { id: 'm_1', date: '2026-10-18' },
    { id: 'm_2', date: '2026-10-19' },
    { id: 'm_3', date: '2026-10-17' },
  ]
  const { move, skip } = splitMovable(rows, new Set(['2026-10-19']))
  assert.deepEqual(move.map((r) => r.id), ['m_1', 'm_3'])
  assert.deepEqual(skip.map((r) => r.id), ['m_2'])
})

test('没有任何冲突时全部搬走', () => {
  const rows = [{ id: 'm_1', date: '2026-10-18' }]
  const { move, skip } = splitMovable(rows, new Set())
  assert.equal(move.length, 1)
  assert.equal(skip.length, 0)
})
