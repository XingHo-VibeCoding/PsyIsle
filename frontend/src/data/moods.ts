// 情绪白名单 —— 契约 api-contract.md §5.2 与数据库 moods_emoji_known 约束共用同一份 id。
// 接口返回的 emoji 字段是这里的 id（不是 emoji 字符）：字符在不同设备上渲染不一样，id 不会。
// 界面文字与装饰 glyph 只在这一处定义，页面不另起名。
//
// ⚠️ level 的语义（契约 §5.2）：它是「这股感觉有多强」（1–5），不是好坏打分——
// 1 和 5 只是强度两端，没有哪端更好。所以界面文案用「强度」，不用「心情指数」「得分」这类词。

export type MoodMeta = {
  /** 契约白名单 id，与数据库 CHECK 约束同一串 */
  id: string
  /** 界面文字 */
  label: string
  /** 装饰用字形（aria-hidden，不承载信息；设备渲染差异由 id 与文字兜底） */
  glyph: string
}

export const MOODS: MoodMeta[] = [
  { id: 'calm', label: '平静', glyph: '🌿' },
  { id: 'warm', label: '温暖', glyph: '✨' },
  { id: 'tired', label: '疲惫', glyph: '🌙' },
  { id: 'low', label: '低落', glyph: '🍃' },
  { id: 'anxious', label: '不安', glyph: '🌊' },
  { id: 'upset', label: '烦躁', glyph: '🌬️' },
  { id: 'empty', label: '空空的', glyph: '🌫️' },
]

const BY_ID = new Map(MOODS.map((m) => [m.id, m]))

/** 查不到时不抛错：给一个中性默认，页面照常渲染（契约没有「未知 id」这种错误态） */
export function moodMeta(id: string | null): MoodMeta {
  return (id && BY_ID.get(id)) || { id: id ?? '', label: '今天', glyph: '🌿' }
}
