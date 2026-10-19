// 匿名存储提示的记忆逻辑。
//
// 为什么不是「弹一次就永久关掉」：用户在弹层上按 Esc 或点到遮罩，多半只是手滑，
// 不该被当成「我以后都不想知道了」。所以分两档——
//   · 主动点了「先这样，继续写」→ 永久不再打扰（localStorage）
//   · 只是关掉（Esc / 点遮罩）→ 本次会话不再弹，下次开新会话再提一次（sessionStorage）
// 两种存储都可能被浏览器禁用（隐私模式会抛异常），所以读写一律包 try/catch，
// 失败时退化成「不记」，最多多提醒一次，不影响写字。

const FOREVER_KEY = 'xinyu.anon-notice-off'
const SESSION_KEY = 'xinyu.anon-notice-shown'

function readFlag(key: string, storage: Storage): boolean {
  try {
    return storage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, storage: Storage): void {
  try {
    storage.setItem(key, '1')
  } catch {
    /* 存不进去就算了，宁可多提醒一次，也不让页面报错 */
  }
}

// 还需要弹吗
export function shouldShowAnonNotice(): boolean {
  if (readFlag(FOREVER_KEY, window.localStorage)) return false
  return !readFlag(SESSION_KEY, window.sessionStorage)
}

// 只是这次关掉了：本会话不再弹，下次再说
export function markAnonNoticeShown(): void {
  writeFlag(SESSION_KEY, window.sessionStorage)
}

// 明确选了「继续匿名」：以后不再弹
export function markAnonNoticeOff(): void {
  writeFlag(FOREVER_KEY, window.localStorage)
  writeFlag(SESSION_KEY, window.sessionStorage)
}
