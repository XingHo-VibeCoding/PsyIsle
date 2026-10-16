// 心汐 · 发布前检查（verify-project）
//
// 干什么：把「上线前要过一遍的那些事」从人肉记忆变成一条命令。
// 每一条检查都来自本项目真实踩过的坑，括号里标了出处；每条都有可执行的判据，
// 结果只有 PASS / FAIL / SKIP 三种，FAIL 必须附证据（不是「感觉不对」）。
//
// 用法（在仓库根跑）：
//   node scripts/verify-project.mjs                 # 用现有 dist 做静态检查 + 公网接口检查
//   node scripts/verify-project.mjs --with-build    # 先重新构建再检查（慢，但结论最硬）
//   node scripts/verify-project.mjs --skip-net      # 断网 / 不想打公网时，只跑本地项
//   node scripts/verify-project.mjs --out <路径>    # 指定报告落点（默认 skills/verify-project/runs/）
//
// 退出码：0 = 全 PASS（或只剩 SKIP）；1 = 有 FAIL。
//
// 设计上的三条自律：
//   1) 不虚报通过：拿不到证据就判 FAIL 或 SKIP，不猜。（SKIP 必须写明为什么跳过）
//   2) 检查本身不破坏数据：写入类检查只用固定的测试日期，跑完自己清理（幂等项会覆盖同一行）。
//   3) 报告落盘：每次跑都留一份 runs/YYYY-MM-DD.md，方便和上一次对照。

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = path.join(REPO, 'frontend')
const DIST = path.join(FRONTEND, 'dist')
const RUNS_DIR = path.join(REPO, 'skills', 'verify-project', 'runs')

// 本机 git 不在 PATH（定制版 PortableGit），给一条兜底路径
const GIT_FALLBACK = 'C:\\Users\\24486\\.workbuddy\\binaries\\PortableGit\\versions\\1.3.0\\cmd\\git.exe'
const gitBin = existsSync(GIT_FALLBACK) ? GIT_FALLBACK : 'git'

const args = process.argv.slice(2)
const WITH_BUILD = args.includes('--with-build')
const SKIP_NET = args.includes('--skip-net')
const outIdx = args.indexOf('--out')
const OUT_ARG = outIdx >= 0 ? args[outIdx + 1] : null

// 线上地址：优先读本地 .env（真值不入库），读不到才用契约里写明的默认域名
const DEFAULT_API = 'https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com'
const DEFAULT_SITE = 'https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com'

