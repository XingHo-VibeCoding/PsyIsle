// 匿名存储提示（2026-10-19）。
//
// 为什么加这个：访客身份是「绑在这台浏览器」上的——换手机、换电脑、清一次浏览器数据，
// 之前写的东西就再也取不回来了（数据还在库里，但人找不回它）。这不是 bug，是匿名登录
// 的固有代价；但用户不知道，等他发现的时候已经晚了。所以在他第一次真正要「存东西」的地方
// 说清楚，并给出两条路：绑邮箱（换设备也在），或者先这样（照样能写）。
//
// 三条设计约束（都是产品红线推出来的）：
//   1. 不拦截：弹层能一键关掉，关掉之后该写的照样写，输入框不被锁。
//   2. 不催：文案不写「立即注册」「否则」，落点是「不着急」——这产品不靠焦虑推人。
//   3. 只提一次：主动选「继续匿名」就永久不再弹（见 lib/anonNotice.ts），
//      被关掉则本会话不再弹、下次再说。
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { getAuthState, subscribe, type AuthState } from '../lib/auth'
import { openAuthPanel } from '../lib/authPanel'
import {
  markAnonNoticeOff,
  markAnonNoticeShown,
  shouldShowAnonNotice,
} from '../lib/anonNotice'

function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState)
}

// 哪些页面算「要存东西」。目前只有写一写真的往云端的自己名下写数据
// （心情 / 小进步）。以后「全部小事」若改成云端保存，把 /guide 加进来即可。
const STORAGE_ROUTES = ['/daily']

export default function AnonymousNotice() {
  const auth = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [settled, setSettled] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  // 到「要存东西」的页面、还没登录、还没做过选择 → 等页面安静下来再浮出来。
  // 延后 700ms 是刻意的：先让人看见「今天感觉怎么样」，再说话；一进来就糊一层遮罩，
  // 像被拦在门口，和「这里很安静」的第一印象相反。
  useEffect(() => {
    if (settled) return
    if (!auth.ready || auth.mode !== 'anonymous') return
    if (!STORAGE_ROUTES.includes(pathname)) return
    if (!shouldShowAnonNotice()) {
      setSettled(true)
      return
    }
    const t = window.setTimeout(() => {
      // 人家已经在打字了就先不打断 —— 这一个字可能比我们的提示重要。
      // 这次让过去，下次进页面还会再提一次（没写任何标记）。
      const el = document.activeElement as HTMLElement | null
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      setOpen(true)
    }, 700)
    return () => window.clearTimeout(t)
  }, [pathname, auth.ready, auth.mode, settled])

  // 弹层开了就把焦点收进来，Esc 能关 —— 读屏与键盘用户的正常期待
  useEffect(() => {
    if (!open) return
    sheetRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // close 是稳定行为，不放进依赖以免频繁重绑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 用户已经登录成正式账号，弹层就没必要留着
  useEffect(() => {
    if (auth.mode === 'password') setOpen(false)
  }, [auth.mode])

  // 只是关掉：本会话不再弹，下次开新会话再提醒一次
  function close(permanent: boolean) {
    if (permanent) markAnonNoticeOff()
    else markAnonNoticeShown()
    setSettled(true)
    setOpen(false)
  }

  function goAuth() {
    close(true)
    openAuthPanel()
  }

  if (!open) return null

  return (
    <div className="anon-mask" onClick={() => close(false)}>
      <div
        className="anon-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anon-title"
        aria-describedby="anon-desc"
        tabIndex={-1}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="anon-title" id="anon-title">
          你写下的东西，现在只在这台设备上
        </h2>
        <div className="anon-body" id="anon-desc">
          <p>你现在是访客身份，不用注册也能写。</p>
          <p>
            只是换手机、换电脑，或者清理一次浏览器数据之后，之前写下的就找不回来了。
          </p>
          <p>绑一个邮箱，记录跟着账号走，换设备也还在。</p>
        </div>
        <div className="anon-actions">
          <button type="button" className="btn btn-primary" onClick={goAuth}>
            注册 / 登录
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => close(true)}>
            先这样，继续写
          </button>
        </div>
        <p className="anon-foot">不着急。想注册的时候，右上角「登录」随时能进。</p>
      </div>
    </div>
  )
}
