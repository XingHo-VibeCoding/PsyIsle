// 登录弹层的全局开关。
// 为什么要有这个文件：导航里的 AuthPanel 自己管着开合状态，别的组件（比如匿名提示）
// 没法直接叫它打开。这里做一个极简订阅：谁想让用户去注册/登录，调 openAuthPanel() 即可，
// AuthPanel 挂载时订阅一次就够。不引入 Context 是因为只有「打开」这一个动作，不值得铺一层。
type Listener = () => void

const listeners = new Set<Listener>()

export function openAuthPanel(): void {
  listeners.forEach((l) => l())
}

export function subscribeAuthPanel(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
