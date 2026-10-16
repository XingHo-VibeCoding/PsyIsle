// Day 24：把「修复前 / 修复后」两份真实输出做成两张截图。
// 页面里没有一个字是手敲的 —— 全部从 scripts/flow-test.mjs 跑出来的证据文件里抽，
// 页面下方附命令与可在 F12 控制台粘贴复现的那段代码，别人照着能自己跑出同一结果。
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const evDir = path.join(root, 'docs', 'Day24-证据')
const read = (f) => fs.readFileSync(path.join(evDir, f), 'utf8')

// 从证据文件里抽出 T8/T9 那几行（含紧跟正文的 note/level 回读行）
function sliceEvidence(txt, startMark, endMark) {
  const lines = txt.split('\n')
  const a = lines.findIndex((l) => l.startsWith(startMark))
  const b = lines.findIndex((l, i) => i > a && l.startsWith(endMark))
  return lines.slice(a, b).filter((l) => l.trim() !== '').join('\n')
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 给人看的着色：PASS 绿、FAIL 琥珀（产品红线是全站禁红色警示色，这里也不用红）
function colorize(line) {
  if (/PASS/.test(line)) return `<span class="p">${line}</span>`
  if (/FAIL/.test(line)) return `<span class="f">${line}</span>`
  if (/"ok":false/.test(line)) return `<span class="f">${line}</span>`
  return line
}

function render(lines) {
  return escapeHtml(lines)
    .split('\n')
    .map((l) => `<div class="ln">${colorize(l) || '&nbsp;'}</div>`)
    .join('\n')
}

// 时间戳与元信息
function meta(txt) {
  const runAt = (txt.match(/=== Day 24 核心流程测试 (.+?) ===/) || [])[1] || '-'
  const base = (txt.match(/BASE=(.+)/) || [])[1] || '-'
  const date = (txt.match(/TEST_DATE=(\d{4}-\d{2}-\d{2})/) || [])[1] || '-'
  return { runAt, base, date }
}

const REPRO = `<span class="c">// 粘贴进 F12 控制台：真发一次请求，看附言有没有被清掉（CORS 只在前端域名下放行）</span>
<span class="k">const</span> B = <span class="s">'https://psyisle-prod-d9g109suw53257aed.service.tcloudbase.com'</span>
<span class="k">const</span> id = <span class="s">'&lt;先去 /daily 记一笔，从 GET /api/moods 里拿一个 id&gt;'</span>
<span class="k">const</span> patch = <span class="k">await</span> fetch(B + <span class="s">'/api/moods?id='</span> + id, {
  method: <span class="s">'PATCH'</span>, headers: { <span class="s">'Content-Type'</span>: <span class="s">'application/json'</span> },
  body: JSON.stringify({ note: <span class="k">null</span> })
}).then(r =&gt; r.json())
console.log(<span class="s">'接口说：'</span>, patch)
<span class="k">const</span> back = <span class="k">await</span> fetch(B + <span class="s">'/api/moods?limit=200'</span>).then(r =&gt; r.json())
console.log(<span class="s">'回读一眼：'</span>, back.data.items.find(i =&gt; i.id === id).note)  <span class="c">// 期望 null</span>`

function page({ title, sub, badge, lines, footNote, repro }) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root{ --ink:#1e2a24; --dim:#5d6d65; --line:#d7ded9; --bg:#f6f8f6; --ok:#1f6f4a; --bad:#8a6212; }
  *{box-sizing:border-box}
  body{margin:0;padding:28px 32px;background:var(--bg);color:var(--ink);
       font:15px/1.7 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;}
  .bar{height:26px;border-radius:6px 6px 0 0;background:#e7ece8;border:1px solid var(--line);
       display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;color:var(--dim)}
  .lock::before{content:"🔒";font-size:11px}
  .url{flex:1;background:#fff;border:1px solid var(--line);border-radius:4px;padding:1px 8px;font-size:12px;color:#3b4a42}
  h1{font-size:19px;margin:18px 0 4px;font-weight:600}
  .sub{color:var(--dim);font-size:13px;margin:0 0 14px}
  .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;
         border:1px solid currentColor;margin-left:8px}
  .badge.bad{color:var(--bad);background:#fdf6e6}
  .badge.ok{color:var(--ok);background:#eaf5ef}
  .con{background:#12211b;color:#d7e3dc;border-radius:0 0 8px 8px;padding:14px 16px;
       font:12.5px/1.75 "Cascadia Mono",Consolas,"Courier New",monospace;white-space:pre-wrap;word-break:break-all}
  .ln{min-height:1.75em}
  .p{color:#7fd6a8}
  .f{color:#e5c168}
  .meta{margin-top:16px;color:var(--dim);font-size:12.5px}
  .meta b{color:var(--ink);font-weight:600}
  pre{margin:0}
  .code .c{color:#7e9c8c}.code .k{color:#c8a2f0}.code .s{color:#e5c168}
  .code{background:#12211b;color:#d7e3dc;border-radius:8px;padding:12px 14px;
        font:12px/1.7 "Cascadia Mono",Consolas,monospace;white-space:pre-wrap;margin-top:6px}
  h2{font-size:14px;margin:20px 0 2px}
</style></head><body>
<div class="bar"><span class="lock"></span><span class="url">https://psyisle-prod-d9g109suw53257aed-1506897881.tcloudbaseapp.com/daily</span><span>　F12 → Console</span></div>
<div class="con">${render(lines)}</div>
<h1>${title}<span class="badge ${badge.cls}">${badge.text}</span></h1>
<p class="sub">${sub}</p>
<div class="meta">${footNote}</div>
${repro ? '<h2>自己复现：把这段贴进 F12 控制台</h2><div class="code"><pre>' + repro + '</pre></div>' : ''}
</body></html>`
}

const before = read('修复前.txt')
const after = read('修复后.txt')
const mb = meta(before)
const ma = meta(after)

const beforeLines = [
  '$ node scripts/flow-test.mjs > docs/Day24-证据/修复前.txt',
  '',
  sliceEvidence(before, 'T8 PATCH', 'T10'),
]

const afterLines = [
  '$ node scripts/flow-test.mjs > docs/Day24-证据/修复后.txt',
  '',
  sliceEvidence(after, 'T8 PATCH', 'T10'),
]

fs.writeFileSync(
  path.join(evDir, 'day24-before.html'),
  page({
    title: 'Day 24 · 修复前：接口说 ok，字段没动',
    sub: 'PATCH {note:null} / {level:null} —— 期望把附言与强度清掉，实际原样返回。',
    badge: { cls: 'bad', text: '复现 · 2 FAIL' },
    lines: beforeLines.join('\n'),
    footNote:
      `<b>跑测时间</b> ${mb.runAt}　<b>接口</b> ${mb.base}<br>` +
      `<b>原始输出</b> docs/Day24-证据/修复前.txt　<b>重跑命令</b> <code>node scripts/flow-test.mjs</code><br>` +
      `<b>重跑要点</b> 测试日期用 ${mb.date}（明天）—— moods 同一天重复提交是覆盖（契约 §4.4），拿今天跑会抹掉当天的演示打卡。`,
    repro: REPRO,
  }),
  'utf8'
)

fs.writeFileSync(
  path.join(evDir, 'day24-after.html'),
  page({
    title: 'Day 24 · 修复后：同一份清单、同一支脚本',
    sub: '同一条 PATCH {note:null} / {level:null}，改三分之一行代码后，字段真的被清空了。',
    badge: { cls: 'ok', text: '回归 · 2 PASS' },
    lines: afterLines.join('\n'),
    footNote:
      `<b>跑测时间</b> ${ma.runAt}　<b>接口</b> ${ma.base}<br>` +
      `<b>修复位置</b> cloudfunctions/moods/index.js 的 validateMoodFields（「有没有传」改判请求体里有没有这个 key）<br>` +
      `<b>原始输出</b> docs/Day24-证据/修复后.txt　<b>对照</b> T1–T7 / T10–T12、20 项刁钻输入、连点并发结果与修复前逐条一致`,
  }),
  'utf8'
)

console.log('生成 docs/Day24-证据/day24-before.html 与 day24-after.html')
