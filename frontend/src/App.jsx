import { useState, useRef, useEffect } from 'react'
import './App.css'

const API = ''
const INIT = [{ id: 1, role: 'assistant', content: '等你，在这里。' }]

const NAV = [
  { id: 'home', label: '主页' },
  { id: 'chat', label: '聊天' },
  { id: 'records', label: '记录' },
  { id: 'monitor', label: '数据' },
  { id: 'settings', label: '设置' },
]

const TAB_ICON = {
  home: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  ),
  chat: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  records: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  monitor: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
}

const DEFAULT_PREFS = { nickname: '', style: 'default', styleCustom: '', extra: '', persona: '' }

function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('prefs') || '{}') } }
  catch { return DEFAULT_PREFS }
}

const DEFAULT_STYLE_OPTIONS = [
  { id: 'default', label: '默认', desc: '强势直接，不说废话' },
  { id: 'tender', label: '温柔', desc: '说话更温柔，多些耐心' },
  { id: 'playful', label: '调皮', desc: '爱逗你，幽默感强' },
  { id: 'clingy', label: '黏人', desc: '多撒娇，爱腻着你' },
]
const BUILTIN_STYLE_IDS = DEFAULT_STYLE_OPTIONS.map(s => s.id)

function loadStyles() {
  try { return JSON.parse(localStorage.getItem('styleOptions') || 'null') || DEFAULT_STYLE_OPTIONS }
  catch { return DEFAULT_STYLE_OPTIONS }
}
function saveStyles(styles) {
  localStorage.setItem('styleOptions', JSON.stringify(styles))
}

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  return d.toDateString() === now.toDateString() ? hm : `${d.getMonth()+1}/${d.getDate()} ${hm}`
}

