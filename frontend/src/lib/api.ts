// 数据访问层：页面只跟这里要数据，不直接 import data/*。
// 阶段 1 的内容还打包在本地，但接口一律做成异步 Promise —— 阶段 2 换成云数据库查询时，
// 页面上的加载 / 错误 / 空 / 正常四种状态一行都不用改，换的只是本文件里的取数实现。
import { library, type LibraryItem } from '../data/library'
import { microTasks, type MicroTask } from '../data/tasks'
// Day 23：错误提示的唯一出处——输入错 / 网络错 / 服务端错三类中文文案与类别判定。
import { AppError, ERROR_MESSAGES, kindOfCode, kindOfStatus, messageForStatus } from './errors'

// 「四种状态」里，只有加载和错误在本地数据上不可能自然发生（本地读数据既不慢也不会失败），
// 所以给一个开发模式专用的覆写开关，用来验收这两种状态。
// 生产构建里 import.meta.env.DEV 为 false，整段开关不存在，产品里没有任何调试入口。
const forcedState = (): 'loading' | 'error' | 'empty' | null => {
  if (!import.meta.env.DEV) return null
  const v = new URLSearchParams(window.location.search).get('listState')
  return v === 'loading' || v === 'error' || v === 'empty' ? v : null
}

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

async function load<T>(rows: T[]): Promise<T[]> {
  const forced = forcedState()
  // 没开覆写就直接给结果：本地数据本来就是就绪的，硬加延迟是拿用户的等待换演示效果
  if (forced === null) return rows

  await delay(600) // 模拟一次网络往返，否则加载态在本地一闪而过、根本看不到
  if (forced === 'loading') return new Promise<T[]>(() => {}) // 请求一直不回来
  if (forced === 'error') throw new Error('列表接口失败（由 ?listState=error 强制触发）')
  return [] // 只剩 empty
}

export const fetchTasks = (): Promise<MicroTask[]> => load(microTasks)

export const fetchLibrary = (): Promise<LibraryItem[]> => load(library)

// ---- Day 17：真实读接口（云端 PostgreSQL，经 CloudBase 云函数 HTTP 网关） ----
// 与本地 mock 彻底分离：这里直连公网 API。loading/error/empty/ready 四种状态由 useListData
// 统一接管，页面不用关心数据来自本地还是云端。
export type MoodRow = {
  id: string
  date: string
  emoji: string | null
  level: number | null
  note: string | null
  createdAt: string
}

export type NoteRow = {
  id: string
  date: string
  text: string | null
  createdAt: string
}

// 构建时被 .env 的 VITE_API_BASE 内联；未配置时回退空串（走同源相对路径）。
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

// 所有请求的唯一出入口（Day 23）：三类错误在这里定型，调用方只管拿数据或接一句中文。
//  · fetch 直接抛 = 网络错（断网 / DNS / 被拦截），浏览器原文是英文，这里换成人话
//  · HTTP 状态码 >= 400 = 按类别给中文，状态码本身不上屏
//  · 响应体不是 JSON = 服务端错（多半是网关返回了 HTML 错误页）
//
// Day 26：除健康检查外，moods/notes 走 HTTP 访问服务 + 网关鉴权（enableAuth）。
// 前端把登录态 accessToken 放进 Authorization: Bearer <token>；网关校验通过后会把已验证的
// 用户身份注入云函数（见 cloudfunctions/*/db.js 从请求头取 uid 做隔离）。
// 健康检查是公开探活，无需身份，单独走 HTTP 且不带鉴权。
import { clearTokenCache, ensureSession, getAccessToken } from './auth'

async function callApiHttp<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      ...init,
    })
  } catch {
    throw new AppError('network')
  }
  if (!res.ok) throw new AppError(kindOfStatus(res.status), messageForStatus(res.status))
  try {
    return (await res.json()) as T
  } catch {
    throw new AppError('server')
  }
}

