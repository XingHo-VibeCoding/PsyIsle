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
