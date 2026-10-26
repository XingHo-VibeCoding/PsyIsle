// 主题 = 找方向的筛选轴（PRD v5.0「灵活多选」）：
// 用户勾选「我现在关心什么」，行动小任务与书影音两条线都跟着它走。
// 只做筛选，不做统计——不存在「你的主题分布」，那属于诊断。

// 2026-10-20 扩到 8 个（真人试用反馈④：「你现在在意什么？选项太少」）。
// 新增三个都对着大学生日常：累与压力（学业/打工/内卷）、家人（最常被略过的一块）、
// 选择（毕业/前路/犹豫不决）。扩轴的同时必须给存量内容补标签——
// 空主题筛不出东西，比选项少更让人困惑。

export type ThemeId =
  | 'lonely'
  | 'meaning'
  | 'worth'
  | 'relation'
  | 'loss'
  | 'stress'
  | 'family'
  | 'future'

export type Theme = { id: ThemeId; label: string }

export const themes: Theme[] = [
  { id: 'lonely', label: '孤独' },
  { id: 'meaning', label: '意义' },
  { id: 'worth', label: '自我价值' },
  { id: 'relation', label: '关系' },
  { id: 'loss', label: '失去' },
  { id: 'stress', label: '累与压力' },
  { id: 'family', label: '家人' },
  { id: 'future', label: '选择' },
]

export const themeLabel = (id: ThemeId): string =>
  themes.find((t) => t.id === id)?.label ?? ''

// 选中集合为空 = 不筛选，全部都看。不做「至少选一个」的强制
export const matchThemes = (itemThemes: ThemeId[], picked: ThemeId[]): boolean =>
  picked.length === 0 || itemThemes.some((t) => picked.includes(t))