function readEnvFile(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const feEnv = readEnvFile(path.join(FRONTEND, '.env'))
const API_BASE = (feEnv.VITE_API_BASE || DEFAULT_API).replace(/\/$/, '')
const SITE_ORIGIN = (feEnv.VITE_SITE_BASE || DEFAULT_SITE).replace(/\/$/, '')
const API_HOST = API_BASE.replace(/^https?:\/\//, '')

// 幂等 / 软删两项要真写库：固定用一个不会碰演示数据的日期（演示数据都在 2026-10）
const TEST_DATE = '2020-01-01'
const TEST_NOTE = 'verify-project 自检占位（用完即软删）'

const results = []
function record(id, title, source, status, summary, evidence = []) {
  results.push({ id, title, source, status, summary, evidence })
  const mark = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'SKIP'
  console.log(`${mark}  ${id}  ${title}`)
  console.log(`      ${summary}`)
  for (const e of evidence) console.log(`      · ${e}`)
  console.log('')
}

// ---------- 小工具 ----------
function git(argsArr) {
  const r = spawnSync(gitBin, argsArr, { cwd: REPO, encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) return ''
  return (r.stdout || '').trim()
}
function gitLines(argsArr) {
  return git(argsArr).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sql', '.yml', '.yaml', '.html', '.css', '.example', '.mts'])
const isText = (f) => TEXT_EXT.has(path.extname(f).toLowerCase()) || path.basename(f).startsWith('.env')

async function fetchJson(url, init = {}, timeoutMs = 15000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 非 JSON 也算一种结果，交给调用方判断 */
  }
  return { res, text, json }
}

// ============================================================
// V1 密钥与敏感文件：有没有进仓库（Day 23 踩坑：漏 .env.production）
// ============================================================
async function v1() {
  const tracked = gitLines(['ls-files'])
  const staged = gitLines(['diff', '--cached', '--name-only'])
  const inRepo = [...new Set([...tracked, ...staged])]

  const SENSITIVE_NAME = /(^|\/)\.env(\.[A-Za-z0-9_.-]+)?$/ // .env / .env.production / frontend/.env
  const badFiles = inRepo.filter(
    (f) => (SENSITIVE_NAME.test(f) && path.basename(f) !== '.env.example') || /cloudbaserc.*\.json$/i.test(f) || /(^|\/)\.(tcb|cloudbase)\//.test(f) || /\.(pem|key)$/i.test(f),
  )

  // 忽略规则够不够：拿几个「容易漏」的名字去问 git
  const probes = ['.env', '.env.local', '.env.production', 'frontend/.env', 'frontend/.env.production', 'cloudbaserc.json', '.tcb/auth.json']
  const notIgnored = probes.filter((p) => {
    const r = spawnSync(gitBin, ['check-ignore', '-q', p], { cwd: REPO, windowsHide: true })
    return r.status !== 0 // 0 = 被忽略；非 0 = 没被拦住
  })

  // 内容扫描：已入库文件里有没有密钥形状的字符串
  const STRONG = [
    { name: 'GitHub 令牌', re: /ghp_[A-Za-z0-9]{20,}/ },
    { name: 'OpenAI 风格密钥', re: /sk-[A-Za-z0-9]{16,}/ },
    { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
    { name: '私钥文件体', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  ]
  const WEAK = /(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'`]([^"'`]{6,})["'`]/i
  const PLACEHOLDER = /^(\*+|\$\{|你的|xxx|your[_-]?|<)/i
  const hits = []
  let scanned = 0
  for (const abs of walk(REPO)) {
    const rel = path.relative(REPO, abs).replace(/\\/g, '/')
    if (!inRepo.includes(rel)) continue // 只看会进仓库的
    if (!isText(abs)) continue
    let size = 0
    try {
      size = statSync(abs).size
    } catch {
      continue
    }
    if (size > 512 * 1024) continue
    const text = readFileSync(abs, 'utf8')
    scanned += 1
    text.split(/\r?\n/).forEach((line, i) => {
      for (const s of STRONG) {
        if (s.re.test(line)) hits.push(`${rel}:${i + 1} 疑似${s.name}`)
      }
      const w = line.match(WEAK)
      if (w && !PLACEHOLDER.test(w[1]) && !/[一-龥]/.test(w[1])) hits.push(`${rel}:${i + 1} 疑似硬编码凭据（${w[0].slice(0, 40)}…）`)
    })
  }

  const ok = badFiles.length === 0 && notIgnored.length === 0 && hits.length === 0
  record(
    'V1',
    '密钥与敏感文件没进仓库',
    'Day 23：.gitignore 只写了 .env/.env.local，漏了 .env.production 这类变体',
    ok ? 'PASS' : 'FAIL',
    ok ? `已入库 ${inRepo.length} 个文件、扫了 ${scanned} 个文本文件，0 命中` : `发现 ${badFiles.length + notIgnored.length + hits.length} 处风险`,
    [
      `入库文件数：${inRepo.length}（含暂存区 ${staged.length}）`,
      badFiles.length ? `❌ 已入库的敏感文件：${badFiles.join('、')}` : '✅ 无 .env* / cloudbaserc* / 私钥入库',
      notIgnored.length ? `❌ 忽略规则没拦住：${notIgnored.join('、')}` : `✅ 忽略规则拦住全部 ${probes.length} 个探测名（.env* 变体 / cloudbaserc.json / .tcb/）`,
      hits.length ? `❌ 内容命中：${hits.slice(0, 5).join('；')}` : `✅ 强/弱密钥特征 0 命中（扫了 ${scanned} 个文本文件）`,
    ],
  )
}

// ============================================================
// V2 构建能过（Day 20：构建失败会一路带到部署）
// ============================================================
async function v2() {
  const ev = []
  let pass = true
  // 漏报防线（第一轮补的）：只看「dist 在不在」会放过一种假通过——
  // 源码刚改过、dist 还是上一版，V3/V4 拿旧产物判成 PASS。所以也要比新鲜度。
  const newestMtime = (files) =>
    files.reduce((m, f) => {
      try {
        const s = statSync(f).mtimeMs
        return s > m ? s : m
      } catch {
        return m
      }
    }, 0)
  const watched = [
    ...walk(path.join(FRONTEND, 'src')),
    path.join(FRONTEND, 'package.json'),
    path.join(FRONTEND, 'index.html'),
    path.join(FRONTEND, 'vite.config.ts'),
  ].filter(existsSync)
  const srcNewest = newestMtime(watched)
  const distNewest = existsSync(path.join(DIST, 'index.html')) ? statSync(path.join(DIST, 'index.html')).mtimeMs : 0
  const fresh = distNewest >= srcNewest
  if (!fresh) pass = false
  ev.push(
    `产物新鲜度：源码最新 ${new Date(srcNewest).toISOString()} vs 产物 ${new Date(distNewest).toISOString()} → ${fresh ? '✅ 产物不旧于源码' : '❌ 产物比源码旧（拿旧包判 PASS 不算数，先 --with-build 重跑）'}`,
  )
  if (WITH_BUILD) {
    const r = spawnSync('npm.cmd', ['run', 'build'], { cwd: FRONTEND, encoding: 'utf8', shell: true, windowsHide: true })
    const out = (r.stdout || '') + (r.stderr || '')
    pass = r.status === 0
    ev.push(`npm run build 退出码：${r.status}（--with-build）`)
    if (!pass) {
      const firstErr = out.split(/\r?\n/).filter((l) => /error|错误/i.test(l))[0] || out.slice(0, 200)
      ev.push(`❌ 第一条错误：${firstErr.trim().slice(0, 160)}`)
    }
  }
  const hasIndex = existsSync(path.join(DIST, 'index.html'))
  if (!hasIndex) {
    pass = false
    ev.push(`❌ 找不到 ${path.join(DIST, 'index.html')}——先跑 npm --prefix frontend run build`)
  } else {
    const m = statSync(path.join(DIST, 'index.html')).mtime.toISOString()
    const assets = existsSync(path.join(DIST, 'assets')) ? readdirSync(path.join(DIST, 'assets')).length : 0
    ev.push(`dist/index.html 存在，构建时间 ${m}，assets ${assets} 个文件`)
  }
  record('V2', '构建能过、产物在', 'Day 20：构建中途退出还照样部署，上线就是旧包', pass ? 'PASS' : 'FAIL', pass ? '构建产物完整' : '构建或产物有问题', ev)
}

// ============================================================
// V3 环境变量真的内联进产物（Day 20 卡点：VITE_API_BASE 没配 → 请求打到页面域名 404）
// ============================================================
async function v3() {
  const envExists = existsSync(path.join(FRONTEND, '.env'))
  const assetsDir = path.join(DIST, 'assets')
  let hitFile = null
  if (existsSync(assetsDir)) {
    for (const f of readdirSync(assetsDir)) {
      if (!f.endsWith('.js')) continue
      const t = readFileSync(path.join(assetsDir, f), 'utf8')
      if (t.includes(API_HOST)) {
        hitFile = f
        break
      }
    }
  }
  const pass = hitFile !== null
  record(
    'V3',
    'VITE_API_BASE 真的进了构建产物',
    'Day 20：.env 改了没重新 build，Vite 是构建期内联，页面请求打到自己域名 404',
    pass ? 'PASS' : 'FAIL',
    pass ? `接口地址已内联（${API_HOST}）` : '构建产物里找不到接口地址——改了 .env 却没重新 build，或 .env 根本没配',
    [
      `frontend/.env：${envExists ? '存在（真值本地，不入库 ✅）' : '不存在 ⚠️（用契约默认域名兜底）'}`,
      pass ? `✅ 命中文件：dist/assets/${hitFile}` : `❌ dist/assets/*.js 中搜不到 ${API_HOST}`,
      '提示：改 .env 后必须重新 npm run build，Vite 不是运行时读环境变量',
    ],
  )
}

// ============================================================
// V4 子路由 fallback 齐备（Day 20 卡点：忘了跑 spa-fallback → 子路由直开 404）
// ============================================================
async function v4() {
  const appTsx = path.join(FRONTEND, 'src', 'App.tsx')
  const src = existsSync(appTsx) ? readFileSync(appTsx, 'utf8') : ''
  const routes = [...src.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]).filter((p) => p !== '/' && p !== '*')
  const missing = routes.filter((r) => !existsSync(path.join(DIST, r.slice(1), 'index.html')))
  const pass = routes.length > 0 && missing.length === 0
  record(
    'V4',
    '每条子路由都有 fallback 入口',
    'Day 20：静态托管不做 fallback，忘了跑 spa-fallback.mjs 时 /daily 直接输地址就 404',
    pass ? 'PASS' : 'FAIL',
    pass ? `${routes.length} 条路由全部有 dist/<route>/index.html` : `缺 ${missing.length} 条：${missing.join('、')}`,
    [
      `从 App.tsx 读到 ${routes.length} 条顶层路由：${routes.join(' ')}`,
      missing.length ? `❌ dist 里没有：${missing.map((m) => `dist${m}/index.html`).join('、')}` : '✅ 全部存在',
      '修法：npm run build 之后紧跟 node scripts/spa-fallback.mjs（构建会清空 dist）',
    ],
  )
}

// ============================================================
// V5 公网探活与契约形状（Day 15 起每次部署第一件事）
// ============================================================
async function v5() {
  if (SKIP_NET) return record('V5', '公网探活与契约形状', 'Day 15', 'SKIP', '--skip-net 已跳过公网项', [])
  try {
    const { res, json } = await fetchJson(`${API_BASE}/api/health`)
    const ct = res.headers.get('content-type') || ''
    const checks = {
      'HTTP 200': res.status === 200,
      'Content-Type 是 JSON': /json/i.test(ct),
      'ok=true': json && json.ok === true,
      "service='PsyIsle'": json && json.service === 'PsyIsle',
      'version 有值': json && typeof json.version === 'string' && json.version.length > 0,
      'time 可解析': json && !Number.isNaN(Date.parse(json.time)),
    }
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    record(
      'V5',
      '公网探活与契约形状',
      'Day 15：部署完第一件事是 curl /api/health，确认管道通、且字段和契约一致',
      bad.length ? 'FAIL' : 'PASS',
      bad.length ? `契约字段不符：${bad.join('、')}` : '健康接口返回形状与契约 §4.1 一致',
      [`GET ${API_BASE}/api/health → ${res.status} · ${ct}`, json ? `响应：${JSON.stringify(json)}` : `❌ 响应不是 JSON：${res.status}`],
    )
  } catch (e) {
    record('V5', '公网探活与契约形状', 'Day 15', 'FAIL', `请求失败：${e.message}`, [`curl 对照：curl ${API_BASE}/api/health`])
  }
}

// ============================================================
// V6 跨域白名单（Day 20 当日知识点：白名单制，不是 *）
// ============================================================
async function v6() {
  if (SKIP_NET) return record('V6', '跨域白名单生效', 'Day 20', 'SKIP', '--skip-net 已跳过公网项', [])
  const cases = [
    { origin: SITE_ORIGIN, expect: true, label: '自己的托管域名' },
    { origin: 'http://localhost:5173', expect: true, label: '本地 dev' },
    { origin: 'https://evil.example.com', expect: false, label: '陌生域名（应拒绝）' },
  ]
  const lines = []
  let pass = true
  for (const c of cases) {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { headers: { Origin: c.origin }, signal: AbortSignal.timeout(15000) })
      const acao = res.headers.get('access-control-allow-origin')
      const okCase = c.expect ? acao === c.origin : !acao
      if (!okCase) pass = false
      lines.push(`${okCase ? '✅' : '❌'} ${c.label}（${c.origin}）→ ACAO=${acao ?? '无'}`)
    } catch (e) {
      pass = false
      lines.push(`❌ ${c.label} 请求失败：${e.message}`)
    }
  }
  record('V6', '跨域白名单生效（该放的放、该拦的拦）', 'Day 20：网关是白名单制，不是 *；换托管域名要重新确认', pass ? 'PASS' : 'FAIL', pass ? '三个 Origin 表现符合预期' : '有 Origin 表现不对', lines)
}

// ============================================================
// V7 接口字段形状（Day 17 踩坑：created_at 与 createdAt 对不上）
// ============================================================
const EMOJI_WHITELIST = ['calm', 'warm', 'tired', 'low', 'anxious', 'upset', 'empty']
async function v7() {
  if (SKIP_NET) return record('V7', '接口字段形状（camelCase）', 'Day 17', 'SKIP', '--skip-net 已跳过公网项', [])
  try {
    const { json } = await fetchJson(`${API_BASE}/api/moods?limit=1`)
    const item = json && json.data && json.data.items && json.data.items[0]
    if (!item) return record('V7', '接口字段形状（camelCase）', 'Day 17', 'FAIL', '接口没返回任何一行，无法比对形状', [`响应：${JSON.stringify(json).slice(0, 200)}`])
    const snake = Object.keys(item).filter((k) => k.includes('_'))
    const need = ['id', 'date', 'emoji', 'createdAt'].filter((k) => !(k in item))
    const pass = snake.length === 0 && need.length === 0 && EMOJI_WHITELIST.includes(item.emoji)
    record(
      'V7',
      '接口字段形状对得上契约',
      'Day 17：库里是 created_at，契约写 createdAt，前端取到 undefined 页面空白',
      pass ? 'PASS' : 'FAIL',
      pass ? '字段齐全、camelCase、emoji 在白名单内' : `形状不符：${[...snake.map((s) => `混进 snake_case ${s}`), ...need.map((n) => `缺字段 ${n}`), EMOJI_WHITELIST.includes(item.emoji) ? '' : `emoji 越界 ${item.emoji}`].filter(Boolean).join('；')}`,
      [`单行样本：${JSON.stringify(item)}`, `白名单：${EMOJI_WHITELIST.join('/')}`],
    )
  } catch (e) {
    record('V7', '接口字段形状（camelCase）', 'Day 17', 'FAIL', `请求失败：${e.message}`, [])
  }
}

// ============================================================
// V8 错误信封（Day 23：错误提示不能把 SQL/堆栈/英文甩给用户）
// ============================================================
async function v8() {
  if (SKIP_NET) return record('V8', '错误信封不外泄内部细节', 'Day 23', 'SKIP', '--skip-net 已跳过公网项', [])
  try {
    const { res, json } = await fetchJson(`${API_BASE}/api/moods`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ emoji: '__not_a_mood__' }),
    })
    const msg = json && json.error ? json.error.message : ''
    const LEAK = /RDB_ERR|THROW|Error:|stack|select |public\.|postgres|\bat \b/i
    const checks = {
      'HTTP 仍是 200（Event 型函数特性）': res.status === 200,
      '信封 ok=false': json && json.ok === false,
      '错误码 INVALID_INPUT': json && json.error && json.error.code === 'INVALID_INPUT',
      '有中文提示': /[一-龥]/.test(msg),
      '不含内部细节（SQL/堆栈/英文原文）': !LEAK.test(msg),
    }
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    record('V8', '错误给人话，不外泄内部细节', 'Day 23：以前直接把 RDB_ERR/THROW 原文塞给用户', bad.length ? 'FAIL' : 'PASS', bad.length ? `不符：${bad.join('、')}` : '中文短句 + 错误码，无内部细节', [`POST /api/moods {emoji:'__not_a_mood__'} → ${res.status}`, `响应：${JSON.stringify(json)}`])
  } catch (e) {
    record('V8', '错误信封不外泄内部细节', 'Day 23', 'FAIL', `请求失败：${e.message}`, [])
  }
}

