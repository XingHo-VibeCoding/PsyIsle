import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

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

      <div className="breathe-actions">
        {(status === 'idle' || status === 'paused') && (
          <button type="button" className="btn btn-primary" onClick={start}>
            {status === 'paused' ? '继续' : '开始'}
          </button>
        )}
        {status === 'running' && (
          <button type="button" className="btn btn-quiet" onClick={pause}>暂停</button>
        )}
        {status !== 'idle' && (
          <button type="button" className="btn btn-quiet" onClick={reset}>重来</button>
        )}
        <Link to="/" className="btn btn-quiet">回首页</Link>
      </div>
    </div>
  )
}

export default Breathe
