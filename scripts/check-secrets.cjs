'use strict'

// Day 23 · 密钥与仓库卫生自查（一键版）
//
// 为什么要有这个脚本：清单里原本是把 grep 命令直接写在 markdown 表格里的，
// 表格要用反斜杠转义竖线，于是命令里变成了 `ghp_\|AKIA` —— 在 -E 模式下
// `\|` 是「字面竖线」，实际搜的是 "ghp_|AKIA" 这个字符串，永远 0 命中。
// 结论正确但是假阴性：真的写了 ghp_ 开头的令牌也搜不出来。
// 所以特征词只在这里定义一次，清单里改成跑这个脚本，避免再粘错。
//
// 怎么跑（仓库根目录，零依赖，Node 18+）：
//   node scripts/check-secrets.cjs
// 退出码 0 = 全过；1 = 有项没过（哪项没过会打出来）。
//
// 覆盖清单第 1 / 2 / 3 / 4 / 5 / 11 项。

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

// ── 特征词：唯一出处 ──────────────────────────────────────────────
// 只放「看起来就是密钥 / 凭据」的形态，不放大普通名词，免得天天误报。
const PATTERN = new RegExp(
  [
    'ghp_[A-Za-z0-9]{20,}', // GitHub 经典令牌
    'github_pat_[A-Za-z0-9_]{20,}', // GitHub 细粒度令牌
    'AKIA[0-9A-Z]{16}', // AWS Access Key
    'AIza[0-9A-Za-z_\\-]{30,}', // Google API Key
    'xox[baprs]-[A-Za-z0-9\\-]{10,}', // Slack
    'sk-[A-Za-z0-9]{16,}', // OpenAI 风格
    '-----BEGIN [A-Z ]*PRIVATE KEY-----', // 私钥
    'postgres(ql)?://[^\\s"\'`]*:[^\\s"\'`]*@', // 带密码的连接串
    'mongodb(\\+srv)?://[^\\s"\'`]*:[^\\s"\'`]*@',
    '(password|passwd|secret|api_?key|apikey|access_?token|private_key|client_secret)\\s*[:=]\\s*["\'][^"\']{6,}', // 赋值形态
  ].join('|'),
  'i'
)

// 自身说明里必然出现特征词的文件 —— 不排除就会天天「命中自己」。
// 注意：这里排除的是「扫描工具与文档」，不是业务代码。业务代码一处都不排除。
const SELF_REFERENTIAL = [
  'scripts/check-secrets.cjs',
  'scripts/verify-project.mjs',
  'docs/Day23-安全审计与自查清单.md',
]

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.workbuddy'])
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.map'])

const problems = []
const out = []
function line(s) {
  out.push(s)
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

// ── 1. 已跟踪文件（工作区 + 索引） ────────────────────────────────
function checkTracked() {
  const files = git(['ls-files']).split('\n').filter(Boolean)
  const hits = []
  for (const f of files) {
    if (SELF_REFERENTIAL.includes(f)) continue
    let text
    try {
      text = fs.readFileSync(path.join(ROOT, f), 'utf8')
    } catch {
      continue // 二进制 / 权限问题，跳过
    }
    text.split('\n').forEach((l, i) => {
      if (PATTERN.test(l)) hits.push(f + ':' + (i + 1) + '  ' + l.trim().slice(0, 140))
    })
  }
  line('[1] 已跟踪文件（' + files.length + ' 个，排除 ' + SELF_REFERENTIAL.length + ' 个自引用文件）')
  line(hits.length ? hits.map((h) => '      HIT ' + h).join('\n') : '      命中 0 条')
  line('')
  if (hits.length) problems.push('[1] 已跟踪文件命中 ' + hits.length + ' 处密钥特征词')
}

// ── 2. 全部 Git 历史 ──────────────────────────────────────────────
function checkHistory() {
  const commits = git(['rev-list', '--all']).split('\n').filter(Boolean)
  const args = ['grep', '-I', '-l', '-E', PATTERN.source]
  for (const c of commits) args.push(c)
  args.push('--')
  SELF_REFERENTIAL.forEach((f) => args.push(':(exclude)' + f))

  let res = ''
  try {
    res = git(args)
  } catch (e) {
    // git grep 没命中时退出码是 1，不是错
    if (e.status !== 1) throw e
  }
  const hits = res.split('\n').filter(Boolean)
  line('[2] 全部 Git 历史（' + commits.length + ' 笔，逐笔扫，排除自引用文件）')
  line(hits.length ? hits.map((h) => '      HIT ' + h).join('\n') : '      命中 0 条')
  line('')
  if (hits.length) problems.push('[2] Git 历史命中 ' + hits.length + ' 处')
}

// ── 3. 工作区全部文件（含被 .gitignore 忽略的） ───────────────────
function checkWorktree() {
  let scanned = 0
  const hits = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        walk(path.join(dir, e.name))
        continue
      }
      const full = path.join(dir, e.name)
      if (SKIP_EXT.has(path.extname(e.name).toLowerCase())) continue
      const rel = path.relative(ROOT, full).replace(/\\/g, '/')
      if (SELF_REFERENTIAL.includes(rel)) continue
      let text
      try {
        text = fs.readFileSync(full, 'utf8')
      } catch {
        continue
      }
      scanned++
      text.split('\n').forEach((l, i) => {
        if (PATTERN.test(l)) hits.push(rel + ':' + (i + 1) + '  ' + l.trim().slice(0, 140))
      })
    }
  }
  walk(ROOT)

  line('[3] 工作区全部文件（含被忽略的，排除 node_modules/.git/dist/.workbuddy）')
  line('      扫描文件数：' + scanned)
  line(hits.length ? hits.map((h) => '      HIT ' + h).join('\n') : '      命中 0 条')
  line('')
  if (hits.length) problems.push('[3] 工作区命中 ' + hits.length + ' 处')
}