// ============================================================
// V9 写入幂等（Day 18 踩坑：同一天重复提交变两行）
// ============================================================
async function v9() {
  if (SKIP_NET) return record('V9', '写入幂等（同日不产生第二行）', 'Day 18', 'SKIP', '--skip-net 已跳过公网项', [])
  try {
    const post = (emoji) =>
      fetchJson(`${API_BASE}/api/moods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ date: TEST_DATE, emoji, level: 1, note: TEST_NOTE }),
      })
    const a = await post('calm')
    const b = await post('low')
    const id1 = a.json?.data?.item?.id
    const id2 = b.json?.data?.item?.id
    const { json: list } = await fetchJson(`${API_BASE}/api/moods?limit=200`)
    const rows = (list?.data?.items || []).filter((r) => r.date === TEST_DATE)
    const pass = Boolean(id1) && id1 === id2 && rows.length === 1 && rows[0].emoji === 'low'
    record(
      'V9',
      '写入幂等（同一天重复提交 = 覆盖）',
      'Day 18：同日重复提交要靠 unique(owner_id,date) 兜底，不能「先查有没有再插」',
      pass ? 'PASS' : 'FAIL',
      pass ? `两次提交返回同一 id，列表里 ${TEST_DATE} 只有 1 行且内容是后一次` : `幂等被破坏：${id1 !== id2 ? `两次 id 不同（${id1} / ${id2}）` : ''}${rows.length !== 1 ? ` 列表里该日有 ${rows.length} 行` : ''}`,
      [
        `第一次 POST → id=${id1}`,
        `第二次 POST（换情绪）→ id=${id2}`,
        `GET /api/moods?limit=200 中 ${TEST_DATE} 的行数：${rows.length}${rows.length ? `，emoji=${rows[0].emoji}（覆盖生效）` : ''}`,
        '注：只用固定测试日期 2020-01-01，不碰演示数据',
      ],
    )
    return id1
  } catch (e) {
    record('V9', '写入幂等（同日不产生第二行）', 'Day 18', 'FAIL', `请求失败：${e.message}`, [])
    return null
  }
}

// ============================================================
// V10 软删生效 + 删不存在的要报 NOT_FOUND（Day 22：删除比新增更容易出事）
// ============================================================
async function v10(testId) {
  if (SKIP_NET) return record('V10', '软删生效且不静默', 'Day 22', 'SKIP', '--skip-net 已跳过公网项', [])
  if (!testId) return record('V10', '软删生效且不静默', 'Day 22', 'SKIP', '幂等项没拿到测试 id，本项跳过', [])
  try {
    const del = await fetchJson(`${API_BASE}/api/moods?id=${encodeURIComponent(testId)}`, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const { json: list } = await fetchJson(`${API_BASE}/api/moods?limit=200`)
    const stillThere = (list?.data?.items || []).some((r) => r.id === testId)
    const again = await fetchJson(`${API_BASE}/api/moods?id=${encodeURIComponent(testId)}`, { method: 'DELETE', headers: { Accept: 'application/json' } })
    const checks = {
      '删除返回 ok=true': del.json?.ok === true,
      '列表里已查不到（软删过滤生效）': !stillThere,
      '重复删同一条报 NOT_FOUND（不静默成功）': again.json?.ok === false && again.json?.error?.code === 'NOT_FOUND',
    }
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    record(
      'V10',
      '软删生效、删错能知道',
      'Day 22：删除用软删（is_deleted），且 id 不存在必须报 NOT_FOUND，不能假装成功',
      bad.length ? 'FAIL' : 'PASS',
      bad.length ? `不符：${bad.join('、')}` : '删后列表查不到；再删一次明确报 NOT_FOUND',
      [
        `DELETE ?id=${testId} → ${JSON.stringify(del.json)}`,
        `再删一次 → ${JSON.stringify(again.json)}`,
        `列表里是否还在：${stillThere ? '❌ 还在' : '✅ 已过滤'}`,
        '注：软删只打标记，库里那行还在（可找回），这是刻意设计',
      ],
    )
  } catch (e) {
    record('V10', '软删生效且不静默', 'Day 22', 'FAIL', `请求失败：${e.message}`, [])
  }
}

// ============================================================
// V11 PATCH 清空字段：说改好了就得真改好（Day 24 修的 Bug）
// ============================================================
async function v11PatchClear(testId) {
  if (SKIP_NET) return record('V11', 'PATCH 清空字段真的生效', 'Day 24', 'SKIP', '--skip-net 已跳过公网项', [])
  if (!testId) return record('V11', 'PATCH 清空字段真的生效', 'Day 24', 'SKIP', '幂等项没拿到测试 id，本项跳过', [])
  try {
    const patch = (body) =>
      fetchJson(`${API_BASE}/api/moods?id=${encodeURIComponent(testId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
    const rowOf = async () => {
      const { json } = await fetchJson(`${API_BASE}/api/moods?limit=200`)
      return (json?.data?.items || []).find((r) => r.id === testId)
    }
    // 先写回有值的状态，再清空——否则「本来就是 null」会让检查空转
    await patch({ emoji: 'calm', level: 3, note: '待清空' })
    const p1 = await patch({ note: null })
    const r1 = await rowOf()
    const p2 = await patch({ level: null })
    const r2 = await rowOf()
    const checks = {
      'PATCH {note:null} 返回 ok=true': p1.json?.ok === true,
      '回读 note 真的是 null': r1 && r1.note === null,
      'PATCH {level:null} 返回 ok=true': p2.json?.ok === true,
      '回读 level 真的是 null': r2 && r2.level === null,
    }
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
    record(
      'V11',
      'PATCH 清空字段真的生效',
      'Day 24：T8/T9 接口回 ok:true、数据没动、还不报错——「说改好了但没改」最害人',
      bad.length ? 'FAIL' : 'PASS',
      bad.length ? `不符：${bad.join('、')}` : '清空后回读确实是 null（不是「接口说好了、库里没动」）',
      [
        `PATCH {note:null} → ${JSON.stringify(p1.json)}；回读 note=${JSON.stringify(r1?.note)}`,
        `PATCH {level:null} → ${JSON.stringify(p2.json)}；回读 level=${JSON.stringify(r2?.level)}`,
        '修法：清空要走「显式置 null」的分支，不能被「没传就不改」的逻辑吞掉',
      ],
    )
  } catch (e) {
    record('V11', 'PATCH 清空字段真的生效', 'Day 24', 'FAIL', `请求失败：${e.message}`, [])
  }
}

// ============================================================
// V12 并发连点：5 次同时写同一天，仍然只有 1 行（Day 24 C 段）
// ============================================================
async function v12Concurrent() {
  if (SKIP_NET) return record('V12', '并发连点不产生第二行', 'Day 24', 'SKIP', '--skip-net 已跳过公网项', [])
  try {
    const shots = await Promise.all(
      ['calm', 'warm', 'tired', 'low', 'empty'].map((emoji) =>
        fetchJson(`${API_BASE}/api/moods`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ date: TEST_DATE, emoji, level: 2, note: TEST_NOTE }),
        }),
      ),
    )
    const oks = shots.filter((s) => s.json?.ok === true).length
    const { json } = await fetchJson(`${API_BASE}/api/moods?limit=200`)
    const rows = (json?.data?.items || []).filter((r) => r.date === TEST_DATE)
    const pass = oks === 5 && rows.length === 1
    record(
      'V12',
      '并发连点不产生第二行',
      'Day 24 C 段：同一天同时发 5 次，唯一约束 + upsert 必须兜住（串行幂等过了不代表并发过得去）',
      pass ? 'PASS' : 'FAIL',
      pass ? '5 发全成功、该日仍只有 1 行' : `5 发中 ${oks} 次成功，该日有 ${rows.length} 行——并发没兜住`,
      [`并发 POST ×5 → 成功 ${oks}/5（顺序不定，内容取其中一次）`, `GET /api/moods?limit=200 中 ${TEST_DATE} 的行数：${rows.length}`],
    )
  } catch (e) {
    record('V12', '并发连点不产生第二行', 'Day 24', 'FAIL', `请求失败：${e.message}`, [])
  }
}

