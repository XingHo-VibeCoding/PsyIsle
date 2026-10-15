'use strict'

// 锁 db.js 的字段映射：表行（snake_case）→ 接口字段（camelCase）。
// 契约 §6.2 的落点——小进步表没有 level / note / emoji，单项只有 id / date / text / createdAt。
// 改形状必须先改 api-contract.md，再改这里。
const test = require('node:test')
const assert = require('node:assert/strict')
const { rowToItem } = require('./db.js')

test('created_at 映射成 createdAt', () => {
  const item = rowToItem({
    id: 'n_01',
    date: '2026-10-15',
    text: '把袜子洗了',
    created_at: '2026-10-15T09:00:00.000+08:00',
  })

  assert.deepEqual(item, {
    id: 'n_01',
    date: '2026-10-15',
    text: '把袜子洗了',
    createdAt: '2026-10-15T09:00:00.000+08:00',
  })
})

// 小进步表没有评分列：接口字段里不许出现 level / note / emoji
test('不带评分相关字段', () => {
  const item = rowToItem({
    id: 'n_02',
    date: '2026-10-15',
    text: '倒了垃圾',
    created_at: '2026-10-15T09:00:00.000+08:00',
  })

  assert.equal('level' in item, false)
  assert.equal('note' in item, false)
  assert.equal('emoji' in item, false)
})
