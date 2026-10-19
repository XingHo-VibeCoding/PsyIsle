// 小程序端 CloudBase 初始化与登录（Day 26 接登录 · 与网页端同 SDK、同架构）。
//
// 为什么用 @cloudbase/js-sdk（即网页端同款）：网关开了 enableAuth，所有 /api/* 请求必须带合法 Bearer
// token，否则在到达云函数前就被网关 401 挡下。云函数靠网关注入的身份按 uid 隔离
// （见 cloudfunctions/*/db.js 的 currentOwner），自己不查密码。小程序只要能拿出 token 带上即可，
// 与网页端完全一致。复用网页端已验证的 token 机制（匿名登录 → accessToken → Bearer）最稳，
// 且用 env 级 publishable key，不依赖小程序 AppID 与 CloudBase 环境的绑定。
//
// 依赖：@cloudbase/js-sdk（原生小程序需 npm install 后，在微信开发者工具「构建 npm」）。
// 微信运行时会提供全局 wx；本文件不直接用 wx。
const cloudbase = require('@cloudbase/js-sdk')
const { ENV, ACCESS_KEY } = require('./config.js')

const app = cloudbase.init({
  env: ENV,
  accessKey: ACCESS_KEY, // Publishable Key，公开安全；为空则匿名登录失败，请求会被网关 401
  auth: { detectSessionInUrl: false },
})

const auth = app.auth({ persistence: 'local' })

// 启动期只跑一次的登录保活：已有会话就复用，没有就匿名建一个。
// 多次请求共享这一个 Promise，避免每次接口都触发一次登录。
let ensured = null
async function ensureSession() {
  if (!ensured) {
    ensured = (async () => {
      try {
        const { data } = await auth.getSession()
        if (data && data.session) return
      } catch (e) {
        /* 忽略，走匿名 */
      }
      try {
        await auth.signInAnonymously()
      } catch (e) {
        /* 极端异常：放行，api.js 会发不带 token 的请求，由网关 401 兜底 */
      }
    })()
  }
  return ensured
}

// 取当前会话的 accessToken。网关 accept 标准 CloudBase token，匿名会话即可（无需正式账号）。
async function getAccessToken() {
  try {
    const anyAuth = auth
    if (typeof anyAuth.getAccessToken === 'function') {
      const r = await anyAuth.getAccessToken()
      const t = (r && r.accessToken) || (typeof r === 'string' ? r : null)
      if (t) return t
    }
    const { data } = await auth.getSession()
    const t = data && (data.accessToken || (data.tokens && data.tokens.accessToken))
    return t || null
  } catch (e) {
    return null
  }
}

module.exports = { ensureSession, getAccessToken }
