// 小程序端配置。
// API 基础地址（契约 api-contract.md §2）：心汐 CloudBase HTTP 网关默认域名。
// ⚠️ 微信小程序要求：这个域名必须在「微信公众平台 → 开发 → 开发设置 → 服务器域名 → request 合法域名」里登记；
//    本地开发可在微信开发者工具勾选「不校验合法域名 / TLS 版本 / HTTPS 证书」。
// 代码里不写死除基础地址外的任何内容；情绪白名单与契约 §5.2 共用同一串 id（与数据库约束、前端 moods.ts 一致）。
const API_BASE = 'https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com'

// 情绪白名单（契约 §5.2）：存 id 不存字符——字符在不同设备渲染不一样，id 不会。
const EMOJI_OPTIONS = [
  { id: 'calm', label: '平静' },
  { id: 'warm', label: '温暖' },
  { id: 'tired', label: '疲惫' },
  { id: 'low', label: '低落' },
  { id: 'anxious', label: '不安' },
  { id: 'upset', label: '烦躁' },
  { id: 'empty', label: '空空的' },
]

module.exports = { API_BASE, EMOJI_OPTIONS }
