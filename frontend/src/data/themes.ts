// 主题 = 指路灯的筛选轴（PRD v5.0「灵活多选」）：
// 用户勾选「我现在关心什么」，行动小任务与书影音两条线都跟着它走。
// 只做筛选，不做统计——不存在「你的主题分布」，那属于诊断。

export type ThemeId = 'lonely' | 'meaning' | 'worth' | 'relation' | 'loss'

export type Theme = { id: ThemeId; label: string }

export const themes: Theme[] = [
  { id: 'lonely', label: '孤独' },
  { id: 'meaning', label: '意义' },
  { id: 'worth', label: '自我价值' },
  { id: 'relation', label: '关系' },
  { id: 'loss', label: '失去' },
]

export const themeLabel = (id: ThemeId): string =>
  themes.find((t) => t.id === id)?.label ?? ''

// 选中集合为空 = 不筛选，全部都看。不做「至少选一个」的强制
export const matchThemes = (itemThemes: ThemeId[], picked: ThemeId[]): boolean =>
  picked.length === 0 || itemThemes.some((t) => picked.includes(t))
