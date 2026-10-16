import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Home, Pause, Play, RotateCcw } from 'lucide-react'

// F7 呼吸练习：4-7-8 节奏 × 3 循环
// 动画用 JS 每帧算 scale（不用 CSS transition 追进度）：暂停后继续不跳帧的唯一稳妥做法
const PHASE_IN = 4000
const PHASE_HOLD = 7000
const PHASE_OUT = 8000
const CYCLE = PHASE_IN + PHASE_HOLD + PHASE_OUT
const CYCLES = 3
const TICK = 100
const MIN_SCALE = 0.6
const MAX_SCALE = 1

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 返回当前阶段名与圆的缩放（reducedMotion 时缩放恒为 1，只切文字）
function phaseAt(elapsed: number, reducedMotion: boolean) {
  const t = elapsed % CYCLE
  const lerp = (from: number, to: number, p: number) =>
    from + (to - from) * p
  if (t < PHASE_IN) {
    const scale = reducedMotion ? 1 : lerp(MIN_SCALE, MAX_SCALE, t / PHASE_IN)
    return { name: '吸气', hint: '跟着节奏，慢慢吸', scale }
  }
  if (t < PHASE_IN + PHASE_HOLD) {
    return { name: '屏息', hint: '感到不适请直接跳到呼气', scale: reducedMotion ? 1 : MAX_SCALE }
  }
  const scale = reducedMotion ? 1 : lerp(MAX_SCALE, MIN_SCALE, (t - PHASE_IN - PHASE_HOLD) / PHASE_OUT)
  return { name: '呼气', hint: '把这口气慢慢吐干净', scale }
}

function Breathe() {
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'done'>('idle')
  const [, setTick] = useState(0)
  const elapsedRef = useRef(0)
  const originRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const reducedMotion = useRef(prefersReducedMotion())

  useEffect(() => () => stopTimer(), [])

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const start = () => {
    originRef.current = performance.now() - elapsedRef.current
    stopTimer()
    timerRef.current = window.setInterval(() => {
      elapsedRef.current = performance.now() - originRef.current
      if (elapsedRef.current >= CYCLE * CYCLES) {
        elapsedRef.current = CYCLE * CYCLES
        stopTimer()
        setStatus('done')
      }
      setTick((n) => n + 1)
    }, TICK)
    setStatus('running')
  }

  const pause = () => {
    stopTimer()
    setStatus('paused')
  }

  const reset = () => {
    stopTimer()
    elapsedRef.current = 0
    setTick((n) => n + 1)
    setStatus('idle')
  }

  const total = CYCLE * CYCLES
  const phase = phaseAt(Math.min(elapsedRef.current, total), reducedMotion.current)
  const cycleNo = Math.min(Math.floor(elapsedRef.current / CYCLE) + 1, CYCLES)

  return (
    <div className="breathe">
      <h1>呼吸练习</h1>
      <p className="breathe-sub">吸 4 秒 · 屏 7 秒 · 呼 8 秒，共 3 个循环。{reducedMotion.current && '已按系统设置关闭动画，跟着文字节奏就好。'}</p>

      <div className="breathe-stage">
        <div
          className="breathe-circle"
          style={status === 'idle' || status === 'done' ? undefined : { transform: `scale(${phase.scale})` }}
        >
          <span className="breathe-phase">
            {status === 'idle' && '准备开始'}
            {status === 'paused' && '已暂停'}
            {status === 'done' && '完成了'}
            {status === 'running' && phase.name}
          </span>
        </div>
      </div>

      <p className="breathe-hint">
        {status === 'running' ? phase.hint : '随时可以停下，不需要做完。'}
      </p>

      {status === 'running' && (
        <p className="breathe-meta">第 {cycleNo} / {CYCLES} 个循环</p>
      )}

      {status === 'done' ? (
        <p className="breathe-done">三个循环做完了。不用急着做别的——想再来一趟随时回来，想休息就去休息。</p>
      ) : null}

      {/* 三个固定槽位：主动作 | 次动作 | 离开。
          改前按钮是按「此刻该显示哪个」条件渲染的，于是 idle 只有 [开始][回首页]、
          running 变成 [暂停][重来][回首页]、done 又变成 [重来][回首页]——
          「重来」一会儿在第 2 位一会儿在第 1 位，手指刚记住的位置每次都变。
          现在槽位恒定：槽里有没有按钮会变，槽在哪不会变。
          回首页用 .act-exit（margin-left:auto）永远钉在最右。 */}
      <div className="breathe-actions act-row">
        <span className="act-slot">
          {status === 'running' ? (
            <button type="button" className="btn btn-quiet" onClick={pause}>
              <Pause size={16} strokeWidth={1.75} aria-hidden="true" />
              暂停
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={start}>
              <Play size={16} strokeWidth={1.75} aria-hidden="true" />
              {status === 'paused' ? '继续' : status === 'done' ? '再来一趟' : '开始'}
            </button>
          )}
        </span>
        {status !== 'idle' && (
          <span className="act-slot">
            <button type="button" className="btn btn-quiet" onClick={reset}>
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
              重来
            </button>
          </span>
        )}
        <Link to="/" className="btn btn-quiet act-exit">
          <Home size={16} strokeWidth={1.75} aria-hidden="true" />
          回首页
        </Link>
      </div>
    </div>
  )
}

export default Breathe
