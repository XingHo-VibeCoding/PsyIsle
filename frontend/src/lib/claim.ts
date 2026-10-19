// 匿名记录「转正」的前端一半（Day 28）。
//
// 要解决的问题：注册走的是 signUp，会发一个新的 uid；匿名身份名下写过的记录还挂在旧 uid 上，
// 注册完界面上一条都看不见。用户不会说「我的数据没跟过来」，只会说「我写的东西没了」。
//
// 三条设计约束：
//   1. **只管搬运，不管拦截**：领不到凭证照样能注册。这是尽力而为的事，不能因为一次接口抖动
//      把「注册」这条路堵死。
//   2. **有东西才领券**：写完一条记录之后才发一次 POST（见 Daily.tsx 的 handleSaved）。
//      没人注册的访客不该为此多烧一次数据库写入。
//   3. **失败留券**：兑换那一刻网络断了，把凭证留在本地，下次打开页面在正式账号下再试一次；
//      过期（1 小时）就作废，不无限重试。
//
// 凭证在本地只用于「兑自己刚写的东西」，而且它兑完即废、库里只有哈希 —— 拿到它也没法
// 换成别人名下的记录（服务端按凭证里的 owner_id 搬，不接受客户端指定 owner）。
import { getAuthState } from './auth'
import { issueClaimTicket, redeemClaim, type ClaimResult, type ClaimTicket } from './api'

const KEY = 'xinyu.pendingClaim'
// 离过期不到 1 分钟就当作不好用了：兑换请求本身要花时间，别拿着快过期的券去赌。
const MIN_LEFT_MS = 60 * 1000

export type PendingClaim = ClaimTicket

function read(): PendingClaim | null {
  // 隐私模式 / 存储被禁用会抛，全部当「没有」处理
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as PendingClaim
    if (!o || typeof o.code !== 'string' || typeof o.expiresAt !== 'string') return null
    return o
  } catch {
    return null
  }
}

function write(p: PendingClaim) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* 存不下就只留在内存里，这一次仍然能兑 */
  }
}

function clear() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* 忽略 */
  }
}

function stillGood(p: PendingClaim | null): p is PendingClaim {
  if (!p) return false
  const t = Date.parse(p.expiresAt)
  return !isNaN(t) && t - Date.now() > MIN_LEFT_MS
}

// 领一张凭证（本地还有新鲜的就直接用）。只在匿名身份下有意义 —— 已经是正式账号就没东西可搬。
let inflight: Promise<PendingClaim | null> | null = null

export function ensureClaimTicket(): Promise<PendingClaim | null> {
  const st = getAuthState()
  if (st.mode !== 'anonymous') return Promise.resolve(null)

  const cached = read()
  if (stillGood(cached)) return Promise.resolve(cached)
  if (inflight) return inflight

  inflight = issueClaimTicket()
    .then((t) => {
      write(t)
      return t
    })
    // 领不到就把手上那张（可能已经快过期的）拿出去碰运气 —— 总比什么都没有强
    .catch(() => cached)
    .finally(() => {
      inflight = null
    })
  return inflight
}

// 兑换结果的通知：写一写页要靠它重新取数，否则「搬过来了但界面还是空的」，
// 用户会以为搬失败了（这比不搬更让人困惑）。
const listeners = new Set<(r: ClaimResult) => void>()

export function subscribeClaim(fn: (r: ClaimResult) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// 换完身份后调用：把凭证里那个旧身份的记录搬到当前账号。
// 返回搬了几条；失败（网络 / 过期 / 已被用）一律返回 null，不打扰用户。
export async function claimPending(p: PendingClaim | null): Promise<ClaimResult | null> {
  if (!p) return null
  try {
    const r = await redeemClaim(p.code)
    clear()
    listeners.forEach((fn) => fn(r))
    return r
  } catch {
    // 留券下次再试；已经过期的就直接作废，免得每次打开页面都白打一次请求
    if (!stillGood(p)) clear()
    return null
  }
}

// 应用启动时兜底：正式账号下如果本地还躺着没兑成功的凭证，再试一次。
// 典型场景：注册那一刻正好断网 —— 记录还在旧身份名下，凭证还在本地。
export async function resumePendingClaim(): Promise<ClaimResult | null> {
  const st = getAuthState()
  if (!st.ready || st.mode !== 'password') return null
  const p = read()
  if (!stillGood(p)) {
    if (p) clear()
    return null
  }
  return claimPending(p)
}
