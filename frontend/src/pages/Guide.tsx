import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ComfortCard from '../components/ComfortCard'
import { library, kindLabel, kindOrder, type LibraryKind } from '../data/library'
import { microTasks } from '../data/tasks'
import { matchThemes, themeLabel, themes, type ThemeId } from '../data/themes'
import { readJson, writeJson } from '../lib/storage'

// 找方向（PRD v5.0 模块二，原稿叫「指路灯」，2026-10-13 老板改定名）＝ 测评 + 行动小任务 + 书影音，
// 三条线都由「我现在在意什么」驱动
// 页面设计立场：不排序、不推荐「最适合你的」、不显示完成了多少——用户挑哪件都行，不挑也行
const THEME_KEY = 'xinyu.guide.themes'

function Guide() {
  const [picked, setPicked] = useState<ThemeId[]>(() => readJson<ThemeId[]>(THEME_KEY) ?? [])
  const [spotlightId, setSpotlightId] = useState<string | null>(null)

  const visibleTasks = useMemo(
    () => microTasks.filter((t) => matchThemes(t.themes, picked)),
    [picked],
  )
  const visibleLibrary = useMemo(
    () => library.filter((i) => matchThemes(i.themes, picked)),
    [picked],
  )

  const spotlight = visibleTasks.find((t) => t.id === spotlightId) ?? visibleTasks[0]

  const toggleTheme = (id: ThemeId) => {
    const next = picked.includes(id) ? picked.filter((t) => t !== id) : [...picked, id]
    setPicked(next)
    writeJson(THEME_KEY, next)
  }

  const shuffle = () => {
    const rest = visibleTasks.filter((t) => t.id !== spotlight?.id)
    if (rest.length === 0) return
    setSpotlightId(rest[Math.floor(Math.random() * rest.length)].id)
  }

  const byKind = (kind: LibraryKind) => visibleLibrary.filter((i) => i.kind === kind)

  return (
    <div className="guide">
      <h1>找方向</h1>
      <p className="guide-sub">
        不知道该往哪走的时候，从这里挑一件。三样东西没有顺序，也不用都做。
      </p>

      <section className="zone zone-flat">
        <h2>你现在在意什么</h2>
        <p className="zone-tip">勾几个都行，一个不勾也行——不勾就全部都给你看</p>
        <div className="chips">
          {themes.map((t) => {
            const on = picked.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                className={on ? 'chip chip-on' : 'chip'}
                aria-pressed={on}
                onClick={() => toggleTheme(t.id)}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="zone zone-flat">
        <h2>今天随便来一件</h2>
        <p className="zone-tip">三到十分钟，做完就算，不用连着做，也不用记下来</p>
        {spotlight ? (
          <div className="card task-spotlight">
            <span className="card-tag">
              约 {spotlight.minutes} 分钟
              {spotlight.themes.map((t) => ` · ${themeLabel(t)}`).join('')}
            </span>
            <h3>{spotlight.title}</h3>
            <p>{spotlight.hint}</p>
            <div className="task-actions">
              <button type="button" className="btn btn-quiet" onClick={shuffle}>
                换一件
              </button>
              {spotlight.to ? (
                <Link to={spotlight.to} className="btn btn-primary">
                  现在就去
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="zone-tip">这个主题下暂时没有合适的小事，换个主题看看。</p>
        )}
      </section>

      <section className="zone zone-flat">
        <h2>全部小事</h2>
        <p className="zone-tip">挑一件现在能做的就行</p>
        <ul className="task-list">
          {visibleTasks.map((task) => (
            <li key={task.id} className="task-item">
              <div className="task-head">
                <strong>{task.title}</strong>
                <span className="task-min">约 {task.minutes} 分钟</span>
              </div>
              <p className="task-hint">{task.hint}</p>
              {task.to ? (
                <Link to={task.to} className="task-link">
                  去做这一件
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="zone zone-flat">
        <h2>不用挑，随手抽一句</h2>
        <p className="zone-tip">心情一下子沉下去的时候用</p>
        <div className="cards">
          <ComfortCard />
        </div>
      </section>

      <section className="zone zone-flat">
        <h2>书影音</h2>
        <p className="zone-tip">只给条目和一句话，不用写读后感，看完也不用告诉谁</p>
        {kindOrder.map((kind) => {
          const items = byKind(kind)
          if (items.length === 0) return null
          return (
            <div key={kind} className="lib-group">
              <h3 className="lib-kind">{kindLabel[kind]}</h3>
              <ul className="lib-list">
                {items.map((item) => (
                  <li key={item.id} className="lib-item">
                    <div className="lib-head">
                      <strong>{item.title}</strong>
                      <span className="lib-by">{item.by}</span>
                    </div>
                    <p className="lib-note">{item.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {visibleLibrary.length === 0 && <p className="zone-tip">这个主题下暂时没有条目，换个主题看看。</p>}
      </section>

      <section className="zone zone-flat">
        <h2>小测评</h2>
        <div className="card card-pending">
          <span className="card-tag">还在准备</span>
          <h3>很快就能用</h3>
          <p>
            做完会给你一段描述，和「接下来可以看看什么」。不会有总分，不会有档位，也不会告诉你你是哪种人。
          </p>
        </div>
      </section>

      <p className="guide-foot">
        这里的东西都不是必须做的。看完就关掉也没关系。
        <Link to="/help"> 如果现在很难熬，先看这里。</Link>
      </p>
    </div>
  )
}

export default Guide