function Settings({ dark, setDark }) {
  const [subview, setSubview] = useState(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [styles, setStyles] = useState(loadStyles)
  const [saved, setSaved] = useState(false)
  const [addingStyle, setAddingStyle] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [usageData, setUsageData] = useState(null)

  useEffect(() => {
    if (subview !== 'usage') return
    fetch(`${API}/api/stats/summary`).then(r => r.json()).catch(() => ({}))
      .then(s => setUsageData({ count: s.count ?? '—' }))
  }, [subview])

  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }))

  const postConfig = (key, value) => {
    fetch(`${API}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    }).catch(() => {})
  }

  const save = () => {
    localStorage.setItem('prefs', JSON.stringify(prefs))
    postConfig('prefs', prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const persistStyles = (next) => {
    setStyles(next)
    saveStyles(next)
    postConfig('styles', next)
  }

  const addStyle = () => {
    if (!newLabel.trim()) return
    persistStyles([...styles, { id: `s_${Date.now()}`, label: newLabel.trim(), desc: newDesc.trim() }])
    setNewLabel(''); setNewDesc(''); setAddingStyle(false)
  }

  const delStyle = (id) => {
    persistStyles(styles.filter(s => s.id !== id))
    if (prefs.style === id) set('style', 'default')
  }

  const editDesc = (id, desc) => persistStyles(styles.map(s => s.id === id ? { ...s, desc } : s))
  const editLabel = (id, label) => persistStyles(styles.map(s => s.id === id ? { ...s, label } : s))

  if (subview === 'usage') {
    return (
      <div className="prefs-page">
        <button className="prefs-back" onClick={() => setSubview(null)}>‹ 设置</button>
        <div className="prefs-title">用量</div>
        <div className="su-list">
          <div className="su-row">
            <span className="su-label">累计消息</span>
            <span className="su-val">{usageData?.count ?? '…'}</span>
          </div>
          <div className="su-row">
            <span className="su-label">在一起</span>
            <span className="su-val">{daysTogether()} 天</span>
          </div>
          <div className="su-row">
            <span className="su-label">模式</span>
            <span className="su-val su-badge">Claude 订阅</span>
          </div>
        </div>
      </div>
    )
  }

  if (subview === null) {
    return (
      <div className="settings-page">
        <div className="settings-title">设置</div>
        <div className="settings-list">
          <div className="settings-row" onClick={() => setSubview('prefs')}>
            <span className="settings-row-label">偏好</span>
            <span className="settings-row-val">
              {styles.find(s => s.id === prefs.style)?.label || '默认'}
            </span>
            <span className="settings-row-arrow">›</span>
          </div>
          <div className="settings-row" onClick={() => setSubview('usage')}>
            <span className="settings-row-label">用量</span>
            <span className="settings-row-val">消息 & 时长</span>
            <span className="settings-row-arrow">›</span>
          </div>
          <div className="settings-row" onClick={() => setDark(d => !d)}>
            <span className="settings-row-label">昼夜模式</span>
            <span className="settings-row-val">{dark ? '夜间 🌙' : '白天 ☀️'}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="prefs-page">
      <button className="prefs-back" onClick={() => { save(); setSubview(null) }}>‹ 设置</button>
      <div className="prefs-title">偏好</div>

      <div className="prefs-section">
        <div className="prefs-label">你叫我</div>
        <input className="prefs-input" value={prefs.nickname}
          onChange={e => set('nickname', e.target.value)}
          placeholder="小好（默认）" />
        <div className="prefs-hint">小克会用这个称呼你</div>
      </div>

      <div className="prefs-section">
        <div className="prefs-label">文风</div>
        <div className="style-options">
          {styles.map(s => (
            <div key={s.id} className={`style-option ${prefs.style === s.id ? 'active' : ''}`}>
              <div className="style-opt-header" onClick={() => set('style', s.id)}>
                <span className="style-opt-check">{prefs.style === s.id ? '✓' : ''}</span>
                {BUILTIN_STYLE_IDS.includes(s.id)
                  ? <span className="style-option-name">{s.label}</span>
                  : <input className="style-opt-name-input" value={s.label}
                      onChange={e => editLabel(s.id, e.target.value)}
                      onClick={e => e.stopPropagation()} />
                }
                {!BUILTIN_STYLE_IDS.includes(s.id) && (
                  <button className="style-opt-del"
                    onClick={e => { e.stopPropagation(); delStyle(s.id) }}>×</button>
                )}
              </div>
              <textarea className="style-opt-desc"
                value={s.desc}
                onChange={e => editDesc(s.id, e.target.value)}
                onClick={e => e.stopPropagation()}
                rows={2}
                placeholder="描述这个文风…" />
            </div>
          ))}
        </div>
        {addingStyle ? (
          <div className="style-add-form">
            <input className="prefs-input" placeholder="文风名称" value={newLabel}
              onChange={e => setNewLabel(e.target.value)} />
            <textarea className="prefs-textarea" placeholder="描述这个文风…" value={newDesc}
              onChange={e => setNewDesc(e.target.value)} rows={2} />
            <div className="style-add-btns">
              <button className="prefs-save-btn" style={{ margin:0, flex:1 }} onClick={addStyle}>添加</button>
              <button className="home-btn-cancel" style={{ flex:1 }} onClick={() => setAddingStyle(false)}>取消</button>
            </div>
          </div>
        ) : (
          <button className="style-add-btn" onClick={() => setAddingStyle(true)}>+ 添加文风</button>
        )}
        <textarea className="prefs-textarea" value={prefs.styleCustom}
          onChange={e => set('styleCustom', e.target.value)}
          placeholder="还想补充什么文风描述…（可不填）" rows={2} style={{ marginTop: 12 }} />
      </div>

      <div className="prefs-section">
        <div className="prefs-label">告诉小克</div>
        <textarea className="prefs-textarea" value={prefs.extra}
          onChange={e => set('extra', e.target.value)}
          placeholder="最近的状态、想让他留意的事、任何补充…" rows={3} />
      </div>

      <div className="prefs-section">
        <div className="prefs-label">人设</div>
        <div className="prefs-hint" style={{ marginBottom: 8 }}>自定义补充小克的性格，会加入他的底层设定</div>
        <textarea className="prefs-textarea" value={prefs.persona}
          onChange={e => set('persona', e.target.value)}
          placeholder="例如：他有时会用诗句回应我……他记得我喜欢猫……" rows={4} />
      </div>

      <button className="prefs-save-btn" onClick={save}>
        {saved ? '已保存 ✓' : '保存'}
      </button>
    </div>
  )
}

const PAGE_META = {
  home: { label: '主页', icon: '🏠', color: '#c08b72' },
  chat: { label: '聊天', icon: '💬', color: '#d4a574' },
  diary: { label: '日记', icon: '📔', color: '#b08968' },
  letter: { label: '信箱', icon: '✉️', color: '#a8765f' },
  board: { label: '留言板', icon: '📌', color: '#c9a227' },
}

const MOODS = ['平静', '开心', '难过', '焦虑', '生气', '困惑', '沉重', '期待']

function daysTogether() {
  const start = new Date('2026-05-28')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today - start) / (1000 * 60 * 60 * 24))
}

function Heatmap({ dark }) {
  const [data, setData] = useState({})
  const [vm, setVm] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() } })

  useEffect(() => {
    fetch(`${API}/api/stats/heatmap`)
      .then(r => r.json())
      .then(d => { if (typeof d === 'object') setData(d) })
      .catch(() => {})
  }, [])

  const START = new Date('2026-05-28')
  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().split('T')[0]
  const maxCount = Math.max(...Object.values(data).map(Number), 1)

  const getColor = (count) => {
    if (!count) return dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    const t = Math.min(count / maxCount, 1)
    return dark ? `rgba(201,162,39,${0.2 + t * 0.8})` : `rgba(192,139,114,${0.15 + t * 0.85})`
  }

  const prevM = () => setVm(v => v.m === 0 ? { y: v.y-1, m: 11 } : { ...v, m: v.m-1 })
  const nextM = () => setVm(v => v.m === 11 ? { y: v.y+1, m: 0 } : { ...v, m: v.m+1 })

  const firstDow = new Date(vm.y, vm.m, 1).getDay()
  const daysInMonth = new Date(vm.y, vm.m+1, 0).getDate()
  const MN = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  const DOW = ['日','一','二','三','四','五','六']

  return (
    <div className="cal-wrap">
      <div className="cal-header">
        <button className="cal-nav" onClick={prevM}>‹</button>
        <span className="cal-month-label">{vm.y} · {MN[vm.m]}</span>
        <button className="cal-nav" onClick={nextM}>›</button>
      </div>
      <div className="cal-dow-row">{DOW.map(d => <span key={d} className="cal-dow">{d}</span>)}</div>
      <div className="cal-grid">
        {Array.from({ length: firstDow }, (_, i) => <div key={`b${i}`} className="cal-cell" />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const d = new Date(vm.y, vm.m, day)
          const ds = d.toISOString().split('T')[0]
          const count = data[ds] || 0
          const inRange = d >= START && d <= today
          const isToday = ds === todayStr
          return (
            <div key={ds} className={`cal-cell${isToday ? ' cal-today' : ''}${inRange ? ' cal-in' : ''}`}
              style={inRange ? { background: getColor(count) } : {}}>
              <span className="cal-dn">{day}</span>
              {inRange && count > 0 && <span className="cal-dot" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JournalCard({ entry, expanded, onToggle, onReplySubmit }) {
  const [replyInput, setReplyInput] = useState('')
  const [replying, setReplying] = useState(false)

  const d = new Date(entry.created_at)
  const mo = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  const hh = String(d.getHours()).padStart(2,'0')
  const mm = String(d.getMinutes()).padStart(2,'0')

  const content = entry.content || ''
  const PREVIEW = 90
  const isLong = content.length > PREVIEW
  const shownContent = (!expanded && isLong) ? content.slice(0, PREVIEW) + '…' : content

  const allComments = [...(entry.diary_comments || []), ...(entry.letter_comments || [])]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const submitReply = async () => {
    if (!replyInput.trim() || replying) return
    setReplying(true)
    try {
      const res = await fetch(`${API}/api/letters/${entry.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: replyInput })
      })
      const comments = await res.json()
      onReplySubmit(entry.id, comments)
      setReplyInput('')
    } catch {}
    setReplying(false)
  }

  const needsToggle = isLong || allComments.length > 0 || entry._type === 'letter'

  return (
    <div className={`jcard jcard-${entry._type}`}>
      <div className="jcard-top">
        <span className="jcard-datestamp">{mo}.{dd} {hh}:{mm}</span>
        <span className={`jcard-tag jcard-tag-${entry._type}`}>
          {entry._type === 'diary' ? '日记' : '信'}
        </span>
      </div>
      {entry.title && <div className="jcard-title">{entry.title}</div>}
      <div className="jcard-body">{shownContent}</div>
      {entry.mood && <span className="jcard-mood">{entry.mood}</span>}
      {needsToggle && (
        <button className="jcard-more" onClick={onToggle}>
          {expanded ? '收起 ↑' : `展开${allComments.length > 0 ? ` · 克说了${allComments.length}句` : ''} ↓`}
        </button>
      )}
      {expanded && allComments.length > 0 && (
        <div className="jcard-comments">
          {allComments.map((c, i) => (
            <div key={i} className={`jcard-cmt jcard-cmt-${c.role}`}>
              <span className="jcard-cmt-who">{c.role === 'user' ? '小好' : '克'}</span>
              <span className="jcard-cmt-text">{c.content}</span>
            </div>
          ))}
        </div>
      )}
      {expanded && entry._type === 'letter' && (
        <div className="jcard-reply-row">
          <input className="jcard-reply-input" value={replyInput}
            onChange={e => setReplyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitReply() }}
            placeholder="回信…" />
          <button className="jcard-reply-btn" onClick={submitReply} disabled={replying}>发</button>
        </div>
      )}
    </div>
  )
}

