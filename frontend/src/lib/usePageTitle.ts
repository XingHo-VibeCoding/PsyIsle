import { useEffect } from 'react'

// 切子视图时浏览器标签标题要跟着走。这是手机 PWA：用户可能同时留着几个标签页，
// 「添加到主屏幕」也取这个标题。标题不跟着换，多级切换就只切了一半。
// 离开时还原，否则从子视图跳到没有标题逻辑的页面（如求助页）会顶着上一个视图的名字。
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · 心汐`
    return () => {
      document.title = previous
    }
  }, [title])
}
