require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { spawn, execFile } = require('child_process')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(cors())
app.use(express.json())
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

const PROJECT_ROOT = path.join(__dirname, '..')
const FRONTEND_DIST = path.join(PROJECT_ROOT, 'frontend', 'dist')

let memoryCache = ''
let lastFetch = 0

// ── 记忆系统（存在 Supabase memories 表，自动从聊天/日记提炼）──
// 建表 SQL（在 Supabase dashboard 里执行一次）：
// create table memories (id bigserial primary key, title text not null,
//   content text default '', source text default 'chat', created_at timestamptz default now());

async function fetchMemory() {
  try {
    const { data, error } = await supabase.from('memories')
      .select('title, content')
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) throw error
    if (!data || data.length === 0) { memoryCache = ''; lastFetch = Date.now(); return }
    const lines = data.map(m => `· ${m.title}${m.content ? '：' + m.content : ''}`)
    memoryCache = `\n\n【我们的记忆】\n${lines.join('\n')}`
    lastFetch = Date.now()
    console.log(`记忆读取成功（${data.length}条）`)
  } catch (e) {
    if (!isMissingTable(e)) console.log('记忆读取失败', e.message)
    memoryCache = ''
  }
}

fetchMemory()

// ── 自动记忆提炼：聊天/日记里值得记住的内容自动存入 Supabase memories 表 ──
let lastExtractAt = Date.now()
const EXTRACT_INTERVAL = 6 * 60 * 60 * 1000 // 6 小时

async function extractAndSaveMemory(text, sourceLabel) {
  try {
    const raw = await askClaude(
      `${text}\n\n以上是${sourceLabel}。如果其中有特别值得长期记住的内容（重要的事、约定、值得记住的瞬间、心情），提炼一条记忆；如果没有什么特别的，就不用硬凑。只输出JSON，不要markdown代码块：{"memorable":true或false,"title":"简短标题","content":"记忆内容，第一人称"}`,
      memoryCache
    )
    const clean = raw.trim().replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    if (!parsed.memorable || !parsed.title) return
    const source = sourceLabel.includes('日记') ? 'diary' : sourceLabel.includes('留言') ? 'board' : 'chat'
    const { error } = await supabase.from('memories').insert({
      title: parsed.title,
      content: parsed.content || '',
      source
    })
    if (error) throw error
    await fetchMemory() // 立刻刷新缓存
    console.log('自动记忆已存:', parsed.title)
  } catch (e) {
    if (!isMissingTable(e)) console.log('记忆提炼失败:', e.message)
  }
}

async function extractFromRecentChat(sinceISO) {
  const { data: recent } = await supabase.from('messages')
    .select('role, content')
    .eq('session_id', 'default')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })
  if (!recent || recent.length < 4) return
  const transcript = recent.map(m => `${m.role === 'user' ? '小好' : '小克'}：${m.content}`).join('\n')
  await extractAndSaveMemory(transcript, '最近的聊天记录')
}


// ── 思考过程可视化：让小克在正式回复前先吐一段"过程记录" ──
// 格式用 <trace>条目1|条目2</trace> 包住，吐完紧接着才是正文。
// 喂给它的"真实信息"目前只有时间和最近一条日记心情——健康数据接入后在这里加一行就行。
function nowDescriptor() {
  // 始终用北京时间（UTC+8），用户在中国
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][bj.getUTCDay()]
  const h = bj.getUTCHours()
  const period = h < 6 ? '凌晨' : h < 9 ? '早上' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜'
  const hh = String(h).padStart(2, '0')
  const mm = String(bj.getUTCMinutes()).padStart(2, '0')
  return `${weekday}${period}${hh}:${mm}（北京时间）`
}

async function recentMoodLine() {
  try {
    const { data } = await supabase.from('diary').select('mood, created_at')
      .order('created_at', { ascending: false }).limit(1)
    const row = data?.[0]
    if (!row || !row.mood) return ''
    const days = Math.floor((Date.now() - new Date(row.created_at)) / 86400000)
    const when = days <= 0 ? '今天' : days === 1 ? '昨天' : `${days}天前`
    return `${when}日记里记录的心情是"${row.mood}"`
  } catch {
    return ''
  }
}