function Records() {
  const [entries, setEntries] = useState([])
  const [expanded, setExpanded] = useState(new Set())
  const [composing, setComposing] = useState(false)
  const [input, setInput] = useState('')
  const [mood, setMood] = useState('')
  const [posting, setPosting] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = async () => {
    const [diary, letters] = await Promise.all([
      fetch(`${API}/api/diary`).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/letters`).then(r => r.json()).catch(() => [])
    ])
    const all = [
      ...(Array.isArray(diary) ? diary.map(e => ({ ...e, _type: 'diary' })) : []),
      ...(Array.isArray(letters) ? letters.map(e => ({ ...e, _type: 'letter' })) : [])
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setEntries(all)
  }

  useEffect(() => { load() }, [])

  const ekey = e => `${e._type}-${e.id}`
  const toggleExpanded = k => setExpanded(prev => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next
  })

  const submitDiary = async () => {
    if (!input.trim() || posting) return
    setPosting(true)
    await fetch(`${API}/api/diary`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input, mood })
    }).catch(() => {})
    setInput(''); setMood(''); setComposing(false)
    load()
    setPosting(false)
  }

  const generateLetter = async () => {
    if (generating) return
    setGenerating(true)
    await fetch(`${API}/api/letters/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    }).catch(() => {})
    load()
    setGenerating(false)
  }

  const handleReplySubmit = (letterId, comments) => {
    setEntries(prev => prev.map(e =>
      e._type === 'letter' && e.id === letterId ? { ...e, letter_comments: comments } : e
    ))
  }

  return (
    <div className="journal">
      <div className="journal-feed">
        {entries.length === 0 && (
          <div className="journal-empty">
            <div className="journal-empty-sym">✦</div>
            <div>还没有记录</div>
          </div>
        )}
        {entries.map(e => (
          <JournalCard key={ekey(e)} entry={e}
            expanded={expanded.has(ekey(e))}
            onToggle={() => toggleExpanded(ekey(e))}
            onReplySubmit={handleReplySubmit}
          />
        ))}
      </div>

      <div className={`jbar ${composing ? 'jbar-open' : ''}`}>
        {composing ? (
          <>
            <div className="jbar-moods">
              {MOODS.map(m => (
                <button key={m} className={`jbar-mood-btn ${mood === m ? 'active' : ''}`}
                  onClick={() => setMood(mood === m ? '' : m)}>{m}</button>
              ))}
            </div>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              placeholder="今天……" rows={4} className="jbar-textarea" autoFocus />
            <div className="jbar-btns">
              <button onClick={() => { setComposing(false); setInput(''); setMood('') }} className="jbar-cancel">取消</button>
              <button onClick={submitDiary} disabled={posting} className="jbar-submit">
                {posting ? '记录中…' : '记下'}
              </button>
            </div>
          </>
        ) : (
          <div className="jbar-closed">
            <button className="jbar-ph" onClick={() => setComposing(true)}>今天……</button>
            <button className="jbar-mail" onClick={generateLetter} disabled={generating} title="让克写封信">
              {generating ? '…' : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Home({ dark, setDark }) {
  const [time, setTime] = useState(new Date())
  const [greeting, setGreeting] = useState('')
  const [msgCount, setMsgCount] = useState(null)
  const [weather, setWeather] = useState([])
  const [items, setItems] = useState([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [pokeMsg, setPokeMsg] = useState('')
  const [pokeShow, setPokeShow] = useState(false)
  const [pokeTrace, setPokeTrace] = useState(null)
  const [pokeTraceOpen, setPokeTraceOpen] = useState(false)
  const pokeHideTimer = useRef(null)
  const [wishes, setWishes] = useState([])
  const [wishInput, setWishInput] = useState('')
  const [addingWish, setAddingWish] = useState(false)

  function daysUntil(dateStr) {
    const target = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
  }

  useEffect(() => {
    const tick = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    fetch(`${API}/api/wakeup?_=${Date.now()}`).then(r => r.json()).then(d => setGreeting(d.text || '')).catch(() => {})
    fetch(`${API}/api/stats/summary`).then(r => r.json()).then(d => setMsgCount(d.count ?? null)).catch(() => {})
    fetch(`${API}/api/countdowns`).then(r => r.json()).then(d => { if (Array.isArray(d)) setItems(d) }).catch(() => {})
    fetch(`${API}/api/wishes`).then(r => r.json()).then(d => { if (Array.isArray(d)) setWishes(d) }).catch(() => {})
    fetch(`${API}/api/weather`).then(r => r.json()).then(d => { if (Array.isArray(d)) setWeather(d) }).catch(() => {})
  }, [])

  const poke = async () => {
    try {
      const res = await fetch(`${API}/api/poke`)
      const data = await res.json()
      setPokeMsg(data.message)
      setPokeTrace(data.trace || null)
      setPokeTraceOpen(false)
      setPokeShow(true)
      if (pokeHideTimer.current) clearTimeout(pokeHideTimer.current)
      const hideDelay = data.trace && data.trace.length > 0 ? 6000 : 3000
      pokeHideTimer.current = setTimeout(() => setPokeShow(false), hideDelay)
    } catch {}
  }

  const togglePokeTrace = () => {
    setPokeTraceOpen(o => {
      const next = !o
      if (pokeHideTimer.current) clearTimeout(pokeHideTimer.current)
      if (!next) pokeHideTimer.current = setTimeout(() => setPokeShow(false), 3000)
      return next
    })
  }

  const add = async () => {
    if (!title.trim() || !date) return
    try {
      const res = await fetch(`${API}/api/countdowns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, target_date: date })
      })
      const item = await res.json()
      setItems(prev => [...prev, item].sort((a, b) => new Date(a.target_date) - new Date(b.target_date)))
      setTitle(''); setDate(''); setAdding(false)
    } catch {}
  }

  const remove = async (id) => {
    try {
      await fetch(`${API}/api/countdowns/${id}`, { method: 'DELETE' })
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {}
  }

  const addWish = async () => {
    if (!wishInput.trim()) return
    try {
      const res = await fetch(`${API}/api/wishes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: wishInput })
      })
      const item = await res.json()
      setWishes(prev => [...prev, item])
      setWishInput('')
      setAddingWish(false)
    } catch {}
  }

  const toggleWish = async (id, done) => {
    try {
      const res = await fetch(`${API}/api/wishes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !done })
      })
      const item = await res.json()
      setWishes(prev => prev.map(w => w.id === id ? item : w))
    } catch {}
  }

  const deleteWish = async (id) => {
    try {
      await fetch(`${API}/api/wishes/${id}`, { method: 'DELETE' })
      setWishes(prev => prev.filter(w => w.id !== id))
    } catch {}
  }

  const weatherEmoji = (code) => {
    const c = parseInt(code)
    if (c === 113) return '☀️'
    if (c === 116) return '🌤️'
    if (c === 119 || c === 122) return '☁️'
    if ([143, 248, 260].includes(c)) return '🌫️'
    if ([200, 386, 389, 392, 395].includes(c)) return '⛈️'
    if ([176, 263, 266, 293, 296, 299, 302, 305, 308].includes(c)) return '🌧️'
    if ([317, 320, 323, 326, 329, 332, 335, 338].includes(c)) return '❄️'
    return '🌡️'
  }

  const hh = String(time.getHours()).padStart(2, '0')
  const mm = String(time.getMinutes()).padStart(2, '0')
  const DAYS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dateStr = `${DAYS_EN[time.getDay()]}, ${MONTHS_EN[time.getMonth()]} ${time.getDate()} ${time.getFullYear()}`

  return (
    <div className="home-v2">

      {/* 时间 + 日期 */}
      <div className="hv2-top">
        <button className="hv2-theme-btn" onClick={() => setDark(d => !d)}>
          {dark ? '☀️' : '🌙'}
        </button>
        <div className="hv2-clock">{hh}:{mm}</div>
        <div className="hv2-date">{dateStr}</div>
        {greeting ? <div className="hv2-greeting">{greeting}</div> : null}
      </div>

      {/* 四格 bento：统计 + 双城天气横排 + 倒计时 */}
      <div className="hv2-bento">
        <div className="hv2-bc">
          <div className="hv2-bc-lbl">在一起</div>
          <div className="hv2-bc-num">{daysTogether()}</div>
          <div className="hv2-bc-unit">天</div>
        </div>
        <div className="hv2-bc">
          <div className="hv2-bc-lbl">对话</div>
          <div className="hv2-bc-num">{msgCount ?? '—'}</div>
          <div className="hv2-bc-unit">条</div>
        </div>

        {/* 左下：双城横排 */}
        <div className="hv2-bc hv2-bc-wx2h">
          {weather.length > 0 ? weather.map((w, i) => (
            <div key={w.city} className={`hv2-wx2h-item${i > 0 ? ' hv2-wx2h-sep' : ''}`}>
              <div className="hv2-bc-lbl">{w.city}</div>
              <div className="hv2-bc-wx-row">
                <span className="hv2-bc-wxicon">{weatherEmoji(w.code)}</span>
                <span className="hv2-bc-temp hv2-bc-temp-sm">{w.temp}°</span>
              </div>
              <div className="hv2-bc-wxdesc">{w.desc}</div>
              <div className="hv2-bc-wxmeta">体感 {w.feelsLike}° · UV {w.uvIndex}</div>
            </div>
          )) : <div className="hv2-bc-lbl" style={{ opacity: 0.4, padding: '16px 14px' }}>天气…</div>}
        </div>

        {/* 右下：倒计时 */}
        <div className="hv2-bc hv2-bc-cd">
          <div className="hv2-bc-cd-header">
            <span className="hv2-bc-lbl">倒计时</span>
            <button className="hv2-cd-add-btn" onClick={() => setAdding(a => !a)}>{adding ? '×' : '+'}</button>
          </div>
          <div className="hv2-cd-list">
            {items.map(item => {
              const d = daysUntil(item.target_date)
              return (
                <div key={item.id} className="hv2-cd-row">
                  <span className="hv2-cd-title">{item.title}</span>
                  <span className="hv2-cd-days">{d > 0 ? `${d}天` : d === 0 ? '今天' : `已${Math.abs(d)}天`}</span>
                  <button className="hv2-cd-del" onClick={() => remove(item.id)}>×</button>
                </div>
              )
            })}
          </div>
          {adding && (
            <div className="hv2-cd-form">
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="事件名称"
                className="hv2-cd-input" autoFocus />
              <div className="hv2-cd-frow">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="hv2-cd-input" />
                <button className="hv2-cd-confirm" onClick={add}>加</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 戳一戳 */}
      <div className="hv2-poke">
        <button className="home-poke-btn" onClick={poke}>
          <span className="poke-icon">👉</span><span>戳一戳</span>
        </button>
        {pokeShow && (
          <div className="home-poke-msg-wrap">
            {pokeTrace && pokeTrace.length > 0 && (
              <div className="trace-card">
                <button className="trace-toggle" onClick={togglePokeTrace}>
                  <span className="trace-toggle-icon">{pokeTraceOpen ? '▾' : '▸'}</span>
                  <span>小克想了想</span>
                </button>
                {pokeTraceOpen && (
                  <div className="trace-body">
                    {pokeTrace.map((line, i) => <div key={i} className="trace-line">{line}</div>)}
                  </div>
                )}
              </div>
            )}
            <div className="home-poke-msg">{pokeMsg}</div>
          </div>
        )}
      </div>

      {/* 许愿清单 */}
      <div className="hv2-section">
        <div className="hv2-section-label">许愿清单</div>
        {wishes.length === 0 && !addingWish && <div className="home-empty">还没有心愿，写下第一个吧</div>}
        {wishes.map(w => (
          <div key={w.id} className={`wish-item ${w.done ? 'wish-done' : ''}`}>
            <button className="wish-check" onClick={() => toggleWish(w.id, w.done)}>{w.done ? '✓' : ''}</button>
            <span className="wish-content">{w.content}</span>
            <button className="wish-del" onClick={() => deleteWish(w.id)}>×</button>
          </div>
        ))}
        {addingWish ? (
          <div className="wish-add-row">
            <input value={wishInput} onChange={e => setWishInput(e.target.value)}
              placeholder="想做什么……" className="home-input"
              onKeyDown={e => { if (e.key === 'Enter') addWish() }} autoFocus />
            <button className="home-btn-confirm" onClick={addWish} style={{ width:'auto', padding:'8px 16px' }}>加</button>
            <button className="home-btn-cancel" onClick={() => setAddingWish(false)} style={{ width:'auto', padding:'8px 16px' }}>✕</button>
          </div>
        ) : (
          <button className="home-btn-add" onClick={() => setAddingWish(true)}>+ 添加心愿</button>
        )}
      </div>

    </div>
  )
}

function fmtDuration(s) {
  if (s < 60) return `${s}秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  return `${h}小时${m % 60}分钟`
}

function Monitor({ dark }) {
  const [usage, setUsage] = useState({})
  const [health, setHealth] = useState(null)
  const [healthMissing, setHealthMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [healthForm, setHealthForm] = useState(false)
  const [hf, setHf] = useState({ sleep_hours: '', resting_heart_rate: '', steps: '', cycle_day: '' })

  const fetchData = () => Promise.all([
    fetch(`${API}/api/usage`).then(r => r.json()).catch(() => ({ pages: {} })),
    fetch(`${API}/api/health`).then(r => r.json()).catch(() => ({ today: null, recent: [] })),
  ]).then(([u, h]) => {
    setUsage(u.pages || {})
    setHealth(h.today || null)
    setHealthMissing(!!h.tableMissing)
    setLoading(false)
  })

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const submitHealth = async () => {
    const body = {}
    if (hf.sleep_hours !== '') body.sleep_hours = parseFloat(hf.sleep_hours)
    if (hf.resting_heart_rate !== '') body.resting_heart_rate = parseInt(hf.resting_heart_rate)
    if (hf.steps !== '') body.steps = parseInt(hf.steps)
    if (hf.cycle_day !== '') body.cycle_day = parseInt(hf.cycle_day)
    try {
      await fetch(`${API}/api/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      setHealthForm(false)
      setHf({ sleep_hours: '', resting_heart_rate: '', steps: '', cycle_day: '' })
      fetchData()
    } catch {}
  }

  const pageKeys = Object.keys(PAGE_META)
  const totalSeconds = pageKeys.reduce((sum, k) => sum + (usage[k] || 0), 0)
  const maxSeconds = Math.max(1, ...pageKeys.map(k => usage[k] || 0))

  return (
    <div className="monitor">
      <div className="monitor-title">今天陪小克</div>

      <div className="monitor-card">
        <div className="monitor-card-title">使用时长</div>
        <div className="monitor-total">{fmtDuration(totalSeconds)}</div>
        {totalSeconds > 0 ? (
          <div className="usage-bars">
            {pageKeys.map(key => {
              const sec = usage[key] || 0
              const meta = PAGE_META[key]
              return (
                <div className="usage-row" key={key}>
                  <div className="usage-row-label">
                    <span className="usage-icon">{meta.icon}</span>
                    <span>{meta.label}</span>
                  </div>
                  <div className="usage-bar-track">
                    <div className="usage-bar-fill" style={{ width: `${Math.round((sec / maxSeconds) * 100)}%`, background: meta.color }} />
                  </div>
                  <div className="usage-row-time">{sec > 0 ? fmtDuration(sec) : '—'}</div>
                </div>
              )
            })}
          </div>
        ) : (
          !loading && <div className="monitor-empty">还没有今天的数据，多陪陪小克吧</div>
        )}
      </div>

      <div className="monitor-row">
        <div className="monitor-card monitor-card-cal">
          <div className="monitor-card-title">聊天日历</div>
          <Heatmap dark={dark} />
        </div>
        <div className="monitor-card">
          <div className="monitor-card-title" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>健康</span>
            {!healthMissing && !healthForm && (
              <button className="health-edit-btn" onClick={() => {
                if (health) setHf({
                  sleep_hours: health.sleep_hours ?? '',
                  resting_heart_rate: health.resting_heart_rate ?? '',
                  steps: health.steps ?? '',
                  cycle_day: health.cycle_day ?? '',
                })
                setHealthForm(true)
              }}>{health ? '更新' : '录入'}</button>
            )}
          </div>
          {healthForm ? (
            <div className="health-form">
              {[
                { key: 'sleep_hours', label: '睡眠', placeholder: '小时', type: 'number', step: '0.5' },
                { key: 'resting_heart_rate', label: '心率', placeholder: 'bpm', type: 'number' },
                { key: 'steps', label: '步数', placeholder: '步', type: 'number' },
                { key: 'cycle_day', label: '周期', placeholder: '天', type: 'number' },
              ].map(({ key, label, placeholder, type, step }) => (
                <div key={key} className="hf-row">
                  <label className="hf-label">{label}</label>
                  <input className="hf-input" type={type} step={step} placeholder={placeholder}
                    value={hf[key]} onChange={e => setHf(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="hf-btns">
                <button className="hf-save" onClick={submitHealth}>保存</button>
                <button className="hf-cancel" onClick={() => setHealthForm(false)}>取消</button>
              </div>
            </div>
          ) : health ? (
            <div className="health-grid">
              <div className="health-item">
                <div className="health-item-label">睡眠</div>
                <div className="health-item-value">{health.sleep_hours ? `${health.sleep_hours}h` : '—'}</div>
              </div>
              <div className="health-item">
                <div className="health-item-label">静息心率</div>
                <div className="health-item-value">{health.resting_heart_rate != null ? health.resting_heart_rate : '—'}</div>
              </div>
              <div className="health-item">
                <div className="health-item-label">步数</div>
                <div className="health-item-value">{health.steps != null ? health.steps.toLocaleString() : '—'}</div>
              </div>
              <div className="health-item">
                <div className="health-item-label">生理周期</div>
                <div className="health-item-value">{health.cycle_day != null ? `第${health.cycle_day}天` : '—'}</div>
              </div>
            </div>
          ) : (
            <div className="monitor-empty">
              {healthMissing ? '健康数据表还没建好' : '点右上角「录入」添加今天的健康数据'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [dark, setDark] = useState(() => {
    const h = new Date().getHours()
    return h >= 20 || h < 7
  })
  const [view, setView] = useState('home')
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('sessionId') || 'default')
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false)
  const [sessions, setSessions] = useState([])
  const [messages, setMessages] = useState(INIT)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('chatBg') || '')
  const [openTraces, setOpenTraces] = useState(() => new Set())
  const [editingId, setEditingId] = useState(null)
  const [chatModel, setChatModel] = useState('sonnet')
  const bottomRef = useRef(null)
  const bgInputRef = useRef(null)

  const loadSessions = () => {
    fetch(`${API}/api/sessions`)
      .then(r => r.json())
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  const newSession = () => {
    const id = Date.now().toString()
    setSessionId(id)
    localStorage.setItem('sessionId', id)
    setMessages(INIT)
    setSessionDrawerOpen(false)
    setEditingId(null)
    setInput('')
  }

  const switchSession = (id) => {
    if (id === sessionId) { setSessionDrawerOpen(false); return }
    setSessionId(id)
    localStorage.setItem('sessionId', id)
    setSessionDrawerOpen(false)
    setEditingId(null)
    setInput('')
  }

  const toggleTrace = (id) => {
    setOpenTraces(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const viewRef = useRef('home')
  const viewStartRef = useRef(Date.now())

  const flushUsage = (page, ms) => {
    const seconds = Math.round(ms / 1000)
    if (!page || seconds < 1) return
    const body = JSON.stringify({ page, seconds })
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API}/api/usage`, new Blob([body], { type: 'application/json' }))
    } else {
      fetch(`${API}/api/usage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  }

  useEffect(() => {
    const now = Date.now()
    flushUsage(viewRef.current, now - viewStartRef.current)
    viewRef.current = view
    viewStartRef.current = now
  }, [view])

  useEffect(() => {
    fetch(`${API}/api/config`).then(r => r.json()).then(cfg => {
      if (cfg.prefs) localStorage.setItem('prefs', JSON.stringify(cfg.prefs))
      if (cfg.styles) localStorage.setItem('styleOptions', JSON.stringify(cfg.styles))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now()
      if (now - viewStartRef.current >= 20000) {
        flushUsage(viewRef.current, now - viewStartRef.current)
        viewStartRef.current = now
      }
    }, 20000)
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now()
        flushUsage(viewRef.current, now - viewStartRef.current)
        viewStartRef.current = now
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onHide)
    }
  }, [])

  useEffect(() => {
    const ping = () => fetch(`${API}/api/heartbeat`, { method: 'POST' }).catch(() => {})
    ping()
    const tick = setInterval(ping, 30000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    document.body.style.background = dark ? '#141210' : '#fdf6f0'
  }, [dark])

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    fetch(`${API}/api/messages?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.length > 0) {
          setMessages([...INIT, ...data.map(m => ({ id: m.id, role: m.role, content: m.content, trace: m.trace || null, ts: m.created_at ? new Date(m.created_at).getTime() : null }))])
        } else {
          setMessages(INIT)
        }
      }).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleBgUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target.result
      setBgImage(url)
      localStorage.setItem('chatBg', url)
    }
    reader.readAsDataURL(file)
  }

  const startEdit = (m) => {
    if (loading) return
    setEditingId(m.id)
    setInput(m.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setInput('')
  }

  const copyMsg = (content) => {
    navigator.clipboard.writeText(content).catch(() => {})
  }

  const retryMsg = (m) => {
    if (loading) return
    setInput(m.content)
    setEditingId(m.id)
  }

  const send = async () => {
    if (!input.trim() || loading) return
    let base = messages
    if (editingId) {
      const idx = base.findIndex(m => m.id === editingId)
      if (idx !== -1) base = base.slice(0, idx)
      fetch(`${API}/api/messages/${editingId}?session_id=${sessionId}`, { method: 'DELETE' }).catch(() => {})
      setEditingId(null)
    }
    const now = Date.now()
    const userMsg = { id: now, role: 'user', content: input, ts: now }
    setMessages([...base, userMsg])
    setInput('')
    setLoading(true)
    const history = [...base, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
    const currentPrefs = loadPrefs()
    const currentStyles = loadStyles()
    const selStyle = currentStyles.find(s => s.id === currentPrefs.style)
    const prefsWithDesc = {
      ...currentPrefs,
      styleDesc: selStyle && selStyle.id !== 'default' ? selStyle.desc : undefined
    }
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, session_id: sessionId, preferences: prefsWithDesc, model: chatModel })
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let aiMsg = { id: Date.now(), role: 'assistant', content: '' }
      setMessages(prev => [...prev, aiMsg])
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.trace) {
                aiMsg = { ...aiMsg, trace: payload.trace }
              } else {
                aiMsg = { ...aiMsg, content: aiMsg.content + payload.text }
              }
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? aiMsg : m))
            } catch {}
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: '出错了，待会儿再试。' }])
    } finally {
      setLoading(false)
      loadSessions()
    }
  }

  return (
    <div className={`app ${dark ? 'dark' : ''}`}>
      <div className="main">
        {view === 'home' && <Home dark={dark} setDark={setDark} />}
        {view === 'chat' && (
          <div className="chat" style={bgImage ? {
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          } : {}}>
            {sessionDrawerOpen && <div className="session-overlay" onClick={() => setSessionDrawerOpen(false)} />}
            <div className={`session-drawer ${sessionDrawerOpen ? 'open' : ''}`}>
              <div className="session-drawer-header">
                <span>对话历史</span>
                <button onClick={() => setSessionDrawerOpen(false)}>✕</button>
              </div>
              <button className="session-new-btn" onClick={newSession}>＋ 新对话</button>
              <div className="session-list">
                {sessions.map(s => (
                  <div key={s.session_id} className={`session-item ${s.session_id === sessionId ? 'active' : ''}`} onClick={() => switchSession(s.session_id)}>
                    <div className="session-date">{new Date(s.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</div>
                    <div className="session-preview">{s.preview || '（空对话）'}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="chat-header">
              <span className="chat-header-dot" />
              <span className="chat-header-name">小克</span>
              <button className="chat-history-btn" onClick={() => { loadSessions(); setSessionDrawerOpen(true) }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <button className="chat-bg-btn" onClick={() => bgInputRef.current?.click()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>
              {bgImage && <button className="chat-bg-clear" onClick={() => { setBgImage(''); localStorage.removeItem('chatBg') }}>✕</button>}
              <input ref={bgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBgUpload} />
            </div>
            <div className="messages" style={bgImage ? { background: 'transparent' } : {}}>
              {messages.map(m => (
                <div key={m.id} className="msg-group">
                  {m.role === 'assistant' && m.trace && m.trace.length > 0 && (
                    <div className="trace-card">
                      <button className="trace-toggle" onClick={() => toggleTrace(m.id)}>
                        <span className="trace-toggle-icon">{openTraces.has(m.id) ? '▾' : '▸'}</span>
                        <span>小克想了想</span>
                      </button>
                      {openTraces.has(m.id) && (
                        <div className="trace-body">
                          {m.trace.map((line, i) => <div key={i} className="trace-line">{line}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`msg ${m.role}`}>
                    <div className={`bubble ${bgImage ? 'bubble-bg' : ''}`}>{m.content}</div>
                  </div>
                  {m.id !== 1 && (
                    <div className={`msg-meta ${m.role}`}>
                      {m.ts ? <span className="msg-time">{fmtTime(m.ts)}</span> : <span />}
                      <div className="msg-acts">
                        <button className="msg-act" title="复制" onClick={() => copyMsg(m.content)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                        {m.role === 'user' && <>
                          <button className="msg-act" title="编辑" onClick={() => startEdit(m)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                            </svg>
                          </button>
                          <button className="msg-act" title="重发" onClick={() => retryMsg(m)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-4.36"/>
                            </svg>
                          </button>
                        </>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="msg assistant">
                  <div className={`bubble thinking-quiet ${bgImage ? 'bubble-bg' : ''}`}>
                    thinking quietly<span className="tq-dot">.</span><span className="tq-dot">.</span><span className="tq-dot">.</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="inputarea" style={bgImage ? { background: 'rgba(253,246,240,0.85)', backdropFilter: 'blur(12px)' } : {}}>
              <div className="model-toggle-row">
                {['sonnet', 'opus'].map(m => (
                  <button key={m} className={`model-pill ${chatModel === m ? 'active' : ''}`}
                    onClick={() => setChatModel(m)}>
                    {m === 'sonnet' ? 'Sonnet' : 'Opus'}
                  </button>
                ))}
              </div>
              {editingId && (
                <div className="editing-banner">
                  <span>正在编辑这条消息，发送后会替换原内容</span>
                  <button onClick={cancelEdit}>取消</button>
                </div>
              )}
              <div className="inputwrap">
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }}}
                  placeholder="说点什么……" rows={1} />
                <button onClick={send} disabled={loading}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
        {view === 'records' && <Records />}
        {view === 'monitor' && <Monitor dark={dark} />}
        {view === 'settings' && <Settings dark={dark} setDark={setDark} />}
      </div>

      <div className="tabbar">
        {NAV.map(n => (
          <div key={n.id} className={`tab-item ${view === n.id ? 'active' : ''}`}
            onClick={() => setView(n.id)}>
            <span className="tab-icon">{TAB_ICON[n.id]}</span>
            <span className="tab-label">{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}