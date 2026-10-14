import { useOutletContext } from 'react-router-dom'
import type { ThemeId } from '../../data/themes'

// 「我在意什么」这条轴归找方向这一层持有，三个子视图共用（PRD v5.0「灵活多选」：
// 测评推荐 / 任务 / 内容三条线全部跟着它走）。状态只存一份、用 Outlet 往下传，
// 子视图各存一份的话，切一次视图用户勾的主题就会看起来「丢了」。
export type GuideThemeContext = {
  picked: ThemeId[]
  clearThemes: () => void
}

export const useGuideThemes = () => useOutletContext<GuideThemeContext>()
