import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { themes, type ThemeId } from '../data/themes'
import { readJson, writeJson } from '../lib/storage'
import type { GuideThemeContext } from './guide/context'

// 找方向（PRD v5.0 模块二）＝ 一个壳 + 三个子视图：行动小事 / 书影音 / 小测评。
// 子视图切换走嵌套路由（URL 是 /guide、/guide/library、/guide/check），不是页面内 state：
// 前进后退、刷新、分享链接、手机返回手势全都自动成立，也不需要在 App 里再挂一遍导航。
// 主题筛选（「我在意什么」）是三条线共用的轴，所以留在壳里常驻，切视图不重置。
const THEME_KEY = 'xinyu.guide.themes'

const subViews = [
  { to: '/guide', label: '行动小事', end: true },
  { to: '/guide/library', label: '书影音', end: false },
  { to: '/guide/check', label: '小测评', end: false },
]

function Guide() {
  const [picked, setPicked] = useState<ThemeId[]>(() => readJson<ThemeId[]>(THEME_KEY) ?? [])

  const toggleTheme = (id: ThemeId) => {
    const next = picked.includes(id) ? picked.filter((t) => t !== id) : [...picked, id]
    setPicked(next)
    writeJson(THEME_KEY, next)
  }

  // 空态里的「不按主题筛」要能真的把筛选放开，所以往下传一个清空动作，
  // 而不是让子视图自己去写 localStorage —— 写入口只有一个
  const clearThemes = () => {
    setPicked([])
    writeJson(THEME_KEY, [])
  }

  const context: GuideThemeContext = { picked, clearThemes }

  return (
    <div className="guide">
      <h1>找方向</h1>
      <p className="guide-sub">
        不知道该往哪走的时候，从这里挑一件。三样东西没有顺序，也不用都做。
      </p>

      <section className="zone zone-flat">
        <h2>你现在在意什么</h2>
        <p className="zone-tip">勾几个都行，一个不勾也行——不勾就全部都给你看</p>
        <div className="chips" role="group" aria-label="按主题筛选">
          {themes.map((t) => {
            const on = picked.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                className={on ? 'chip chip-on' : 'chip'}
                aria-pressed={on}
                onClick={() => toggleTheme(t.id)}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* 子导航：下划线式而不是胶囊式——胶囊在本页已经被主题/类型筛选占了，
          两处长得一样会让人分不清「这是在筛内容」还是「这是在换页」。
          aria-current="page" 由 NavLink 自动写，读屏用户也能听到当前在哪个分区。 */}
      <nav className="guide-tabs" aria-label="找方向的分区">
        {subViews.map((v) => (
          <NavLink key={v.to} to={v.to} end={v.end} className="guide-tab">
            {v.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={context} />

      <p className="guide-foot">
        这里的东西都不是必须做的。看完就关掉也没关系。
        <Link to="/help"> 如果现在很难熬，先看这里。</Link>
      </p>
    </div>
  )
}

export default Guide
