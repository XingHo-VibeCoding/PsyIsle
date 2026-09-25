import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { quotes } from '../data/quotes'
import { bumpCounter, readCounter } from '../lib/storage'

const MOOD_COUNT_KEY = 'xinyu.mood.count'
// 连续点击超过 10 次出柔和求助引导（PRD F8 验收）
const GUIDE_AFTER = 10

// F8 随机安慰卡：首页常驻入口，原地出卡不跳页
// 会话内不重复用内存集合（mood.seen 本就不上云：刷新即重置是设计意图）
function ComfortCard() {
  const [current, setCurrent] = useState<string | null>(null)
  const [count, setCount] = useState(() => readCounter(MOOD_COUNT_KEY))
  const seen = useRef<Set<number>>(new Set())

  const draw = () => {
    if (seen.current.size >= quotes.length) {
      seen.current.clear()
    }
    let index: number
    do {
      index = Math.floor(Math.random() * quotes.length)
    } while (seen.current.has(index))
    seen.current.add(index)
    setCurrent(quotes[index])
    setCount(bumpCounter(MOOD_COUNT_KEY))
  }

  return (
    <div className="card comfort-card">
      <span className="card-tag">安慰卡</span>
      <h3>我 emo 了，点一下</h3>
      {current === null ? (
        <p>点上面的按钮，抽一句温柔的话。</p>
      ) : (
        <p className="comfort-text">{current}</p>
      )}
      {current !== null && (
        <button type="button" className="btn btn-quiet comfort-again" onClick={draw}>
          再来一句
        </button>
      )}
      {count > GUIDE_AFTER && (
        <p className="comfort-guide">
          这阵子辛苦了。要是想说给真人听，<Link to="/help">这里有一些可以找的人</Link>。
        </p>
      )}
    </div>
  )
}

export default ComfortCard
