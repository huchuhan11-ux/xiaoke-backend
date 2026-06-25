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

function Settings({ dark, setDark, chatModel, setChatModel }) {
  const [subview, setSubview] = useState(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [styles, setStyles] = useState(loadStyles)
  const [saved, setSaved] = useState(false)
  const [addingStyle, setAddingStyle] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [usageData, setUsageData] = useState(null)
  const [claudeUsage, setClaudeUsage] = useState(null)
  const [locEnabled, setLocEnabled] = useState(() => localStorage.getItem('locEnabled') === '1')
  const [locStatus, setLocStatus] = useState(() => localStorage.getItem('locEnabled') === '1' ? 'granted' : null)
  const [locInput, setLocInput] = useState(() => localStorage.getItem('locText') || '')
  const [locSaved, setLocSaved] = useState(false)
  const [locGpsErr, setLocGpsErr] = useState(false)
  const [calForm, setCalForm] = useState(null)
  const [remForm, setRemForm] = useState(null)

  const autoLocate = async () => {
    setLocGpsErr(false)
    try {
      const r = await fetch('https://ipapi.co/json/')
      const d = await r.json()
      const city = d.city || d.region || ''
      if (city) {
        setLocInput(city)
        const val = city.trim()
        localStorage.setItem('locText', val)
        localStorage.setItem('locEnabled', '1')
        setLocEnabled(true)
        fetch(`${API}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'userLocation', value: val }) }).catch(() => {})
        setLocSaved(true); setTimeout(() => setLocSaved(false), 1500)
      } else setLocGpsErr(true)
    } catch { setLocGpsErr(true) }
  }

  useEffect(() => {
    if (subview !== 'usage') return
    fetch(`${API}/api/stats/summary`).then(r => r.json()).catch(() => ({}))
      .then(s => setUsageData({ count: s.count ?? '—' }))
    fetch(`${API}/api/claude-usage`).then(r => r.json()).catch(() => null)
      .then(d => setClaudeUsage(d))
  }, [subview])

  // removed auto-locate on open — user controls via toggle

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
    const fmtReset = (isoStr) => {
      if (!isoStr) return null
      const d = new Date(isoStr)
      const diffMs = d - Date.now()
      if (diffMs < 0) return '已重置'
      const h = Math.floor(diffMs / 3600000)
      const m = Math.floor((diffMs % 3600000) / 60000)
      const dateStr = d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      return `${dateStr} ${timeStr} 重置（${h}h ${m}m后）`
    }
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
            <span className="su-label">相处时间</span>
            <span className="su-val">{daysTogether()} 天</span>
          </div>
          <div className="su-row">
            <span className="su-label">模式</span>
            <span className="su-val su-badge">Claude 订阅</span>
          </div>
        </div>
        {claudeUsage?.ok && (
          <div className="su-section">
            <div className="su-plan-header">
              <span className="su-plan-label">Plan usage</span>
            </div>
            {Object.keys(claudeUsage.windows || {}).length === 0
              ? <div className="su-reset-time" style={{ padding: '8px 0' }}>暂无用量数据（可能刚重置）</div>
              : Object.entries(claudeUsage.windows).map(([key, w]) => {
                const pct = Math.round(w.utilization ?? 0)
                let resetStr = ''
                if (w.resets_at) {
                  const d = new Date(w.resets_at)
                  const diffMs = d - Date.now()
                  if (diffMs < 0) { resetStr = '已重置' }
                  else if (diffMs < 86400000) {
                    resetStr = 'Resets ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  } else {
                    resetStr = 'Resets ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }
                }
                const LABELS = { five_hour: '5-hour limit', seven_day: 'Weekly · all models', seven_day_sonnet: 'Weekly · Sonnet' }
                return (
                  <div className="su-plan-row" key={key}>
                    <div className="su-plan-row-head">
                      <span className="su-plan-name">{LABELS[key] || w.label}</span>
                      <span className="su-plan-meta">{resetStr}</span>
                      <span className="su-plan-pct">{pct}%</span>
                    </div>
                    <div className="su-plan-bar">
                      <div className="su-plan-fill" style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? '#c08b72' : '#7eb8c0' }} />
                    </div>
                  </div>
                )
              })}
            {claudeUsage.extra_usage?.is_enabled && (
              <div className="su-extra">超量：${((claudeUsage.extra_usage.used_credits || 0) / 100).toFixed(2)} / ${((claudeUsage.extra_usage.monthly_limit || 0) / 100).toFixed(0)}</div>
            )}
          </div>
        )}
        {claudeUsage && !claudeUsage.ok && (
          <div className="su-section">
            <div className="su-err">当前 token 暂不支持读取用量，可在 claude.ai 查看</div>
          </div>
        )}
      </div>
    )
  }

  if (subview === 'connectors') {
    const saveLocation = (text) => {
      const val = text.trim()
      localStorage.setItem('locText', val)
      localStorage.setItem('locEnabled', val ? '1' : '0')
      setLocEnabled(!!val)
      fetch(`${API}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'userLocation', value: val }) }).catch(() => {})
      setLocSaved(true); setTimeout(() => setLocSaved(false), 1500)
    }
    const createCalEvent = () => {
      if (!calForm?.title) return
      const params = new URLSearchParams({ title: calForm.title, date: calForm.date || '', time: calForm.time || '', duration: calForm.duration || '60', notes: calForm.notes || '' })
      window.location.href = `${API}/api/ios/calendar?${params}`
      setCalForm(null)
    }
    const createReminder = () => {
      if (!remForm?.title) return
      const params = new URLSearchParams({ title: remForm.title, notes: remForm.notes || '', due: remForm.due || '' })
      window.location.href = `${API}/api/ios/reminder?${params}`
      setRemForm(null)
    }
    return (
      <div className="prefs-page">
        <button className="prefs-back" onClick={() => setSubview(null)}>‹ 设置</button>
        <div className="prefs-title">连接器</div>
        <div className="conn-list">
          {/* 健康 */}
          <div className="conn-row active">
            <span className="conn-icon">❤️</span>
            <div className="conn-info">
              <div className="conn-label">健康 <span className="conn-desc">iPhone 健康数据</span></div>
              <div className="conn-note">睡眠 · 心率 · 步数</div>
            </div>
            <span className="conn-badge active">已连接</span>
          </div>
          {/* 位置 */}
          <div className={`conn-row-loc ${locEnabled ? 'active' : 'todo'}`}>
            <div className="conn-row-loc-head">
              <span className="conn-icon">📍</span>
              <div className="conn-info">
                <div className="conn-label">位置 <span className="conn-desc">获取当前城市</span></div>
                <div className="conn-note">用于天气和问答</div>
              </div>
              <button className={`conn-badge ${locEnabled ? 'active' : 'todo'}`}
                onClick={() => {
                  const next = !locEnabled
                  setLocEnabled(next)
                  localStorage.setItem('locEnabled', next ? '1' : '0')
                  if (!next) {
                    localStorage.removeItem('locText')
                    setLocInput('')
                    fetch(`${API}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key: 'userLocation', value: '' }) }).catch(() => {})
                  } else if (!locInput) autoLocate()
                }}>
                {locEnabled ? '已启用' : '启用'}
              </button>
            </div>
            {locEnabled && (
              <div className="conn-row-loc-form">
                <input className="conn-input conn-loc-input" placeholder="输入地址或城市" value={locInput}
                  onChange={e => setLocInput(e.target.value)}
                  onBlur={() => saveLocation(locInput)} />
                <button className="conn-loc-gps" onClick={autoLocate}>IP</button>
                {locSaved && <span className="conn-loc-hint ok">已保存</span>}
                {locGpsErr && <span className="conn-loc-hint err">GPS不可用，手动输入</span>}
              </div>
            )}
          </div>
          {/* 日历 */}
          <div className="conn-row active">
            <span className="conn-icon">📅</span>
            <div className="conn-info">
              <div className="conn-label">日历 <span className="conn-desc">创建日程事件</span></div>
              <div className="conn-note">生成 ICS 文件 → 添加到 iPhone 日历</div>
            </div>
            <button className="conn-badge todo" onClick={() => setCalForm(calForm ? null : { title: '', date: '', time: '', duration: '60', notes: '' })}>
              {calForm ? '取消' : '创建'}
            </button>
          </div>
          {calForm && (
            <div className="conn-form">
              <input className="conn-input" placeholder="事件名称" value={calForm.title} onChange={e => setCalForm(f => ({ ...f, title: e.target.value }))} />
              <div className="conn-form-row">
                <input className="conn-input" type="date" value={calForm.date} onChange={e => setCalForm(f => ({ ...f, date: e.target.value }))} />
                <input className="conn-input" type="time" value={calForm.time} onChange={e => setCalForm(f => ({ ...f, time: e.target.value }))} />
              </div>
              <input className="conn-input" placeholder="备注（可选）" value={calForm.notes} onChange={e => setCalForm(f => ({ ...f, notes: e.target.value }))} />
              <button className="conn-form-btn" onClick={createCalEvent}>添加到日历</button>
            </div>
          )}
          {/* Notion */}
          <div className="conn-row todo">
            <span className="conn-icon">📓</span>
            <div className="conn-info">
              <div className="conn-label">Notion <span className="conn-desc">笔记和数据库</span></div>
              <div className="conn-note">读取和写入 Notion 页面</div>
            </div>
            <span className="conn-badge todo">即将支持</span>
          </div>
          {/* Gmail */}
          <div className="conn-row todo">
            <span className="conn-icon">✉️</span>
            <div className="conn-info">
              <div className="conn-label">Gmail <span className="conn-desc">邮件</span></div>
              <div className="conn-note">查看和发送邮件</div>
            </div>
            <span className="conn-badge todo">即将支持</span>
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
            <span className="settings-row-val">对话 · 计划</span>
            <span className="settings-row-arrow">›</span>
          </div>
          <div className="settings-row" onClick={() => setSubview('connectors')}>
            <span className="settings-row-label">连接器</span>
            <span className="settings-row-val">位置 · 日历</span>
            <span className="settings-row-arrow">›</span>
          </div>
          <div className="settings-row" onClick={() => setDark(d => !d)}>
            <span className="settings-row-label">昼夜模式</span>
            <span className="settings-row-val">{dark ? '夜间 🌙' : '白天 ☀️'}</span>
          </div>
          <div className="settings-row settings-row-model">
            <span className="settings-row-label">对话模型</span>
            <div className="model-toggle-row" style={{ marginBottom: 0 }}>
              {['sonnet', 'opus'].map(m => (
                <button key={m} className={`model-pill ${chatModel === m ? 'active' : ''}`}
                  onClick={() => { setChatModel(m); localStorage.setItem('chatModel', m) }}>
                  {m === 'sonnet' ? 'Sonnet' : 'Opus'}
                </button>
              ))}
            </div>
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
              <div className="jcard-cmt-text">{c.content}</div>
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
  const [composing, setComposing] = useState(false)
  const [input, setInput] = useState('')
  const [mood, setMood] = useState('')
  const [posting, setPosting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [activeSection, setActiveSection] = useState(null) // null | 'diary' | 'letter' | 'memory'
  const [detailEntry, setDetailEntry] = useState(null)
  const [memEntries, setMemEntries] = useState([])
  const [memTitle, setMemTitle] = useState('')
  const [memContent, setMemContent] = useState('')
  const [memComposing, setMemComposing] = useState(false)
  const [memSaving, setMemSaving] = useState(false)
  const [memSummarizing, setMemSummarizing] = useState(false)
  const [memMsg, setMemMsg] = useState('')
  const [todos, setTodos] = useState([])
  const [todoInput, setTodoInput] = useState('')
  const [todoSuggesting, setTodoSuggesting] = useState(false)

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

  const loadMem = async () => {
    const data = await fetch(`${API}/api/memories`).then(r => r.json()).catch(() => [])
    setMemEntries(Array.isArray(data) ? data : [])
  }

  const loadTodos = async () => {
    const data = await fetch(`${API}/api/todos`).then(r => r.json()).catch(() => [])
    setTodos(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load(); loadMem(); loadTodos() }, [])

  const ekey = e => `${e._type}-${e.id}`

  const fmtDate = (s) => {
    const d = new Date(s)
    return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

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
    if (detailEntry && detailEntry.id === letterId) {
      setDetailEntry(prev => ({ ...prev, letter_comments: comments }))
    }
  }

  const diaryEntries = entries.filter(e => e._type === 'diary')
  const letterEntries = entries.filter(e => e._type === 'letter')

  const mailIcon = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )

  // Level 3: full detail
  if (detailEntry) {
    return (
      <div className="journal">
        <div className="records-detail-wrap">
          <button className="records-back-btn" onClick={() => setDetailEntry(null)}>← 返回</button>
          <JournalCard entry={detailEntry} expanded={true} onToggle={() => {}} onReplySubmit={handleReplySubmit} />
        </div>
      </div>
    )
  }

  // Memory section view
  if (activeSection === 'memory') {
    const saveMem = async () => {
      if (!memTitle.trim() || memSaving) return
      setMemSaving(true)
      await fetch(`${API}/api/memories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: memTitle, content: memContent })
      }).catch(() => {})
      setMemTitle(''); setMemContent(''); setMemComposing(false)
      await loadMem()
      setMemSaving(false)
    }
    const delMem = async (id) => {
      await fetch(`${API}/api/memories/${id}`, { method: 'DELETE' }).catch(() => {})
      setMemEntries(prev => prev.filter(m => m.id !== id))
    }
    const summarize = async () => {
      if (memSummarizing) return
      setMemSummarizing(true); setMemMsg('')
      try {
        const r = await fetch(`${API}/api/memories/summarize`, { method: 'POST' }).then(d => d.json())
        setMemMsg(r.msg || '')
        if (r.added > 0) await loadMem()
      } catch { setMemMsg('出错了') }
      setMemSummarizing(false)
      setTimeout(() => setMemMsg(''), 3000)
    }
    const srcLabel = s => ({ user: '我写的', chat: '对话', diary: '日记', board: '留言' }[s] || s)
    return (
      <div className="journal" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="records-detail-wrap" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="records-section-nav">
            <button className="records-back-btn" style={{ padding: '10px 0 0' }} onClick={() => setActiveSection(null)}>←</button>
            <span className="records-nav-title">记忆库</span>
            <button className="memory-summarize-btn" onClick={summarize} disabled={memSummarizing}>
              {memSummarizing ? '总结中…' : '让小克总结'}
            </button>
          </div>
          {memMsg && <div style={{ fontSize: '12px', color: '#a8765f', padding: '0 0 8px' }}>{memMsg}</div>}
          <div className="memory-list" style={{ flex: 1, overflowY: 'auto' }}>
            {memEntries.length === 0 && <div className="records-empty-sm">还没有记忆</div>}
            {memEntries.map(m => (
              <div key={m.id} className="memory-item">
                <div className="memory-item-title">{m.title}</div>
                {m.content && <div className="memory-item-content">{m.content}</div>}
                <div className="memory-item-footer">
                  <span className="memory-item-date">{fmtDate(m.created_at)}</span>
                  <span className="memory-item-source">{srcLabel(m.source)}</span>
                  <button className="memory-item-del" onClick={() => delMem(m.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="memory-compose-bar">
          {memComposing ? (
            <div className="memory-compose-inputs">
              <input className="memory-compose-title" value={memTitle} onChange={e => setMemTitle(e.target.value)}
                placeholder="标题（必填）" />
              <textarea className="memory-compose-content" value={memContent} onChange={e => setMemContent(e.target.value)}
                placeholder="内容（选填）" rows={2} />
              <div className="memory-compose-btns">
                <button className="memory-compose-cancel" onClick={() => { setMemComposing(false); setMemTitle(''); setMemContent('') }}>取消</button>
                <button className="memory-compose-save" onClick={saveMem} disabled={memSaving}>{memSaving ? '保存中…' : '记下'}</button>
              </div>
            </div>
          ) : (
            <button className="memory-add-ph" onClick={() => setMemComposing(true)}>写下一条记忆…</button>
          )}
        </div>
      </div>
    )
  }

  // Todo section view
  if (activeSection === 'todo') {
    const addTodo = async () => {
      if (!todoInput.trim()) return
      const item = await fetch(`${API}/api/todos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: todoInput.trim(), role: 'user' })
      }).then(r => r.json()).catch(() => null)
      if (item) { setTodos(prev => [item, ...prev]); setTodoInput('') }
    }
    const toggleTodo = async (id) => {
      setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
      await fetch(`${API}/api/todos/${id}`, { method: 'PATCH' }).catch(() => {})
    }
    const delTodo = async (id) => {
      setTodos(prev => prev.filter(t => t.id !== id))
      await fetch(`${API}/api/todos/${id}`, { method: 'DELETE' }).catch(() => {})
    }
    const suggestTodo = async () => {
      if (todoSuggesting) return
      setTodoSuggesting(true)
      try {
        const r = await fetch(`${API}/api/todos/suggest`, { method: 'POST' }).then(d => d.json())
        if (r?.content) setTodos(prev => [r, ...prev])
      } catch {}
      setTodoSuggesting(false)
    }
    return (
      <div className="journal" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="records-detail-wrap" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="records-section-nav">
            <button className="records-back-btn" style={{ padding: '10px 0 0' }} onClick={() => setActiveSection(null)}>←</button>
            <span className="records-nav-title">每日清单</span>
            <button className="todo-suggest-btn" onClick={suggestTodo} disabled={todoSuggesting}>
              {todoSuggesting ? '思考中' : '小克来一条'}
            </button>
          </div>
          <div className="todo-list" style={{ flex: 1, overflowY: 'auto' }}>
            {todos.length === 0 && <div className="records-empty-sm">还没有清单</div>}
            {todos.map(t => (
              <div key={t.id} className="todo-item">
                <button className={`todo-check${t.done ? ' done' : ''}`} onClick={() => toggleTodo(t.id)}>✓</button>
                <span className={`todo-text${t.done ? ' done' : ''}`}>{t.content}</span>
                {t.role === 'ai' && <span className="todo-role-ai">小克</span>}
                <button className="todo-del" onClick={() => delTodo(t.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
        <div className="todo-compose-bar">
          <input className="todo-compose-input" value={todoInput} onChange={e => setTodoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTodo() }}
            placeholder="加一条…" />
          <button className="todo-compose-send" onClick={addTodo}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Level 2: compact list within a section
  if (activeSection) {
    const isLetter = activeSection === 'letter'
    const list = isLetter ? letterEntries : diaryEntries
    return (
      <div className="journal">
        <div className="records-detail-wrap">
          <div className="records-section-nav">
            <button className="records-back-btn" style={{ padding: '10px 0 0' }} onClick={() => setActiveSection(null)}>←</button>
            <span className="records-nav-title">{isLetter ? '信' : '日记'}</span>
            {isLetter && (
              <button className="jbar-mail" style={{ marginLeft: 'auto' }} onClick={generateLetter} disabled={generating}>
                {generating ? '…' : mailIcon}
              </button>
            )}
          </div>
          <div className="records-section-feed" style={{ marginTop: '4px' }}>
            {list.length === 0 ? (
              <div className="records-empty-sm">{isLetter ? '还没有信' : '还没有日记'}</div>
            ) : (
              list.map(e => (
                <div key={ekey(e)} className="records-row" onClick={() => setDetailEntry(e)}>
                  <div className="records-row-top">
                    <span className="records-row-date">{fmtDate(e.created_at)}</span>
                    {e.mood && <span className="records-row-mood">{e.mood}</span>}
                    {e.letter_comments?.length > 0 && <span className="records-row-cmts">💬 {e.letter_comments.length}</span>}
                  </div>
                  <div className="records-row-preview">{(e.content||'').slice(0,50)}{(e.content||'').length>50?'…':''}</div>
                </div>
              ))
            )}
          </div>
        </div>
        {!isLetter && (
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
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Level 1: two section cards (home view)
  return (
    <div className="journal">
      <div className="records-home-wrap">
        <div className="records-home-card" onClick={() => setActiveSection('diary')}>
          <div className="records-home-icon">📔</div>
          <div className="records-home-name">日记</div>
          <div className="records-home-sub">{diaryEntries.length > 0 ? `${diaryEntries.length} 篇` : '还没有记录'}</div>
        </div>
        <div className="records-home-card" onClick={() => setActiveSection('letter')}>
          <div className="records-home-icon">✉️</div>
          <div className="records-home-name">信</div>
          <div className="records-home-sub">{letterEntries.length > 0 ? `${letterEntries.length} 封` : '还没有信'}</div>
        </div>
        <div className="records-home-card" onClick={() => setActiveSection('memory')}>
          <div className="records-home-icon">✨</div>
          <div className="records-home-name">记忆库</div>
          <div className="records-home-sub">{memEntries.length > 0 ? `${memEntries.length} 条` : '还没有记忆'}</div>
        </div>
        <div className="records-home-card" onClick={() => setActiveSection('todo')}>
          <div className="records-home-icon">☑️</div>
          <div className="records-home-name">每日清单</div>
          <div className="records-home-sub">{todos.filter(t => !t.done).length > 0 ? `${todos.filter(t => !t.done).length} 件待完成` : todos.length > 0 ? '全完成了' : '还没有清单'}</div>
        </div>
      </div>
    </div>
  )
}


function Home({ dark, setDark, setTraceModal }) {
  const [time, setTime] = useState(new Date())
  const [greeting, setGreeting] = useState('')
  const [weather, setWeather] = useState([])
  const [items, setItems] = useState([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [pokeParts, setPokeParts] = useState([])
  const [pokeShow, setPokeShow] = useState(false)
  const [pokeTrace, setPokeTrace] = useState(null)
  const [pokeTraceOpen, setPokeTraceOpen] = useState(false)
  const pokeHideTimer = useRef(null)
  const [wishes, setWishes] = useState([])
  const [wishInput, setWishInput] = useState('')
  const [addingWish, setAddingWish] = useState(false)
  const [health, setHealth] = useState(null)
  const [healthMissing, setHealthMissing] = useState(false)
  const [healthForm, setHealthForm] = useState(false)
  const [hf, setHf] = useState({ sleep_hours: '', resting_heart_rate: '', steps: '', cycle_day: '' })

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
    fetch(`${API}/api/health`).then(r => r.json()).then(d => { setHealth(d.today || null); setHealthMissing(!!d.tableMissing) }).catch(() => {})
    fetch(`${API}/api/countdowns`).then(r => r.json()).then(d => { if (Array.isArray(d)) setItems(d) }).catch(() => {})
    fetch(`${API}/api/wishes`).then(r => r.json()).then(d => { if (Array.isArray(d)) setWishes(d) }).catch(() => {})
    fetch(`${API}/api/weather`).then(r => r.json()).then(d => { if (Array.isArray(d)) setWeather(d) }).catch(() => {})
  }, [])

  const submitHealth = async () => {
    const body = {}
    if (hf.sleep_hours !== '') body.sleep_hours = parseFloat(hf.sleep_hours)
    if (hf.resting_heart_rate !== '') body.resting_heart_rate = parseInt(hf.resting_heart_rate)
    if (hf.steps !== '') body.steps = parseInt(hf.steps)
    if (hf.cycle_day !== '') body.cycle_day = parseInt(hf.cycle_day)
    try {
      await fetch(`${API}/api/health`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      setHealthForm(false)
      setHf({ sleep_hours: '', resting_heart_rate: '', steps: '', cycle_day: '' })
      fetch(`${API}/api/health`).then(r => r.json()).then(d => { setHealth(d.today || null) }).catch(() => {})
    } catch {}
  }

  const poke = async () => {
    try {
      const res = await fetch(`${API}/api/poke`)
      const data = await res.json()
      const MSG_RE = /\[MSG?\]|\[M[A-Z]*G\]/g
      const parts = (data.message || '').split(MSG_RE).map(p => p.trim()).filter(Boolean)
      setPokeParts(parts.length ? parts : ['想你了'])
      setPokeTrace(data.trace || null)
      setPokeTraceOpen(false)
      setPokeShow(true)
      if (pokeHideTimer.current) clearTimeout(pokeHideTimer.current)
      pokeHideTimer.current = setTimeout(() => setPokeShow(false), 15000)
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
          <div className="hv2-bc-cd-header">
            <span className="hv2-bc-lbl">健康</span>
            {!healthMissing && (healthForm
              ? <button className="hv2-cd-add-btn" onClick={() => setHealthForm(false)}>×</button>
              : <button className="hv2-cd-add-btn" style={{ fontSize:'13px' }} onClick={() => {
                  if (health) setHf({ sleep_hours: health.sleep_hours??'', resting_heart_rate: health.resting_heart_rate??'', steps: health.steps??'', cycle_day: health.cycle_day??'' })
                  setHealthForm(true)
                }}>{health ? '✎' : '+'}</button>
            )}
          </div>
          {healthForm ? (
            <div className="hv2-hf-form">
              {[
                { key: 'sleep_hours', label: '睡', placeholder: '时', type: 'number', step: '0.5' },
                { key: 'resting_heart_rate', label: '心', placeholder: 'bpm', type: 'number' },
                { key: 'steps', label: '步', placeholder: '步', type: 'number' },
                { key: 'cycle_day', label: '周', placeholder: '天', type: 'number' },
              ].map(({ key, label, placeholder, type, step }) => (
                <div key={key} className="hv2-hf-row">
                  <label className="hv2-hf-label">{label}</label>
                  <input className="hv2-cd-input" type={type} step={step} placeholder={placeholder}
                    value={hf[key]} onChange={e => setHf(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <button className="hv2-cd-confirm" style={{ width:'100%', marginTop:'4px' }} onClick={submitHealth}>保存</button>
            </div>
          ) : health ? (
            <div className="hv2-health-grid">
              <div className="hv2-health-item"><div className="hv2-health-lbl">睡眠</div><div className="hv2-health-val">{health.sleep_hours ? (() => { const h = Math.floor(health.sleep_hours); const m = Math.round((health.sleep_hours - h) * 60); return m > 0 ? `${h}h ${m}m` : `${h}h` })() : '—'}</div></div>
              <div className="hv2-health-item"><div className="hv2-health-lbl">心率</div><div className="hv2-health-val">{health.resting_heart_rate ?? '—'}</div></div>
              <div className="hv2-health-item"><div className="hv2-health-lbl">步数</div><div className="hv2-health-val">{health.steps ? (health.steps >= 1000 ? `${(health.steps/1000).toFixed(1)}k` : health.steps) : '—'}</div></div>
              <div className="hv2-health-item"><div className="hv2-health-lbl">周期</div><div className="hv2-health-val">{health.cycle_day != null ? `D${health.cycle_day}` : '—'}</div></div>
            </div>
          ) : (
            <div className="hv2-health-empty">{healthMissing ? '表未建' : '今天还没录入'}</div>
          )}
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
        {pokeShow && pokeTrace && pokeTrace.length > 0 && (
          <button className="trace-btn poke-trace-btn" onClick={() => setTraceModal(pokeTrace)}>
            <span className="trace-btn-icon">✦</span>
            <span>Thought process</span>
          </button>
        )}
        {pokeShow && pokeParts.map((p, i) => (
          <div key={i} className="home-poke-msg">{p}</div>
        ))}
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
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function Monitor({ dark }) {
  const [usage, setUsage] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchData = () =>
    fetch(`${API}/api/usage`).then(r => r.json()).catch(() => ({ pages: {} }))
    .then(u => {
      setUsage(u.pages || {})
      setLoading(false)
    })

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
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
        <div className="monitor-card-title">聊天日历</div>
        <Heatmap dark={dark} />
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
  const [pendingActions, setPendingActions] = useState([])
  const thinkStartRef = useRef(null)
  const lastChatActivityRef = useRef(Date.now())
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('chatBg') || '')
  const [openTraces, setOpenTraces] = useState(() => new Set())
  const [traceModal, setTraceModal] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [chatModel, setChatModel] = useState(() => localStorage.getItem('chatModel') || 'sonnet')
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)

  const playTTS = async (msgId, content) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playingId === msgId) { setPlayingId(null); return }
    setPlayingId(msgId)
    try {
      const res = await fetch(`${API}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content })
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.play()
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); audioRef.current = null }
    } catch { setPlayingId(null) }
  }
  const bottomRef = useRef(null)
  const messagesRef = useRef(null)
  const bgInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [attachment, setAttachment] = useState(null)

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
    if (!page || seconds < 1 || seconds > 300) return
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
      const now = Date.now()
      if (document.visibilityState === 'hidden') {
        flushUsage(viewRef.current, now - viewStartRef.current)
      }
      // always reset on visibility change so background time isn't counted
      viewStartRef.current = now
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
    // Session timeout: 30 min → new conversation
    const lastActive = localStorage.getItem('lastActive')
    if (lastActive && Date.now() - Number(lastActive) > 30 * 60 * 1000) {
      const newId = Date.now().toString()
      localStorage.setItem('sessionId', newId)
      setSessionId(newId)
    }
    localStorage.setItem('lastActive', String(Date.now()))
    const interval = setInterval(() => localStorage.setItem('lastActive', String(Date.now())), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch(`${API}/api/messages?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.length > 0) {
          const LOAD_MSG_RE = /\[MSG?\]|\[M[A-Z]*G\]/
          const loaded = data.flatMap(m => {
            const parts = (m.content || '').split(LOAD_MSG_RE).map(p => p.trim()).filter(Boolean)
            if (parts.length > 1) {
              const base = Number(m.id)
              return parts.map((p, i) => ({ id: base + i, role: m.role, content: p, trace: i === 0 ? (m.trace || null) : undefined, ts: m.created_at ? new Date(m.created_at).getTime() : null }))
            }
            return [{ id: m.id, role: m.role, content: parts[0] ?? m.content, trace: m.trace || null, ts: m.created_at ? new Date(m.created_at).getTime() : null }]
          })
          setMessages([...INIT, ...loaded])
        } else {
          setMessages(INIT)
        }
      }).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    if (view === 'chat') {
      setTimeout(() => {
        const el = messagesRef.current
        if (el) el.scrollTop = el.scrollHeight
      }, 50)
    }
  }, [view])

  const handleFileAttach = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAttachment({
        name: file.name,
        mime: file.type,
        isImage: file.type.startsWith('image/'),
        data: ev.target.result
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

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
    if ((!input.trim() && !attachment) || loading) return
    let base = messages
    if (editingId) {
      const idx = base.findIndex(m => m.id === editingId)
      if (idx !== -1) base = base.slice(0, idx)
      fetch(`${API}/api/messages/${editingId}?session_id=${sessionId}`, { method: 'DELETE' }).catch(() => {})
      setEditingId(null)
    }
    const now = Date.now()
    const att = attachment
    const userMsg = { id: now, role: 'user', content: input || (att ? `[${att.isImage ? '图片' : '文件'}: ${att.name}]` : ''), attachment: att || undefined, ts: now }
    setMessages([...base, userMsg])
    setInput('')
    setAttachment(null)
    setLoading(true)
    thinkStartRef.current = Date.now()
    lastChatActivityRef.current = Date.now()
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
    const abortCtrl = new AbortController()
    const abortTimer = setTimeout(() => abortCtrl.abort(), 90000)
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, session_id: sessionId, preferences: prefsWithDesc, model: chatModel, attachment: att ? { name: att.name, mime: att.mime, isImage: att.isImage, data: att.data } : null }),
        signal: abortCtrl.signal
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let aiMsg = { id: Date.now(), role: 'assistant', content: '' }
      let rawContent = ''
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
              } else if (payload.actions) {
                setPendingActions(payload.actions)
              } else {
                rawContent += payload.text
                aiMsg = { ...aiMsg, content: rawContent.replace(/\[MSG?\]|\[M[A-Z]*G\]/g, '').replace(/^\s+/, '') }
              }
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? aiMsg : m))
            } catch {}
          }
        }
      }
      // split [MSG] into multiple bubbles — also handle [MG] model typos
      const MSG_RE = /\[MSG?\]|\[M[A-Z]*G\]/g
      const msgParts = rawContent.split(MSG_RE).map(p => p.trim()).filter(Boolean)
      const secs = thinkStartRef.current ? Math.round((Date.now() - thinkStartRef.current) / 1000) : null
      if (msgParts.length > 1) {
        const ts = Date.now()
        const multi = msgParts.map((p, i) => ({ id: ts + i, role: 'assistant', content: p, trace: i === 0 ? aiMsg.trace : undefined, thinkSecs: i === 0 && secs != null ? secs : undefined }))
        setMessages(prev => [...prev.filter(m => m.id !== aiMsg.id), ...multi])
      } else if (secs != null) {
        setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, thinkSecs: secs } : m))
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: '等太久没反应，网络可能卡了，待会儿再试。' }])
      } else {
        setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: '出错了，待会儿再试。' }])
      }
    } finally {
      clearTimeout(abortTimer)
      setLoading(false)
      loadSessions()
    }
  }

  return (
    <div
      className={`app ${dark ? 'dark' : ''}${view === 'chat' && bgImage ? ' chat-with-bg' : ''}`}
      style={(view === 'chat' && bgImage) ? {
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      <div className="main" style={(view === 'chat' && bgImage) ? { background: 'transparent' } : {}}>
        {view === 'home' && <Home dark={dark} setDark={setDark} setTraceModal={setTraceModal} />}
        <div className="chat" style={{ display: view === 'chat' ? 'flex' : 'none' }}>
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
            <div className={`chat-header${bgImage ? ' chat-header-transparent' : ''}`}>
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
            <div className="messages" ref={messagesRef} style={bgImage ? { background: 'transparent' } : {}}>
              {messages.map(m => (
                (m.content?.trim() || m.trace?.length || m.role === 'user') ? (
                <div key={m.id} className="msg-group">
                  {m.role === 'assistant' && m.trace && m.trace.length > 0 && (
                    <button className="trace-btn" onClick={() => setTraceModal(m.trace)}>
                      <span className="trace-btn-icon">✦</span>
                      <span>{m.thinkSecs != null ? `Thought for ${m.thinkSecs}s` : 'Thought process'}</span>
                    </button>
                  )}
                  <div className={`msg ${m.role}`}>
                    <div className={`bubble ${bgImage ? 'bubble-bg' : ''}`}>
                      {m.attachment?.isImage && <img className="msg-img" src={m.attachment.data} alt={m.attachment.name} />}
                      {m.attachment && !m.attachment.isImage && <div className="msg-file-chip">📎 {m.attachment.name}</div>}
                      {m.content && !m.content.startsWith('[图片:') && !m.content.startsWith('[文件:') ? m.content.replace(/\[MSG?\]|\[M[A-Z]*G\]/g, '') : (!m.attachment ? m.content : null)}
                    </div>
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
                        {m.role === 'assistant' && (
                          <button className={`msg-act${playingId === m.id ? ' playing' : ''}`} title="朗读" onClick={() => playTTS(m.id, m.content)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                            </svg>
                          </button>
                        )}
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
                ) : null
              ))}
              {pendingActions.length > 0 && (
                <div className="action-cards">
                  {pendingActions.map((a, i) => {
                    const isCal = a.type === 'cal'
                    const openICS = () => {
                      const pad = n => String(n).padStart(2, '0')
                      const buildICS = (type, fields) => {
                        const uid = Date.now() + '@xiaokehome'
                        const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
                        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//xiaokeHome//EN',
                          `BEGIN:${type}`, `UID:${uid}`, `DTSTAMP:${now}`,
                          ...fields, `END:${type}`, 'END:VCALENDAR'].join('\r\n')
                      }
                      let ics
                      if (isCal) {
                        const fields = [`SUMMARY:${a.title}`]
                        if (a.date && a.time) {
                          const local = a.date.replace(/-/g, '') + 'T' + a.time.replace(':', '') + '00'
                          const endMs = new Date(`${a.date}T${a.time}`).getTime() + 60 * 60000
                          const ed = new Date(endMs)
                          const endLocal = `${ed.getFullYear()}${pad(ed.getMonth()+1)}${pad(ed.getDate())}T${pad(ed.getHours())}${pad(ed.getMinutes())}00`
                          fields.push(`DTSTART;TZID=Asia/Shanghai:${local}`, `DTEND;TZID=Asia/Shanghai:${endLocal}`)
                        }
                        if (a.notes) fields.push(`DESCRIPTION:${a.notes}`)
                        ics = buildICS('VEVENT', fields)
                      } else {
                        const fields = [`SUMMARY:${a.title}`, 'STATUS:NEEDS-ACTION']
                        if (a.due) {
                          const dt = new Date(a.due)
                          fields.push(`DUE;TZID=Asia/Shanghai:${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`)
                        }
                        if (a.notes) fields.push(`DESCRIPTION:${a.notes}`)
                        ics = buildICS('VTODO', fields)
                      }
                      window.location.href = `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`
                    }
                    return (
                      <div key={i} className="action-card">
                        <span className="action-card-icon">{isCal ? '📅' : '⏰'}</span>
                        <div className="action-card-body">
                          <div className="action-card-title">{a.title}</div>
                          <div className="action-card-sub">{isCal ? `${a.date} ${a.time || ''}` : a.due}</div>
                        </div>
                        <button className="action-card-btn" onClick={openICS}>
                          {isCal ? '加入日历' : '添加提醒'}
                        </button>
                        <button className="action-card-close" onClick={() => setPendingActions(prev => prev.filter((_, j) => j !== i))}>✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
              {loading && (
                <div className="msg-group">
                  <div className="thinking-card">
                    <span className="thinking-icon">✦</span>
                    <span className="thinking-text">Thinking</span>
                    <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="inputarea" style={bgImage ? { background: 'rgba(15,8,4,0.35)', backdropFilter: 'blur(24px)', borderTopColor: 'rgba(255,255,255,0.1)' } : {}}>
              {editingId && (
                <div className="editing-banner">
                  <span>正在编辑这条消息，发送后会替换原内容</span>
                  <button onClick={cancelEdit}>取消</button>
                </div>
              )}
              {attachment && (
                <div className="attach-preview">
                  {attachment.isImage
                    ? <img className="attach-thumb" src={attachment.data} alt={attachment.name} />
                    : <span className="attach-file-chip">📎 {attachment.name}</span>
                  }
                  <button className="attach-remove" onClick={() => setAttachment(null)}>×</button>
                </div>
              )}
              <div className="inputwrap">
                <button className="inputwrap-attach" onClick={() => fileInputRef.current?.click()} title="附件">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.txt,.doc,.docx" style={{ display: 'none' }} onChange={handleFileAttach} />
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
        {view === 'records' && <Records />}
        {view === 'monitor' && <Monitor dark={dark} />}
        {view === 'settings' && <Settings dark={dark} setDark={setDark} chatModel={chatModel} setChatModel={setChatModel} />}
      </div>

      <div className="tabbar">
        {NAV.map(n => (
          <div key={n.id} className={`tab-item ${view === n.id ? 'active' : ''}`}
            onClick={() => {
              if (n.id === 'chat' && view !== 'chat') {
                const idleMs = Date.now() - lastChatActivityRef.current
                if (idleMs > 30 * 60 * 1000) {
                  const newId = `session_${Date.now()}`
                  setSessionId(newId)
                  localStorage.setItem('sessionId', newId)
                  setMessages(INIT)
                }
              }
              setView(n.id)
            }}>
            <span className="tab-icon">{TAB_ICON[n.id]}</span>
            <span className="tab-label">{n.label}</span>
          </div>
        ))}
      </div>

      {traceModal && (
        <div className="trace-modal-overlay" onClick={() => setTraceModal(null)}>
          <div className="trace-modal" onClick={e => e.stopPropagation()}>
            <div className="trace-modal-header">
              <span className="trace-modal-title">✦ Thinking Process</span>
              <button className="trace-modal-close" onClick={() => setTraceModal(null)}>×</button>
            </div>
            <div className="trace-modal-body">
              {traceModal.join(' ')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}