import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { readJson, writeJson } from '../lib/storage'

// 提建议：一份大学生能看懂、不过于复杂的问卷。
// 现在这一版没有收集通道：写一写那类记录已经上了云端，但建议这里刻意还没接，
// 所以提交后存在本机，并给一个「复制全部」把建议发到任何方便的地方告诉我们。
// 页面上说的「只存在这台设备上」就是字面意思，别在文案里改口。
const STORAGE_KEY = 'xinxin_suggestions'

type Suggestion = {
  id: string
  createdAt: string
  module: string
  rating: number
  main: string
  liked: string
  want: string
  contactOk: boolean
  contact: string
}

const MODULES = [
  { value: 'treehole', label: '倾诉树洞' },
  { value: 'guide', label: '指路灯' },
  { value: 'daily', label: '日常管家' },
  { value: 'none', label: '还没怎么用过' },
]

const RATING_WORDS = ['', '不太顺手', '一般般', '还行', '挺顺手', '很顺手']

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d="M12 2.6l2.85 6.18 6.65.78-4.95 4.6 1.32 6.6L12 17.9 6.13 20.76l1.32-6.6L2.5 9.56l6.65-.78z"
        fill={filled ? 'var(--forest-500)' : 'none'}
        stroke={filled ? 'var(--forest-500)' : 'var(--line-strong)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function copyText(text: string): boolean {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 落到下面的兜底 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function buildText(items: Suggestion[]) {
  return items
    .map((s, i) => {
      const m = MODULES.find((x) => x.value === s.module)?.label ?? '未选'
      let t = `建议 #${i + 1}（${formatDate(s.createdAt)}）\n`
      t += `· 最常来的板块：${m}\n`
      t += `· 整体打分：${s.rating || '未打分'} / 5\n`
      t += `· 最想改 / 最想加：${s.main}\n`
      if (s.liked) t += `· 觉得懂我的瞬间：${s.liked}\n`
      if (s.want) t += `· 想要的新功能：${s.want}\n`
      if (s.contactOk) t += `· 联系方式：${s.contact || '（想联系但没留）'}\n`
      return t
    })
    .join('\n')
}

