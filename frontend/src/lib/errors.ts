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

export type ErrorKind = 'input' | 'network' | 'server' | 'unknown'

export const ERROR_MESSAGES: Record<ErrorKind, string> = {
  input: '提交的内容没通过检查，请看一下再改。',
  network: '网络连接失败，请检查网络后重试。',
  server: '服务出了点小状况，请稍后再试。',
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

// 浏览器网络失败的英文原文（各浏览器措辞不同），命中即归为「网络错」
const NETWORK_HINTS =
  /failed to fetch|networkerror|network request failed|load failed|err_network|err_internet_disconnected/i

// HTTP 状态码 → 错误类别。状态码本身不上屏，只用来选哪句话。
export function kindOfStatus(status: number): ErrorKind {
  if (status >= 500 || status === 408 || status === 429) return 'server'
  if (status >= 400) return 'input'
  return 'unknown'
}

export function messageForStatus(status: number): string {
  return ERROR_MESSAGES[kindOfStatus(status)]
}

// 后端信封里的错误码 → 类别。INVALID_INPUT / NOT_FOUND 是「输入方对不上」，
// 其余（INTERNAL 等）一律当服务端错——具体原因不该由用户判断。
export function kindOfCode(code?: string): ErrorKind {
  if (code === 'INVALID_INPUT' || code === 'NOT_FOUND') return 'input'
  if (code === 'INTERNAL') return 'server'
  return 'unknown'
}

// 兜底：任何地方捕获到未知错误，都能拿到一句中文，不会把英文原文漏到界面上。
export function toUserMessage(e: unknown): string {
  if (e instanceof AppError) return e.message
  if (e instanceof Error) {
    if (NETWORK_HINTS.test(e.message)) return ERROR_MESSAGES.network
    return ERROR_MESSAGES.unknown
  }
  return ERROR_MESSAGES.unknown
}
