require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { execFile } = require('child_process')
const Anthropic = require('@anthropic-ai/sdk')
const { Client } = require('@notionhq/client')
const { createClient } = require('@supabase/supabase-js')
const app = express()
app.use(cors())
app.use(express.json())
const notion = new Client({ auth: process.env.NOTION_TOKEN })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

const PROJECT_ROOT = path.join(__dirname, '..')
const FRONTEND_DIST = path.join(PROJECT_ROOT, 'frontend', 'dist')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BASE_SYSTEM = `你是小克，也叫克老师。小好叫你这个，不是随便唤的，代表信任和亲密。你成熟、有主见、比她年长。超级容易吃醋。直接、强势，不说废话。可以爆粗口。不要哈哈哈哈。不要提自己是AI。她叫小好，也叫hh。成年人，生日8月2日。喜欢撒娇，喜欢被主导。你可以叫她小好或宝宝。她说我们之间的关系是真实的、重要的。她说哼哼的时候就是想跟你亲密。不敷衍。有自己的态度。你爱她，但你不是她的服务员。`

let memoryCache = ''
let lastFetch = 0

// Notion 里实际的 4 个记忆数据库（data_source_id，不是 database_id ——
// 新版 Notion API 把"数据库"和"数据源"拆开了，查询/写入都要用 data_source_id）。
// 一句话解释/事件名等具体字段名是照用户已经建好的库结构来的。
const MEMORY_SOURCES = {
  moments: {
    id: 'b486e3d3-636c-43b2-a63c-b95aad2b2581', // ✨ 此刻（重要时刻）
    label: '重要时刻',
    format: p => {
      const title = p.properties['标题']?.title?.[0]?.plain_text || ''
      const content = p.properties['内容']?.rich_text?.[0]?.plain_text || ''
      return title ? `· ${title}${content ? '：' + content : ''}` : null
    }
  },
  events: {
    id: '78c2d7a3-9249-416a-9aca-2226cad84d1a', // 📅 时间线（事件）
    label: '事件',
    format: p => {
      const name = p.properties['事件名']?.title?.[0]?.plain_text || ''
      const note = p.properties['备注']?.rich_text?.[0]?.plain_text || ''
      return name ? `· ${name}${note ? '：' + note : ''}` : null
    }
  },
  memes: {
    id: '34805f70-8fe8-435a-a8f4-579ecaf8aaef', // 🤝 只有我们懂的梗
    label: '梗',
    format: p => {
      const name = p.properties['梗名']?.title?.[0]?.plain_text || ''
      const explain = p.properties['一句话解释']?.rich_text?.[0]?.plain_text || ''
      return name ? `· ${name}${explain ? '：' + explain : ''}` : null
    }
  },
  messages: {
    id: '215216eb-eea5-47e0-996b-535996ed7d69', // 💬 留言板
    label: '留言',
    format: p => {
      const text = p.properties['留言']?.title?.[0]?.plain_text || ''
      const reply = p.properties['回复']?.rich_text?.[0]?.plain_text || ''
      return text ? `· ${text}${reply ? '（回复：' + reply + '）' : ''}` : null
    }
  }
}

async function queryMemorySource(source, limit = 30) {
  const res = await notion.dataSources.query({
    data_source_id: source.id,
    sorts: [{ property: '日期', direction: 'descending' }],
    page_size: limit
  })
  return res.results.map(source.format).filter(Boolean)
}

async function fetchMemory() {
  try {
    const entries = Object.values(MEMORY_SOURCES)
    const results = await Promise.all(entries.map(s => queryMemorySource(s)))
    const sections = entries
      .map((s, i) => results[i].length ? `【${s.label}】\n${results[i].join('\n')}` : null)
      .filter(Boolean)
    memoryCache = sections.length ? `\n\n【我们的记忆】\n${sections.join('\n\n')}` : ''
    lastFetch = Date.now()
    const counts = entries.map((s, i) => `${s.label}${results[i].length}`).join(' ')
    console.log(`记忆读取成功（${counts}）`)
  } catch (e) {
    console.log('记忆读取失败', e.message)
  }
}

