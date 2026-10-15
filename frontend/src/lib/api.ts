// 数据访问层：页面只跟这里要数据，不直接 import data/*。
// 阶段 1 的内容还打包在本地，但接口一律做成异步 Promise —— 阶段 2 换成云数据库查询时，
// 页面上的加载 / 错误 / 空 / 正常四种状态一行都不用改，换的只是本文件里的取数实现。
import { library, type LibraryItem } from '../data/library'
import { microTasks, type MicroTask } from '../data/tasks'

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

async function getList<T>(path: string): Promise<T[]> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`GET ${path} 失败（${res.status}）`)
  const body = (await res.json()) as {
    ok: boolean
    data?: { items: T[] }
    error?: { message: string }
  }
  if (!body.ok) throw new Error(body.error?.message ?? '接口返回 ok:false')
  return body.data?.items ?? []
}

// 余力加练：limit 查询参数服务端已支持；这里默认不传＝取全部，传入即限制条数。
export const fetchMoods = (): Promise<MoodRow[]> => getList<MoodRow>('/api/moods')
export const fetchNotes = (): Promise<NoteRow[]> => getList<NoteRow>('/api/notes')

// ---- Day 20：首页与检查台新增的三个取数 ----

// 探活接口不套信封（契约 §3 的唯一例外）：扁平字段原样返回。
export type HealthInfo = {
  ok: boolean
  service: string
  version: string
  time: string
}

export const fetchHealth = async (): Promise<HealthInfo> => {
  const res = await fetch(`${API_BASE}/api/health`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`GET /api/health 失败（${res.status}）`)
  return (await res.json()) as HealthInfo
}

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
  const res = await fetch(`${API_BASE}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text: `检查台写入测试 · ${stamp}` }),
  })
  if (!res.ok) throw new Error(`POST /api/notes 失败（${res.status}）`)
  const body = (await res.json()) as {
    ok: boolean
    data?: { item: NoteRow }
    error?: { message: string }
  }
  if (!body.ok || !body.data?.item) throw new Error(body.error?.message ?? '接口返回 ok:false')
  return body.data.item
}

// ---- Day 22：删除（软删）一条心情打卡 ----
// DELETE /api/moods?id=xxx，复用同一网关路由 /api/moods（id 走查询参数，见契约 §5.2）。
// 后端是软删除：只打 is_deleted 标记，列表查询会跳过、可找回。返回 ok:false 时抛出
// 中文错误消息（含 NOT_FOUND），由页面决定怎么提示。
export const deleteMood = async (id: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/moods?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`DELETE /api/moods 失败（${res.status}）`)
  const body = (await res.json()) as {
    ok: boolean
    data?: { id: string; deleted: boolean }
    error?: { code: string; message: string }
  }
  if (!body.ok) throw new Error(body.error?.message ?? '接口返回 ok:false')
}

// ---- Day 21 补 #8：写一写的前端写入入口 ----
// 复用 Day 18 已上线的两个 POST 接口，前端不再只读。
// 业务错误走统一信封（契约 §3）：前端只判 ok，错误信息直接当文案给用户看。
// moods 同一天重复提交是覆盖（契约 §4.4 幂等）；notes 一天可记多件（§4.5）。

export const postMood = async (body: {
  emoji: string
  level?: number
  note?: string
}): Promise<MoodRow> => {
  const res = await fetch(`${API_BASE}/api/moods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST /api/moods 失败（${res.status}）`)
  const r = (await res.json()) as {
    ok: boolean
    data?: { item: MoodRow }
    error?: { message: string }
  }
  if (!r.ok || !r.data?.item) throw new Error(r.error?.message ?? '接口返回 ok:false')
  return r.data.item
}

export const postNote = async (body: { text: string }): Promise<NoteRow> => {
  const res = await fetch(`${API_BASE}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST /api/notes 失败（${res.status}）`)
  const r = (await res.json()) as {
    ok: boolean
    data?: { item: NoteRow }
    error?: { message: string }
  }
  if (!r.ok || !r.data?.item) throw new Error(r.error?.message ?? '接口返回 ok:false')
  return r.data.item
}
