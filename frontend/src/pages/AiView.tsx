import { useMemo } from 'react'
import { fetchMoods, fetchNotes } from '../lib/api'
import { themeLabel, themes, type ThemeId } from '../data/themes'
import { usePageTitle } from '../lib/usePageTitle'
import { ListEmpty, ListError, ListLoading } from '../components/ListStates'
import { useListData } from '../lib/useListData'

// AI 板块（2026-10-19 新增）
// 合规定位：项目红线禁止 AI 生成安慰 / 建议 / 解读，也不接外部大模型。
// 所以这里的「AI」只做**本地聚类归纳**——把你「写一写」里记下的片段，
// 按关键词归到几个在意的方向上，只整理、不判断、不给建议、不联网、不生成内容。
// 等你接了带鉴权的云函数，这一步可以换成真正的模型归纳，但产物形态不变。

const THEME_KEYWORDS: Record<ThemeId, string[]> = {
  lonely: ['孤独', '一个人', '孤单', '没人', '安静', '独处', '冷清'],
  meaning: ['意义', '想做', '喜欢', '有意思', '目标', '方向', '为什么', '值得'],
  worth: ['价值', '自信', '不行', '没用', '不够好', '值得', '肯定'],
  relation: ['朋友', '家人', '关系', '聊天', '陪伴', '某人', '联系'],
  loss: ['失去', '离开', '想念', '过去', '忘了', '遗憾', '走'],
}

// 没有真实记录时的示例，保证页面可演示；会明确标注「示例」。
const SAMPLE = [
  '今天一个人吃了顿很慢的饭，居然有点喜欢这种安静。',
  '不知道自己到底想做什么，方向越来越模糊。',
  '和朋友聊了几句，感觉没那么孤单了。',
  '翻到以前的照片，有点想念那时的自己。',
  '完成了一件小事，居然觉得还挺有价值。',
  '晚上又是一个人，房间太安静了。',
]

// 云端的 text / note 可空，这里收窄成“非空字符串”再送去聚类
const nonEmpty = (v: (string | null)[]): string[] =>
  v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)

// 取数走全站统一的 useListData（模块级函数＝稳定引用，不会重复请求）：
// 拿不到云端记录时返回示例，保证页面永远可演示。
const loadTexts = async (): Promise<string[]> => {
  const [n, m] = await Promise.allSettled([fetchNotes(), fetchMoods()])
  const got: string[] = []
  if (n.status === 'fulfilled') got.push(...nonEmpty(n.value.map((x) => x.text)))
  if (m.status === 'fulfilled') got.push(...nonEmpty(m.value.map((x) => x.note)))
  return got.length > 0 ? got : SAMPLE
}

function AiView() {
  usePageTitle('AI 整理')
  const { status, data: texts, retry } = useListData(loadTexts)
  // 引用相等即可判定：只有拿不到真实记录时 loadTexts 才会返回 SAMPLE 本身
  const isSample = texts === SAMPLE

  const clusters = useMemo(() => {
    const map: Record<ThemeId, string[]> = {
      lonely: [],
      meaning: [],
      worth: [],
      relation: [],
      loss: [],
    }
    const other: string[] = []
    for (const t of texts) {
      const hits = themes.filter((th) => THEME_KEYWORDS[th.id].some((k) => t.includes(k)))
      if (hits.length === 0) other.push(t)
      else hits.forEach((h) => map[h.id].push(t))
    }
    return { map, other }
  }, [texts])

  const active = themes.filter((t) => clusters.map[t.id].length > 0)

  return (
    <div className="page ai-page">
      <div className="page-head">
        <h1>AI 整理</h1>
        <p className="page-sub">
          本地整理，不联网、不生成内容。把你「写一写」里记下的片段，归到几个在意的方向上——
          只整理，不判断，也不给建议。
        </p>
      </div>

      {status === 'loading' && <ListLoading label="正在整理你的片段" />}
      {status === 'error' && <ListError onRetry={retry} />}

      {status === 'ready' && (
        <>
          {isSample && (
            <p className="ai-note">你还没有「写一写」的记录，下面先用示例演示整理效果。</p>
          )}

          {active.length === 0 && clusters.other.length === 0 ? (
            <ListEmpty>暂时没有可整理的内容。</ListEmpty>
          ) : (
            <>
              <p className="ai-lead">你最近在意的，大概是这几件事：</p>
              <div className="ai-clusters">
                {active.map((t) => (
                  <div key={t.id} className="card ai-cluster">
                    <span className="card-tag">{themeLabel(t.id)}</span>
                    <p className="ai-count">{clusters.map[t.id].length} 段相关</p>
                    <ul className="ai-snips">
                      {clusters.map[t.id].slice(0, 3).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {clusters.other.length > 0 && (
                  <div className="card ai-cluster">
                    <span className="card-tag">还没归类的</span>
                    <p className="ai-count">{clusters.other.length} 段</p>
                    <ul className="ai-snips">
                      {clusters.other.slice(0, 3).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          <p className="assess-warn">
            这只是把你的话归归类，不是分析你、也不是给你结论。想多记一点，去「写一写」。
          </p>
        </>
      )}
    </div>
  )
}

export default AiView