export default function Suggest() {
  usePageTitle('提建议')

  const [moduleKey, setModuleKey] = useState('')
  const [rating, setRating] = useState(0)
  const [main, setMain] = useState('')
  const [liked, setLiked] = useState('')
  const [want, setWant] = useState('')
  const [contactOk, setContactOk] = useState(false)
  const [contact, setContact] = useState('')
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [list, setList] = useState<Suggestion[]>([])

  useEffect(() => {
    const saved = readJson<Suggestion[]>(STORAGE_KEY)
    if (saved && Array.isArray(saved)) setList(saved)
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (main.trim().length === 0) {
      setError('最上面那条「最想改 / 最想加的一点」先写一句吧，其他的都能空着。')
      return
    }
    const item: Suggestion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      module: moduleKey,
      rating,
      main: main.trim(),
      liked: liked.trim(),
      want: want.trim(),
      contactOk,
      contact: contactOk ? contact.trim() : '',
    }
    const next = [item, ...list]
    setList(next)
    writeJson(STORAGE_KEY, next)
    setJustSaved(true)
    setCopied('idle')
    setError('')
    setModuleKey('')
    setRating(0)
    setMain('')
    setLiked('')
    setWant('')
    setContactOk(false)
    setContact('')
  }

  function handleDelete(id: string) {
    const next = list.filter((s) => s.id !== id)
    setList(next)
    writeJson(STORAGE_KEY, next)
  }

  function handleCopy() {
    if (list.length === 0) return
    const ok = copyText(buildText(list))
    setCopied(ok ? 'ok' : 'fail')
    if (ok) window.setTimeout(() => setCopied('idle'), 2200)
  }

  return (
    <div className="page suggest">
      <style>{`
.suggest-banner{display:flex;gap:var(--sp-3);align-items:flex-start;background:var(--forest-50);border:1px solid var(--forest-300);border-radius:var(--r-md);padding:var(--sp-4) var(--sp-5);color:var(--forest-800);margin-bottom:var(--sp-6);font-size:var(--fs-body);line-height:1.7}
.suggest-banner svg{flex:none;margin-top:3px}
.suggest-q{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:var(--sp-5);margin-bottom:var(--sp-5);box-shadow:var(--sh-1),var(--sheen)}
.suggest-q h2{font-size:var(--fs-h3);color:var(--ink);margin:0 0 var(--sp-1)}
.suggest-q .req{color:var(--forest-700);font-size:var(--fs-meta);margin-left:var(--sp-2);font-weight:var(--fw-bold)}
.suggest-q .hint{color:var(--ink-mute);font-size:var(--fs-meta);margin:0 0 var(--sp-3)}
.suggest-seg{display:flex;flex-wrap:wrap;gap:var(--sp-2)}
.suggest-seg button{min-height:var(--tap);padding:var(--sp-2) var(--sp-4);background:var(--card);border:1px solid var(--line-strong);border-radius:var(--r-pill);color:var(--ink-soft);font-size:var(--fs-body);cursor:pointer;transition:border-color var(--t-fast),background-color var(--t-fast),color var(--t-fast)}
.suggest-seg button:hover{border-color:var(--forest-300)}
.suggest-seg button[aria-pressed="true"]{background:var(--forest-50);border-color:var(--forest-500);color:var(--forest-800);font-weight:var(--fw-bold)}
.suggest-stars{display:flex;align-items:center;gap:var(--sp-1);flex-wrap:wrap}
.suggest-stars button{width:var(--tap);height:var(--tap);display:inline-flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:0;border-radius:var(--r-sm)}
.suggest-stars button:focus-visible{outline:2px solid var(--forest-500);outline-offset:2px}
.suggest-rating-word{margin-left:var(--sp-3);color:var(--ink-mute);font-size:var(--fs-meta)}
.suggest-textarea,.suggest-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:var(--fs-body);color:var(--ink);background:var(--card);border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:var(--sp-3);transition:border-color var(--t-fast),box-shadow var(--t-fast)}
.suggest-textarea{min-height:96px;resize:vertical;line-height:1.6}
.suggest-textarea:focus,.suggest-input:focus{outline:none;border-color:var(--forest-500);box-shadow:0 0 0 3px var(--forest-50)}
.suggest-actions{display:flex;align-items:center;gap:var(--sp-4);flex-wrap:wrap;margin-top:var(--sp-2)}
.suggest-error{color:var(--forest-800);background:var(--forest-50);border:1px solid var(--forest-300);border-radius:var(--r-sm);padding:var(--sp-3) var(--sp-4);font-size:var(--fs-meta);margin-top:var(--sp-4);line-height:1.6}
.suggest-note{color:var(--ink-mute);font-size:var(--fs-meta);line-height:1.7;margin-top:var(--sp-4)}
.suggest-divider{height:1px;background:var(--line);border:none;margin:var(--sp-8) 0}
.suggest-list-head{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-4);flex-wrap:wrap;margin-bottom:var(--sp-4)}
.suggest-list-head h2{font-size:var(--fs-h3);color:var(--ink);margin:0}
.suggest-item{border:1px solid var(--line);border-radius:var(--r-md);padding:var(--sp-4);margin-bottom:var(--sp-3)}
.suggest-item-top{display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap;margin-bottom:var(--sp-2)}
.suggest-item-tag{display:inline-flex;align-items:center;padding:2px var(--sp-3);background:var(--forest-50);border-radius:var(--r-pill);color:var(--forest-700);font-size:var(--fs-meta)}
.suggest-item-date{color:var(--ink-mute);font-size:var(--fs-meta)}
.suggest-item-del{margin-left:auto;background:none;border:none;color:var(--ink-mute);font-size:var(--fs-meta);cursor:pointer;padding:var(--sp-1) var(--sp-2);border-radius:var(--r-sm)}
.suggest-item-del:hover{color:var(--forest-800);text-decoration:underline}
.suggest-item-text{color:var(--ink-soft);font-size:var(--fs-body);line-height:1.6;white-space:pre-wrap;margin:0 0 var(--sp-2)}
.suggest-item-text:last-child{margin-bottom:0}
@media (max-width:768px){.suggest-actions{flex-direction:column;align-items:stretch}.suggest-actions .btn{width:100%}}
`}</style>

      <header className="page-head">
        <h1>想给心汐提个建议？</h1>
        <p className="page-sub">用着顺手吗？哪里别扭、哪里想要、甚至想吐槽，都欢迎写下来。不用客气，想到哪写到哪。</p>
      </header>

      {justSaved && (
        <div className="suggest-banner" role="status">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--forest-700)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>收到啦，谢谢你愿意花时间写这些。你在这台设备上留的建议都在下面，需要的话可以复制发给我们。</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <section className="suggest-q">
          <h2>1 · 你最常来的是哪一块？</h2>
          <p className="hint">帮我们对上号，建议更好落到地方。</p>
          <div className="suggest-seg">
            {MODULES.map((m) => (
              <button type="button" key={m.value} aria-pressed={moduleKey === m.value} onClick={() => setModuleKey(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section className="suggest-q">
          <h2>2 · 整体感觉打几分？</h2>
          <p className="hint">凭直觉点几颗，不纠结。</p>
          <div className="suggest-stars" role="group" aria-label="整体满意度，1 到 5 分">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} aria-label={`打 ${n} 分`} aria-pressed={rating >= n} onClick={() => setRating(n)}>
                <Star filled={rating >= n} />
              </button>
            ))}
            <span className="suggest-rating-word">{RATING_WORDS[rating]}</span>
          </div>
        </section>

        <section className="suggest-q">
          <h2>3 · 最想改 / 最想加的一点<span className="req">必填</span></h2>
          <p className="hint">一句话也行，比如「夜间模式太亮了」「希望能导出我的记录」。</p>
          <textarea className="suggest-textarea" value={main} onChange={(e) => setMain(e.target.value)} placeholder="写在这里…" />
        </section>

        <section className="suggest-q">
          <h2>4 · 有没有哪个瞬间让你觉得「这个 App 有点懂我」？</h2>
          <p className="hint">选填。这种瞬间最值得多来一点。</p>
          <textarea className="suggest-textarea" value={liked} onChange={(e) => setLiked(e.target.value)} placeholder="比如某句话正好说到心坎里…" />
        </section>

        <section className="suggest-q">
          <h2>5 · 如果加一个新功能，你最想要什么？</h2>
          <p className="hint">选填。天马行空也没关系。</p>
          <textarea className="suggest-textarea" value={want} onChange={(e) => setWant(e.target.value)} placeholder="比如…" />
        </section>

        <section className="suggest-q">
          <h2>6 · 愿意让我们之后联系你吗？</h2>
          <p className="hint">选填。只想匿名说也完全 OK。</p>
          <div className="suggest-seg">
            <button type="button" aria-pressed={!contactOk} onClick={() => { setContactOk(false); setContact('') }}>
              不用了，匿名就好
            </button>
            <button type="button" aria-pressed={contactOk} onClick={() => setContactOk(true)}>
              可以，留个联系方式
            </button>
          </div>
          {contactOk && (
            <input
              className="suggest-input"
              style={{ marginTop: 'var(--sp-3)' }}
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="微信 / 邮箱 / QQ，留一个就行"
            />
          )}
        </section>

        {error && <div className="suggest-error">{error}</div>}

        <div className="suggest-actions">
          <button type="submit" className="btn btn-primary">提交建议</button>
          <Link to="/" className="btn btn-quiet">先回首页逛逛</Link>
        </div>
        <p className="suggest-note">
          现在这一版，建议只存在你这台设备上，我们暂时收不到。等以后有了收集通道，会改成能直接发给我们——在那之前，你可以点下面的「复制全部」，把建议发到任何你觉得方便的地方告诉我们。
        </p>
      </form>

      {list.length > 0 && (
        <>
          <hr className="suggest-divider" />
          <div className="suggest-list-head">
            <h2>你在这台设备上留了 {list.length} 条建议</h2>
            <button type="button" className="btn btn-quiet" onClick={handleCopy}>
              {copied === 'ok' ? '已复制' : '复制全部'}
            </button>
          </div>
          <div>
            {list.map((s) => {
              const m = MODULES.find((x) => x.value === s.module)?.label
              return (
                <div className="suggest-item" key={s.id}>
                  <div className="suggest-item-top">
                    {m && <span className="suggest-item-tag">{m}</span>}
                    {s.rating > 0 && <span className="suggest-item-tag">{s.rating} / 5</span>}
                    <span className="suggest-item-date">{formatDate(s.createdAt)}</span>
                    <button type="button" className="suggest-item-del" onClick={() => handleDelete(s.id)}>删除</button>
                  </div>
                  <p className="suggest-item-text">{s.main}</p>
                  {s.liked && <p className="suggest-item-text">懂我的瞬间：{s.liked}</p>}
                  {s.want && <p className="suggest-item-text">想要的新功能：{s.want}</p>}
                  {s.contactOk && s.contact && <p className="suggest-item-text">联系方式：{s.contact}</p>}
                </div>
              )
            })}
          </div>
          {copied === 'fail' && (
            <p className="suggest-note">复制没成功，你可以直接选中上面的文字手动复制。</p>
          )}
        </>
      )}
    </div>
  )
}
