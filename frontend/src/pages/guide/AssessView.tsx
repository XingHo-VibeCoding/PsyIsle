import { useMemo, useState } from 'react'
import { scales, likert } from '../../data/assess'
import { usePageTitle } from '../../lib/usePageTitle'

// 找方向 · 小测评（子视图三，2026-10-19 补内容）
// 合规要点：不打分、不评级、不出总分、不位置词（无中文常模）。
// 答完看到的是「你自己这一遍选了什么」，是一面镜子，不是一张成绩单。

// 题目全局序号：按 scales 出现顺序连续编号，便于把答案按序号收集。
const indexMap: Record<string, number[]> = {}
{
  let cursor = 0
  for (const s of scales) {
    indexMap[s.id] = s.questions.map(() => cursor++)
  }
}

function AssessView() {
  usePageTitle('小测评')
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [done, setDone] = useState(false)

  const answeredCount = Object.keys(answers).length
  const totalCount = scales.reduce((n, s) => n + s.questions.length, 0)

  const set = (idx: number, v: number) => setAnswers((a) => ({ ...a, [idx]: v }))

  const reset = () => {
    setAnswers({})
    setDone(false)
  }

  // 聚合：各档被选中次数（仅作自我觉察的镜子，不折算成分数）
  const dist = useMemo(() => {
    const d = [0, 0, 0, 0, 0]
    for (const v of Object.values(answers)) d[v]++
    return d
  }, [answers])

  if (done) {
    return (
      <section className="zone zone-flat assess-result">
        <h2>这一遍的自己</h2>
        <p className="zone-tip">
          下面是你刚才选的。没有分数，也不是结论——只是你此刻的一个快照。
        </p>

        <div className="card assess-summary">
          <span className="card-tag">你选得最多的</span>
          <p className="comfort-text">
            {(() => {
              const max = Math.max(...dist)
              const top = dist
                .map((c, i) => (c === max ? likert[i] : null))
                .filter(Boolean)
                .join('、')
              return max > 0 ? `这一遍你最常选的是「${top}」。` : '你还没选任何一项。'
            })()}
          </p>
          <p className="assess-dist">
            {likert.map((l, i) => `${l} ${dist[i]} 项`).join('　·　')}
          </p>
        </div>

        {scales.map((s) => (
          <div key={s.id} className="assess-group">
            <h3 className="lib-kind">{s.name}</h3>
            <ul className="assess-list">
              {s.questions.map((q, qi) => {
                const idx = indexMap[s.id][qi]
                const v = answers[idx]
                return (
                  <li key={idx} className="assess-item">
                    <span className="assess-q">{q}</span>
                    <span className="assess-a">
                      {typeof v === 'number' ? likert[v] : '（没选）'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <p className="assess-warn">
          这不是诊断，也不替代专业帮助。如果最近持续很难熬，<a href="/help">这里可以找人说说</a>。
        </p>
        <button type="button" className="btn btn-quiet" onClick={reset}>
          重新填一遍
        </button>
      </section>
    )
  }

  return (
    <section className="zone zone-flat">
      <h2>小测评</h2>
      <p className="zone-tip">
        不是考试，不打分、不评级、不出总分。只是帮你看看自己这一阵子大概在哪个状态。
      </p>

      {scales.map((s) => (
        <div key={s.id} className="assess-group">
          <h3 className="lib-kind">
            {s.name} <span className="assess-src">· {s.source}</span>
          </h3>
          <ul className="assess-list">
            {s.questions.map((q, qi) => {
              const idx = indexMap[s.id][qi]
              return (
                <li key={idx} className="assess-item">
                  <p className="assess-q">{q}</p>
                  <div className="chips" role="group" aria-label={`对「${q}」的选择`}>
                    {likert.map((l, li) => {
                      const on = answers[idx] === li
                      return (
                        <button
                          key={li}
                          type="button"
                          className={on ? 'chip chip-on' : 'chip'}
                          aria-pressed={on}
                          onClick={() => set(idx, li)}
                        >
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="assess-foot">
        <span className="assess-progress">
          已填 {answeredCount} / {totalCount}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={answeredCount === 0}
          onClick={() => setDone(true)}
        >
          看这一遍的自己
        </button>
      </div>
    </section>
  )
}

export default AssessView
