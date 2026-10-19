// 小程序端配置。
//
// CloudBase 环境 ID（公开：它就写在公网域名里，也写在 api-contract.md §2）。
const ENV = 'psyisle-prod-d9g109suw53257aed'

// API 基础地址（契约 api-contract.md §2）：CloudBase HTTP 网关默认域名。
// ⚠️ 微信小程序要求：这个域名必须在「微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名」里登记；
//    本地开发可在微信开发者工具勾选「不校验合法域名 / TLS 版本 / HTTPS 证书」。
const API_BASE = 'https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com'

// Publishable Key（公开、可放前端，非 Secret）。
// 真实值放在 gitignored 的 secret.js（与网页端 .env.production 同策略）；
// 没有就回退成空串——此时匿名登录会失败、拿不到 token，请求会被网关 401 挡下。
// 开发者按 README 把 .env.production 里的 VITE_CLOUDBASE_ACCESS_KEY 拷进 secret.js 即可。
let ACCESS_KEY = ''
try {
  ACCESS_KEY = require('./secret.js').ACCESS_KEY || ''
} catch (e) {
  ACCESS_KEY = ''
}

// 情绪白名单（契约 §5.2）：存 id 不存字符——字符在不同设备渲染不一样，id 不会。
// 与数据库约束（moods_emoji_known）、网页端 moods.ts、云函数 EMOJI_WHITELIST 共用同一串 id。
const EMOJI_OPTIONS = [
  { id: 'calm', label: '平静' },
  { id: 'warm', label: '温暖' },
  { id: 'tired', label: '疲惫' },
  { id: 'low', label: '低落' },
  { id: 'anxious', label: '不安' },
  { id: 'upset', label: '烦躁' },
  { id: 'empty', label: '空空的' },
]

module.exports = { ENV, ACCESS_KEY, API_BASE, EMOJI_OPTIONS }
