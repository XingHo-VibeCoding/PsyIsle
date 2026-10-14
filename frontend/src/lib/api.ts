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
