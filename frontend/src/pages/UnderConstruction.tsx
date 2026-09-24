import { Link } from 'react-router-dom'

// 未建页面的统一占位：不做死路——任何占位页都能回首页、能到危机页
function UnderConstruction({ name }: { name: string }) {
  return (
    <div className="wip">
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
