'use strict'

// 这个测试锁的是 api-contract.md 第 4 节的返回形状：探活接口回扁平字段。
// 形状变了，扫这个地址的人（和以后的监控）就会看到看不懂的东西 —— 所以改形状必须先改契约，再改这里。
const test = require('node:test')
const assert = require('node:assert/strict')
const { main } = require('./index.js')

test('返回课程要求的探活形状', async () => {
  const res = await main({}, {})

  assert.equal(res.ok, true)
  assert.equal(res.service, 'PsyIsle')
  assert.equal(typeof res.version, 'string')
  assert.equal(Number.isNaN(Date.parse(res.time)), false)
})

// 探活口不套信封：多一层 data，扫一眼就得多点一次，没有收益
test('不套 { ok, data } 信封', async () => {
  const res = await main({}, {})

  assert.equal('data' in res, false)
  assert.equal('error' in res, false)
})

// 公网无鉴权接口，不该顺手把基础设施信息带出去
test('不吐露环境 ID 或数据库线索', async () => {
  const body = JSON.stringify(await main({}, {}))

  assert.equal(/envid|env_id|tcloudbase|database|mysql|postgres|password|secret/i.test(body), false)
})