async function callApi<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  // 健康检查：公开探活，走 HTTP 公网接口（不带鉴权）
  if (path === '/api/health') return callApiHttp<T>(path, init)

  // moods / notes：带登录态 token 走 HTTP 访问服务；网关 enableAuth 校验后注入用户身份。
  const method = (init?.method || 'GET').toUpperCase()
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = await getAccessToken()
  if (token) headers['Authorization'] = 'Bearer ' + token

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      body: init?.body,
    })
  } catch {
    // fetch 抛错（断网 / DNS / 被拦截）= 网络错，原文英文不显示
    throw new AppError('network')
  }

  // 网关说「没认出这个身份」（401）：先自己救一次，再决定要不要告诉用户。
  // 最常见的成因是本地缓存的 token 提前作废了（换设备登录 / 后台踢下线 / 缓存过期）。
  // 这种情况下清掉缓存、重建会话，重试往往一次就过，用户完全不必知道刚才失败过。
  // 只重试一次：第二次仍是 401 就说明不是「旧 token」的问题（多半是会话真的没了），
  // 再重试只是原地打转，白白多打两次接口。
  if (res.status === 401 && !retried) {
    clearTokenCache()
    await ensureSession()
    return callApi<T>(path, init, true)
  }

  if (!res.ok) throw new AppError(kindOfStatus(res.status), messageForStatus(res.status))
  try {
    return (await res.json()) as T
  } catch {
    throw new AppError('server')
  }
}

// 信封里的 ok:false —— 后端已给中文 message，直接透出；没给就按类别兜底一句。
function envelopeError(code?: string, message?: string): AppError {
  const kind = kindOfCode(code)
  return new AppError(kind, message || ERROR_MESSAGES[kind])
}

async function getList<T>(path: string): Promise<T[]> {
  const body = await callApi<{
    ok: boolean
    data?: { items: T[] }
    error?: { code?: string; message: string }
  }>(path)
  if (!body.ok) throw envelopeError(body.error?.code, body.error?.message)
  return body.data?.items ?? []
}

// 全量读（服务端上限 200 条）：AI 整理页要在一屏里归纳主题，不适合分页。
// 更早的记录走下面的 fetchMoodsPage / fetchNotesPage 一页页翻。
export const fetchMoods = (): Promise<MoodRow[]> => getList<MoodRow>('/api/moods?limit=200')
export const fetchNotes = (): Promise<NoteRow[]> => getList<NoteRow>('/api/notes?limit=200')

// ---- Day 27：游标分页 ----
// 契约 §3 写死的是游标分页：请求带 cursor，响应带 nextCursor（null = 到底了）。
// 改之前 nextCursor 恒为 null、前端也从不传 cursor —— 于是「默认 50 条」就悄悄变成了
// 「只能看到 50 条」。数据一直在库里，是页面拿不到，而这种「看起来正常」的缺失最伤人：
// 用户会以为一个月前写的东西丢了。
export type ApiPage<T> = { items: T[]; nextCursor: string | null }

const PAGE_SIZE = 50

async function getPage<T>(path: string): Promise<ApiPage<T>> {
  const body = await callApi<{
    ok: boolean
    data?: { items: T[]; nextCursor?: string | null }
    error?: { code?: string; message: string }
  }>(path)
  if (!body.ok) throw envelopeError(body.error?.code, body.error?.message)
  return { items: body.data?.items ?? [], nextCursor: body.data?.nextCursor ?? null }
}

// cursor 是不透明串：前端只负责原样带回去，绝不解析、绝不拼装。
// 里面装的是哪几个排序键属于后端，将来换排序方式，这里一行都不用改。
function pagePath(base: string, cursor: string | null): string {
  const q = `?limit=${PAGE_SIZE}`
  return cursor ? `${base}${q}&cursor=${encodeURIComponent(cursor)}` : `${base}${q}`
}

export const fetchMoodsPage = (cursor: string | null = null): Promise<ApiPage<MoodRow>> =>
  getPage<MoodRow>(pagePath('/api/moods', cursor))

export const fetchNotesPage = (cursor: string | null = null): Promise<ApiPage<NoteRow>> =>
  getPage<NoteRow>(pagePath('/api/notes', cursor))

// ---- Day 20：首页与检查台新增的三个取数 ----

// 探活接口不套信封（契约 §3 的唯一例外）：扁平字段原样返回。
export type HealthInfo = {
  ok: boolean
  service: string
  version: string
  time: string
}

export const fetchHealth = async (): Promise<HealthInfo> => callApi<HealthInfo>('/api/health')

