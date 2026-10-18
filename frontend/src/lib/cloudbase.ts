// CloudBase 前端 Web SDK 初始化（Day 26 接登录）。
// 只用 env + accessKey（Publishable Key，公开、可放前端、非 Secret）。
// 无需任何 API Secret / SecretId / SecretKey —— 那些是服务端用的，绝不能进前端。
import cloudbase from '@cloudbase/js-sdk'

const env =
  ((import.meta.env as any).VITE_CLOUDBASE_ENV as string) ||
  'psyisle-prod-d9g109suw53257aed'
const accessKey = ((import.meta.env as any).VITE_CLOUDBASE_ACCESS_KEY as string) || ''

// accessKey 触发自动匿名会话；detectSessionInUrl 让邮箱验证回跳能解析会话。
export const app = cloudbase.init({
  env,
  accessKey,
  auth: { detectSessionInUrl: true },
} as any)

export const auth = app.auth({ persistence: 'local' })