// ── 4. 环境变量文件 ───────────────────────────────────────────────
// 注意判据：本地「磁盘上存在 .env」是正常且必需的（不然没法开发），不算不合格。
// 不合格的是「.env 进了索引 / 被跟踪 / 没被忽略」——那才叫进了仓库。
function checkEnvFiles() {
  const tracked = git(['ls-files']).split('\n').filter(Boolean)
  const trackedEnv = tracked.filter((f) => /(^|\/)\.env/.test(f))
  const badTracked = trackedEnv.filter((f) => !f.endsWith('.env.example'))

  // 暂存区里有没有（这才是「会被提交出去」的状态，Day 23 就是在这抓到的）
  let staged = []
  try {
    staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean)
  } catch {
    staged = []
  }
  const badStaged = staged.filter((f) => /(^|\/)\.env/.test(f) && !f.endsWith('.env.example'))
  // git ls-files 列的是索引，已经包含暂存区，同一个文件会同时出现在两边 —— 去重
  const badEnv = [...new Set([...badTracked, ...badStaged])]

  const onDisk = ['', 'frontend/']
    .flatMap((p) => ['.env', '.env.local', '.env.production'].map((n) => p + n))
    .filter((f) => fs.existsSync(path.join(ROOT, f)))

  const checks = [
    ['.env 系列没有进索引、也没被跟踪', badEnv.length === 0,
      badEnv.length
        ? '混进来了：' + badEnv.join(', ')
        : '被跟踪的只有 ' + (trackedEnv.join(', ') || '（无）')],
    ['根 .env.example 存在', fs.existsSync(path.join(ROOT, '.env.example')), fs.existsSync(path.join(ROOT, '.env.example')) ? '存在' : '缺失'],
    ['frontend/.env.example 存在', fs.existsSync(path.join(ROOT, 'frontend/.env.example')), fs.existsSync(path.join(ROOT, 'frontend/.env.example')) ? '存在' : '缺失'],
  ]

  // git check-ignore：有输出 = 已忽略。这里直接看退出码，比看字面输出更稳。
  for (const probe of ['.env', '.env.production', '.env.local']) {
    let ignored = false
    try {
      execFileSync('git', ['check-ignore', '-q', probe], { cwd: ROOT, stdio: 'ignore' })
      ignored = true
    } catch {
      ignored = false
    }
    checks.push(['git check-ignore 判定 ' + probe + ' 已被忽略', ignored, ignored ? '已忽略' : '没被忽略 → 要修 .gitignore'])
  }

  line('[4] 环境变量文件')
  for (const [name, ok, detail] of checks) {
    line('      ' + (ok ? '✓' : '✗') + ' ' + name + '  —— ' + detail)
    if (!ok) problems.push('[4] ' + name)
  }
  line('      参考（不算不合格）：本地磁盘上存在 ' + (onDisk.join(', ') || '无') + '，均已被 .gitignore 拦住')
  line('')
}

// ── 5. 不该入库的文件类型 ─────────────────────────────────────────
function checkForbidden() {
  const tracked = git(['ls-files']).split('\n').filter(Boolean)
  const rules = [
    ['依赖目录 node_modules', (f) => f.includes('node_modules')],
    ['构建产物 dist', (f) => /(^|\/)dist\//.test(f)],
    ['私钥 / 凭据文件', (f) => /\.(pem|key|p12|pfx)$/.test(f) || /(^|\/)(secrets?|credentials)\..*\.?(json|ya?ml)$/i.test(f)],
    ['本地部署配置 cloudbaserc.json', (f) => /(^|\/)cloudbaserc\.json$/.test(f)],
    ['构建缓存 *.tsbuildinfo', (f) => f.endsWith('.tsbuildinfo')],
    ['日志 / 临时文件', (f) => /\.(log|tmp)$/.test(f)],
    ['凭据头文件 hdr.txt', (f) => /(^|\/)hdr\.txt$/.test(f)],
  ]
  line('[5] 不该入库的文件类型（被跟踪数应全为 0）')
  for (const [name, pred] of rules) {
    const hit = tracked.filter(pred)
    line('      ' + (hit.length ? '✗' : '✓') + ' ' + name + ' —— ' + hit.length + (hit.length ? ' 个：' + hit.slice(0, 3).join(', ') : ''))
    if (hit.length) problems.push('[5] ' + name + ' 有 ' + hit.length + ' 个被跟踪')
  }
  line('')
}

line('心汐 · 密钥与仓库卫生自查')
line('特征词：' + PATTERN.source.slice(0, 110) + '…')
line('自引用文件（故意包含特征词，已排除）：' + SELF_REFERENTIAL.join(' / '))
line('')
checkTracked()
checkHistory()
checkWorktree()
checkEnvFiles()
checkForbidden()

line('──────────────────────────────────────────')
if (problems.length) {
  line('✗ 未通过 ' + problems.length + ' 项：')
  problems.forEach((p) => line('  - ' + p))
  console.log(out.join('\n'))
  process.exit(1)
}
line('✓ 全部通过：仓库与历史里没有密钥，环境变量与不该入库的文件也都干净')
console.log(out.join('\n'))
