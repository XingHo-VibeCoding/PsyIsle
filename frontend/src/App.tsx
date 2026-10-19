import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import Home from './pages/Home'
import Help from './pages/Help'
import Breathe from './pages/Breathe'
import Guide from './pages/Guide'
import LibraryView from './pages/guide/LibraryView'
import TasksView from './pages/guide/TasksView'
import AssessView from './pages/guide/AssessView'
import About from './pages/About'
import Daily from './pages/Daily'
import UnderConstruction from './pages/UnderConstruction'
import Suggest from './pages/Suggest'
import Comfort from './pages/Comfort'
import AiView from './pages/AiView'
import Fireflies from './components/Fireflies'
import AuthPanel from './components/AuthPanel'
import AnonymousNotice from './components/AnonymousNotice'
import { getAuthState, subscribe, type AuthState } from './lib/auth'

// 导航布局（2026-10-19）：
//  · 左上角放「访客（匿名）」小徽标，随登录态变化，不占太多空间；
//  · 右上角归一组：AI 之后是「求助」「提建议」（求助仍全站 1 次点击可达，红线不可砍）；
//  · 登录入口（AuthPanel）匿名态显示「登录」，避免在左上角徽标之外再重复念一遍「访客」。
function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState)
}

// 徽标的字与说明（2026-10-19 修）：
// 原先四个状态共用一句「访客身份：……绑个邮箱可以跟着账号走」，两处都不准：
//   1. 已登录 / 未连接 / 连接中的人，鼠标停上去看到的还是「访客身份」，说的不是他自己；
//   2. 「绑个邮箱可以跟着账号走」眼下兑现不了 —— 邮箱走的是 signUp，是另一个 uid，
//      匿名名下写过的记录不会自己并过去（真要转正得接 CloudBase 的账户关联 / updateEmail）。
// 所以按状态各写一句，只写此刻确实成立的事。说明同时给 title 和读屏（sr-only）。
interface BadgeCopy {
  label: string
  hint: string
}

function badgeCopy(state: AuthState): BadgeCopy {
  if (!state.ready) {
    return { label: '连接中…', hint: '正在连上云端，稍等一下。' }
  }
  if (state.mode === 'password') {
    return {
      label: '已登录',
      hint: state.email
        ? `已用邮箱 ${state.email} 登录：此后写下的记录跟着这个账号走，换设备登录同一个邮箱也能看到。`
        : '已登录账号：此后写下的记录跟着这个账号走，换设备登录同一个账号也能看到。',
    }
  }
  if (state.mode === 'anonymous') {
    return {
      label: '访客（匿名）',
      hint: '匿名身份：记录存在云端，但这个身份只认这台浏览器里的登录状态。换设备，或者清理浏览器数据，之前写的就找不回来了。',
    }
  }
  return {
    label: '未连接',
    hint: '没有连上云端：现在读不到、也存不了记录。刷新一下页面试试。',
  }
}

function VisitorBadge() {
  const state = useAuth()
  const { label, hint } = badgeCopy(state)
  return (
    <span className="visitor-badge" title={hint}>
      {/* 手机上括号会把这枚徽标撑到 90px、挤掉一个导航位，所以「（匿名）」单独包一层，
          窄屏只留「访客」两个字：信息没少（title 与读屏文案仍在），只是不再抢位置 */}
      {state.mode === 'anonymous' ? (
        <>
          访客<span className="visitor-badge-tail">（匿名）</span>
        </>
      ) : (
        label
      )}
      {/* span + title 在多数读屏里不朗读，补一份只给读屏的完整说明 */}
      <span className="sr-only">：{hint}</span>
    </span>
  )
}