// ============================================================
// V13 线上跑的是不是本地这份（Day 20 坑：部署像没生效 / CDN 缓存）
// ============================================================
async function v13Online() {
  if (SKIP_NET) return record('V13', '线上跑的是本地这份产物', 'Day 20', 'SKIP', '--skip-net 已跳过公网项', [])
  try {
    const home = await fetch(SITE_ORIGIN + '/', { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } })
    const html = await home.text()
    const m = html.match(/\/assets\/([A-Za-z0-9._-]+\.js)/)
    const onlineBundle = m ? m[1] : null
    let same = false
    let localInfo = '本地 dist 里没有同名文件'
    if (onlineBundle && existsSync(path.join(DIST, 'assets', onlineBundle))) {
      const localBuf = readFileSync(path.join(DIST, 'assets', onlineBundle))
      const onlineBuf = Buffer.from(await (await fetch(`${SITE_ORIGIN}/assets/${onlineBundle}`, { signal: AbortSignal.timeout(15000) })).arrayBuffer())
      same = localBuf.length === onlineBuf.length && localBuf.equals(onlineBuf)
      localInfo = `本地 ${localBuf.length} 字节 / 线上 ${onlineBuf.length} 字节 → ${same ? '完全一致' : '不一致（线上是另一个版本，多半是没重新部署或 CDN 还挂着旧包）'}`
    }
    // 子路由直开：静态托管不做 fallback，只有直开能验出 fallback 到底部署上去没有
    const sub = await fetch(`${SITE_ORIGIN}/daily`, { signal: AbortSignal.timeout(15000) })
    const subHtml = sub.status === 200 ? await sub.text() : ''
    const subOk = sub.status === 200 && /<div id="root"/.test(subHtml)
    const pass = same && subOk
    record(
      'V13',
      '线上跑的是本地这份产物',
      'Day 20：部署看着没生效时别先怀疑网络——比对线上引用的 bundle 与本地 dist，再看子路由能不能直开',
      pass ? 'PASS' : 'FAIL',
      pass ? '线上 bundle 与本地逐字节一致，且 /daily 直开 200' : `线上与本地不一致，或子路由直开异常`,
      [
        `线上首页引用的 bundle：${onlineBundle ?? '未取到'}`,
        `比对：${localInfo}`,
        `/daily 直开：HTTP ${sub.status}${subOk ? '，含 <div id="root">（fallback 已生效）' : '，❌ 不是正常的 SPA 入口页'}`,
        '修法：npm run build → node scripts/spa-fallback.mjs → tcb hosting deploy frontend/dist -e <env> --verify',
      ],
    )
  } catch (e) {
    record('V13', '线上跑的是本地这份产物', 'Day 20', 'FAIL', `请求失败：${e.message}`, [])
  }
}

