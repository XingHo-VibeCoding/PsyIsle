// Day 23：三类错误，各一句人话。全站只有这一处定义错误文案。
//
// 改之前前端是「把英文原文直接上屏」：
//   · 断网 / 请求发不出去时，浏览器抛 Failed to fetch（英文，且用户看不懂是自己网的问题）
//   · HTTP 失败时自己拼一句 `GET /api/moods 失败（500）`——把状态码甩给用户
// 现在按三类分开，每类只说「发生了什么 + 下一步能做什么」，不出现英文、状态码、堆栈。
//   1) 输入错 input   —— 提交的内容没通过检查（校验文案由后端给，已是人话）
//   2) 网络错 network —— 请求根本没发出去，是本地网络的事
//   3) 服务端错 server—— 请求到了但对岸出了状况，重试或等一会儿
//
// 与后端同一套口径：cloudfunctions/*/index.js 里也只分这三类（后端没有「网络错」）。

export type ErrorKind = 'input' | 'network' | 'server' | 'auth' | 'unknown'

export const ERROR_MESSAGES: Record<ErrorKind, string> = {
  input: '提交的内容没通过检查，请看一下再改。',
  network: '网络连接失败，请检查网络后重试。',
  server: '服务出了点小状况，请稍后再试。',
  // Day 27：登录态没取到（网关 401 / 信封 UNAUTHORIZED）。
  // 原来这类被归进 input，用户写了一半点提交，看到的是「提交的内容没通过检查」--
  // 他会去改文案，但无论怎么改都发不出去。这句才是他真正该做的事。
  auth: '登录状态没取到，刷新一下页面再试。',
  unknown: '出了点问题，请稍后再试。',
}

// 带类别的错误：页面不需要 message 之外的东西，但日志与未来埋点需要知道是哪一类。
export class AppError extends Error {
  kind: ErrorKind

  constructor(kind: ErrorKind, message?: string) {
    super(message || ERROR_MESSAGES[kind])
    this.name = 'AppError'
    this.kind = kind
  }
}

// 网络失败的英文原文（各环境措辞不同），命中即归为「网络错」。
// 浏览器说 Failed to fetch / NetworkError；Node 的 fetch 说 fetch failed，并把
// ECONNREFUSED / ENOTFOUND / ETIMEDOUT 放在 cause.code 里。三处都认，
// 免得换个环境就漏成「未知错误」——那句话对用户没有任何指向性。
const NETWORK_HINTS =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|err_network|err_internet_disconnected/i

const NETWORK_CODES = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ERR_INTERNET/i

function isNetworkError(e: Error): boolean {
  if (NETWORK_HINTS.test(e.message)) return true
  const cause = (e as unknown as { cause?: { code?: string; message?: string } }).cause
  if (!cause) return false
  return NETWORK_CODES.test(cause.code ?? '') || NETWORK_HINTS.test(cause.message ?? '')
}

// HTTP 状态码 → 错误类别。状态码本身不上屏，只用来选哪句话。
// 401 / 403 必须在 >=400 那一支**之前**判掉：它不是「提交的内容有问题」，
// 而是「这次请求没被认出来是谁发的」。归到 input 会让人去改文案（而且改不对）。
export function kindOfStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status >= 500 || status === 408 || status === 429) return 'server'
  if (status >= 400) return 'input'
  return 'unknown'
}

export function messageForStatus(status: number): string {
  return ERROR_MESSAGES[kindOfStatus(status)]
}

// 后端信封里的错误码 → 类别。INVALID_INPUT / NOT_FOUND 是「输入方对不上」，
// UNAUTHORIZED 是「没认出你是谁」，其余（INTERNAL 等）一律当服务端错
// ——具体原因不该由用户判断。
export function kindOfCode(code?: string): ErrorKind {
  if (code === 'INVALID_INPUT' || code === 'NOT_FOUND') return 'input'
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return 'auth'
  if (code === 'INTERNAL') return 'server'
  return 'unknown'
}

// 兜底：任何地方捕获到未知错误，都能拿到一句中文，不会把英文原文漏到界面上。
export function toUserMessage(e: unknown): string {
  if (e instanceof AppError) return e.message
  if (e instanceof Error) {
    if (isNetworkError(e)) return ERROR_MESSAGES.network
    return ERROR_MESSAGES.unknown
  }
  return ERROR_MESSAGES.unknown
}

// ---- 登录 / 注册路径（Day 27 第三方真人试用修复）----
//
// 试用现场（视频 0:13–0:37）：用户想注册，邮箱密码都没填就点了「注册新账号」，
// 屏幕上出现 `auth.signUp(params): missing required param 'email/phone'` —— 一句裸英文。
// 他看不懂，也没在文字反馈里提，直接关掉不注册了。同类问题在「邮箱验证码」标签页同样存在。
// 这正是契约 §3 禁止的：英文原文、参数名、堆栈不上屏，细节只进日志。
//
// 两层防线：
//   1) 表单先拦（authEmailHint / authPasswordHint）——空值、格式、位数不对，根本不给 SDK 报的机会；
//   2) SDK 真报了错，也经 authErrorMessage 翻成中文——原文只 console.debug 进日志。

// 表单校验文案（与后端提示同源思路：说「差什么 + 怎么办」）
export const AUTH_FORM = {
  emailEmpty: '先把邮箱填上。',
  emailBad: '这个邮箱格式看起来不对，检查一下再试。',
  passwordShort: '密码至少 6 位。',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function authEmailHint(email: string): string | null {
  const s = email.trim()
  if (!s) return AUTH_FORM.emailEmpty
  if (!EMAIL_RE.test(s)) return AUTH_FORM.emailBad
  return null
}

export function authPasswordHint(password: string): string | null {
  return password.length >= 6 ? null : AUTH_FORM.passwordShort
}

// SDK 原始错误 → 用户看得懂的中文。认不出的统一一句兜底，绝不原文上屏。
export function authErrorMessage(raw: string): string {
  console.debug('[auth] 原始错误：', raw)
  const s = raw.toLowerCase()
  // 顺序有讲究：'User not found' 里也有 not found，必须排在「环境没开」之前
  if (s.includes('missing required param') || s.includes('email/phone')) {
    return '邮箱和密码还没填，先填好再试。'
  }
  if (s.includes('invalid email') || s.includes('email format') || s.includes('not a valid email')) {
    return AUTH_FORM.emailBad
  }
  if (isNetworkError(new Error(raw))) return ERROR_MESSAGES.network
  if (s.includes('too many') || s.includes('rate limit') || s.includes('frequency') || s.includes('throttl')) {
    return '试得太勤了，歇一会儿再试。'
  }
  if (s.includes('password') || s.includes('user not found') || s.includes('credentials') || s.includes('invalid login')) {
    return '邮箱或密码不对，再检查一下。'
  }
  if (s.includes('already') || s.includes('registered') || s.includes('exists')) {
    return '这个邮箱已经注册过了，直接登录试试。'
  }
  if (s.includes('expired')) return '验证码过期了，再获取一次。'
  if (s.includes('code') || s.includes('otp') || s.includes('verif')) return '验证码不对，再检查一下。'
  // 本环境现状：邮箱身份源没配（provider email not found），注册/验证码都走不到
  if (s.includes('provider email not found') || s.includes('not enabled') || s.includes('unsupported') || s.includes('login method')) {
    return '邮箱登录还没开通。先匿名用着，想换设备看记录时再试。'
  }
  return '登录没成功，请稍后再试。'
}