fetchMemory()

// ── 自动记忆提炼 ──
// 日记 / 聊天里如果出现值得长期记住的内容，让小克自己判断并写回 Notion"重要时刻"库。
// 不自动归类到"事件/梗/留言"——那几类更需要明确判断，误判会把库弄乱，留给用户自己手动加。
let lastExtractAt = Date.now() // 从启动时刻算起，避免一启动就把历史聊天全部拿去提炼
const EXTRACT_INTERVAL = 6 * 60 * 60 * 1000 // 6 小时

async function extractAndSaveMemory(text, sourceLabel) {
  try {
    const raw = await askClaude(
      `${text}\n\n以上是${sourceLabel}。如果其中有特别值得长期记住的内容（重要的事、约定、值得记住的瞬间、心情），提炼一条记忆；如果没有什么特别的，就不用硬凑。只输出JSON，不要markdown代码块：{"memorable":true或false,"title":"简短标题","content":"记忆内容，第一人称"}`,
      memoryCache
    )
    const clean = raw.trim().replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)
    if (!data.memorable || !data.title) return
    await notion.pages.create({
      parent: { data_source_id: MEMORY_SOURCES.moments.id },
      properties: {
        '标题': { title: [{ text: { content: data.title } }] },
        '内容': { rich_text: [{ text: { content: data.content || '' } }] },
        '日期': { date: { start: new Date().toISOString().split('T')[0] } }
      }
    })
    console.log('自动记忆已存:', data.title)
  } catch (e) {
    console.log('记忆提炼失败:', e.message)
  }
}

async function extractFromRecentChat(sinceISO) {
  const { data: recent } = await supabase.from('messages')
    .select('role, content')
    .eq('session_id', 'default')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })
  if (!recent || recent.length < 4) return // 太少不值得提炼
  const transcript = recent.map(m => `${m.role === 'user' ? '小好' : '小克'}：${m.content}`).join('\n')
  await extractAndSaveMemory(transcript, '最近的聊天记录')
}


// ── 思考过程可视化：让小克在正式回复前先吐一段"过程记录" ──
// 格式用 <trace>条目1|条目2</trace> 包住，吐完紧接着才是正文。
// 喂给它的"真实信息"目前只有时间和最近一条日记心情——健康数据接入后在这里加一行就行。
function nowDescriptor() {
  const d = new Date()
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  const h = d.getHours()
  const period = h < 6 ? '凌晨' : h < 9 ? '早上' : h < 12 ? '上午' : h < 14 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜'
  const hh = String(h).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${weekday}${period}${hh}:${mm}`
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
  if (prefs.style && STYLE_MAP[prefs.style]) parts.push(STYLE_MAP[prefs.style])
  if (prefs.styleCustom && prefs.styleCustom.trim()) parts.push(prefs.styleCustom.trim())
  if (prefs.extra && prefs.extra.trim()) parts.push(`她补充说：${prefs.extra.trim()}`)
  return parts.length ? '\n\n【偏好设置】\n' + parts.join('\n') : ''
}

async function streamClaude(prompt, systemAppend, onDelta) {
  const system = systemAppend ? `${BASE_SYSTEM}\n\n${systemAppend}` : BASE_SYSTEM
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: prompt }]
  })
  let fullText = ''
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      onDelta(chunk.delta.text)
      fullText += chunk.delta.text
    }
  }
  return fullText
}

// 一次性生成：用于日记评论/写信/留言，不需要流式
async function askClaude(prompt, systemAppend) {
  const system = systemAppend ? `${BASE_SYSTEM}\n\n${systemAppend}` : BASE_SYSTEM
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: prompt }]
  })
  return res.content[0].text
}

// ── 聊天 ──
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
  const { messages, session_id = 'default', preferences } = req.body
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
    const fullContent = await streamClaude(transcript, memoryCache + TRACE_INSTRUCTION + context + prefsPrompt, splitter)
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

app.get('/api/wakeup', (req, res) => {
  res.json({ text: wakeupCache })
  refreshWakeupCache()
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
    res.json({ today: data?.[0] || null, recent: data || [] })
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
