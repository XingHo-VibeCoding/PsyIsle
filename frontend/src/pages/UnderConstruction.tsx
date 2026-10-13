import { Link } from 'react-router-dom'
import Mascot from '../components/Mascot'

// 未建页面的统一占位：不做死路——任何占位页都能回首页、能到危机页。
// 小角色放在这里是有意的：页面空的时候最容易觉得「被晾着」，让它陪着。
function UnderConstruction({ name }: { name: string }) {
  return (
    <div className="wip">
      <Mascot />
      <h1>{name}</h1>
      <p>这个页面正在按任务排期逐个上线，今天还没轮到它。</p>
      <p>现在可以先回首页，或看看已经上线的部分。</p>
      <div className="wip-actions">
        <Link to="/" className="btn btn-primary">回首页</Link>
        <Link to="/help" className="btn btn-quiet">求助资源</Link>
      </div>
    </div>
  )
}

export default UnderConstruction
