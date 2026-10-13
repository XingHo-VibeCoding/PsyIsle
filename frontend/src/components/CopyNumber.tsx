import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyText } from '../lib/clipboard'

type CopyState = 'idle' | 'done' | 'error'

interface CopyNumberProps {
  number: string
  // 结果上报给页面：按钮只管自己脚下的状态，页面级的确认提示由页面统一出，
  // 免得每个按钮各自飘一个提示条（连续点几个号码时会叠成一堆）
  onResult?: (ok: boolean, number: string) => void
}

// 结果态停留时长：够看清发生了什么，又不至于一直挂在按钮上让人以为它卡住了
const RESET_MS = 2400

// 复制号码按钮：给「还不敢直接拨、想先把号码记下来」的人。
// 反馈分三层，缺一层用户就不知道刚才那一下到底生效没有：
//   1) 即时 —— CSS 的 :active 按压（手指按下去立刻有反应，这是触屏唯一的"收到了"）；
//   2) 结果 —— 按钮自己变成「已复制」，离手指最近，不用去别处找；
//   3) 兜底 —— 失败绝不静默：变成「手动复制」并让页面给出怎么办。
// 不做"复制中"转圈：写剪贴板是毫秒级的（远低于 Nielsen 说的 1 秒），
// 中间态只会闪一下反而更晃眼。
function CopyNumber({ number, onResult }: CopyNumberProps) {
  const [state, setState] = useState<CopyState>('idle')
  const timerRef = useRef<number | null>(null)
  const busyRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // 卸载时清定时器：连点后立刻离开页面，回调不该再落到已经没了的组件上
  useEffect(() => () => clearTimer(), [])

  const handleCopy = async () => {
    // 连点保护：上一次还没回来时忽略后续点击，避免两笔结果互相覆盖
    if (busyRef.current) return
    busyRef.current = true
    const ok = await copyText(number)
    busyRef.current = false

    // 先清旧定时器再设新的：连点 N 次只留最后一个，
    // 否则先设的会提前把状态打回 idle（这就是"连点后状态乱跳"的成因）
    clearTimer()
    setState(ok ? 'done' : 'error')
    onResult?.(ok, number)
    timerRef.current = window.setTimeout(() => setState('idle'), RESET_MS)
  }

  const done = state === 'done'
  const failed = state === 'error'
  const className = done ? 'copy-btn copy-btn-done' : failed ? 'copy-btn copy-btn-error' : 'copy-btn'

  return (
    <button type="button" className={className} onClick={handleCopy}>
      {/* 视觉文字对读屏是重复信息（下面那段才是完整的一句话），所以藏进无障碍树外 */}
      <span aria-hidden="true" className="copy-btn-face">
        {done ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} strokeWidth={1.75} />}
        {done ? '已复制' : failed ? '手动复制' : '复制'}
      </span>
      <span className="sr-only">
        {done
          ? `号码 ${number} 已复制到剪贴板`
          : failed
            ? `号码 ${number} 自动复制失败，请长按号码手动复制`
            : `复制号码 ${number}`}
      </span>
    </button>
  )
}

export default CopyNumber
