// 登录入口组件（Day 26 接登录）。
// 行为：应用启动即匿名自动登录（见 lib/auth.ts ensureSession），这里只负责“让人升级成正式账号”
// 以及展示当前登录态。邮箱/密码与邮箱验证码两种走法都接好；若控制台没开启对应登录方式，
// 按钮会如实报错，不会假装成功。
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import {
  ensureSession,
  getAuthState,
  signInWithEmailOtp,
  signInWithPassword,
  signOut,
  signUpWithEmail,
  subscribe,
  type AuthState,
} from '../lib/auth'
import { subscribeAuthPanel } from '../lib/authPanel'

function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState)
}

// 样式仍走内联（这个弹层是 Day 26 独立加的，没进 index.css 的组件区），
// 但颜色一律引用设计令牌：原来用的是亮紫 #7c6ef0 和报错红 #c0392b，
// 前者不在全站色板里、后者踩了「全站禁红色警示色」这条红线（2026-10-19 统一）。
const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20, 54, 44, 0.32)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
}
const card: CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--r-lg)',
  padding: 24,
  width: 'min(360px, 92vw)',
  boxShadow: 'var(--sh-3)',
  fontFamily: 'inherit',
}
const input: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  margin: '6px 0',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--line-strong)',
  fontSize: 15,
  boxSizing: 'border-box',
}
const btn: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  margin: '6px 0',
  borderRadius: 'var(--r-sm)',
  border: 'none',
  background: 'var(--forest-700)',
  color: '#fff',
  fontSize: 15,
  cursor: 'pointer',
}
const ghost: CSSProperties = {
  ...btn,
  background: 'transparent',
  color: 'var(--forest-700)',
  border: '1px solid var(--forest-300)',
}

export default function AuthPanel() {
  const state = useAuth()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'password' | 'otp'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const verifyRef = useRef<((c: string) => Promise<string | null>) | null>(null)

  useEffect(() => {
    ensureSession()
  }, [])

  // 别的组件（匿名存储提示）要让用户去注册/登录时，通过这个订阅把弹层打开，
  // 不必把 open 状态提到 App 层（见 lib/authPanel.ts）。
  useEffect(() => subscribeAuthPanel(() => setOpen(true)), [])

  async function login() {
    setBusy(true)
    setMsg(null)
    const err = await signInWithPassword(email.trim(), password)
    setBusy(false)
    if (err) setMsg(err)
    else {
      setOpen(false)
      setMsg(null)
    }
  }
  async function signup() {
    setBusy(true)
    setMsg(null)
    const err = await signUpWithEmail(email.trim(), password)
    setBusy(false)
    if (err) setMsg(err)
    else {
      setOpen(false)
      setMsg(null)
    }
  }
  async function sendOtp() {
    setBusy(true)
    setMsg(null)
    const r = await signInWithEmailOtp(email.trim())
    setBusy(false)
    if (typeof r === 'string') {
      setMsg(r)
      verifyRef.current = null
    } else {
      verifyRef.current = r
      setMsg('验证码已发送，请查收邮箱后填入下方')
    }
  }
  async function verifyOtp() {
    if (!verifyRef.current) {
      setMsg('请先点“获取验证码”')
      return
    }
    setBusy(true)
    setMsg(null)
    const err = await verifyRef.current(code.trim())
    setBusy(false)
    if (err) setMsg(err)
    else {
      setOpen(false)
      setMsg(null)
      verifyRef.current = null
    }
  }
  async function logout() {
    setBusy(true)
    await signOut()
    setBusy(false)
  }

  const label =
    state.mode === 'password'
      ? `已登录${state.email ? '：' + state.email : ''}`
      : state.mode === 'anonymous'
      ? '登录'
      : state.ready
      ? '未连接'
      : '连接中…'

  return (
    <>
      <button
        type="button"
        className="nav-auth"
        style={ghost}
        onClick={() => setOpen(true)}
        aria-label="登录或注册"
      >
        {label}
      </button>

      {open && (
        <div style={overlay} onClick={() => setOpen(false)}>
          <div style={card} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px' }}>登录 / 注册</h3>
            <p style={{ margin: '0 0 12px', color: 'var(--ink-mute)', fontSize: 13 }}>
              你是这里唯一能看见自己记录的人。匿名也能用；想换设备也能看，就注册个邮箱账号。
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                style={tab === 'password' ? btn : ghost}
                onClick={() => setTab('password')}
              >
                邮箱密码
              </button>
              <button
                type="button"
                style={tab === 'otp' ? btn : ghost}
                onClick={() => setTab('otp')}
              >
                邮箱验证码
              </button>
            </div>

            <input
              style={input}
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
            {tab === 'password' ? (
              <>
                <input
                  style={input}
                  placeholder="密码（至少 6 位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                />
                <button style={btn} disabled={busy} onClick={login}>
                  登录
                </button>
                <button style={ghost} disabled={busy} onClick={signup}>
                  注册新账号
                </button>
              </>
            ) : (
              <>
                {verifyRef.current ? (
                  <>
                    <input
                      style={input}
                      placeholder="邮箱验证码"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    <button style={btn} disabled={busy} onClick={verifyOtp}>
                      验证并登录
                    </button>
                  </>
                ) : (
                  <button style={btn} disabled={busy} onClick={sendOtp}>
                    获取验证码
                  </button>
                )}
              </>
            )}

            {msg && (
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: '8px 0 0' }}>
                {msg}
              </p>
            )}

            <button
              style={{ ...ghost, marginTop: 12, borderColor: 'var(--line-strong)', color: 'var(--ink-mute)' }}
              onClick={() => setOpen(false)}
            >
              关闭
            </button>
            {/* 只有正式账号才给「退出」：匿名用户点它只会换到一个新的匿名 uid，
                原来那些记录当场就再也取不回来了 —— 这个按钮对他们不是功能，是陷阱。 */}
            {state.mode === 'password' && (
              <button
                style={{ ...ghost, borderColor: 'var(--line-strong)', color: 'var(--ink-mute)' }}
                disabled={busy}
                onClick={logout}
              >
                退出到匿名
              </button>
            )}
            <p style={{ color: 'var(--ink-mute)', fontSize: 12, margin: '10px 0 0' }}>
              若提示“未开启”，请在 CloudBase 控制台 → 身份认证 → 登录方式 开启邮箱登录。
            </p>
          </div>
        </div>
      )}
    </>
  )
}
