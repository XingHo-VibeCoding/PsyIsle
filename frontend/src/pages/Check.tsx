import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePageTitle } from '../lib/usePageTitle'
import { useListData, useFetch } from '../lib/useListData'
import { ListLoading, ListError } from '../components/ListStates'
import { moodMeta } from '../data/moods'
import {
  fetchHealth,
  fetchMoods,
  fetchNotes,
  postTestNote,
  type MoodRow,
  type NoteRow,
} from '../lib/api'

// 检查台（Day 20）—— 开发验收用，不是产品功能：
// 一眼确认「浏览器 → 公网接口 → 数据库」这条管道通不通。
//   ① 健康状态：GET /api/health（契约 §4.1，探活接口不套信封）
//   ② 核心表真实数据：moods / progress_notes 各取回最近若干条（契约 §4.2 / §4.3）
//   ③ 写入测试：POST /api/notes 真写一条带标注的测试记录（契约 §4.5）
// 全站禁红色警示色（产品红线）：这里的「没通」也用中性色 + 说清怎么办 + 重试来表达。
// 三块数据各自走请求四态（useFetch / useListData）：一块取不回来不影响另外两块。

// 列表只展示最近几条：全量数据在 /daily 看，检查台要的是「管道通 + 数据是真的」。
const PREVIEW = 5

function MoodRowView({ m }: { m: MoodRow }) {
  const meta = moodMeta(m.emoji)
  return (
    <li className="feed-item">
      <span className="feed-emoji" aria-hidden="true">
        {meta.glyph}
      </span>
      <div className="feed-body">
        <div className="feed-head">
          <span className="feed-date">{m.date}</span>
          <span className="feed-mood">{meta.label}</span>
          {typeof m.level === 'number' && <span className="feed-tag">强度 {m.level}/5</span>}
        </div>
        {m.note && <p className="feed-note">{m.note}</p>}
      </div>
    </li>
  )
}

function NoteRowView({ n }: { n: NoteRow }) {
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

function Check() {
  usePageTitle('检查台')
  const health = useFetch(fetchHealth)
  const moods = useListData(fetchMoods)
  const notes = useListData(fetchNotes)

  // 「最后更新时间」：三块数据都成功回来的时刻。写入测试成功后也会刷新，时间跟着走。
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  useEffect(() => {
    if (health.status === 'ready' && moods.status === 'ready' && notes.status === 'ready') {
      setLastUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    }
  }, [health.status, moods.status, notes.status])

  const refreshAll = () => {
    health.retry()
    moods.retry()
    notes.retry()
  }

  const [write, setWrite] = useState<{ status: 'idle' | 'writing' | 'done' | 'error'; message: string }>(
    { status: 'idle', message: '' },
  )

  const runWriteTest = async () => {
    setWrite({ status: 'writing', message: '' })
    try {
      const item = await postTestNote()
      setWrite({
        status: 'done',
        message: `已写入 ${item.id}：「${item.text}」。下面两个列表已跟着刷新——这条就是刚写进去的。`,
      })
      refreshAll()
    } catch (e: unknown) {
      setWrite({ status: 'error', message: e instanceof Error ? e.message : '未知错误' })
    }
  }

  return (
    <div className="check">
      <h1>检查台</h1>
      <p className="check-sub">
        开发验收用，不是产品功能：确认「浏览器 → 公网接口 → 数据库」这条管道通不通。
        写入测试会真的往数据库里加一条记录，不是模拟。
      </p>

      <div className="check-bar">
        <button type="button" className="btn btn-quiet" onClick={refreshAll}>
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          刷新全部数据
        </button>
        <span className="check-meta">
          {lastUpdated ? `数据更新于 ${lastUpdated}` : '正在取第一波数据…'}
        </span>
      </div>

      <section className="zone zone-flat">
        <h2>① 管道通不通</h2>
        <p className="zone-tip">GET /api/health —— 契约里的探活接口，给人和监控扫一眼用。</p>
        {health.status === 'loading' && <ListLoading label="正在确认健康状态" />}
        {health.status === 'error' && <ListError onRetry={health.retry} />}
        {health.status === 'ready' && health.data && (
          <div className="check-ok" role="status">
            <span className="check-dot" aria-hidden="true" />
            <span>
              管道正常 · service={health.data.service} · version={health.data.version} ·
              服务端时间 {health.data.time}
            </span>
          </div>
        )}
      </section>

      <section className="zone zone-flat">
        <h2>
          ② 核心表真实数据<span className="check-count">moods 心情打卡</span>
        </h2>
        <p className="zone-tip">GET /api/moods —— 数据库 public.moods 的真实行，按 date 倒序。</p>
        {moods.status === 'loading' && <ListLoading label="正在取回心情打卡" />}
        {moods.status === 'error' && <ListError onRetry={moods.retry} />}
        {moods.status === 'ready' && (
          <>
            <p className="check-count-line">取回 {moods.data.length} 条{moods.data.length > PREVIEW ? `（显示最近 ${PREVIEW} 条）` : ''}</p>
            {moods.data.length === 0 ? (
              <p className="check-count-line">表里暂时没有行——去控制台插一条，再点「刷新全部数据」。</p>
            ) : (
              <ul className="feed-list">
                {moods.data.slice(0, PREVIEW).map((m) => (
                  <MoodRowView key={m.id} m={m} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="zone zone-flat">
        <h2>
          ② 核心表真实数据<span className="check-count">progress_notes 小进步</span>
        </h2>
        <p className="zone-tip">GET /api/notes —— 数据库 public.progress_notes 的真实行，按 date 倒序。</p>
        {notes.status === 'loading' && <ListLoading label="正在取回小进步" />}
        {notes.status === 'error' && <ListError onRetry={notes.retry} />}
        {notes.status === 'ready' && (
          <>
            <p className="check-count-line">取回 {notes.data.length} 条{notes.data.length > PREVIEW ? `（显示最近 ${PREVIEW} 条）` : ''}</p>
            {notes.data.length === 0 ? (
              <p className="check-count-line">表里暂时没有行——用下面的写入测试写一条，列表会跟着多一行。</p>
            ) : (
              <ul className="feed-list">
                {notes.data.slice(0, PREVIEW).map((n) => (
                  <NoteRowView key={n.id} n={n} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="zone zone-flat">
        <h2>③ 写入测试（真写库）</h2>
        <p className="zone-tip">
          POST /api/notes —— 往 progress_notes 追加一条「检查台写入测试 · 时间」。
          刻意不测 moods：moods 同一天重复提交是覆盖（契约 §4.4 幂等），会抹掉当天的演示打卡；
          notes 一天可记多件（契约 §4.5），测试记录只追加、不破坏现有数据。
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={runWriteTest}
          disabled={write.status === 'writing'}
        >
          {write.status === 'writing' ? '正在写入…' : '写一条测试小进步'}
        </button>
        {write.status === 'done' && (
          <p className="check-write-msg check-write-ok" role="status">
            {write.message}
          </p>
        )}
        {write.status === 'error' && (
          <p className="check-write-msg" role="alert">
            没写进去：{write.message}。可以再点一次按钮重试。
          </p>
        )}
      </section>
    </div>
  )
}

export default Check
