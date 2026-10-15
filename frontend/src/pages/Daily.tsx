import { usePageTitle } from '../lib/usePageTitle'
import { useListData } from '../lib/useListData'
import { ListLoading, ListError, ListEmpty } from '../components/ListStates'
import { fetchMoods, fetchNotes, type MoodRow, type NoteRow } from '../lib/api'

// 写一写 · 心情打卡 + 小进步（Day 17 正式接入云端真实读接口）。
// 两张表各是一个独立列表，各自走 loading/error/empty/ready 四态——
// 一块取不回来不影响另一块，也不用把两个请求捏成一个（捏了反而一损俱损）。

function MoodCard({ m }: { m: MoodRow }) {
  return (
    <li className="feed-item">
      <span className="feed-emoji" aria-hidden="true">
        {m.emoji ?? '🌿'}
      </span>
      <div className="feed-body">
        <div className="feed-head">
          <span className="feed-date">{m.date}</span>
          {/* level 可空：没打分的人就不展示这一格，不为空数据硬占位 */}
          {typeof m.level === 'number' && <span className="feed-tag">心情 {m.level}/5</span>}
        </div>
        {m.note && <p className="feed-note">{m.note}</p>}
      </div>
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

  return (
    <>
      <section className="zone">
        <h2>今天的心情</h2>
        <p className="zone-tip">记一笔今天的状态，想写就写，不写也行。</p>

        {moods.status === 'loading' && <ListLoading label="正在取回心情记录" />}
        {moods.status === 'error' && <ListError onRetry={moods.retry} />}
        {moods.status === 'ready' && moods.data.length === 0 && (
          <ListEmpty>还没有心情记录，今天可以记一笔。</ListEmpty>
        )}
        {moods.status === 'ready' && moods.data.length > 0 && (
          <ul className="feed-list">
            {moods.data.map((m) => (
              <MoodCard key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>

      <section className="zone">
        <h2>小进步</h2>
        <p className="zone-tip">再小的事也是往前走。</p>

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
