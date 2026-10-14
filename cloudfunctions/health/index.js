'use strict'

// 健康检查：只回答一件事 —— 这套云端的管道通不通。
// 形状按课程要求（Day 15）：扁平字段，不套 { ok, data } 信封。
// 理由：它是探活口，不是业务接口 —— 前端不解析它，人/监控扫一眼就要看懂。
// 业务接口（Day 16 起）一律走信封，见 api-contract.md 第 3 节。
//
// 这是公网无鉴权接口，所以只回最少的信息：不回环境 ID、不回地域、不回数据库线索。
// 少说一句，就少一张给扫描者画的地图。
const SERVICE = 'PsyIsle'
const VERSION = '0.1.0'

exports.main = async () => ({
  ok: true,
  service: SERVICE,
  version: VERSION,
  time: new Date().toISOString(),
})
