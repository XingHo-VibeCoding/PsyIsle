import { Link, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Help from './pages/Help'
import Breathe from './pages/Breathe'
import Guide from './pages/Guide'
import About from './pages/About'
import UnderConstruction from './pages/UnderConstruction'

// 导航 = 三个模块 + 求助。用产品语言（树洞/指路灯/管家），不用「功能/板块/专区」这类行业词
function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" className="logo">心屿</Link>
        <Link to="/talk">倾诉树洞</Link>
        <Link to="/guide">指路灯</Link>
        <Link to="/daily">日常管家</Link>
        {/* 危机入口常驻导航：全站任意页 1 次点击可达，永久不可砍 */}
        <Link to="/help" className="nav-help">求助</Link>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          {/* 树洞与管家按排期还没轮到，先占位（不做出死路：能回首页、能到危机页） */}
          <Route path="/talk" element={<UnderConstruction name="倾诉树洞" />} />
          {/* 指路灯：阶段 1（课程 Day 7–12）做内容层——主题多选 + 行动小任务 + 书影音，全部是静态内容，零依赖 */}
          <Route path="/guide" element={<Guide />} />
          <Route path="/daily" element={<UnderConstruction name="日常管家" />} />
          {/* 已实现页面原样沿用：危机页不可砍；呼吸练习已并入「指路灯 · 行动小任务」 */}
          <Route path="/help" element={<Help />} />
          <Route path="/breathe" element={<Breathe />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<UnderConstruction name="你要找的页面" />} />
        </Routes>
      </main>

      <footer className="footer">
        {/* 页脚常驻危机入口，全站位置恒定 */}
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
