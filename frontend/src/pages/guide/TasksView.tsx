import { useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { ListEmpty, ListError, ListLoading } from '../../components/ListStates'
import { fetchTasks } from '../../lib/api'
import { matchThemes, themeLabel, themes, type ThemeId } from '../../data/themes'
import { getAuthState, subscribe } from '../../lib/auth'
import { openAuthPanel } from '../../lib/authPanel'
import { readJson, writeJson } from '../../lib/storage'
import { useListData } from '../../lib/useListData'
import { usePageTitle } from '../../lib/usePageTitle'
import { useGuideThemes } from './context'

// 找方向 · 行动小事（子视图一，也是 /guide 的默认视图）
// 立场：不排序、不推荐「最适合你的」、不做成待办清单、不显示完成了多少。
// 「今天随便来一件」是从当前筛选结果里抽一件，抽到哪件都行，所以它和「全部小事」
// 读的是同一份数据、同一份加载状态——不做第二次请求，两处也就不可能不一致。
//
// 2026-10-19 改版：
//  · 「全部小事」默认收起成一个按钮，点开才列全部（页面第一屏只留抽卡这个主动作）；
//  · 用户可新增 / 编辑 / 删除「自己的小事」（本地 localStorage），种子小事为官方内容、只读；
//  · 「我 emo 了」的安慰卡移出本页，单独成页 /comfort，这里只留一个入口。

const USER_TASKS_KEY = 'xinyu.tasks.user'

// 2026-10-20 真人试用反馈⑦：「只有在写一写才会出现注册登录界面，找方向添加小事的时候不会跳出来」。
// 这里的小事是纯本地存储（localStorage），后端没有对应接口——不弹登录不是漏了，
// 是它本来就不需要账号。但用户的困惑是真的：两个页面待遇不一样，得有人说清楚。
// 所以加一件小事的地方常驻一句实话 + 一个不强迫的登录入口：存在哪、会不会丢、登录能带来什么。
// 不弹模态：为一个本地功能弹「注册否则丢失」的模态，是拿焦虑推人，踩产品红线。
const useAnon = () =>
  useSyncExternalStore(
    subscribe,
    () => getAuthState().mode === 'anonymous',
    () => true,
  )

export type TaskRow = {
  id: string
  title: string
  hint: string
  minutes: number
  themes: ThemeId[]
  to?: string
  /** 本地用户新增的小事，可增删改；种子小事无此标记、只读 */
  user?: boolean
}

const readUserTasks = (): TaskRow[] => {
  const rows = readJson<TaskRow[]>(USER_TASKS_KEY)
  return Array.isArray(rows) ? rows.filter((r) => r && r.id && r.title) : []
}
const saveUserTasks = (rows: TaskRow[]) => writeJson(USER_TASKS_KEY, rows)

function TasksView() {
  usePageTitle('行动小事')
  const { picked, clearThemes } = useGuideThemes()
  const { status, data: seedTasks, retry } = useListData(fetchTasks)
  const [userTasks, setUserTasks] = useState<TaskRow[]>(readUserTasks)
  const [open, setOpen] = useState(false)
  const [spotlightId, setSpotlightId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const anon = useAnon()

  const allTasks = useMemo<TaskRow[]>(() => [...seedTasks, ...userTasks], [seedTasks, userTasks])
  const visible = useMemo(
    () => allTasks.filter((t) => matchThemes(t.themes, picked)),
    [allTasks, picked],
  )

  const spotlight = visible.find((t) => t.id === spotlightId) ?? visible[0]

  const shuffle = () => {
    const rest = visible.filter((t) => t.id !== spotlight?.id)
    if (rest.length === 0) return
    setSpotlightId(rest[Math.floor(Math.random() * rest.length)].id)
  }

  const persist = (next: TaskRow[]) => {
    setUserTasks(next)
    saveUserTasks(next)
  }
  const addTask = (row: TaskRow) => persist([...userTasks, row])
  const updateTask = (row: TaskRow) =>
    persist(userTasks.map((t) => (t.id === row.id ? row : t)))
  const removeTask = (id: string) => {
    persist(userTasks.filter((t) => t.id !== id))
    setConfirmId(null)
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

      {/* 全部小事：默认收起成一个按钮，点开才列全部——第一屏只留抽卡这个主动作。
          展开后用户可对自己新增的小事做增删改；种子小事为官方内容、只读。 */}
      <section className="zone zone-flat">
        <div className="tasks-toggle">
          <h2>全部小事</h2>
          <button
            type="button"
            className="btn btn-quiet"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '收起' : `展开（${visible.length}）`}
          </button>
        </div>

        {open && status === 'ready' && (
          <>
            <div className="tasks-toolbar">
              <p className="zone-tip">挑一件现在能做的就行；也可以记下你自己想做的小事。</p>
              {!showAdd && !editing && (
                <button
                  type="button"
                  className="btn btn-primary tasks-add"
                  onClick={() => setShowAdd(true)}
                >
                  加一件我的小事
                </button>
              )}
            </div>

            {anon && (
              <p className="tasks-local-note">
                <span>
                  你加的小事存在这台设备的浏览器里，换设备带不走；写一写的心情记录，可以注册账号跟着走。
                </span>
                <button type="button" className="btn btn-quiet" onClick={() => openAuthPanel()}>
                  登录 / 注册
                </button>
              </p>
            )}

            {(showAdd || editing) && (
              <TaskForm
                initial={editing}
                onCancel={() => {
                  setShowAdd(false)
                  setEditing(null)
                }}
                onSave={(row) => {
                  if (editing) updateTask(row)
                  else addTask(row)
                  setShowAdd(false)
                  setEditing(null)
                }}
              />
            )}

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
                  {task.user && (
                    <div className="task-edit-row">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="编辑这件小事"
                        onClick={() => {
                          setEditing(task)
                          setShowAdd(false)
                        }}
                      >
                        ✎
                      </button>
                      {confirmId === task.id ? (
                        <button
                          type="button"
                          className="btn btn-quiet task-confirm"
                          onClick={() => removeTask(task.id)}
                        >
                          确认删除？
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn icon-btn-strong"
                          aria-label="删除这件小事"
                          onClick={() => setConfirmId(task.id)}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 心情沉下去时的安慰卡已移出本页，单独成 /comfort；这里留一个安静的入口。 */}
      <section className="zone zone-flat">
        <h2>不用挑，随手抽一句</h2>
        <p className="zone-tip">心情一下子沉下去的时候用</p>
        <Link to="/comfort" className="card comfort-entry">
          <span className="card-tag">安慰卡</span>
          <h3>我 emo 了</h3>
          <p>点开，抽一句温柔的话陪你。可以一张张滑过去。</p>
        </Link>
      </section>
    </>
  )
}

// 新增 / 编辑小事的表单：标题必填，其余可选；主题多选（可空 = 不归类）。
function TaskForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: TaskRow | null
  onSave: (row: TaskRow) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [hint, setHint] = useState(initial?.hint ?? '')
  const [minutes, setMinutes] = useState(initial?.minutes ?? 5)
  const [picked, setPicked] = useState<ThemeId[]>(initial?.themes ?? [])

  const toggle = (id: ThemeId) =>
    setPicked((p) => (p.includes(id) ? p.filter((t) => t !== id) : [...p, id]))

  const save = () => {
    const t = title.trim()
    if (!t) return
    onSave({
      id: initial?.id ?? `u-${Date.now()}`,
      title: t,
      hint: hint.trim() || '做完就算，不用连着做。',
      minutes: Math.max(1, Math.min(120, Number(minutes) || 5)),
      themes: picked,
      user: true,
    })
  }

  return (
    <div className="card task-form">
      <label className="write-label" htmlFor="task-title">
        {initial ? '编辑这件小事' : '加一件我的小事'}
      </label>
      <input
        id="task-title"
        className="write-area"
        placeholder="一句话，比如：把桌面清干净"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="write-area"
        placeholder="怎么做（可选）"
        value={hint}
        onChange={(e) => setHint(e.target.value)}
      />
      <div className="write-strength">
        <span>大概几分钟</span>
        <input
          className="write-area task-min-input"
          type="number"
          min={1}
          max={120}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </div>
      <div className="chips" role="group" aria-label="给小事归类（可空）">
        {themes.map((t) => {
          const on = picked.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              className={on ? 'chip chip-on' : 'chip'}
              aria-pressed={on}
              onClick={() => toggle(t.id)}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="write-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!title.trim()}>
          保存
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}

export default TasksView
