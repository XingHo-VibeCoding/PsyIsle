// 小程序端请求封装（围绕 wx.request）。与前端 src/lib/api.ts 同构：
// 统一走契约信封 { ok, data } / { ok:false, error:{code,message} }，调用方只判 ok。
//
// 鉴权（演示期）：当前后端按网关注入的身份或固定演示身份处理（cloudfunctions/moods/db.js 的 currentOwner）。
// 小程序直连 HTTP API 即可写入/读取演示数据，无需 token。
// 接登录后（下一步）：在这里给 wx.request 加 header
//   Authorization: Bearer <token>
// token 取得方式：wx.login() 拿 code → 调一个换发 token 的后端接口（或由 CloudBase 小程序 SDK 取得）。
const { API_BASE } = require('./config.js')

// 统一出口：业务成功返回 data，业务失败或网络失败抛出 Error（message 给人看，不抛原文）。
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path,
      method: method,
      data: body || {},
      header: { 'content-type': 'application/json' },
      success(res) {
        const d = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && d && d.ok === true) {
          resolve(d.data)
        } else if (d && d.ok === false) {
          // 业务错误：直接把后端的中文 message 上屏（契约 §3，前端只判 ok、不解析 message 做逻辑）
          reject(new Error((d.error && d.error.message) || '出错了'))
        } else {
          reject(new Error('网络连接失败，请检查网络后重试。'))
        }
      },
      fail() {
        reject(new Error('网络连接失败，请检查网络后重试。'))
      },
    })
  })
}

// GET /api/moods?limit= —— 读回心情打卡列表（契约 §5.2 / §4.2）
function getMoods(limit) {
  const l = limit || 50
  return request('GET', '/api/moods?limit=' + encodeURIComponent(l), null)
}

// POST /api/moods —— 打一次卡（契约 §5.2 / §4.4）
// { emoji(必填,白名单), level(可选 1–5 或 null), note(可选 ≤200 字) }
// 同一天重复提交 = 覆盖（后端 unique(owner_id,date) 保证，见 db.js 的 upsertMood）。
function createMood(payload) {
  return request('POST', '/api/moods', payload)
}

module.exports = { getMoods, createMood }
