// 本地草稿层：只服务「绝不丢用户已写的内容」与断网兜底，不承担跨设备职责（跨设备是云端的事）
// 红线：所有 localStorage 读写必须包 try/catch（Safari 无痕、存储被禁用时不白屏）
const readRaw = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeRaw = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 存储不可用时静默放弃：功能照常，计数丢失可接受，草稿不丢（内容仍在内存里）
  }
}

export const readCounter = (key: string): number => {
  const raw = readRaw(key)
  const n = raw === null ? 0 : Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const bumpCounter = (key: string): number => {
  const next = readCounter(key) + 1
  writeRaw(key, String(next))
  return next
}
