// 登录状态管理（Day 26 接登录）。
// 设计：应用启动即匿名自动登录（零门槛，契合心理陪伴调性）；邮箱/密码作为正式账号。
// 数据隔离由云函数侧 app.auth().getUserInfo().uid 落地（见 cloudfunctions/*/db.js），
// 前端只负责拿到并持有登录态，不自己拼装 uid。
import { auth } from './cloudbase'

export type AuthMode = 'none' | 'anonymous' | 'password'

export interface AuthState {
  ready: boolean
  uid: string | null
  mode: AuthMode
  email: string | null
}

let state: AuthState = { ready: false, uid: null, mode: 'none', email: null }
const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((l) => l())
}
function set(p: Partial<AuthState>) {
  state = { ...state, ...p }
  // 任何登录态变化都作废 token 缓存：避免切换身份后仍带着上一个身份的 token 发请求。
  clearTokenCache()
  emit()
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getAuthState() {
  return state
}

type VerifyFn = (code: string) => Promise<string | null>

// 应用启动时调用：没有真实登录就匿名自动登录（保证人人都有隔离空间）。
export async function ensureSession(): Promise<void> {
  try {
    const { data } = await auth.getSession()
    if (data?.session) {
      const u = data.user
      set({
        ready: true,
        uid: u?.id ?? null,
        mode: u?.is_anonymous ? 'anonymous' : 'password',
        email: u?.email ?? null,
      })
      return
    }
  } catch (_) {
    /* 忽略，走匿名 */
  }
  try {
    await auth.signInAnonymously()
    const { data } = await auth.getSession()
    const u = data?.user
    set({ ready: true, uid: u?.id ?? null, mode: 'anonymous', email: null })
  } catch (_) {
    set({ ready: true, uid: null, mode: 'none', email: null })
  }
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<string | null> {
  const { data, error } = await auth.signInWithPassword({ email, password })
  if (error) return error.message || '登录失败'
  const u = data?.user
  set({ uid: u?.id ?? null, mode: 'password', email: u?.email ?? null })
  return null
}

// 新 SDK 的 signUp 对 email 走 OTP；若控制台开启了邮箱密码且支持，直接建号。
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<string | null> {
  const { data, error } = await auth.signUp({ email, password } as any)
  if (error) return error.message || '注册失败'
  const u = data?.user
  set({ uid: u?.id ?? null, mode: 'password', email: u?.email ?? null })
  return null
}

// 发送邮箱验证码；成功返回“验证码校验函数”，失败返回错误文案。
export async function signInWithEmailOtp(
  email: string
): Promise<VerifyFn | string> {
  const { data, error } = await auth.signInWithOtp({ email })
  if (error) return error.message || '发送验证码失败'
  if (!data || typeof (data as any).verifyOtp !== 'function')
    return '未收到验证入口（请确认控制台已开启邮箱登录）'
  return async (code: string): Promise<string | null> => {
    const r = await (data as any).verifyOtp({ token: code })
    if (r.error) return r.error.message || '验证失败'
    const u = r.data?.user
    set({ uid: u?.id ?? null, mode: 'password', email: u?.email ?? null })
    return null
  }
}

export async function signOut(): Promise<void> {
  clearTokenCache()
  await auth.signOut()
  // 退出后回到匿名会话，保持「人人有隔离空间」
  await ensureSession()
}

// 取当前登录态的 accessToken（匿名登录即有）。网关开启 enableAuth 后，
// 前端把它放进 Authorization: Bearer <token>，网关校验通过即把用户身份注入云函数。
// 拿不到（极端异常 / 尚未登录）返回 null，调用方据此决定回退。
//
// Day 27 省资源点：加内存缓存。原先 api.ts 每次请求都来这里取一次 token，
// 而 getAccessToken() 在 SDK 里要读 session / 校验过期，属于「云开发 API 调用」计费项
// （账单里 2103 次的主要来源）。缓存后同一页面生命周期内只真取几次。
// TTL 取 4 分钟：远短于 token 有效期（小时级），即使 token 被提前作废，
// 最坏也只多打 4 分钟旧 token —— 那时请求会 401，用户刷新即可恢复。
const TOKEN_TTL_MS = 4 * 60 * 1000
let tokenCache: { value: string; exp: number } | null = null

// 登录态变化（登录 / 退出 / 切换账号）必须清缓存，否则会继续用上一个身份或旧 token。
export function clearTokenCache() {
  tokenCache = null
}

export async function getAccessToken(): Promise<string | null> {
  const now = Date.now()
  if (tokenCache && tokenCache.exp > now) return tokenCache.value
  try {
    const anyAuth = auth as any
    let t: string | null = null
    if (typeof anyAuth.getAccessToken === 'function') {
      const r = await anyAuth.getAccessToken()
      t = r?.accessToken ?? (typeof r === 'string' ? r : null)
    }
    if (!t) {
      const { data } = await auth.getSession()
      t = (data as any)?.accessToken ?? (data as any)?.tokens?.accessToken ?? null
    }
    if (t) tokenCache = { value: t, exp: now + TOKEN_TTL_MS }
    return t ?? null
  } catch {
    return null
  }
}
