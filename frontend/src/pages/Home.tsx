import { Link } from 'react-router-dom'
import { Compass, MessageCircle, NotebookPen } from 'lucide-react'
import homeImg from '../assets/home-watercolor.jpg'

// 首页 = 一整幅插画（2026-10-13 深夜老板定稿：月亮+星+波浪的构图不变，
// 画风与色调重绘成深青绿水彩、光斑氤氲的治愈风）。画面整体偏深，文字用浅色。
// 顶部只留问候语；三个入口收进底部一排小卡；名称与引导语仍是老板原话，不自造。
// 插画是氛围主体，纯装饰，alt 留空不进无障碍树。
// 危机入口不放在画面里：导航「求助」仍全站 1 次点击可达（红线，永久不可砍）。
function greeting() {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function Home() {
  return (
    <section className="scene">
      <img className="scene-bg" src={homeImg} alt="" aria-hidden="true" />
      {/* 上下两层薄纱：画面偏深但问候语正落月亮亮面，纱帮白字「沉」住 */}
      <div className="scene-veil" aria-hidden="true" />

      <header className="scene-greet">
        <h1>{greeting()}</h1>
        <p>这里很安静，想待多久都行。</p>
      </header>

      <nav className="scene-door" aria-label="三个入口">
        <Link to="/talk" className="door">
          <span className="door-icon" aria-hidden="true">
            <MessageCircle size={18} strokeWidth={1.75} />
          </span>
          <h3>听你说</h3>
          <p>想说就说，AI 会认真听。</p>
        </Link>
        <Link to="/guide" className="door">
          <span className="door-icon" aria-hidden="true">
            <Compass size={18} strokeWidth={1.75} />
          </span>
          <h3>找方向</h3>
          <p>做个小测评、领一件小事，帮你找到方向。</p>
        </Link>
        <Link to="/daily" className="door">
          <span className="door-icon" aria-hidden="true">
            <NotebookPen size={18} strokeWidth={1.75} />
          </span>
          <h3>写一写</h3>
          <p>记下今天的心情，想写就写，不写也行。</p>
        </Link>
      </nav>
    </section>
  )
}

export default Home
