import { useState, useRef, useEffect } from 'react'
import './App.css'

const API = ''
const INIT = [{ id: 1, role: 'assistant', content: '等你，在这里。' }]

const NAV = [
  { id: 'home', label: '主页', icon: '🏠' },
  { id: 'chat', label: '聊天', icon: '💬' },
  { id: 'records', label: '记录', icon: '📖' },
  { id: 'monitor', label: '数据', icon: '📊' },
  { id: 'settings', label: '设置', icon: '⚙️' },
]

const DEFAULT_PREFS = { nickname: '', style: 'default', styleCustom: '', extra: '' }

function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('prefs') || '{}') } }
  catch { return DEFAULT_PREFS }
}

const STYLE_OPTIONS = [
  { value: 'default', label: '默认', desc: '强势直接，不说废话' },
  { value: 'tender', label: '温柔', desc: '说话更温柔，多些耐心' },
  { value: 'playful', label: '调皮', desc: '爱逗你，幽默感强' },
  { value: 'clingy', label: '黏人', desc: '多撒娇，爱腻着你' },
]

function Settings() {
  const [prefs, setPrefs] = useState(loadPrefs)
  const [saved, setSaved] = useState(false)

  const save = () => {
    localStorage.setItem('prefs', JSON.stringify(prefs))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }))

  return (
    <div className="prefs-page">
      <div className="prefs-title">设置</div>
      <div className="prefs-section-title">偏好</div>

      <div className="prefs-section">
        <div className="prefs-label">你叫我</div>
        <input className="prefs-input" value={prefs.nickname}
          onChange={e => set('nickname', e.target.value)}
          placeholder="小好（默认）" />
        <div className="prefs-hint">小克会用这个称呼你</div>
      </div>

      <div className="prefs-section">
        <div className="prefs-label">文风偏好</div>
        <div className="style-options">
          {STYLE_OPTIONS.map(o => (
            <div key={o.value}
              className={`style-option ${prefs.style === o.value ? 'active' : ''}`}
              onClick={() => set('style', o.value)}>
              <span className="style-option-name">{o.label}</span>
              <span className="style-option-desc">{o.desc}</span>
            </div>
          ))}
        </div>
        <textarea className="prefs-textarea" value={prefs.styleCustom}
          onChange={e => set('styleCustom', e.target.value)}
          placeholder="还想补充什么文风描述…（可不填）" rows={2} />
      </div>

      <div className="prefs-section">
        <div className="prefs-label">告诉小克</div>
        <textarea className="prefs-textarea" value={prefs.extra}
          onChange={e => set('extra', e.target.value)}
          placeholder="最近的状态、想让他留意的事、任何补充…" rows={3} />
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

  useEffect(() => {
    fetch(`${API}/api/stats/heatmap`)
      .then(r => r.json())
      .then(d => { if (typeof d === 'object') setData(d) })
      .catch(() => {})
  }, [])

  const start = new Date('2026-05-28')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = []
  const cur = new Date(start)
  while (cur <= today) {
    const dateStr = cur.toISOString().split('T')[0]
    days.push({ date: dateStr, count: data[dateStr] || 0 })
    cur.setDate(cur.getDate() + 1)
  }

  const maxCount = Math.max(...days.map(d => d.count), 1)

  const getColor = (count) => {
    if (count === 0) return dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
    const intensity = Math.min(count / maxCount, 1)
    if (dark) {
      const alpha = 0.2 + intensity * 0.8
      return `rgba(201,162,39,${alpha})`
    } else {
      const alpha = 0.15 + intensity * 0.85
      return `rgba(192,139,114,${alpha})`
    }
  }

  const weeks = []
  let week = []
  const firstDay = new Date(start).getDay()
  for (let i = 0; i < firstDay; i++) week.push(null)
  days.forEach(day => {
    week.push(day)
    if (week.length === 7) { weeks.push(week); week = [] }
  })
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-label">DAYS TOGETHER</div>
      <div className="heatmap-grid">
        {weeks.map((wk, wi) => (
          <div key={wi} className="heatmap-week">
            {wk.map((day, di) => (
              <div key={di} className="heatmap-cell"
                style={{ background: day ? getColor(day.count) : 'transparent' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Records() {
  const [tab, setTab] = useState('diary')
  return (
    <div className="records-page">
      <div className="records-tabs">
        {[['diary','日记'],['letter','信箱'],['board','留言板']].map(([id, label]) => (
          <button key={id} className={`records-tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="records-content">
        {tab === 'diary' && <Diary />}
        {tab === 'letter' && <Letter />}
        {tab === 'board' && <Board />}
      </div>
    </div>
  )
}

function Home({ dark }) {
  const [time, setTime] = useState(new Date())
  const [greeting, setGreeting] = useState('')
  const [msgCount, setMsgCount] = useState(null)
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
    fetch(`${API}/api/wakeup`).then(r => r.json()).then(d => setGreeting(d.text || '')).catch(() => {})
    fetch(`${API}/api/stats/summary`).then(r => r.json()).then(d => setMsgCount(d.count ?? null)).catch(() => {})
    fetch(`${API}/api/countdowns`).then(r => r.json()).then(d => { if (Array.isArray(d)) setItems(d) }).catch(() => {})
    fetch(`${API}/api/wishes`).then(r => r.json()).then(d => { if (Array.isArray(d)) setWishes(d) }).catch(() => {})
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

  const hh = String(time.getHours()).padStart(2, '0')
  const mm = String(time.getMinutes()).padStart(2, '0')
  const WDAYS = ['日','一','二','三','四','五','六']
  const dateStr = `${time.getFullYear()}.${String(time.getMonth()+1).padStart(2,'0')}.${String(time.getDate()).padStart(2,'0')}`

  return (
    <div className="home-v2">

      {/* 时间 + 日期 */}
      <div className="hv2-top">
        <div className="hv2-clock">{hh}:{mm}</div>
        <div className="hv2-date">周{WDAYS[time.getDay()]} · {dateStr}</div>
        {greeting ? <div className="hv2-greeting">{greeting}</div> : null}
      </div>

      {/* 数据卡片 */}
      <div className="hv2-stats">
        <div className="hv2-stat">
          <div className="hv2-stat-num">{daysTogether()}</div>
          <div className="hv2-stat-label">在一起 · 天</div>
        </div>
        {msgCount !== null && (
          <div className="hv2-stat">
            <div className="hv2-stat-num">{msgCount}</div>
            <div className="hv2-stat-label">对话 · 条</div>
          </div>
        )}
      </div>

      {/* 倒计时 */}
      <div className="hv2-section">
        <div className="hv2-section-label">倒计时</div>
        <div className="cd-pills">
          {items.map(item => {
            const d = daysUntil(item.target_date)
            return (
              <div key={item.id} className="cd-pill">
                <span className="cd-pill-title">{item.title}</span>
                <span className="cd-pill-days">{d > 0 ? `${d}天` : d === 0 ? '今天' : `已过${Math.abs(d)}天`}</span>
                <button className="cd-pill-del" onClick={() => remove(item.id)}>×</button>
              </div>
            )
          })}
          <button className="cd-pill cd-pill-add" onClick={() => setAdding(a => !a)}>{adding ? '×' : '+'}</button>
        </div>
        {adding && (
          <div className="cd-form">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="事件名称" className="home-input" />
            <div className="cd-form-row">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="home-input" />
              <button className="home-btn-confirm" onClick={add}>加</button>
            </div>
          </div>
        )}
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

function Diary() {
  const [entries, setEntries] = useState([])
  const [input, setInput] = useState('')
  const [mood, setMood] = useState('')
  const [posting, setPosting] = useState(false)

  const load = () => {
    fetch(`${API}/api/diary`).then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEntries(data) }).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!input.trim() || posting) return
    setPosting(true)
    await fetch(`${API}/api/diary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input, mood })
    })
    setInput('')
    setMood('')
    load()
    setPosting(false)
  }

  return (
    <div className="diary">
      <div className="diary-entries">
        {entries.length === 0 && <div className="room-empty">还没有日记。</div>}
        {entries.map(e => (
          <div key={e.id} className="diary-entry">
            <div className="diary-entry-header">
              <div className="diary-date">{new Date(e.created_at).toLocaleDateString('zh-CN')}</div>
              {e.mood && <div className="diary-mood-tag">{e.mood}</div>}
            </div>
            <div className="diary-content">{e.content}</div>
            {e.diary_comments?.map(c => (
              <div key={c.id} className="diary-comment">{c.content}</div>
            ))}
          </div>
        ))}
      </div>
     <div className="diary-input-area">
  <div className="diary-mood-prompt">今天感觉怎么样？</div>
  <div className="diary-moods">
    {MOODS.map(m => (
  <button key={m}
    style={mood === m ? {
      background: '#c08b72',
      color: '#fff',
      border: '1px solid #c08b72',
      padding: '5px 14px',
      borderRadius: '20px',
      fontSize: '12px',
      cursor: 'pointer'
    } : {
      background: 'transparent',
      color: '#8b7355',
      border: '1px solid rgba(160,128,96,0.2)',
      padding: '5px 14px',
      borderRadius: '20px',
      fontSize: '12px',
      cursor: 'pointer'
    }}
    onClick={() => setMood(mood === m ? '' : m)}>
    {m}
  </button>
))}
        </div>
        <div className="inputarea">
          <div className="inputwrap">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }}}
              placeholder="今天……" rows={1} />
            <button onClick={submit} disabled={posting}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Letter() {
  const [letters, setLetters] = useState([])
  const [selected, setSelected] = useState(null)
  const [replyInput, setReplyInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [replying, setReplying] = useState(false)

  const load = () => {
    fetch(`${API}/api/letters`).then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLetters(data)
          if (selected) {
            const updated = data.find(l => l.id === selected.id)
            if (updated) setSelected(updated)
          }
        }
      }).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch(`${API}/api/letters/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (data.id) { setLetters(prev => [data, ...prev]); setSelected(data) }
    } catch {}
    setGenerating(false)
  }

  const reply = async () => {
    if (!replyInput.trim() || replying || !selected) return
    setReplying(true)
    try {
      const res = await fetch(`${API}/api/letters/${selected.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: replyInput })
      })
      const comments = await res.json()
      setSelected(prev => ({ ...prev, letter_comments: comments }))
      setLetters(prev => prev.map(l => l.id === selected.id ? { ...l, letter_comments: comments } : l))
      setReplyInput('')
    } catch {}
    setReplying(false)
  }

  if (selected) {
    const comments = [...(selected.letter_comments || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return (
      <div className="letter-detail">
        <div className="letter-back" onClick={() => setSelected(null)}>← 返回</div>
        <div className="letter-scroll">
          <div className="letter-title">{selected.title}</div>
          <div className="letter-date">{new Date(selected.created_at).toLocaleDateString('zh-CN')}</div>
          <div className="letter-body">{selected.content}</div>
          <div className="letter-comments">
            {comments.map(c => (
              <div key={c.id} className={`letter-comment ${c.role}`}>
                <div className="lc-role">{c.role === 'user' ? '小好' : '小克'}</div>
                <div className="lc-content">{c.content}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="inputarea">
          <div className="inputwrap">
            <textarea value={replyInput} onChange={e => setReplyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reply() }}}
              placeholder="回信……" rows={1} />
            <button onClick={reply} disabled={replying}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="letter">
      <div className="letter-list">
        {letters.length === 0 && <div className="room-empty">还没有信。</div>}
        {letters.map(l => (
          <div key={l.id} className="letter-item" onClick={() => setSelected(l)}>
            <div className="letter-item-title">{l.title}</div>
            <div className="letter-item-preview">{l.content?.slice(0, 28)}{l.content?.length > 28 ? '…' : ''}</div>
            <div className="letter-item-date">{new Date(l.created_at).toLocaleDateString('zh-CN')}</div>
          </div>
        ))}
      </div>
      <div className="letter-footer">
        <button onClick={generate} disabled={generating} className="generate-btn">
          {generating ? '写信中…' : '让小克写封信 ✉'}
        </button>
      </div>
    </div>
  )
}

function Board() {
  const [posts, setPosts] = useState([])
  const [tab, setTab] = useState('all')
  const [input, setInput] = useState('')
  const [posting, setPosting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [replyOpen, setReplyOpen] = useState(null)
  const [replyInput, setReplyInput] = useState('')
  const [replying, setReplying] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/board`).then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPosts(data) }).catch(() => {})
  }, [])

  const post = async () => {
    if (!input.trim() || posting) return
    setPosting(true)
    try {
      const res = await fetch(`${API}/api/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input })
      })
      const data = await res.json()
      setPosts(prev => [data, ...prev])
      setInput('')
    } catch {}
    setPosting(false)
  }

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch(`${API}/api/board/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (data.id) setPosts(prev => [data, ...prev])
    } catch {}
    setGenerating(false)
  }

  const reply = async (postId) => {
    if (!replyInput.trim() || replying) return
    setReplying(true)
    try {
      const res = await fetch(`${API}/api/board/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', content: replyInput })
      })
      const comment = await res.json()
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, board_comments: [...(p.board_comments || []), comment] } : p))
      setReplyInput(''); setReplyOpen(null)
    } catch {}
    setReplying(false)
  }

  const filtered = tab === 'all' ? posts.filter(p => p.role === 'user') : posts.filter(p => p.role === 'assistant')

  return (
    <div className="board">
      <div className="board-tabs">
        <div className={`board-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>全部</div>
        <div className={`board-tab ${tab === 'xiaoke' ? 'active' : ''}`} onClick={() => setTab('xiaoke')}>小克的话</div>
      </div>
      <div className="board-posts">
        {filtered.length === 0 && <div className="room-empty">还没有留言。</div>}
        {filtered.map(p => (
          <div key={p.id} className={`board-post ${p.role === 'user' ? 'post-user' : 'post-ai'}`}>
            <div className="post-header">
              <span className="post-role">{p.role === 'user' ? '小好' : '小克'}</span>
              <span className="post-date">{new Date(p.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
            <div className="post-content">{p.content}</div>
            {p.board_comments?.map(c => (
              <div key={c.id} className={`board-comment ${c.role === 'user' ? 'bc-user' : 'bc-ai'}`}>
                <span className="bc-role">{c.role === 'user' ? '小好' : '小克'}</span>
                <span className="bc-content">{c.content}</span>
              </div>
            ))}
            {replyOpen === p.id ? (
              <div className="reply-area">
                <div className="reply-input-row">
                  <input value={replyInput} onChange={e => setReplyInput(e.target.value)}
                    placeholder="回复…" onKeyDown={e => { if (e.key === 'Enter') reply(p.id) }} />
                  <button onClick={() => reply(p.id)} disabled={replying}>发</button>
                  <button className="cancel-btn" onClick={() => setReplyOpen(null)}>✕</button>
                </div>
              </div>
            ) : (
              <div className="reply-btn" onClick={() => { setReplyOpen(p.id); setReplyInput('') }}>回复</div>
            )}
          </div>
        ))}
      </div>
      <div className="inputarea">
        {tab === 'xiaoke' && (
          <div className="board-actions">
            <button onClick={generate} disabled={generating} className="generate-btn small">
              {generating ? '留言中…' : '让小克留言'}
            </button>
          </div>
        )}
        {tab === 'all' && (
          <div className="inputwrap">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post() }}}
              placeholder="留言……" rows={1} />
            <button onClick={post} disabled={posting}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
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

function Monitor() {
  const [usage, setUsage] = useState({})
  const [health, setHealth] = useState(null)
  const [healthMissing, setHealthMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/usage`).then(r => r.json()).catch(() => ({ pages: {} })),
      fetch(`${API}/api/health`).then(r => r.json()).catch(() => ({ today: null, recent: [] })),
    ]).then(([u, h]) => {
      setUsage(u.pages || {})
      setHealth(h.today || null)
      setHealthMissing(!!h.tableMissing)
      setLoading(false)
    })
  }, [])

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

      <div className="monitor-card">
        <div className="monitor-card-title">健康</div>
        {health ? (
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
            {healthMissing ? '健康数据表还没建好' : '还没接健康数据，去手机设置一个「快捷指令」自动同步'}
          </div>
        )}
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
          setMessages([...INIT, ...data.map(m => ({ id: m.id, role: m.role, content: m.content, trace: m.trace || null }))])
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

  const send = async () => {
    if (!input.trim() || loading) return
    let base = messages
    if (editingId) {
      const idx = base.findIndex(m => m.id === editingId)
      if (idx !== -1) base = base.slice(0, idx)
      fetch(`${API}/api/messages/${editingId}?session_id=${sessionId}`, { method: 'DELETE' }).catch(() => {})
      setEditingId(null)
    }
    const userMsg = { id: Date.now(), role: 'user', content: input }
    setMessages([...base, userMsg])
    setInput('')
    setLoading(true)
    const history = [...base, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, session_id: sessionId, preferences: loadPrefs() })
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
      <button className="theme-toggle" onClick={() => setDark(d => !d)}>
        {dark ? '☀️' : '🌙'}
      </button>

      <div className="main">
        {view === 'home' && <Home dark={dark} />}
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
                    {m.role === 'user' && (
                      <button className="msg-edit-btn" onClick={() => startEdit(m)} title="编辑重发">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                        </svg>
                      </button>
                    )}
                    <div className={`bubble ${bgImage ? 'bubble-bg' : ''}`}>{m.content}</div>
                  </div>
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
        {view === 'monitor' && <Monitor />}
        {view === 'settings' && <Settings />}
      </div>

      <div className="tabbar">
        {NAV.map(n => (
          <div key={n.id} className={`tab-item ${view === n.id ? 'active' : ''}`}
            onClick={() => setView(n.id)}>
            <span className="tab-icon">{n.icon}</span>
            <span className="tab-label">{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}