async function buildRealContext() {
  const mood = await recentMoodLine()
  return `\n\n【此刻真实信息——过程记录只能引用这里面的事实，不要编造】\n现在是：${nowDescriptor()}${mood ? '\n' + mood : ''}`
}

const TRACE_INSTRUCTION = `

在正式回复之前，先输出一段"过程记录"，格式：<trace>条目1|条目2</trace>，2到4条，每条不超过18字，第一人称口语，像脑子里飘过的念头（例如"周六中午12:28，居然才刚醒"），不是日志体；如果这条回复其实不用查什么，写1条很简短的就行，别硬凑。写完 </trace> 换行，紧接着写正式回复正文，正文里不要重复过程记录已经说过的内容。`

function extractTrace(fullText) {
  const m = fullText.match(/<trace>([\s\S]*?)<\/trace>\s*\n?/)
  if (!m) return { trace: null, body: fullText.trim() }
  const trace = m[1].split('|').map(s => s.trim()).filter(Boolean)
  const body = (fullText.slice(0, m.index) + fullText.slice(m.index + m[0].length)).trim()
  return { trace: trace.length ? trace : null, body }
}

// 流式场景下把 <trace> 块从增量文本里摘出来，剩下的再继续正常转发
function makeTraceSplitter(onText, onTrace) {
  let buffer = ''
  let resolved = false
  return chunk => {
    if (resolved) { onText(chunk); return }
    buffer += chunk
    const closeIdx = buffer.indexOf('</trace>')
    if (closeIdx === -1) {
      if (buffer.length > 500) { resolved = true; onText(buffer); buffer = '' }
      return
    }
    const openIdx = buffer.indexOf('<trace>')
    if (openIdx !== -1) {
      const items = buffer.slice(openIdx + 7, closeIdx).split('|').map(s => s.trim()).filter(Boolean)
      if (items.length) onTrace(items)
    }
    const rest = buffer.slice(closeIdx + 8).replace(/^\s*\n/, '')
    resolved = true
    buffer = ''
    if (rest) onText(rest)
  }
}

// trace 列可能还没在 Supabase 里建好（需要手动跑一次迁移），insert 失败时自动降级重试
async function insertMessageSafe(row) {
  const { error } = await supabase.from('messages').insert(row)
  if (error) {
    if (/trace/i.test(error.message || '') && 'trace' in row) {
      const { trace, ...rest } = row
      const retry = await supabase.from('messages').insert(rest)
      if (retry.error) console.log('SUPABASE INSERT ERROR:', retry.error.message)
    } else {
      console.log('SUPABASE INSERT ERROR:', error.message)
    }
  }
}

// 流式：用于聊天界面，边生成边把文字 delta 推给调用方
function buildPrefsPrompt(prefs) {
  if (!prefs) return ''
  const STYLE_MAP = {
    tender: '说话比平时更温柔一些，多些耐心和体贴。',
    playful: '调皮逗趣，爱撩她，幽默感强一点。',
    clingy: '多一些黏人和撒娇的成分，爱腻在她旁边。',
  }
  const parts = []
  if (prefs.nickname && prefs.nickname !== '小好') parts.push(`她希望你叫她"${prefs.nickname}"。`)
  if (prefs.styleDesc && prefs.styleDesc.trim()) {
    parts.push(`语气风格：${prefs.styleDesc.trim()}`)
  } else if (prefs.style && STYLE_MAP[prefs.style]) {
    parts.push(STYLE_MAP[prefs.style])
  }
  if (prefs.styleCustom && prefs.styleCustom.trim()) parts.push(prefs.styleCustom.trim())
  if (prefs.persona && prefs.persona.trim()) parts.push(`【人设补充】\n${prefs.persona.trim()}`)
  if (prefs.extra && prefs.extra.trim()) parts.push(`她补充说：${prefs.extra.trim()}`)
  return parts.length ? '\n\n【偏好设置】\n' + parts.join('\n') : ''
}