// 导航 = 三扇门 + 求助。名字统一用户视角（听你说/找方向/写一写），
// 不用「功能/板块/专区」这类行业词，也全站只保留这一套称呼（改名必须连 PRD 一起想，别留两个名字）。
// 首页是整幅插画场景（app-immersive）：导航浮在画面上、页脚隐藏；
// 危机入口仍由导航「求助」保证全站 1 次点击可达，其余页面页脚兜底不变。
// 用 NavLink 而不是 Link：当前所在页由 aria-current 标出来（读屏可读），
// 颜色 + 字重随之变化，不必为「我在哪一页」再想一套视觉。
function App() {
  const { pathname } = useLocation()
  return (
    <div className={pathname === '/' ? 'app app-immersive' : 'app'}>
      <nav className="nav" aria-label="全站导航">
        <VisitorBadge />
        <Link to="/" className="logo">心汐</Link>
        <NavLink to="/talk">听你说</NavLink>
        <NavLink to="/guide">找方向</NavLink>
        <NavLink to="/daily">写一写</NavLink>
        <NavLink to="/ai">AI</NavLink>
        {/* 危机入口常驻导航：全站任意页 1 次点击可达，永久不可砍 */}
        <NavLink to="/help" className="nav-help">求助</NavLink>
        {/* 提建议：放在求助右边，鼓励用户反馈；纯本地收集，不触碰危机红线 */}
        <NavLink to="/suggest">提建议</NavLink>
        {/* 登录入口：启动即匿名自动登录，点开可升级为邮箱账号（Day 26 接登录） */}
        <AuthPanel />
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          {/* 听你说与写一写按排期还没轮到，先占位（不做出死路：能回首页、能到危机页） */}
          <Route path="/talk" element={<UnderConstruction name="听你说" />} />
          {/* 找方向：阶段 1（课程 Day 7–12）做内容层——主题多选 + 行动小任务 + 书影音 + 小测评，
              全部是静态内容，零依赖。三个子视图走嵌套路由切换：地址栏能直接落到某一个子视图，
              返回键与刷新都照常工作。 */}
          <Route path="/guide" element={<Guide />}>
            <Route index element={<TasksView />} />
            <Route path="library" element={<LibraryView />} />
            {/* 小测评（2026-10-19 补内容）：无评分自测，不破红线 */}
            <Route path="check" element={<AssessView />} />
          </Route>
          {/* 写一写：Day 17 接入云端真实读接口（心情打卡 + 小进步） */}
          <Route path="/daily" element={<Daily />} />
          {/* 我 emo 了 · 安慰卡（2026-10-19 从找方向移出，独立成页，抽屉式滑动） */}
          <Route path="/comfort" element={<Comfort />} />
          {/* AI 板块（2026-10-19 新增）：本地聚类归纳，不生成内容、不破红线 */}
          <Route path="/ai" element={<AiView />} />
          {/* 已实现页面原样沿用：危机页不可砍；呼吸练习已并入「找方向 · 行动小任务」 */}
          <Route path="/help" element={<Help />} />
          <Route path="/breathe" element={<Breathe />} />
          <Route path="/about" element={<About />} />
          <Route path="/suggest" element={<Suggest />} />
          <Route path="*" element={<UnderConstruction name="你要找的页面" />} />
        </Routes>
      </main>

      {/* 匿名存储提示（2026-10-19）：只在「要存东西」的页面、且还是访客身份、
          且没做过选择时浮出来一次（见 components/AnonymousNotice.tsx）。
          挂在 main 之后，位置与 Fireflies 同级，避免被页面内的 overflow 裁掉。 */}
      <AnonymousNotice />

      {/* 萤火层挂在 .app 里、.main 之后：同一个父层下的 DOM 顺序就是它的层序。
          z-index:-1 把它放进根堆叠层的负层，于是首页浮在插画与薄纱之上、
          内页躲在实心白卡之下（卡片是不透明的，粒子只在留白里看得见，不会爬到字上）。
          它不承载任何信息，所以 aria-hidden 且不可点。 */}
      <Fireflies />

      <footer className="footer">
        {/* 页脚兜底危机入口：除首页（画面里由导航承担）外的所有页面都在 */}
        <Link to="/help" className="footer-help">需要马上找人说说？点这里</Link>
        <p>
          <Link to="/about" className="footer-about">关于与免责</Link>
        </p>
        <p>本站不提供医疗诊断与治疗，不替代专业帮助。</p>
      </footer>
    </div>
  )
}

export default App