// ============================================================
// V14 危机入口红线（PRD 三条不可破的底线之一）
// ============================================================
async function v14() {
  const appTsx = path.join(FRONTEND, 'src', 'App.tsx')
  const src = existsSync(appTsx) ? readFileSync(appTsx, 'utf8') : ''
  const helpLinks = (src.match(/to="\/help"/g) || []).length
  const srcFiles = walk(path.join(FRONTEND, 'src'))
  const hasNumbers = srcFiles.some((f) => isText(f) && readFileSync(f, 'utf8').includes('12356'))
  const hasTel = srcFiles.some((f) => isText(f) && readFileSync(f, 'utf8').includes('tel:'))
  const checks = {
    '导航 + 页脚都有 /help 入口': helpLinks >= 2,
    '源码里有 12356 心理援助热线': hasNumbers,
    '号码可点拨号（tel:）': hasTel,
  }
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  record('V14', '危机入口常驻（不可砍的红线）', 'PRD §2：任意页面 ≤1 次点击可达，号码打包进构建、可点拨号', bad.length ? 'FAIL' : 'PASS', bad.length ? `红线破了：${bad.join('、')}` : '导航 + 页脚双入口，热线在源码里、可点拨号', [`App.tsx 中 to="/help" 出现 ${helpLinks} 次`, `12356：${hasNumbers ? '✅' : '❌'}；tel: 链接：${hasTel ? '✅' : '❌'}`])
}

