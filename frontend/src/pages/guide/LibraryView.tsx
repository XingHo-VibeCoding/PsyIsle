import { useMemo, useState } from 'react'
import { ListEmpty, ListError, ListLoading } from '../../components/ListStates'
import { fetchLibrary } from '../../lib/api'
import { kindLabel, kindOrder, type LibraryItem, type LibraryKind } from '../../data/library'
import { matchThemes } from '../../data/themes'
import { readJson, writeJson } from '../../lib/storage'
import { useListData } from '../../lib/useListData'
import { usePageTitle } from '../../lib/usePageTitle'
import { useGuideThemes } from './context'

// 找方向 · 书影音（子视图二）
// 主题是「我在意什么」（长期），类型是「我此刻想看哪种」（当次），两把尺子分开存、互不干扰。
const KIND_KEY = 'xinyu.guide.kind'

type KindFilter = LibraryKind | 'all'

const kindOptions: { id: KindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  ...kindOrder.map((k) => ({ id: k, label: kindLabel[k] })),
]

// 本地存的值可能被手改过或来自旧版本，先校验再进 state——
// 坏值只该安静地退回默认，不该让整页白掉
const readKind = (): KindFilter => {
  const saved = readJson<KindFilter>(KIND_KEY)
  return saved === 'all' || kindOrder.includes(saved as LibraryKind) ? (saved as KindFilter) : 'all'
}

// 封面：有图用图；图挂了或没有图，退回同族渐变占位（绝不破图）
function LibCover({ item }: { item: LibraryItem }) {
  const [err, setErr] = useState(false)
  const showImg = Boolean(item.cover) && !err
  return (
    <div className={`lib-cover lib-cover-${item.kind}`}>
      {showImg ? (
        <img src={item.cover} alt="" loading="lazy" onError={() => setErr(true)} />
      ) : (
        <span className="lib-cover-ph">{kindLabel[item.kind]}</span>
      )}
    </div>
  )
}

function LibraryView() {
  usePageTitle('书影音')
  const { picked, clearThemes } = useGuideThemes()
  const { status, data: items, retry } = useListData(fetchLibrary)
  const [kind, setKind] = useState<KindFilter>(readKind)

  const visible = useMemo(
    () => items.filter((i) => matchThemes(i.themes, picked) && (kind === 'all' || i.kind === kind)),
    [items, picked, kind],
  )

  const pickKind = (next: KindFilter) => {
    setKind(next)
    writeJson(KIND_KEY, next)
  }

  // 空态的退路从窄到宽：先放开当次筛选（类型），再放开长期筛选（主题）。
  // 直接把用户勾的主题清掉太粗暴，所以类型能放就绝不动主题。
  const emptyAction =
    kind !== 'all' ? (
      <button type="button" className="btn btn-quiet" onClick={() => pickKind('all')}>
        看全部类型
      </button>
    ) : picked.length > 0 ? (
      <button type="button" className="btn btn-quiet" onClick={clearThemes}>
        不按主题筛
      </button>
    ) : undefined

  return (
    <section className="zone zone-flat">
      <h2>可以看看这些</h2>
      <p className="zone-tip">只给条目和一句话，不用写读后感，看完也不用告诉谁。点卡片去你常用的地方看。</p>

      <div className="chips" role="group" aria-label="按类型筛选">
        {kindOptions.map((k) => {
          const on = kind === k.id
          return (
            <button
              key={k.id}
              type="button"
              className={on ? 'chip chip-on' : 'chip'}
              aria-pressed={on}
              onClick={() => pickKind(k.id)}
            >
              {k.label}
            </button>
          )
        })}
      </div>

      {status === 'loading' && <ListLoading label="正在取回条目" />}
      {status === 'error' && <ListError onRetry={retry} />}

      {status === 'ready' && visible.length === 0 && (
        <ListEmpty action={emptyAction}>这个条件下暂时没有条目，换个条件看看。</ListEmpty>
      )}

      {status === 'ready' &&
        kindOrder.map((group) => {
          const groupItems = visible.filter((i) => i.kind === group)
          if (groupItems.length === 0) return null
          return (
            <div key={group} className="lib-group">
              <h3 className="lib-kind">{kindLabel[group]}</h3>
              <ul className="lib-grid">
                {groupItems.map((item) => (
                  <li key={item.id} className="lib-card-wrap">
                    <a
                      className="lib-card"
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <LibCover item={item} />
                      <div className="lib-body">
                        <div className="lib-head">
                          <strong>{item.title}</strong>
                          <span className="lib-by">{item.by}</span>
                        </div>
                        <p className="lib-note">{item.note}</p>
                        <span className="lib-go">去看看 ›</span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
    </section>
  )
}

export default LibraryView