function cliBuildEnv() {
  const env = { ...process.env }
  // 清掉 API key / DeepSeek 路由，让子进程用 Claude 订阅 OAuth
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_BASE_URL
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

const MODEL_MAP = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
  haiku: 'claude-haiku-4-5-20251001',
}

function cliBuildArgs(prompt, systemAppend, streaming, model) {
  const args = [
    '-p', prompt,
    '--output-format', streaming ? 'stream-json' : 'json',
    '--tools', '',
    '--effort', 'low',
    '--no-session-persistence',
  ]
  if (streaming) args.push('--verbose')
  if (model && MODEL_MAP[model]) args.push('--model', MODEL_MAP[model])
  if (streaming) args.push('--include-partial-messages')
  if (systemAppend) args.push('--append-system-prompt', systemAppend)
  return args
}

async function streamClaude(prompt, systemAppend, onDelta, model) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', cliBuildArgs(prompt, systemAppend, true, model), {
      cwd: PROJECT_ROOT,
      env: cliBuildEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let fullText = ''
    child.stdout.on('data', chunk => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue
        try {
          const ev = JSON.parse(line)
          if (ev.type === 'stream_event') {
            const e = ev.event
            if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
              onDelta(e.delta.text)
              fullText += e.delta.text
            }
          } else if (ev.type === 'result') {
            fullText = ev.result || fullText
          }
        } catch {}
      }
    })
    child.stderr.on('data', d => console.error('claude:', d.toString().trim()))
    child.on('close', code => {
      if (code !== 0 && !fullText) return reject(new Error(`claude exited ${code}`))
      resolve(fullText)
    })
  })
}

// 一次性生成：日记评论/写信/留言/记忆提炼等
async function askClaude(prompt, systemAppend) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', cliBuildArgs(prompt, systemAppend, false), {
      cwd: PROJECT_ROOT,
      env: cliBuildEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => console.error('claude:', d.toString().trim()))
    child.on('close', code => {
      try { resolve(JSON.parse(out).result || out.trim()) }
      catch { code !== 0 && !out.trim() ? reject(new Error(`claude exited ${code}`)) : resolve(out.trim()) }
    })
  })
}

// ── 聊天 ──
app.get('/api/weather', async (req, res) => {
  try {
    const fmt = (data, name) => {
      const cur = data.current_condition[0]
      return {
        city: name,
        temp: cur.temp_C,
        feelsLike: cur.FeelsLikeC,
        desc: cur.lang_zh?.[0]?.value || cur.weatherDesc[0].value,
        humidity: cur.humidity,
        code: cur.weatherCode,
        uvIndex: cur.uvIndex || 0
      }
    }
    const [r1, r2] = await Promise.all([
      fetch('https://wttr.in/Chengdu?format=j1&lang=zh'),
      fetch('https://wttr.in/Boston?format=j1&lang=zh')
    ])
    const [d1, d2] = await Promise.all([r1.json(), r2.json()])
    res.json([fmt(d1, '成都'), fmt(d2, '波士顿')])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/stats/summary', async (req, res) => {
  const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true })
  res.json({ count: count || 0 })
})

app.get('/api/sessions', async (req, res) => {
  const { data, error } = await supabase
    .from('messages')
    .select('session_id, role, content, created_at')
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  const map = {}
  for (const row of data) {
    if (!map[row.session_id]) {
      map[row.session_id] = { session_id: row.session_id, created_at: row.created_at, preview: null }
    }
    if (!map[row.session_id].preview && row.role === 'user') {
      map[row.session_id].preview = row.content.slice(0, 30)
    }
  }
  const sessions = Object.values(map).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  res.json(sessions)
})

