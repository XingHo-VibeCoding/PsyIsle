import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { allQuestions, likert, scales } from '../../data/assess'
import { usePageTitle } from '../../lib/usePageTitle'

// 找方向 · 小测评（子视图三，2026-10-19 补内容；2026-10-20 结果页按真人试用反馈重做）
// 合规要点：不打分、不评级、不出总分、不位置词（无中文常模）。
// 答完看到的是「你自己这一遍选了什么」，是一面镜子，不是一张成绩单。
//
// 2026-10-20 真人试用原话：「这个测评做出来没有任何意义，帮不到人，也无法让人更了解自己」——
// 因为整页只有一句「你选得最多的是很少」加每题回放，用户看完不知道然后呢。
// 重做后的结果页做三件事：
//   1. 跨量表汇总「这一遍选从不/很少的几句」——这是用户唯一能带走的东西；
//   2. 每句配一句符合语境的实话：反着问的句子（flip）说明白，免得回看时吓自己一跳；
//   3. 给一个不强迫的下一步：想接着说就去「写一写」。仍然没有分数、没有结论、没有诊断。

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
    // 跨量表汇总：这一遍选「从不 / 很少」的句子，按题目顺序，展示上限 6 句
    // （全是极端项会变成长清单，清单本身就成了压力）
    const lows = allQuestions.filter((q) => {
      const v = answers[q.index]
      return v === 0 || v === 1
    })

    return (
      <section className="zone zone-flat assess-result">
        <h2>这一遍的自己</h2>
        <p className="zone-tip">
          下面是你刚才选的。没有分数，也不是结论——只是你此刻的一个快照。
        </p>

        <div className="card assess-summary">
          <span className="card-tag">这一遍，你选「从不 / 很少」的几句</span>
          {lows.length === 0 ? (
            <p className="comfort-text">这一遍，你没有选「从不 / 很少」的句子。</p>
          ) : (
            <ul className="assess-lows">
              {lows.slice(0, 6).map((q) => {
                const v = answers[q.index] as number
                return (
                  <li key={q.index} className="assess-low">
                    <span className="assess-low-q">{q.text}</span>
                    <span className="assess-low-a">「{likert[v]}」</span>
                    <span className="assess-low-note">
                      {q.flip
                        ? '这句是反着问的——意思和字面相反。'
                        : '这句是你这一刻的回答，不是定论。'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          {lows.length > 6 && (
            <p className="assess-dist">还有 {lows.length - 6} 句，在下面的分组里都能看到。</p>
          )}
        </div>

        <p className="assess-next">
          有没有哪一句想接着说？可以去<Link to="/daily">写一写</Link>写下来，不想写也没关系。
        </p>

        {scales.map((s) => (
          <div key={s.id} className="assess-group">
            <h3 className="lib-kind">{s.name}</h3>
            <ul className="assess-list">
              {s.questions.map((q, qi) => {
                const idx = indexMap[s.id][qi]
                const v = answers[idx]
                return (
                  <li key={idx} className="assess-item">
                    <span className="assess-q">
                      {q.text}
                      {q.flip && <span className="assess-flip">（这句是反着问的）</span>}
                    </span>
                    <span className="assess-a">
                      {typeof v === 'number' ? likert[v] : '（没选）'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <p className="assess-dist">
          {likert.map((l, i) => `${l} ${dist[i]} 项`).join('　·　')}
        </p>

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
                  <p className="assess-q">{q.text}</p>
                  <div className="chips" role="group" aria-label={`对「${q.text}」的选择`}>
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
