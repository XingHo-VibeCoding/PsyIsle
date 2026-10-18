// 给静态托管的 SPA 补入口。
//
// 为什么需要：静态托管的服务器不做 fallback，只认「路径 → 文件」的对应关系。
// 用户直接打开 /guide（或在那儿刷新一下），服务器找不到 guide 这个文件就直接 404，
// React Router 根本没机会启动。所以每条子路由的目录下都得放一份 index.html。
//
// 用法（在仓库根跑）：
//   npm --prefix frontend run build
//   node scripts/spa-fallback.mjs
//
// ⚠️ 每次 npm run build 都会清空 dist，所以构建之后必须重跑这个脚本。
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 子路由清单 —— 必须与 frontend/src/App.tsx 的路由表保持一致，加路由时同时改这里。
const ROUTES = [
  'talk',
  'guide',
  'guide/library',
  'daily',
  'help',
  'breathe',
  'about',
  'suggest',
]

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(repoRoot, 'frontend', 'dist')
const entry = path.join(dist, 'index.html')

if (!existsSync(entry)) {
  console.error(`找不到 ${entry}，先跑：npm --prefix frontend run build`)
  process.exit(1)
}

// 顺手体检一下：App.tsx 里出现了清单外的顶层路由就提醒（比如 /privacy 之类忘了加进来）
const appTsx = path.join(repoRoot, 'frontend', 'src', 'App.tsx')
if (existsSync(appTsx)) {
  const declared = [...readFileSync(appTsx, 'utf8').matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1])
  const missing = declared.filter((p) => p !== '/' && !ROUTES.includes(p.slice(1)))
  if (missing.length > 0) {
    console.warn(`⚠️ App.tsx 里有清单外的顶层路由：${missing.join('、')}——请补进本脚本的 ROUTES`)
  }
}

const html = readFileSync(entry)
for (const route of ROUTES) {
  const dir = path.join(dist, route)
  mkdirSync(dir, { recursive: true })
  copyFileSync(entry, path.join(dir, 'index.html'))
}

console.log(`已为 ${ROUTES.length} 条子路由补上 index.html（共写入 ${ROUTES.length + 1} 个入口）`)