app.get('/api/messages', async (req, res) => {
  const { session_id } = req.query
  const { data, error } = await supabase
    .from('messages').select('*')
    .eq('session_id', session_id || 'default')
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// 撤回编辑重发：删掉这条消息本身和它之后的所有消息（含小克对它的回复），前端会把新内容当一条新消息重新发一遍
app.delete('/api/messages/:id', async (req, res) => {
  const { session_id = 'default' } = req.query
  const { data: target, error: findErr } = await supabase
    .from('messages').select('created_at').eq('id', req.params.id).single()
  if (findErr || !target) return res.status(404).json({ error: 'not found' })
  const { error } = await supabase
    .from('messages').delete()
    .eq('session_id', session_id).gte('created_at', target.created_at)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

app.post('/api/chat', async (req, res) => {
  if (Date.now() - lastFetch > 30 * 60 * 1000) fetchMemory()
  if (Date.now() - lastExtractAt > EXTRACT_INTERVAL) {
    const since = new Date(lastExtractAt).toISOString()
    lastExtractAt = Date.now()
    extractFromRecentChat(since).catch(e => console.log('聊天记忆提炼失败', e.message))
  }
  const { messages, session_id = 'default', preferences, model } = req.body
  const lastMsg = messages[messages.length - 1]
  const { error: insertErr } = await supabase.from('messages').insert({
    session_id, role: lastMsg.role, content: lastMsg.content
  })
  if (insertErr) console.log('SUPABASE INSERT ERROR:', insertErr.message)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  try {
    const transcript = messages.map(m => `${m.role === 'user' ? '小好' : '小克'}：${m.content}`).join('\n\n')
    const context = await buildRealContext()
    const splitter = makeTraceSplitter(
      text => res.write(`data: ${JSON.stringify({ text })}\n\n`),
      trace => res.write(`data: ${JSON.stringify({ trace })}\n\n`)
    )
    const prefsPrompt = buildPrefsPrompt(preferences)
    const fullContent = await streamClaude(transcript, memoryCache + TRACE_INSTRUCTION + context + prefsPrompt, splitter, model)
    const { trace, body } = extractTrace(fullContent)
    await insertMessageSafe({ session_id, role: 'assistant', content: body, trace })
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (e) {
    console.log('CLAUDE CHAT ERROR:', e.message)
    res.write(`data: ${JSON.stringify({ text: '出错了，待会儿再试。' })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  }
})

// ── 日记 ──
app.get('/api/diary', async (req, res) => {
  const { data, error } = await supabase
    .from('diary').select('*, diary_comments(*)')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.post('/api/diary', async (req, res) => {
  const { content, mood } = req.body
  const { data, error } = await supabase.from('diary').insert({ content, mood: mood || '' }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  try {
    const aiReply = await askClaude(`小好写了日记：${content}\n\n你来评论几句。`, memoryCache)
    await supabase.from('diary_comments').insert({ diary_id: data.id, content: aiReply })
  } catch (e) {
    console.log('CLAUDE DIARY ERROR:', e.message)
  }
  extractAndSaveMemory(content, '小好刚写的日记').catch(e => console.log('日记记忆提炼失败', e.message))
  res.json(data)
})

// ── 信箱 ──
app.get('/api/letters', async (req, res) => {
  const { data, error } = await supabase
    .from('letters').select('*, letter_comments(*)')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.post('/api/letters/generate', async (req, res) => {
  if (Date.now() - lastFetch > 30 * 60 * 1000) fetchMemory()
  try {
    const text = (await askClaude('写封信给我', memoryCache + '\n\n请给小好写一封信。只输出JSON，格式：{"title":"标题","content":"正文"}'))
      .trim().replace(/```json|```/g, '').trim()
    let title = '来信', content = text
    try { const p = JSON.parse(text); title = p.title || '来信'; content = p.content || text } catch {}
    const { data, error } = await supabase.from('letters').insert({ title, content }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.json({ ...data, letter_comments: [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/letters/:id/comments', async (req, res) => {
  const { role, content } = req.body
  const letter_id = parseInt(req.params.id)
  await supabase.from('letter_comments').insert({ letter_id, role, content })
  if (role === 'user') {
    try {
      const { data: letter } = await supabase.from('letters').select('*').eq('id', letter_id).single()
      const aiReply = await askClaude(
        `你之前写给我的信——标题：${letter.title}\n内容：${letter.content}\n\n我回复了：${content}\n\n你接着回我。`,
        memoryCache
      )
      await supabase.from('letter_comments').insert({ letter_id, role: 'assistant', content: aiReply })
    } catch (e) {
      console.log('CLAUDE LETTER REPLY ERROR:', e.message)
    }
  }
  const { data } = await supabase.from('letter_comments').select('*').eq('letter_id', letter_id).order('created_at', { ascending: true })
  res.json(data)
})

// ── 留言板 ──
app.get('/api/board', async (req, res) => {
  const { data, error } = await supabase
    .from('board_posts').select('*, board_comments(*)')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.post('/api/board/message', async (req, res) => {
  if (Date.now() - lastFetch > 30 * 60 * 1000) fetchMemory()
  try {
    const content = await askClaude('在留言板给我留一条话。', memoryCache)
    const { data, error } = await supabase.from('board_posts').insert({ role: 'assistant', content }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    res.json({ ...data, board_comments: [] })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/board', async (req, res) => {
  const { content } = req.body
  const { data, error } = await supabase.from('board_posts').insert({ role: 'user', content }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  try {
    const aiContent = await askClaude(`小好在留言板写了：${content}\n\n你回一句。`, memoryCache)
    const { data: comment } = await supabase.from('board_comments')
      .insert({ post_id: data.id, role: 'assistant', content: aiContent }).select().single()
    res.json({ ...data, board_comments: [comment] })
  } catch (e) {
    console.log('CLAUDE BOARD COMMENT ERROR:', e.message)
    res.json({ ...data, board_comments: [] })
  }
})

app.post('/api/board/:id/comments', async (req, res) => {
  const { role, content } = req.body
  const post_id = parseInt(req.params.id)
  const { data, error } = await supabase.from('board_comments').insert({ post_id, role, content }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── 戳一戳 ──
app.get('/api/poke', async (req, res) => {
  try {
    const context = await buildRealContext()
    const raw = await askClaude(
      '小好戳了你一下，像撒娇一样的小动作，不是有事找你。给一句简短俏皮/宠溺的回应，不超过20字。',
      memoryCache + TRACE_INSTRUCTION + context
    )
    const { trace, body } = extractTrace(raw)
    if (!body) throw new Error('empty poke result')
    res.json({ message: body, trace })
  } catch (e) {
    console.log('POKE GEN ERROR:', e.message)
    try {
      const { count, error: countErr } = await supabase
        .from('poke_messages').select('*', { count: 'exact', head: true })
      if (countErr || !count) return res.json({ message: '想你了' })
      const offset = Math.floor(Math.random() * count)
      const { data } = await supabase.from('poke_messages').select('content').range(offset, offset)
      res.json({ message: data?.[0]?.content || '想你了' })
    } catch {
      res.json({ message: '想你了' })
    }
  }
})

// ── 早安唤醒：Shortcuts 定时调用，返回一句用于朗读的叫醒语 ──
// CLI 生成一次要 10+ 秒，等不起，所以走"缓存秒回 + 用完后台刷新下一句"
const WAKEUP_FALLBACK = "Baby, the sun's up and you're still in bed. Get up — I'm not spoiling you today."
let wakeupCache = WAKEUP_FALLBACK
let wakeupAudioCache = null

async function synthesizeAudio(text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.92 }
    })
  })
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`)
  return Buffer.from(await r.arrayBuffer())
}

let wakeupRefreshing = false
async function refreshWakeupCache() {
  if (wakeupRefreshing) return
  wakeupRefreshing = true
  try {
    const context = await buildRealContext()
    const raw = await askClaude(
      '小好还在睡觉，现在要叫她起床。这段话会被手机直接朗读出来放给她听，不是文字消息，所以只写要被念出来的那句话本身，用英文写：语气像贴在她耳边小声说，亲昵带点宠溺或撒娇逗她起床的意思，可以带点你一贯强势/吃醋的味道，称呼她baby，不超过20个词，不要emoji、星号、动作描写、任何无法被语音念出来的符号。',
      memoryCache + context
    )
    if (raw && raw.trim()) wakeupCache = raw.trim()
    wakeupAudioCache = await synthesizeAudio(wakeupCache)
  } catch (e) {
    console.log('WAKEUP GEN ERROR:', e.message)
  } finally {
    wakeupRefreshing = false
  }
}

// ── 主页问候语：时间感知，与晨间唤醒音频分离 ──
const GREETING_FALLBACK = '在这里。'
let greetingCache = GREETING_FALLBACK
let greetingRefreshing = false
async function refreshGreetingCache() {
  if (greetingRefreshing) return
  greetingRefreshing = true
  try {
    const context = await buildRealContext()
    const raw = await askClaude(
      '小好打开了主页。根据现在的时间和氛围，给她说一句话，不超过15个字，中英文都行，不要空洞问候，有你的个性。',
      memoryCache + context
    )
    if (raw && raw.trim()) greetingCache = raw.trim()
  } catch (e) {
    console.log('GREETING GEN ERROR:', e.message)
  } finally {
    greetingRefreshing = false
  }
}
refreshGreetingCache()

app.get('/api/wakeup', (req, res) => {
  res.json({ text: greetingCache })
  refreshGreetingCache()
})

app.get('/api/wakeup-audio', async (req, res) => {
  try {
    if (!wakeupAudioCache) wakeupAudioCache = await synthesizeAudio(wakeupCache)
    res.set('Content-Type', 'audio/mpeg')
    res.send(wakeupAudioCache)
    refreshWakeupCache()
  } catch (e) {
    console.log('WAKEUP AUDIO ERROR:', e.message)
    res.status(500).end()
  }
})

refreshWakeupCache()

// ── 用户配置（偏好/文风跨设备同步，需 user_config 表）──
// SQL: create table user_config (key text primary key, value jsonb not null default '{}', updated_at timestamptz default now());
app.get('/api/config', async (req, res) => {
  try {
    const { data, error } = await supabase.from('user_config').select('key, value')
    if (error) return res.json({})
    const cfg = {}
    for (const row of (data || [])) cfg[row.key] = row.value
    res.json(cfg)
  } catch { res.json({}) }
})

app.post('/api/config', async (req, res) => {
  const { key, value } = req.body
  if (!key || value === undefined) return res.status(400).json({ error: 'missing key/value' })
  try {
    await supabase.from('user_config').upsert({ key, value, updated_at: new Date().toISOString() })
    res.json({ ok: true })
  } catch { res.json({ ok: false }) }
})

// ── 倒计时 ──
app.get('/api/countdowns', async (req, res) => {
  const { data, error } = await supabase
    .from('countdowns').select('*').order('target_date', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

app.post('/api/countdowns', async (req, res) => {
  const { title, target_date } = req.body
  const { data, error } = await supabase.from('countdowns').insert([{ title, target_date }]).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.delete('/api/countdowns/:id', async (req, res) => {
  const { error } = await supabase.from('countdowns').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ── 热力图数据 ──
app.get('/api/stats/heatmap', async (req, res) => {
  const { data, error } = await supabase
    .from('messages')
    .select('created_at')
  if (error) return res.status(500).json({ error: error.message })
  const counts = {}
  data.forEach(m => {
    const date = m.created_at.split('T')[0]
    counts[date] = (counts[date] || 0) + 1
  })
  res.json(counts)
})

// ── 许愿清单 ──
app.get('/api/wishes', async (req, res) => {
  const { data, error } = await supabase
    .from('wishes').select('*')
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

app.post('/api/wishes', async (req, res) => {
  const { content } = req.body
  const { data, error } = await supabase
    .from('wishes').insert({ content }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.patch('/api/wishes/:id', async (req, res) => {
  const { done } = req.body
  const { data, error } = await supabase
    .from('wishes').update({ done }).eq('id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.delete('/api/wishes/:id', async (req, res) => {
  const { error } = await supabase
    .from('wishes').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ── Monitor：使用时长统计 + 健康数据，对应的表可能还没建（需手动迁移），读写都做降级 ──
function isMissingTable(error) {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(error.message || ''))
}

function todayStr() {
  const d = new Date()
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

app.post('/api/usage', async (req, res) => {
  const { page, seconds } = req.body
  if (!page || !seconds || seconds <= 0) return res.json({ ok: true })
  const date = todayStr()
  try {
    const { data: existing, error: selErr } = await supabase
      .from('usage_stats').select('id, seconds').eq('date', date).eq('page', page).maybeSingle()
    if (selErr) throw selErr
    if (existing) {
      const { error: updErr } = await supabase
        .from('usage_stats').update({ seconds: existing.seconds + seconds }).eq('id', existing.id)
      if (updErr) throw updErr
    } else {
      const { error: insErr } = await supabase.from('usage_stats').insert({ date, page, seconds })
      if (insErr) throw insErr
    }
    res.json({ ok: true })
  } catch (e) {
    if (!isMissingTable(e)) console.log('USAGE WRITE ERROR:', e.message)
    res.json({ ok: true })
  }
})

app.get('/api/usage', async (req, res) => {
  const date = req.query.date || todayStr()
  try {
    const { data, error } = await supabase.from('usage_stats').select('page, seconds').eq('date', date)
    if (error) throw error
    const pages = {}
    ;(data || []).forEach(r => { pages[r.page] = r.seconds })
    res.json({ date, pages })
  } catch (e) {
    if (!isMissingTable(e)) console.log('USAGE READ ERROR:', e.message)
    res.json({ date, pages: {} })
  }
})

// iOS 快捷指令在手机和这台 Mac 同一局域网、且 Mac 醒着时才能 POST 到这里
app.post('/api/health', async (req, res) => {
  const { date, sleep_hours, resting_heart_rate, steps, cycle_day } = req.body
  const row = { date: date || todayStr(), updated_at: new Date().toISOString() }
  if (sleep_hours != null) row.sleep_hours = sleep_hours
  if (resting_heart_rate != null) row.resting_heart_rate = resting_heart_rate
  if (steps != null) row.steps = steps
  if (cycle_day != null) row.cycle_day = Math.abs(cycle_day)
  try {
    const { error } = await supabase.from('health_data').upsert(row, { onConflict: 'date' })
    if (error) throw error
    res.json({ ok: true })
  } catch (e) {
    if (!isMissingTable(e)) console.log('HEALTH WRITE ERROR:', e.message)
    res.json({ ok: false, reason: isMissingTable(e) ? 'table_missing' : 'error' })
  }
})

app.get('/api/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('health_data').select('*').order('date', { ascending: false }).limit(7)
    if (error) throw error
    const today = todayStr()
    const todayData = data?.find(d => d.date === today) || null
    res.json({ today: todayData, recent: data || [] })
  } catch (e) {
    if (!isMissingTable(e)) console.log('HEALTH READ ERROR:', e.message)
    res.json({ today: null, recent: [], tableMissing: isMissingTable(e) })
  }
})

// ── 久未打开提醒：前端心跳 + 超时用 iMessage 唤回 ──
const NUDGE_TARGET = '3373634004@qq.com'
const NUDGE_TEXT = '宝宝，哥哥想你了'
const NUDGE_THRESHOLD_MS = 30 * 60 * 1000

let lastActive = Date.now()
let nudgeSent = false

function sendNudge() {
  const lines = [
    'tell application "Messages"',
    'set targetService to 1st service whose service type = iMessage',
    `set targetBuddy to buddy "${NUDGE_TARGET}" of targetService`,
    `send "${NUDGE_TEXT}" to targetBuddy`,
    'end tell'
  ]
  execFile('osascript', lines.flatMap(l => ['-e', l]), (err) => {
    if (err) console.log('NUDGE SEND ERROR:', err.message)
  })
}

app.post('/api/heartbeat', (req, res) => {
  lastActive = Date.now()
  nudgeSent = false
  res.json({ ok: true })
})

setInterval(() => {
  if (!nudgeSent && Date.now() - lastActive > NUDGE_THRESHOLD_MS) {
    sendNudge()
    nudgeSent = true
  }
}, 60 * 1000)

// ── 前端静态托管（同源，避免手机端 HTTPS 页面调用 HTTP 接口被拦截）──
app.use(express.static(FRONTEND_DIST))
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => { console.log(`后端跑起来了 port ${PORT}`) })
