'use strict'

// 锁 db.js 的字段映射：表行（snake_case）→ 接口字段（camelCase）。
// 这是契约 §6.2「created_at 对不上 createdAt」那个坑的落点——Day 19 把映射搬进数据层，
// 形状不容悄悄变。改形状必须先改 api-contract.md，再改这里。
const test = require('node:test')
const assert = require('node:assert/strict')
const { rowToItem } = require('./db.js')

test('created_at 映射成 createdAt', () => {
  const item = rowToItem({
    id: 'm_01',
    date: '2026-10-15',
    emoji: 'calm',
    level: 3,
    note: '把窗户打开了一会儿',
    created_at: '2026-10-15T09:00:00.000+08:00',
  })

  assert.deepEqual(item, {
    id: 'm_01',
    date: '2026-10-15',
    emoji: 'calm',
    level: 3,
    note: '把窗户打开了一会儿',
    createdAt: '2026-10-15T09:00:00.000+08:00',
  })
})

// level / note 可空：没打分、没写字的人就是 null，原样透出，不补默认值
test('level / note 可空，原样透出', () => {
  const item = rowToItem({
    id: 'm_02',
    date: '2026-10-15',
    emoji: 'low',
    level: null,
    note: null,
    created_at: '2026-10-15T09:00:00.000+08:00',
  })

  assert.equal(item.level, null)
  assert.equal(item.note, null)
})

// 表里有的、契约里没有的列，接口不给：updated_at 和 created_at 都不许出现在接口字段里
test('updated_at 不透出，created_at 也不留原名', () => {
  const item = rowToItem({
    id: 'm_03',
    date: '2026-10-15',
    emoji: 'warm',
    level: null,
    note: null,
    created_at: '2026-10-15T09:00:00.000+08:00',
    updated_at: '2026-10-15T10:00:00.000+08:00',
  })

  assert.equal('updated_at' in item, false)
  assert.equal('created_at' in item, false)
})

// ---- Day 27：身份缺失必须拒绝，绝不回退到共享身份 ----
// 改之前 owner 的取法是「取不到就返回固定的 000…099」。那句兜底把「谁都没身份」
// 翻译成了「大家都是同一个人」——网关鉴权一旦失效，所有访客读写同一个 owner_id 空间。
// 这里把「只能返回真实 uid，否则抛」钉死，防止哪天有人为了「别整页崩」再加回默认值。
const { ownerFromInfo } = require('./db.js')

test('拿到 uid 就用它', () => {
  assert.equal(ownerFromInfo({ uid: 'u_123' }), 'u_123')
})

test('取不到 uid 一律抛 UNAUTHORIZED，不返回任何默认值', () => {
  for (const bad of [null, undefined, {}, { uid: '' }, { uid: null }]) {
    assert.throws(
      () => ownerFromInfo(bad),
      (e) => e.code === 'UNAUTHORIZED' && e.name === 'AuthMissingError'
    )
  }
})

// ---- Day 27：游标编解码 ----
// 原来 GET 恒回 nextCursor: null，前端就算想翻也没有下一页可翻，于是「看过的记录」
// 实际上只有最近 50 条。这里把「锚点能被原样还原」钉死，否则「看更早的记录」
// 会退化成原地重读——那比直接没有按钮更糟，用户会以为记录真的只剩这些。
const { encodeCursor, decodeCursor, cursorFilter } = require('./db.js')

test('游标能原样往返（date / createdAt / id 三件套）', () => {
  const c = encodeCursor({
    id: 'm_1',
    date: '2026-10-19',
    createdAt: '2026-10-19T07:00:00.123+00:00',
  })
  const d = decodeCursor(c)
  assert.equal(d.d, '2026-10-19')
  assert.equal(d.i, 'm_1')
  assert.equal(d.c, '2026-10-19T07:00:00.123Z') // 规范化成 Z，不带 +
})

test('过滤条件里绝不出现 +（URL 里 + 会被解码成空格，PostgREST 会整条 400）', () => {
  const c = encodeCursor({
    id: 'n_9',
    date: '2026-10-19',
    createdAt: '2026-10-19T07:00:00.500+00:00',
  })
  const f = cursorFilter(decodeCursor(c))
  assert.ok(f, '过滤条件不该为空')
  assert.ok(!f.includes('+'), '出现了 +: ' + f)
  assert.ok(f.includes('date.lt.2026-10-19'))
  assert.ok(f.includes('created_at.lt.'))
  assert.ok(f.includes('id.lt.n_9'))
})

test('没有可靠时间戳时退化成只按日期翻页，不抛错也不返回空', () => {
  const f = cursorFilter(
    decodeCursor(encodeCursor({ id: 'n_1', date: '2026-10-18', createdAt: null }))
  )
  assert.ok(f, '过滤条件不该为空')
  assert.ok(!f.includes('created_at'), '不该带时间戳条件: ' + f)
  assert.ok(f.includes('id.lt.n_1'))
})

test('坏游标一律当第一页（返回 null），不把垃圾串塞进查询', () => {
  const bad = [
    '',
    null,
    undefined,
    'not-base64!!!',
    Buffer.from('{"x":1}').toString('base64url'),
    Buffer.from('{"d":"2026-10-19"}').toString('base64url'), // 缺 id
  ]
  for (const b of bad) assert.equal(decodeCursor(b), null, '应返回 null: ' + b)
})

test('没有游标就不加过滤条件（第一页）', () => {
  assert.equal(cursorFilter(null), null)
})

test('游标形状白名单：d/i 会被拼进 PostgREST or(...)，畸形字符一律拒绝', () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  // 正常游标必须仍然可用
  assert.ok(decodeCursor(enc({ d: '2026-10-19', c: '2026-10-19T01:02:03.000Z', i: 'm_abc123' })))
  assert.ok(decodeCursor(enc({ d: '2026-10-19', i: 'n_abc-123_XYZ' })))
  // 右括号能改变 or(...) 的分组结构；逗号能额外塞进一个条件；日期格式歪掉会变 400
  const bad = [
    enc({ d: '2026-10-19', i: 'zz),owner_id.neq.x' }),
    enc({ d: '2026-10-19', i: 'a,b' }),
    enc({ d: '2026-10-19', i: 'a b' }),
    enc({ d: '2020-01-01),x', i: 'm_abc' }),
    enc({ d: '2026-1-1', i: 'm_abc' }),
    enc({ d: '2026-10-19', i: '' }),
  ]
  for (const b of bad) assert.equal(decodeCursor(b), null, '应拒绝: ' + b)
})
