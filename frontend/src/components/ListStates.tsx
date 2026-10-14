import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'

// 列表「四种状态」里的三种非正常态（正常态就是列表本身）。
// 三态一律不用红色（产品红线：全站没有一种语义状态用红色表达）——
// 错误态靠「说清发生了什么 + 一个真能按的重试」立住，不靠警示色吓人。
// 「点了没反应」是本产品最不能出现的反馈形态，所以错误态的重试按钮必须给回加载态。

export function ListLoading({ label }: { label: string }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {/* 骨架先用形状占位：内容回来时列表不会整体跳一下 */}
      <span className="skeleton-row" aria-hidden="true" />
      <span className="skeleton-row" aria-hidden="true" />
      <span className="skeleton-row" aria-hidden="true" />
    </div>
  )
}

export function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state-note" role="alert">
      <p className="state-title">这次没能把内容取回来。</p>
      <p>大概是网络不太稳，和你没关系。等一下再试，也不用急着看。</p>
      <button type="button" className="btn btn-quiet" onClick={onRetry}>
        <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
        再试一次
      </button>
    </div>
  )
}

// 空态不是故障，是「这个条件下暂时没有」——所以文案要说清是哪个条件，
// 并给一条退路（放宽筛选），而不是让用户自己猜怎么把它变回来。
export function ListEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="state-note state-note-quiet" role="status">
      <p>{children}</p>
      {action}
    </div>
  )
}
