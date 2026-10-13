// 复制到剪贴板：优先用异步 Clipboard API，不行再退回老式 execCommand。
// 为什么要写两层：navigator.clipboard 只在安全上下文（https 或 localhost）存在，
// 且个别浏览器在非用户手势里会直接 reject。返回布尔值而不是吞掉异常——
// 「点了没反应」是本产品最不能出现的反馈形态，失败必须能被上层讲出来。
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 落到下面的兜底：权限被拒或页面失焦时走老路
    }
  }
  return legacyCopy(text)
}

// 兜底路径：临时 textarea + execCommand('copy')。
// 它已标记废弃，但在 http 与嵌入式浏览器里仍是唯一能用的办法；
// 用完立刻移除，且不改变页面滚动位置（fixed + 移出视口）。
function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
