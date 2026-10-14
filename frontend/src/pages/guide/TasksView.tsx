import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ComfortCard from '../../components/ComfortCard'
import { ListEmpty, ListError, ListLoading } from '../../components/ListStates'
import { fetchTasks } from '../../lib/api'
import { matchThemes, themeLabel } from '../../data/themes'
import { useListData } from '../../lib/useListData'
import { usePageTitle } from '../../lib/usePageTitle'
import { useGuideThemes } from './context'

// 找方向 · 行动小事（子视图一，也是 /guide 的默认视图）
// 立场：不排序、不推荐「最适合你的」、不做成待办清单、不显示完成了多少。
// 「今天随便来一件」是从当前筛选结果里抽一件，抽到哪件都行，所以它和「全部小事」
// 读的是同一份数据、同一份加载状态——不做第二次请求，两处也就不可能不一致。
function TasksView() {
  usePageTitle('行动小事')
  const { picked, clearThemes } = useGuideThemes()
  const { status, data: tasks, retry } = useListData(fetchTasks)
  const [spotlightId, setSpotlightId] = useState<string | null>(null)

  const visible = useMemo(() => tasks.filter((t) => matchThemes(t.themes, picked)), [tasks, picked])

  const spotlight = visible.find((t) => t.id === spotlightId) ?? visible[0]

  const shuffle = () => {
    const rest = visible.filter((t) => t.id !== spotlight?.id)
    if (rest.length === 0) return
    setSpotlightId(rest[Math.floor(Math.random() * rest.length)].id)
  }

  return (
    <>
      <section className="zone zone-flat">
        <h2>今天随便来一件</h2>
        <p className="zone-tip">三到十分钟，做完就算，不用连着做，也不用记下来</p>

        {status === 'loading' && <ListLoading label="正在取回小任务" />}
        {status === 'error' && <ListError onRetry={retry} />}

        {status === 'ready' && spotlight && (
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
        )}

        {status === 'ready' && !spotlight && (
          <ListEmpty
            action={
              // 勾了主题才筛空，所以退路就是把主题放开；一件没勾还空只可能是内容库真没条目
              picked.length > 0 ? (
                <button type="button" className="btn btn-quiet" onClick={clearThemes}>
                  不按主题筛
                </button>
              ) : undefined
            }
          >
            这个主题下暂时没有合适的小事，换个主题看看。
          </ListEmpty>
        )}
      </section>

      {/* 抽中一件之后，想多挑挑的人才会往下看，所以列表跟着抽卡走：
          抽卡空着的时候，这里也没有东西可列 */}
      {status === 'ready' && visible.length > 0 && (
        <section className="zone zone-flat">
          <h2>全部小事</h2>
          <p className="zone-tip">挑一件现在能做的就行</p>
          <ul className="task-list">
            {visible.map((task) => (
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
      )}

      {/* 安慰卡与任务库无关（它读的是固定文案），所以不挂在加载态下：
          内容取不回来的时候，反而更需要它还在 */}
      <section className="zone zone-flat">
        <h2>不用挑，随手抽一句</h2>
        <p className="zone-tip">心情一下子沉下去的时候用</p>
        <div className="cards">
          <ComfortCard />
        </div>
      </section>
    </>
  )
}

export default TasksView