// ============================================================
// V15 文档里的相对链接没失效（改口径容易忘改引用）
// ============================================================
async function v15() {
  const mds = walk(REPO).filter((f) => f.endsWith('.md') && !f.includes(`${path.sep}备查${path.sep}`) && !f.includes(`${path.sep}runs${path.sep}`))
  const broken = []
  let total = 0
  for (const f of mds) {
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = m[1].split('#')[0].trim()
      if (!target || /^https?:\/\//.test(target) || /^mailto:/.test(target)) continue
      total += 1
      const abs = path.resolve(path.dirname(f), target)
      if (!existsSync(abs)) broken.push(`${path.relative(REPO, f).replace(/\\/g, '/')} → ${target}`)
    }
  }
  const pass = broken.length === 0
  record('V15', '文档里的相对链接没失效', 'AGENTS §10：改口径要全文搜旧说法；链接失效就是文档漂了', pass ? 'PASS' : 'FAIL', pass ? `${mds.length} 篇文档、${total} 个站内链接全部有效` : `${broken.length} 个失效链接`, pass ? [`扫描 ${mds.length} 篇 .md、${total} 个站内相对链接`] : broken.slice(0, 6).map((b) => `❌ ${b}`))
}

// ============================================================
// 跑 + 出报告
// ============================================================
function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function dayStamp() {
  return stamp().slice(0, 10)
}

