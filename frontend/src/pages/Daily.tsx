import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
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

// 写一写 · 心情 + 小进步
//
// 2026-10-19 改版：从「两张并排的大表单」收敛成一个主表单 + 一条轻量入口。
// 改前三屏里有两个几乎等重的写入口（心情 / 小进步），各带标题、说明、输入框和
// 同一个「记一笔」按钮 —— 用户第一眼要先做一次「我该用哪个」的判断，而这件事
// 本来不该由他判断。现在：
//   · 心情是主表单（一屏只留一个 textarea、一个提交按钮）；
//   · 小进步是一条单行入口（回车即记），视觉重量降到「顺带」；
//   · 两段列表合成一条时间流，按「今天 / 昨天 / 日期」分组，用筛选切心情或小进步。
// 数据的读写语义一律没动：仍是 moods / notes 两张表，moods 同日覆盖、notes 一天可多件。

// 写入提交态：idle / posting / done / error。
// 业务错误走统一信封（契约 §3），这里只接 message 给用户看；提示不靠红色（产品红线），
// 成功用 forest 安抚色、失败退回无彩 + 换文案，和全站错误态同一套表达。
type WriteState =
  | { phase: 'idle' }
  | { phase: 'posting' }
  | { phase: 'done'; text: string }
  | { phase: 'error'; text: string }

// ---- 主表单：今天的心情（emoji 必选，强度与附言可选）----
function MoodCompose({ onSaved }: { onSaved: () => void }) {
  const [emoji, setEmoji] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [note, setNote] = useState('')
  // 强度是可选信息，默认不占位：「加个强度」点开才出现 1–5。
  // 大学生一天里绝大多数时候只想点个表情就完事，不该先被五个数字拦住。
  const [showLevel, setShowLevel] = useState(false)
  const [state, setState] = useState<WriteState>({ phase: 'idle' })

  const posting = state.phase === 'posting'
  const canSubmit = emoji !== null && !posting
  const picked = emoji ? moodMeta(emoji) : null

  async function submit() {
    if (!emoji || posting) return
    setState({ phase: 'posting' })
    try {
      // 同一天重复提交是覆盖（契约 §4.4 幂等）：emoji 保留不清空，
      // 想改就再点一次 —— 提示语把这层语义直接说给用户听，不用「幂等」这种词。
      await postMood({ emoji, level: level ?? undefined, note: note.trim() || undefined })
      setState({ phase: 'done', text: '记下了。想改，再点一次就行。' })
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
    <form
      className="compose"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h2 className="compose-title">今天感觉怎么样？</h2>

      {/* 七个情绪一行排开：点一下就是一次完整的记录，不用再读一遍说明 */}
      <div className="mood-row" role="group" aria-label="选一个最接近的心情">
        {MOODS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={`mood-dot${emoji === m.id ? ' mood-dot-on' : ''}`}
            aria-pressed={emoji === m.id}
            aria-label={m.label}
            onClick={() => setEmoji(m.id)}
          >
            <span aria-hidden="true">{m.glyph}</span>
          </button>
        ))}
      </div>

      {/* 选完才出文字：没选时这里是一句很轻的提示，不逼人先做决定 */}
      <p className={`compose-sub${picked ? ' compose-sub-on' : ''}`} aria-live="polite">
        {picked ? (
          <>
            今天：<b>{picked.label}</b>
            {typeof level === 'number' && ` · 强度 ${level}/5`}
          </>
        ) : (
          '点一个最接近的就行，不用想太久。'
        )}
      </p>

      <textarea
        className="write-area"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="想说点什么？一句话就够了，不写也行。"
        rows={2}
        maxLength={280}
      />

      <div className="compose-foot">
        {typeof level === 'number' || showLevel ? (
          <div className="strength-row" role="group" aria-label="强度 1 到 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                className={`pip${level === n ? ' pip-on' : ''}`}
                aria-pressed={level === n}
                aria-label={`强度 ${n}`}
                onClick={() => setLevel(level === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="compose-link" onClick={() => setShowLevel(true)}>
            加个强度（可选）
          </button>
        )}

        <button type="submit" className="btn btn-primary compose-submit" disabled={!canSubmit}>
          {posting ? '记下…' : '记下今天'}
        </button>
      </div>

      {/* 写了字但还没点心情：把「为什么按不动」说清楚，不做成点了没反应 */}
      {!emoji && note.trim().length > 0 && (
        <p className="compose-nudge">再点一个心情，就能记下来了。</p>
      )}
      {state.phase === 'done' && (
        <p className="write-hint write-hint-ok" role="status">
          {state.text}
        </p>
      )}
      {state.phase === 'error' && (
        <p className="write-hint" role="alert">
          {state.text}
        </p>
      )}
    </form>
  )
}

// ---- 轻量入口：一句话小进步（回车即记，占一行）----
function NoteQuick({ onSaved }: { onSaved: () => void }) {
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
      setState({ phase: 'done', text: '记下了。' })
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
    <form
      className="note-quick"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="note-quick-row">
        {/* 星点符号和下方时间流里「小进步」那一条同源，一眼就知道这条输入进哪一栏 */}
        <span className="note-quick-mark" aria-hidden="true">
          ✶
        </span>
        <label className="sr-only" htmlFor="note-quick-input">
          今天做成的一件小事
        </label>
        <input
          id="note-quick-input"
          className="note-quick-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="今天做成的一件小事？"
          maxLength={200}
          enterKeyHint="done"
        />
        <button type="submit" className="btn btn-quiet note-quick-btn" disabled={!canSubmit}>
          {posting ? '记下…' : '记下'}
        </button>
      </div>
      {state.phase === 'done' && (
        <p className="write-hint write-hint-ok note-quick-hint" role="status">
          {state.text}
        </p>
      )}
      {state.phase === 'error' && (
        <p className="write-hint note-quick-hint" role="alert">
          {state.text}
        </p>
      )}
    </form>
  )
}

