import { Link } from 'react-router-dom'

// 首页 = 三段式入口：倾诉树洞 / 指路灯 / 日常管家
// 三张卡的说明取自 PRD v5.0 第 2 节的模块定义，不另造营销话术
function Home() {
  return (
    <>
      <header className="hero">
        <h1>一个出口，一盏灯，一个每天在的伴</h1>
        <p className="hero-sub">给说不清哪里不对、就是觉得没什么意思的你</p>
        <p className="hero-note">免费 · 打开就能用 · 没有必须完成的步骤</p>
      </header>

      <section className="zone">
        <h2>从哪扇门进都可以</h2>
        <p className="zone-tip">三件事，没有先后，也没有进度要求</p>
        <div className="cards">
          <Link to="/talk" className="card">
            <span className="card-tag">想说点什么的时候</span>
            <h3>倾诉树洞</h3>
            <p>说说今天的事。AI 会听着，不评价、不劝你</p>
          </Link>
          <Link to="/guide" className="card">
            <span className="card-tag">不知道该往哪走的时候</span>
            <h3>指路灯</h3>
            <p>做个小测评、领一件十分钟的小事、看一段书影音 —— 你自己挑</p>
          </Link>
          <Link to="/daily" className="card">
            <span className="card-tag">想留个记号的时候</span>
            <h3>日常管家</h3>
            <p>记一下今天的心情，或者那件小到不用努力的事。不想写就不写</p>
          </Link>
        </div>
      </section>

      <section className="zone">
        {/* 首页再给危机入口一个显眼位置：导航与页脚已保证「任意页 1 次点击可达」 */}
        <div className="cards">
          <Link to="/help" className="card card-crisis">
            <span className="card-tag">现在很难熬的话，先看这里</span>
            <h3>我需要求助资源</h3>
            <p>热线号码、该找谁、怎么去医院</p>
          </Link>
        </div>
      </section>
    </>
  )
}

export default Home