// 首页「写一写」门卡只要最近一条：limit=1，服务端按 date 倒序（契约 §4.2）。
// 任何一环取不到都返回 null——首页对这一行的约定是「有就显示，没有就不显示」，
// 首页不承担报错职责（真出了什么问题，去 /check 看）。
export const fetchLatestMood = async (): Promise<MoodRow | null> => {
  const rows = await getList<MoodRow>('/api/moods?limit=1')
  return rows[0] ?? null
}

// 检查台的写入测试入口：往 progress_notes 追加一条带标注的测试记录。
// 刻意不测 POST /api/moods——moods 同一天重复提交是覆盖（契约 §4.4 幂等），
// 会抹掉当天的演示打卡；notes 一天可记多件、不设重复限制（契约 §4.5），
// 测试记录只追加、不破坏现有数据。date 省略＝服务端按 +08:00 判今天，不信客户端时钟。
export const postTestNote = async (): Promise<NoteRow> => {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  const body = await callApi<{
    ok: boolean
    data?: { item: NoteRow }
    error?: { code?: string; message: string }
  }>('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text: `检查台写入测试 · ${stamp}` }),
  })
  if (!body.ok || !body.data?.item) throw envelopeError(body.error?.code, body.error?.message)
  return body.data.item
}

// ---- Day 22：删除（软删）一条心情打卡 ----
// DELETE /api/moods?id=xxx，复用同一网关路由 /api/moods（id 走查询参数，见契约 §5.2）。
// 后端是软删除：只打 is_deleted 标记，列表查询会跳过、可找回。返回 ok:false 时抛出
// 中文错误消息（含 NOT_FOUND），由页面决定怎么提示。
export const deleteMood = async (id: string): Promise<void> => {
  const body = await callApi<{
    ok: boolean
    data?: { id: string; deleted: boolean }
    error?: { code?: string; message: string }
  }>(`/api/moods?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })
  if (!body.ok) throw envelopeError(body.error?.code, body.error?.message)
}

// ---- Day 21 补 #8：写一写的前端写入入口 ----
// 复用 Day 18 已上线的两个 POST 接口，前端不再只读。
// 业务错误走统一信封（契约 §3）：前端只判 ok，错误信息直接当文案给用户看。
// moods 同一天重复提交是覆盖（契约 §4.4 幂等）；notes 一天可记多件（§4.5）。

// 写入类请求共用一个出口：信封里 ok:false 时，后端给的中文 message 直接上屏；
// 网络不通 / 服务端出错分别走各类的固定文案，不出现状态码与英文原文。
async function postItem<T>(path: string, payload: unknown): Promise<T> {
  const body = await callApi<{
    ok: boolean
    data?: { item: T }
    error?: { code?: string; message: string }
  }>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!body.ok || !body.data?.item) throw envelopeError(body.error?.code, body.error?.message)
  return body.data.item
}

export const postMood = (body: {
  emoji: string
  level?: number
  note?: string
}): Promise<MoodRow> => postItem<MoodRow>('/api/moods', body)

export const postNote = (body: { text: string }): Promise<NoteRow> =>
  postItem<NoteRow>('/api/notes', body)

// ---- Day 28：匿名记录转正（契约 §4.10）----
// 注册会发新的 uid，匿名名下写过的记录 owner_id 还指着旧 uid —— 注册完界面上就看不见了。
// 这里只做两次请求：领一张一次性凭证、拿它换「把旧 uid 的行搬到现在这个账号」。
// 「搬哪些行」由服务端根据凭证里的 owner_id 决定；前端只有一张随机串，说自己是谁不算数。
export type ClaimTicket = { code: string; expiresAt: string }
export type ClaimResult = { moods: number; notes: number; skipped: number }

type ClaimEnvelope<T> = { ok: boolean; data?: T; error?: { code?: string; message: string } }

async function postClaim<T>(payload: unknown): Promise<T> {
  const body = await callApi<ClaimEnvelope<T>>('/api/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!body.ok || !body.data) throw envelopeError(body.error?.code, body.error?.message)
  return body.data
}

export const issueClaimTicket = (): Promise<ClaimTicket> => postClaim<ClaimTicket>({ action: 'issue' })

export const redeemClaim = (code: string): Promise<ClaimResult> =>
  postClaim<ClaimResult>({ action: 'redeem', code })