// ---- 时间流：两张表合并成一条，按日期分组 ----
type Entry = { kind: 'mood'; row: MoodRow } | { kind: 'note'; row: NoteRow }
type FeedFilter = 'all' | 'mood' | 'note'

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'mood', label: '心情' },
  { id: 'note', label: '小进步' },
]

function pad(n: number): string {
  return `${n}`.padStart(2, '0')
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 日期说人话：今天 / 昨天 / 10月17日。
// 后端 date 是 +08:00 的日历日（契约 §4.2），这里只做展示换算，不参与任何统计。
function dayLabel(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const now = new Date()
  if (date === toYmd(now)) return '今天'
  if (date === toYmd(new Date(now.getTime() - 86400000))) return '昨天'
  const [y, m, d] = date.split('-')
  const md = `${Number(m)}月${Number(d)}日`
  return Number(y) === now.getFullYear() ? md : `${y}年${md}`
}

type DeleteState = { phase: 'idle' } | { phase: 'deleting'; id: string } | { phase: 'error'; text: string }

function FeedRow({
  entry,
  disabled,
  onDelete,
}: {
  entry: Entry
  disabled: boolean
  onDelete: (id: string) => void
}) {
  if (entry.kind === 'note') {
    return (
      <li className="feed-item">
        <span className="feed-emoji feed-emoji-note" aria-hidden="true">
          ✶
        </span>
        <div className="feed-body">
          {entry.row.text && <p className="feed-note">{entry.row.text}</p>}
        </div>
        {/* 小进步还没有删除接口（契约里只有 DELETE /api/moods），这一列留空只为对齐栅格 */}
        <span aria-hidden="true" />
      </li>
    )
  }

  const meta = moodMeta(entry.row.emoji)
  return (
    <li className="feed-item">
      <span className="feed-emoji" aria-hidden="true">
        {meta.glyph}
      </span>
      <div className="feed-body">
        <div className="feed-head">
          {/* emoji 是契约白名单 id，界面文字在这里才映射出来（data/moods.ts，全站唯一一处） */}
          <span className="feed-mood">{meta.label}</span>
          {/* 强度可空：没打分的人就不展示这一格，不为空数据硬占位 */}
          {typeof entry.row.level === 'number' && (
            <span className="feed-tag">强度 {entry.row.level}/5</span>
          )}
        </div>
        {entry.row.note && <p className="feed-note">{entry.row.note}</p>}
      </div>
      <div className="feed-act">
        <button
          type="button"
          className="icon-btn"
          disabled={disabled}
          aria-label="删除这条心情记录"
          onClick={() => onDelete(entry.row.id)}
        >
          <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

function Daily() {
  usePageTitle('写一写')
  const moods = useListData(fetchMoods)
  const notes = useListData(fetchNotes)
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [del, setDel] = useState<DeleteState>({ phase: 'idle' })

  // 记完回到「全部」，否则用户刚记的那条可能被当前筛选挡住 —— 会以为没记上。
  function refreshAll() {
    moods.retry()
    notes.retry()
    setFilter('all')
  }

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
      moods.retry()
    } catch (e) {
      setDel({ phase: 'error', text: toUserMessage(e) })
    }
  }

  const deletingId = del.phase === 'deleting' ? del.id : null

  // 合并 + 排序：date 倒序，同一天内按 created_at 倒序（契约只要求 date，这里是展示层的第二序）
  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [
      ...moods.data.map((row) => ({ kind: 'mood' as const, row })),
      ...notes.data.map((row) => ({ kind: 'note' as const, row })),
    ]
    return all.sort(
      (a, b) =>
        b.row.date.localeCompare(a.row.date) ||
        (b.row.createdAt ?? '').localeCompare(a.row.createdAt ?? ''),
    )
  }, [moods.data, notes.data])

  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter)

  // Map 的插入顺序就是日期倒序，分组不用再排一次
  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of shown) {
      const list = map.get(e.row.date)
      if (list) list.push(e)
      else map.set(e.row.date, [e])
    }
    return [...map.entries()]
  }, [shown])

  const bothLoading = moods.status === 'loading' && notes.status === 'loading'
  const bothError = moods.status === 'error' && notes.status === 'error'
  const partlyError = moods.status === 'error' || notes.status === 'error'

  return (
    <div className="page page-write">
      <header className="page-head">
        <h1>写一写</h1>
        <p className="page-sub">记一笔今天。三十秒，不写也行。</p>
      </header>

      <MoodCompose onSaved={refreshAll} />
      <NoteQuick onSaved={refreshAll} />

      <section className="feed">
        <div className="feed-toolbar">
          <h2>记过的</h2>
          <div className="feed-filter" role="group" aria-label="筛选记录">
            {FILTERS.map((f) => (
              <button
                type="button"
                key={f.id}
                className={`chip${filter === f.id ? ' chip-on' : ''}`}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 骨架只在「一条都还没有」时出现：记完一笔会重拉两张表，
            若每次刷新都把已有列表清掉再填回来，屏幕会闪一下，像没记上 */}
        {bothLoading && entries.length === 0 && <ListLoading label="正在取回记录" />}
        {bothError && entries.length === 0 && <ListError onRetry={refreshAll} />}

        {!bothLoading && !bothError && shown.length === 0 && (
          <ListEmpty>
            {filter === 'all'
              ? '还没有记录。今天随手点个心情，这里就有了。'
              : filter === 'mood'
                ? '还没记过心情。上面点一个就行。'
                : '还没记过小进步。再小的事也算。'}
          </ListEmpty>
        )}

        {shown.length > 0 &&
          groups.map(([date, items]) => (
            <section className="feed-day" key={date}>
              <h3 className="feed-day-label">{dayLabel(date)}</h3>
              <ul className="feed-list">
                {items.map((e) => (
                  <FeedRow
                    key={`${e.kind}-${e.row.id}`}
                    entry={e}
                    disabled={deletingId !== null}
                    onDelete={handleDeleteMood}
                  />
                ))}
              </ul>
            </section>
          ))}

        {/* 一半取回来了：先显示有的，别让一条链路挂了把整页清空 */}
        {partlyError && entries.length > 0 && (
          <p className="write-hint feed-partial">
            有一部分记录没取回来，过一会儿可以
            <button type="button" className="compose-link" onClick={refreshAll}>
              再试一次
            </button>
            。
          </p>
        )}

        {del.phase === 'error' && (
          <p className="write-hint" role="alert">
            {del.text}
          </p>
        )}
      </section>
    </div>
  )
}

export default Daily
