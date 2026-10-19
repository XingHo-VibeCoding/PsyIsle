// 「用户刚才在哪一页」——只活在这一次页面加载里，刷新即忘。
//
// 用途：提建议页原来第一问是「你最常来的是哪一块？」，那是拿用户的**使用习惯**
// 开刀，还用的是内部叫法（倾诉树洞/指路灯/日常管家），跟导航上的「听你说/找方向/写一写」
// 对不上。现在改成「这条建议说的是哪一块？」，并且**先按他刚才待的页面猜一个**：
// 用户不用回忆自己用得多的少，猜错了点一下别的就行。
//
// 只猜三扇门（/talk、/guide、/daily）——它们与三个模块一一对应。
// /comfort、/ai、/breathe、/help 这些是跨模块的小工具，猜了容易猜错，不如不猜。
let last = '/'

export function setLastPage(path: string): void {
  last = path
}

export function getLastPage(): string {
  return last
}

/** 路径 → 模块 key；不在三扇门下的返回 null（= 不猜）。 */
export function moduleFromPath(path: string): string | null {
  if (/^\/talk/.test(path)) return 'treehole'
  if (/^\/guide/.test(path)) return 'guide'
  if (/^\/daily/.test(path)) return 'daily'
  return null
}
