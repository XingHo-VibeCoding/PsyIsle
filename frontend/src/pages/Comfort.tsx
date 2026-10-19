import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { quotes } from '../data/quotes'
import { usePageTitle } from '../lib/usePageTitle'

// 我 emo 了 · 安慰卡（独立页，2026-10-19 从「找方向」移出）
// 抽屉式卡片：手指/鼠标左右拖动切换下一句，也可点按钮。
// 文案仍是固定库（不联网、不生成），符合项目红线：安慰只给固定温柔的话，绝不让 AI 现编。

const TOTAL = quotes.length
const GUIDE_AFTER = 10
const SWIPE_THRESHOLD = 56

const shuffle = (n: number): number[] => {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function Comfort() {
  usePageTitle('我 emo 了')
  const [order, setOrder] = useState<number[]>(() => shuffle(TOTAL))
  const [pos, setPos] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [count, setCount] = useState(0)
  const startX = useRef(0)

  const current = quotes[order[pos]]

  const go = (delta: number) => {
    setPos((p) => {
      let n = p + delta
      if (n >= TOTAL) {
        setOrder(shuffle(TOTAL))
        n = 0
      }
      if (n < 0) n = 0
      return n
    })
    setCount((c) => c + 1)
  }

  const onDown = (e: ReactPointerEvent) => {
    startX.current = e.clientX
    setDragging(true)
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!dragging) return
    setDragX(e.clientX - startX.current)
  }
  const onUp = () => {
    if (!dragging) return
    setDragging(false)
    const dx = dragX
    setDragX(0)
    if (dx <= -SWIPE_THRESHOLD) go(1)
    else if (dx >= SWIPE_THRESHOLD) go(-1)
  }

  const rotate = dragging ? Math.max(-8, Math.min(8, dragX / 24)) : 0

  return (
    <div className="page comfort-page">
      <div className="page-head">
        <h1>我 emo 了</h1>
        <p className="page-sub">左右滑动卡片，换一句陪你的话。不用都信，挑一句能接住的。</p>
      </div>

      <div
        className="comfort-drawer"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        role="group"
        aria-label="安慰卡，可左右滑动切换"
      >
        <div
          className="comfort-card-slide"
          key={pos}
          style={{
            transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
            transition: dragging ? 'none' : 'transform 320ms var(--ease-soft)',
          }}
        >
          <div className="card comfort-card comfort-card-anim">
            <span className="card-tag">安慰卡</span>
            <p className="comfort-text">{current}</p>
          </div>
        </div>
      </div>

      <div className="comfort-controls">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => go(-1)}
          disabled={pos === 0}
        >
          上一句
        </button>
        <span className="comfort-progress">
          第 {pos + 1} / {TOTAL} 句
        </span>
        <button type="button" className="btn btn-primary" onClick={() => go(1)}>
          下一句
        </button>
      </div>

      {count > GUIDE_AFTER && (
        <p className="comfort-guide">
          这阵子辛苦了。要是想说给真人听，<Link to="/help">这里有一些可以找的人</Link>。
        </p>
      )}
    </div>
  )
}

export default Comfort
