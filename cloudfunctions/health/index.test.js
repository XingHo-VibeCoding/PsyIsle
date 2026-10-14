'use strict'

// 这个测试锁的是 api-contract.md §3 的信封形状：前端按信封取值，
// 形状变了前端就静默拿到 undefined —— 所以改形状必须先改契约，再改这里。
const test = require('node:test')
const assert = require('node:assert/strict')
const { main } = require('./index.js')

test('返回契约约定的成功信封', async () => {
  const res = await main({}, {})

  assert.equal(res.ok, true)
  assert.equal(res.data.service, 'xinyu-api')
  assert.equal(typeof res.data.version, 'string')
  assert.equal(Number.isNaN(Date.parse(res.data.time)), false)
})

// 公网无鉴权接口，不该顺手把基础设施信息带出去
test('不吐露环境 ID 或数据库线索', async () => {
  const body = JSON.stringify(await main({}, {}))

  assert.equal(/envid|env_id|tcloudbase|database|mysql|postgres|password|secret/i.test(body), false)
})
