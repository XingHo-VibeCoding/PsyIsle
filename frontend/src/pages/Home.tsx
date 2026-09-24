import { Link } from 'react-router-dom'

// F11 分区首页：按「用户此刻的状态」分三区，不用行业词
// 措辞禁令：分区标题不得出现「应急/探索/深度/模块/板块/专区」
function Home() {
  return (
    <>
      <header className="hero">
        <h1>深夜也好，清晨也好，这里都为你亮着</h1>
        <p className="hero-sub">一座安放心绪的小岛：涨知识 · 缓情绪 · 认识自己</p>
        <p className="hero-note">不用注册、完全免费、打开就能用</p>
        {/* 主 CTA 指向大五人格测评（不是文章） */}
        <Link to="/test" className="btn btn-primary">大五人格测评</Link>
      </header>

      <section className="zone">
        <h2>现在有点难受</h2>
        <p className="zone-tip">30 秒内就能拿到的东西</p>
        <div className="cards">
          <Link to="/help" className="card card-crisis">
            <span className="card-tag">最显眼的入口</span>
            <h3>我需要求助资源</h3>
            <p>热线号码、该找谁、怎么面诊</p>
          </Link>
          <Link to="/breathe" className="card">
            <span className="card-tag">1 分钟</span>
            <h3>呼吸练习</h3>
            <p>跟着节奏吸 4 秒 · 屏 7 秒 · 呼 8 秒</p>
          </Link>
          <div className="card card-disabled">
            <span className="card-tag">接下来上线</span>
            <h3>安慰卡</h3>
            <p>点一下，抽一句温柔的话</p>
          </div>
        </div>
      </section>

      <section className="zone">
        <h2>想弄明白自己</h2>
        <p className="zone-tip">3~20 分钟，答完就能看到描述性解读</p>
        <div className="cards">
          <Link to="/assessments" className="card">
            <span className="card-tag">5 个测评</span>
            <h3>测评总览</h3>
            <p>大五人格、自我价值感、自我效能感、思考风格、情绪自评</p>
          </Link>
          <Link to="/abc" className="card">
            <span className="card-tag">写给自己</span>
            <h3>认知纠正工作台</h3>
            <p>把一件事拆成五步，看清念头从哪来</p>
          </Link>
        </div>
      </section>

      <section className="zone">
        <h2>想看点东西</h2>
        <p className="zone-tip">随时可读的心理学科普</p>
        <div className="cards">
          <Link to="/articles" className="card">
            <span className="card-tag">4 篇文章</span>
            <h3>知识库</h3>
            <p>焦虑、睡眠、求助指南……慢慢看</p>
          </Link>
        </div>
      </section>
    </>
  )
}

export default Home
