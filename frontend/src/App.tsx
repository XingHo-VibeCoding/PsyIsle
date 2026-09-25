import { Link, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Help from './pages/Help'
import Breathe from './pages/Breathe'
import UnderConstruction from './pages/UnderConstruction'

function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" className="logo">心屿</Link>
        <Link to="/assessments">测评</Link>
        <Link to="/articles">知识库</Link>
        <Link to="/about">关于</Link>
        {/* 危机入口常驻导航：全站任意页 1 次点击可达，永久不可砍 */}
        <Link to="/help" className="nav-help">求助</Link>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/help" element={<Help />} />
          {/* 13 个页面路由先全部占位，后续按任务逐个替换 */}
          <Route path="/assessments" element={<UnderConstruction name="测评总览" />} />
          <Route path="/test" element={<UnderConstruction name="大五人格测评" />} />
          <Route path="/result" element={<UnderConstruction name="测评结果" />} />
          <Route path="/result-light" element={<UnderConstruction name="轻量表结果" />} />
          <Route path="/checkup" element={<UnderConstruction name="情绪自评" />} />
          <Route path="/breathe" element={<Breathe />} />
          <Route path="/abc" element={<UnderConstruction name="认知纠正" />} />
          <Route path="/records" element={<UnderConstruction name="我的记录" />} />
          <Route path="/articles" element={<UnderConstruction name="知识库" />} />
          <Route path="/article" element={<UnderConstruction name="文章详情" />} />
          <Route path="/about" element={<UnderConstruction name="关于与免责" />} />
          <Route path="*" element={<UnderConstruction name="你要找的页面" />} />
        </Routes>
      </main>

      <footer className="footer">
        {/* 页脚常驻危机入口，全站位置恒定 */}
        <Link to="/help" className="footer-help">需要马上找人说说？点这里</Link>
        <p>本站不提供医疗诊断与治疗，不替代专业帮助。</p>
      </footer>
    </div>
  )
}

export default App
