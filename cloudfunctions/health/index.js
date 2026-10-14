'use strict'

// 健康检查：只回答一件事 —— 这套云端的管道通不通。
// 这是公网无鉴权接口，所以只回最少的信息：不回环境 ID、不回地域、不回数据库线索。
// 少说一句，就少一张给扫描者画的地图。
const SERVICE = 'xinyu-api'
const VERSION = '0.1.0'

exports.main = async () => ({
  ok: true,
  data: {
    service: SERVICE,
    version: VERSION,
    time: new Date().toISOString(),
  },
})
