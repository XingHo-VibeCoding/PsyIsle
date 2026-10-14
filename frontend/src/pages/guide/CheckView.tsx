import { usePageTitle } from '../../lib/usePageTitle'

// 找方向 · 小测评（子视图三）
// 测评题目与计分排在阶段 1 后半，但卡在一个没裁定的问题上：4 个可用量表的结果
// 怎么落到 5 个主题上（`docs/MVP实施计划.md` 冲突 6）。没裁定就不开工，
// 这里如实写「还在准备」——关于页说过，写着还在准备的地方就是真的还没做。
function CheckView() {
  usePageTitle('小测评')
  return (
    <section className="zone zone-flat">
      <h2>小测评</h2>
      <div className="card card-pending">
        <span className="card-tag">还在准备</span>
        <h3>很快就能用</h3>
        <p>
          做完会给你一段描述，和「接下来可以看看什么」。不会有总分，不会有档位，也不会告诉你你是哪种人。
        </p>
      </div>
    </section>
  )
}

export default CheckView
