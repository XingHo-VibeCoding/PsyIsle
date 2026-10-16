'use strict'

// Day 24：锁 PATCH 的「传了 null = 清空这个字段」语义。
//
// 这条规则以前是靠默契存在的：校验层用 `body.note !== null` 跳过 null，
// 入口层用 `body.note !== undefined` 判有没有传——三层各自都对，组合起来 null 被吞，
// 表现为「接口回 ok:true，附言纹丝不动」，连一句报错都没有。
// 契约 §4.7 已把规则写明（「没传」与「传了 null」是两件事），这里用测试把它钉住。
const test = require('node:test')
const assert = require('node:assert/strict')
const { validateMoodFields } = require('./index.js')

// key 不存在 = 没传 → 值保持 undefined，数据层据此不写这个字段
test('没传的字段保持 undefined（不是 null）', () => {
  const r = validateMoodFields({}, { requireEmoji: false })
  assert.equal(r.ok, true)
  assert.equal(r.value.emoji, undefined)
  assert.equal(r.value.level, undefined)
  assert.equal(r.value.note, undefined)
})

// key 存在但值是 null = 清空 → 值必须是 null，且必须能一路传到数据层
test('显式传 null = 清空 note（附言）', () => {
  const r = validateMoodFields({ note: null }, { requireEmoji: false })
  assert.equal(r.ok, true)
  assert.equal(r.value.note, null)
})

test('显式传 null = 清空 level（取消评分）', () => {
  const r = validateMoodFields({ level: null }, { requireEmoji: false })
  assert.equal(r.ok, true)
  assert.equal(r.value.level, null)
})

// 空串和 null 同义：前端「清空选项」递出来的往往是 ''
test('level 空串与 null 同义，都是清空', () => {
  const r = validateMoodFields({ level: '' }, { requireEmoji: false })
  assert.equal(r.ok, true)
  assert.equal(r.value.level, null)
})

// emoji 不允许为空：打了就是打了，它没有「清空」这个动作
test('emoji 传 null 仍然报错（情绪不能没有）', () => {
  const r = validateMoodFields({ emoji: null }, { requireEmoji: false })
  assert.equal(r.ok, false)
  assert.equal(r.fail.code, 'INVALID_INPUT')
})

// 形状校验没被这次改动波及
test('level 越界、非法情绪、超长附言照旧拦住', () => {
  assert.equal(validateMoodFields({ level: 6 }, { requireEmoji: false }).ok, false)
  assert.equal(validateMoodFields({ level: 2.5 }, { requireEmoji: false }).ok, false)
  assert.equal(validateMoodFields({ emoji: 'happy' }, { requireEmoji: false }).ok, false)
  assert.equal(validateMoodFields({ note: '字'.repeat(201) }, { requireEmoji: false }).ok, false)
  assert.equal(validateMoodFields({ note: '字'.repeat(200) }, { requireEmoji: false }).ok, true)
})

test('POST 缺 emoji 报错，给了就通过', () => {
  assert.equal(validateMoodFields({}, { requireEmoji: true }).ok, false)
  const r = validateMoodFields({ emoji: 'calm' }, { requireEmoji: true })
  assert.equal(r.ok, true)
  assert.equal(r.value.emoji, 'calm')
})