async function main() {
  console.log('心汐 · 发布前检查 verify-project')
  console.log(`时间：${stamp()}　接口：${API_BASE}　站点：${SITE_ORIGIN}`)
  console.log(`模式：${WITH_BUILD ? '含重新构建' : '用现有 dist'}${SKIP_NET ? ' · 跳过公网项' : ''}`)
  console.log('─'.repeat(72))
  console.log('')

  await v1()
  await v2()
  await v3()
  await v4()
  await v5()
  await v6()
  await v7()
  await v8()
  // 写入类检查的顺序有讲究：先造行 → 清空字段 → 并发连点 → 最后软删收尾（删早了后面就没得测）
  const testId = await v9()
  await v11PatchClear(testId)
  await v12Concurrent()
  await v10(testId)
  await v13Online()
  await v14()
  await v15()

  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const skip = results.filter((r) => r.status === 'SKIP').length

  console.log('─'.repeat(72))
  console.log(`结论：${pass} PASS / ${fail} FAIL / ${skip} SKIP　——　${fail === 0 ? '可以发' : '有 FAIL，发之前先修'}`)
  console.log('')
  console.log('脚本查不了、发之前必须人确认的三件事（契约 §7 三条 🔴）：')
  console.log('  1. 收回 anon 的 insert/update 授权（Day 18 演示期临时开的）')
  console.log('  2. 恢复 moods / progress_notes 的 RLS（Day 17 临时关的）')
  console.log('  3. 检查台 /check 已于 Day21 收尾下线（2026-10-16）；恢复须先接登录加权限')

  // 报告落盘
  const lines = []
  lines.push(`# 发布前检查 · ${stamp()}`)
  lines.push('')
  lines.push(`> 命令：\`node scripts/verify-project.mjs${WITH_BUILD ? ' --with-build' : ''}${SKIP_NET ? ' --skip-net' : ''}\``)
  lines.push(`> 结论：**${pass} PASS / ${fail} FAIL / ${skip} SKIP** —— ${fail === 0 ? '可以发' : '有 FAIL，发之前先修'}`)
  lines.push('')
  lines.push('| # | 检查项 | 结果 | 一句话 | 踩坑出处 |')
  lines.push('|---|---|---|---|---|')
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.title} | **${r.status}** | ${r.summary.replace(/\|/g, '\\|')} | ${r.source.replace(/\|/g, '\\|')} |`)
  }
  lines.push('')
  lines.push('## 脚本查不了、发之前必须人确认的三件事（契约 §7 三条 🔴）')
  lines.push('')
  lines.push('1. 收回 `anon` 的 insert/update 授权（Day 18 演示期临时开的）')
  lines.push('2. 恢复 `moods` / `progress_notes` 的 RLS（Day 17 临时关的）')
  lines.push('3. 检查台 `/check` 已于 Day21 收尾下线（2026-10-16）；恢复须先接登录加权限')
  lines.push('')
  lines.push('## 逐项证据')
  lines.push('')
  for (const r of results) {
    lines.push(`### ${r.id} ${r.title} —— ${r.status}`)
    lines.push('')
    lines.push(`- 判据来源：${r.source}`)
    lines.push(`- 结论：${r.summary}`)
    for (const e of r.evidence) lines.push(`- ${e}`)
    lines.push('')
  }

  const dir = OUT_ARG ? path.dirname(path.resolve(REPO, OUT_ARG)) : RUNS_DIR
  mkdirSync(dir, { recursive: true })
  let outPath
  if (OUT_ARG) {
    outPath = path.resolve(REPO, OUT_ARG)
  } else {
    let n = 1
    do {
      outPath = path.join(dir, n === 1 ? `${dayStamp()}.md` : `${dayStamp()}-${n}.md`)
      n += 1
    } while (existsSync(outPath))
  }
  writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`报告：${path.relative(REPO, outPath).replace(/\\/g, '/')}`)

  process.exit(fail === 0 ? 0 : 1)
}

main()
