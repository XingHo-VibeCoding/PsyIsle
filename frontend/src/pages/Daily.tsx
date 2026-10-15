import { useState } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { useListData } from '../lib/useListData'
import { ListLoading, ListError, ListEmpty } from '../components/ListStates'
import { moodMeta, MOODS } from '../data/moods'
import {
  fetchMoods,
  fetchNotes,
  postMood,
  postNote,
  deleteMood,
  type MoodRow,
  type NoteRow,
} from '../lib/api'
import { toUserMessage } from '../lib/errors'

// 写一写 · 心情打卡 + 小进步。
// Day 17 正式接入云端真实读接口；Day 21 补 #8 把写入 UI 也接上 —— 之前这页只展示、写不了。
// 两张表各是一个独立列表，各自走 loading/error/empty/ready 四态；写入与读取解耦，
// 一块取不回来不影响另一块，写失败也只影响自己那一格的提示、不拖累列表。

// 写入提交态：idle / posting / done / error。
// 业务错误走统一信封（契约 §3），这里只接 message 给用户看；提示不靠红色（产品红线），
// 成功用 forest 安抚色、失败退回无彩 + 换文案，和全站错误态同一套表达。
type WriteState =
  | { phase: 'idle' }
  | { phase: 'posting' }
  | { phase: 'done'; text: string }
  | { phase: 'error'; text: string }

// ---- 心情写入：先选一个情绪（必选），强度与附言都可选 ----
function MoodForm({ onSaved }: { onSaved: () => void }) {
  const [emoji, setEmoji] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [state, setState] = useState<WriteState>({ phase: 'idle' })

  const posting = state.phase === 'posting'
  const canSubmit = emoji !== null && !posting

  async function submit() {
    if (!emoji || posting) return
    setState({ phase: 'posting' })
    try {
      // 同一天重复提交是覆盖（契约 §4.4 幂等）：保留上次选中的 emoji 更顺手，不强制清空。
      await postMood({ emoji, level: level ?? undefined, note: note.trim() || undefined })
      setState({ phase: 'done', text: '今天的心情记下了。' })
      setNote('')
      setLevel(null)
      onSaved()
    } catch (e) {
      setState({
        phase: 'error',
        // Day 23：统一走三类错误的中文文案，不再自己拼兜底句（也不让英文原文上屏）
        text: toUserMessage(e),
      })
    }
  }

  return (
    <form className="write-card" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <p className="write-label">今天感觉怎么样？</p>
      <div className="chips" role="group" aria-label="选择一个心情">
        {MOODS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`chip${emoji === m.id ? ' chip-on' : ''}`}
            aria-pressed={emoji === m.id}
            onClick={() => setEmoji(m.id)}
          >
            <span aria-hidden="true">{m.glyph}</span> {m.label}
          </button>
        ))}
      </div>

      <label className="write-strength">
        这股感觉有多强？（可选）
        <span className="strength-row" role="group" aria-label="强度 1 到 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              className={`pip${level === n ? ' pip-on' : ''}`}
              aria-pressed={level === n}
              aria-label={`强度 ${n}`}
              onClick={() => setLevel(n)}
            >
              {n}
            </button>
          ))}
        </span>
      </label>

      <textarea
        className="write-area"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="还想说点什么，随便写几句，不写也行。"
        rows={3}
      />

      <div className="write-actions">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {posting ? '记下…' : '记一笔'}
        </button>
        {state.phase === 'done' && <span className="write-hint write-hint-ok">{state.text}</span>}
        {state.phase === 'error' && <span className="write-hint">{state.text}</span>}
      </div>
    </form>
  )
}

