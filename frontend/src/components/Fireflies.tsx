import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

// 萤火层：全站唯一一处浮动的纯装饰。样式见 index.css §2 的 .fireflies。
//
// 位置不用 Math.random 而用固定种子的伪随机：每次刷新光点都落在同一处。
// 这不是洁癖——路由切换时若粒子整片重排，满屏的亮光会在用户眼前跳一下，
// 那种动静比「没有粒子」糟得多。
//
// 数量克制（18 颗，窄屏只留 9 颗）：它们是余光里的东西，不是主角。
// 这个产品最不该做的就是抢注意力，所以「少」本身就是设计要求。

const COUNT = 18

type Particle = {
  key: number
  style: CSSProperties
}

// mulberry32：32 位整数种子的小伪随机，几十字节，不值得为它引一个依赖
function makeParticles(count: number): Particle[] {
  let seed = 0x9e3779b9
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return Array.from({ length: count }, (_, i) => {
    const size = 2 + rnd() * 3.6 // 2.0–5.6px：再大就成了圆点，不是光
    const dur = 16 + rnd() * 18 // 16–34s 一轮，慢到几乎看不出在动
    return {
      key: i,
      style: {
        '--x': `${(rnd() * 96 + 2).toFixed(1)}%`,
        '--y': `${(rnd() * 92 + 3).toFixed(1)}%`,
        '--s': `${size.toFixed(1)}px`,
        '--dur': `${dur.toFixed(1)}s`,
        // 负延迟：一进页面它们就已经在各自该在的位置上，不是从同一颗炸开
        '--delay': `-${(rnd() * dur).toFixed(1)}s`,
        '--peak': (0.3 + rnd() * 0.38).toFixed(2),
        '--dx': `${(rnd() * 26 - 13).toFixed(0)}px`,
        // 纵向一律向下漂：首页插画里的光点就是自上而下蔓延的，这里跟着它
        '--dy': `${(8 + rnd() * 18).toFixed(0)}px`,
      } as CSSProperties,
    }
  })
}

const PARTICLES = makeParticles(COUNT)

// 指针视差：整层光点朝指针方向挪一点点（最多 12px），像有人走近时带起的一阵风。
// 幅度是-design 决定的——超过 20px 就成了「页面在跟着鼠标晃」，那会晕。
const AMPLITUDE = 12
// 缓动系数：每帧只追剩余距离的 8%，指针停下后光点还会飘一小会儿才定住。
// 直接赋值的版本是「贴着鼠标走」，机械感很强；留一点惯性才像活的东西。
const EASE = 0.08

function Fireflies() {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = layerRef.current
    if (!el) return

    // 两个门禁，缺一个都会出问题：
    // ① 系统要「减少动态效果」——这层根本不该存在（CSS 已把它 display:none，这里只是不再算）；
    // ② 设备没有真指针（手机触摸）——手指按住时页面跟着挪，会和滚动打架。
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const hover = window.matchMedia('(hover: hover)')

    let targetX = 0
    let targetY = 0
    let curX = 0
    let curY = 0
    let raf = 0

    const tick = () => {
      curX += (targetX - curX) * EASE
      curY += (targetY - curY) * EASE
      el.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`
      // 追到几乎重合就停：常驻的 rAF 循环会让风扇一直转，为一个装饰不值当
      if (Math.abs(targetX - curX) < 0.1 && Math.abs(targetY - curY) < 0.1) {
        raf = 0
        return
      }
      raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      if (reduce.matches) return
      targetX = (e.clientX / window.innerWidth - 0.5) * 2 * AMPLITUDE
      targetY = (e.clientY / window.innerHeight - 0.5) * 2 * AMPLITUDE
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const onLeave = () => {
      targetX = 0
      targetY = 0
      if (!raf) raf = requestAnimationFrame(tick)
    }

    // 先拆再装：sync 会被 reduced-motion 的 change 事件反复调用，
    // 不先 teardown 的话监听器会一层层叠上去，同一次移动被处理 N 遍。
    const sync = () => {
      teardown()
      if (reduce.matches || !hover.matches) {
        el.style.transform = ''
        return
      }
      window.addEventListener('pointermove', onMove, { passive: true })
      document.addEventListener('pointerleave', onLeave)
    }

    const teardown = () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    sync()
    reduce.addEventListener('change', sync)
    return () => {
      teardown()
      reduce.removeEventListener('change', sync)
    }
  }, [])

  return (
    <div className="fireflies" ref={layerRef} aria-hidden="true">
      {PARTICLES.map((p) => (
        <i key={p.key} style={p.style} />
      ))}
    </div>
  )
}

export default Fireflies
