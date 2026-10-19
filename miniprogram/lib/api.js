// 小程序端请求封装（围绕 wx.request）。与前端 src/lib/api.ts 同构：
// 统一走契约信封 { ok, data } / { ok:false, error:{code,message} }，调用方只判 ok。
//
// 鉴权（Day 26 接登录）：网关注入的身份要求每个请求带 Bearer token。这里先确保匿名会话、
// 取出 accessToken 加进请求头；拿不到（极端异常 / 尚未登录）就发不带 token 的请求，
// 由网关 401 + 后端中文报错兜底。换登录方式只动 lib/cloudbase.js，本文件不动。
const { API_BASE } = require('./config.js')
const { ensureSession, getAccessToken } = require('./cloudbase.js')

// 统一出口：业务成功返回 data，业务失败或网络失败抛出 Error（message 给人看，不抛原文）。
async function request(method, path, body) {
  // 先确保登录态并取 token（不阻塞失败——失败就发无 token 请求，让网关/后端报错兜底）。
  let token = null
  try {
    await ensureSession()
    token = await getAccessToken()
  } catch (e) {
    token = null
  }

  const header = { 'content-type': 'application/json' }
  if (token) header['Authorization'] = 'Bearer ' + token

  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + path,
      method: method,
      data: body || {},
      header,
      success(res) {
        const d = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && d && d.ok === true) {
          resolve(d.data)
        } else if (d && d.ok === false) {
          // 业务错误：直接把后端的中文 message 上屏（契约 §3，前端只判 ok、不解析 message 做逻辑）
          reject(new Error((d.error && d.error.message) || '出错了'))
        } else if (res.statusCode === 401) {
          // 网关鉴权失败：多半是 token 没拿到 / 过期。给人一句能懂的，不暴露 401 等技术词。
          reject(new Error('需要先登录才能使用，请稍后重试。'))
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

// GET /api/notes?limit= —— 读回「小进步」列表（契约 §4.3 / §5.2 的 notes 段）
// 单项：{ id, date, text, createdAt }。小进步不评分，没有 level/emoji。
function getNotes(limit) {
  const l = limit || 50
  return request('GET', '/api/notes?limit=' + encodeURIComponent(l), null)
}

// POST /api/notes —— 记一件小事（契约 §4.5 / §5.2）
// { text(必填 1–200 字), date(可选，省略=服务端按 +08:00 判今天) }
// 一天可记多件（不像 mood 有「同日覆盖」），所以这里只追加、不破坏现有数据。
function createNote(payload) {
  return request('POST', '/api/notes', payload)
}

module.exports = { getMoods, createMood, getNotes, createNote }