// ---- 小进步写入：一句话就行，一天可记多件（契约 §4.5）----
function NoteForm({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<WriteState>({ phase: 'idle' })

  const posting = state.phase === 'posting'
  const canSubmit = text.trim().length > 0 && !posting

  async function submit() {
    const t = text.trim()
    if (!t || posting) return
    setState({ phase: 'posting' })
    try {
      await postNote({ text: t })
      setState({ phase: 'done', text: '小进步记下了。' })
      setText('')
      onSaved()
    } catch (e) {
      setState({
        phase: 'error',
        // Day 23：统一走三类错误的中文文案，不再自己拼兜底句（也不让英文原文上屏）
        text: toUserMessage(e),
      })
    }
  }

  return (
    <form className="write-card" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <label className="write-label" htmlFor="note-input">
        今天往前走了一小步？
      </label>
      <textarea
        id="note-input"
        className="write-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="再小的事也是往前走，写一句。"
        rows={3}
      />
      <div className="write-actions">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {posting ? '记下…' : '记一笔'}
        </button>
        {state.phase === 'done' && <span className="write-hint write-hint-ok">{state.text}</span>}
        {state.phase === 'error' && <span className="write-hint">{state.text}</span>}
      </div>
    </form>
  )
}

// 删除态：idle / deleting / error。删完由父组件刷新列表，这里只管按钮与提示。
type DeleteState = { phase: 'idle' } | { phase: 'deleting'; id: string } | { phase: 'error'; text: string }

function MoodCard({
  m,
  disabled,
  onDelete,
}: {
  m: MoodRow
  disabled: boolean
  onDelete: (id: string) => void
}) {
  const meta = moodMeta(m.emoji)
  return (
    <li className="feed-item">
      <span className="feed-emoji" aria-hidden="true">
        {meta.glyph}
      </span>
      <div className="feed-body">
        <div className="feed-head">
          <span className="feed-date">{m.date}</span>
          {/* emoji 是契约白名单 id，界面文字在这里才映射出来（data/moods.ts，全站唯一一处） */}
          <span className="feed-mood">{meta.label}</span>
          {/* level 可空：没打分的人就不展示这一格，不为空数据硬占位。
              文案是「强度」不是「得分」——契约 §5.2：1 和 5 只是强度两端，没有哪端更好 */}
          {typeof m.level === 'number' && <span className="feed-tag">强度 {m.level}/5</span>}
        </div>
        {m.note && <p className="feed-note">{m.note}</p>}
      </div>
      {/* Day 22：删除按钮。真正的「二次确认」在父组件的 onDelete 里用 window.confirm 实现——
          一次点击表达意图，一次确认才真正发请求，避免手滑删掉一条记录。 */}
      <button
        type="button"
        className="feed-del"
        disabled={disabled}
        aria-label="删除这条心情记录"
        onClick={() => onDelete(m.id)}
      >
        删除
      </button>
    </li>
  )
}

function NoteCard({ n }: { n: NoteRow }) {
  return (
    <li className="feed-item">
      <span className="feed-emoji" aria-hidden="true">
        ✶
      </span>
      <div className="feed-body">
        <div className="feed-head">
          <span className="feed-date">{n.date}</span>
        </div>
        {n.text && <p className="feed-note">{n.text}</p>}
      </div>
    </li>
  )
}

function Daily() {
  usePageTitle('写一写')
  const moods = useListData(fetchMoods)
  const notes = useListData(fetchNotes)
  const [del, setDel] = useState<DeleteState>({ phase: 'idle' })

  // 删除一条心情：先 window.confirm 二次确认（Day 22），确认后才发请求，
  // 成功后刷新列表——软删除后这条就不会再出现在 GET 结果里。
  async function handleDeleteMood(id: string) {
    if (del.phase === 'deleting') return
    if (!window.confirm('确定删除这条心情记录吗？\n删除后列表里会立刻消失，但后台保留、可找回。')) {
      return
    }
    setDel({ phase: 'deleting', id })
    try {
      await deleteMood(id)
      setDel({ phase: 'idle' })
      moods.retry() // 重新拉列表，删掉的不再出现
    } catch (e) {
      setDel({ phase: 'error', text: toUserMessage(e) })
    }
  }

  const deletingId = del.phase === 'deleting' ? del.id : null

  return (
    <>
      <section className="zone">
        <h2>今天的心情</h2>
        <p className="zone-tip">记一笔今天的状态，想写就写，不写也行。</p>

        <MoodForm onSaved={moods.retry} />

        {moods.status === 'loading' && <ListLoading label="正在取回心情记录" />}
        {moods.status === 'error' && <ListError onRetry={moods.retry} />}
        {moods.status === 'ready' && moods.data.length === 0 && (
          <ListEmpty>还没有心情记录，今天可以记一笔。</ListEmpty>
        )}
        {moods.status === 'ready' && moods.data.length > 0 && (
          <ul className="feed-list">
            {moods.data.map((m) => (
              <MoodCard key={m.id} m={m} disabled={deletingId !== null} onDelete={handleDeleteMood} />
            ))}
          </ul>
        )}
        {del.phase === 'error' && <p className="write-hint">{del.text}</p>}
      </section>

      <section className="zone">
        <h2>小进步</h2>
        <p className="zone-tip">再小的事也是往前走。</p>

        <NoteForm onSaved={notes.retry} />

        {notes.status === 'loading' && <ListLoading label="正在取回小进步" />}
        {notes.status === 'error' && <ListError onRetry={notes.retry} />}
        {notes.status === 'ready' && notes.data.length === 0 && (
          <ListEmpty>还没有记下小进步。</ListEmpty>
        )}
        {notes.status === 'ready' && notes.data.length > 0 && (
          <ul className="feed-list">
            {notes.data.map((n) => (
              <NoteCard key={n.id} n={n} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export default Daily
