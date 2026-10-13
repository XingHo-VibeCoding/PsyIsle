// 站里的伴：纯 CSS 画的小角色（不引图片、不手绘 SVG）。
// 只陪伴不功能——不承载信息、不可点、aria-hidden 不进无障碍树；
// 呼吸动画被全局 prefers-reduced-motion 兜底压停。纪律见 docs/设计规范.md。
function Mascot() {
  return (
    <div className="mascot" aria-hidden="true">
      <span className="mascot-body">
        <span className="mascot-eye mascot-eye-l" />
        <span className="mascot-eye mascot-eye-r" />
        <span className="mascot-blush mascot-blush-l" />
        <span className="mascot-blush mascot-blush-r" />
        <span className="mascot-smile" />
      </span>
    </div>
  )
}

export default Mascot
