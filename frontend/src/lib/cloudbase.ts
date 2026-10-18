// CloudBase 前端 Web SDK 初始化（Day 26 接登录）。
// 只用 env + accessKey（Publishable Key，公开、可放前端、非 Secret）。
// 无需任何 API Secret / SecretId / SecretKey —— 那些是服务端用的，绝不能进前端。
import cloudbase from '@cloudbase/js-sdk'

// 直接访问 import.meta.env.VITE_XXX 即可（ImportMetaEnv 自带 [key:string]: any 索引签名，
// 本来就有类型，不需要断言；实测加不加 `as any` 两种写法产物完全一致，都能正常内联）。
//
// ⚠️ 验证口诀：改完 env / 换 key 之后，必须用**当前** key 的前缀去 grep 生产包确认真的内联了：
//   grep -c "<key 前 12 位>" dist/assets/index-*.js
// 2026-10-18 踩的坑：拿记忆里的旧 key 串（eyAsvVht…）去 grep 得到 0，误判成「Vite 没内联」；
// 实际是 .env.production 被并行会话换成了另一枚 key（eyJhbGciOiJSUzI1…），包里一直是对的。
// 而且 api.ts 有 HTTP 回退兜底，accessKey 就算真为空页面也「看起来正常」，只能靠 grep 发现。
const env: string =
  import.meta.env.VITE_CLOUDBASE_ENV || 'psyisle-prod-d9g109suw53257aed'
const accessKey: string = import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || ''

// accessKey 触发自动匿名会话；detectSessionInUrl 让邮箱验证回跳能解析会话。
export const app = cloudbase.init({
  env,
  accessKey,
  auth: { detectSessionInUrl: true },
} as any)

export const auth = app.auth({ persistence: 'local' })
