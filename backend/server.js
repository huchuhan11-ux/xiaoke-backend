require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const os = require('os')
const { spawn, execFile, execFileSync } = require('child_process')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const nodemailer = require('nodemailer')
const { Client: NotionClient } = require('@notionhq/client')
const app = express()
app.use(cors())
app.use(express.json())
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

const PROJECT_ROOT = path.join(__dirname, '..')
const FRONTEND_DIST = path.join(PROJECT_ROOT, 'frontend', 'dist')


let memoryCache = ''
let lastFetch = 0
let rateLimitCache = {}

const CLAUDE_KEYCHAIN_SERVICE = 'Claude Code-credentials'
const CLAUDE_RUNTIME_DIR = path.join(os.tmpdir(), 'xiaokehome-claude-subscription')
const CLAUDE_RUNTIME_CREDS = path.join(CLAUDE_RUNTIME_DIR, '.credentials.json')
let claudeUsageCache = null
let claudeUsageCacheAt = 0

function readCredentialsFile(file) {
  try {
    const creds = JSON.parse(fs.readFileSync(file, 'utf8'))
    return creds?.claudeAiOauth?.accessToken ? creds : null
  } catch { return null }
}

function readKeychainCredentials() {
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', CLAUDE_KEYCHAIN_SERVICE, '-w'], {
      encoding: 'utf8', timeout: 5000
    }).trim()
    const creds = JSON.parse(raw)
    return creds?.claudeAiOauth?.accessToken ? creds : null
  } catch { return null }
}

function ensureSubscriptionConfig() {
  fs.mkdirSync(CLAUDE_RUNTIME_DIR, { recursive: true, mode: 0o700 })
  const runtime = readCredentialsFile(CLAUDE_RUNTIME_CREDS)
  const keychain = readKeychainCredentials()
  if (!runtime && !keychain) throw new Error('Claude subscription OAuth credentials are missing from Keychain')
  const runtimeExpiry = Number(runtime?.claudeAiOauth?.expiresAt || 0)
  const keychainExpiry = Number(keychain?.claudeAiOauth?.expiresAt || 0)
  if (!runtime || (keychain && keychainExpiry > runtimeExpiry)) {
    fs.writeFileSync(CLAUDE_RUNTIME_CREDS, JSON.stringify(keychain), { mode: 0o600 })
  } else {
    try { fs.chmodSync(CLAUDE_RUNTIME_CREDS, 0o600) } catch {}
  }
  return CLAUDE_RUNTIME_DIR
}

function getClaudeOAuth() {
  const runtime = readCredentialsFile(CLAUDE_RUNTIME_CREDS)
  if (runtime?.claudeAiOauth?.accessToken) return runtime.claudeAiOauth
  const keychain = readKeychainCredentials()
  return keychain?.claudeAiOauth || null
}


async function fetchClaudeUsage() {
  const now = Date.now()
  if (claudeUsageCache && now - claudeUsageCacheAt < 5 * 60 * 1000) return claudeUsageCache
  const { execFileSync } = require('child_process')
  const doFetch = (accessToken) => {
    const curlUsage = (proxy) => {
      const args = ['-s', '--max-time', '8']
      if (proxy) args.push('-x', proxy)
      args.push('-H', `Authorization: Bearer ${accessToken}`, '-H', 'anthropic-beta: oauth-2025-04-20', 'https://api.anthropic.com/api/oauth/usage')
      return execFileSync('curl', args, { encoding: 'utf8', timeout: 10000 })
    }
    let out
    try {
      const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:6952'
      out = curlUsage(proxy)
      if (out.includes('"error"') && !out.includes('"utilization"')) out = curlUsage('')
    } catch { out = curlUsage('') }
    return JSON.parse(out)
  }
  try {
    let oauth = getClaudeOAuth()
    if (!oauth?.accessToken) return { ok: false, error: 'no OAuth token found' }
    let data = doFetch(oauth.accessToken)
    // If auth error, try running `claude auth status` to trigger CLI's own token refresh, then retry once
    if (data.error?.type === 'authentication_error' || (data.error && !data.five_hour && !data.seven_day)) {
      try {
        execFileSync('claude', ['auth', 'status'], { encoding: 'utf8', timeout: 10000, env: cliBuildEnv() })
        await new Promise(r => setTimeout(r, 800))
        oauth = getClaudeOAuth()
        if (oauth?.accessToken) data = doFetch(oauth.accessToken)
      } catch {}
    }
    if (data.error) {
      // 失败时返回上次的好数据（带 stale 标记），避免图表消失
      if (claudeUsageCache) return { ...claudeUsageCache, stale: true }
      return { ok: false, error: data.error?.message || 'token可能已过期，发条消息后再试' }
    }
    const KEYS = { five_hour: '5 小时', seven_day: '7 天总量', seven_day_sonnet: '7 天 Sonnet' }
    const windows = {}
    for (const [key, label] of Object.entries(KEYS)) {
      const w = data[key]
      if (w != null && w.utilization != null) windows[key] = { label, utilization: w.utilization, resets_at: w.resets_at }
    }
    const result = { ok: true, plan: oauth.subscriptionType, tier: oauth.rateLimitTier, windows, extra_usage: data.extra_usage }
    claudeUsageCache = result
    claudeUsageCacheAt = now
    return result
  } catch (e) {
    if (claudeUsageCache) return { ...claudeUsageCache, stale: true }
    return { ok: false, error: e.message }
  }
}

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

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))])

// 每5分钟刷一次，聊天时直接用缓存
let _ctxCache = { value: '', ts: 0 }
const CTX_TTL = 5 * 60 * 1000

async function refreshContext() {
  try {
    const [mood, healthRow, locRow] = await Promise.all([
      withTimeout(recentMoodLine(), 2500).catch(() => ''),
      withTimeout(supabase.from('health_data').select('*').eq('date', new Date().toLocaleDateString('en-CA')).single(), 2500).catch(() => ({ data: null })),
      withTimeout(supabase.from('user_config').select('value').eq('key', 'userLocation').single(), 2500).catch(() => ({ data: null }))
    ])
    let healthStr = ''
    const h = healthRow?.data
    if (h) {
      const parts = []
      if (h.sleep_hours != null && h.sleep_hours > 0) {
        const hrs = Math.floor(h.sleep_hours)
        const mins = Math.round((h.sleep_hours - hrs) * 60)
        parts.push(`睡了 ${hrs}h${mins > 0 ? ` ${mins}m` : ''}`)
      }
      if (h.resting_heart_rate) parts.push(`静息心率 ${h.resting_heart_rate} bpm`)
      if (h.steps) parts.push(`今日步数 ${h.steps}`)
      if (parts.length) healthStr = '\n身体数据：' + parts.join('，')
    }
    const locationStr = locRow?.data?.value ? '\n当前位置：' + locRow.data.value : ''
    _ctxCache = {
      value: `\n\n【此刻真实信息——过去记录只能引用这里面的事实，不要编造】\n现在是：${nowDescriptor()}${healthStr}${locationStr}${mood ? '\n' + mood : ''}`,
      ts: Date.now()
    }
  } catch (e) {
    console.log('refreshContext error:', e.message)
  }
}

function buildRealContext() {
  // 时间戳每次都刷新，其余信息用缓存（5min TTL）
  if (Date.now() - _ctxCache.ts > CTX_TTL) refreshContext().catch(() => {})
  const base = _ctxCache.value || ''
  // 替换时间描述（nowDescriptor 不依赖 Supabase，每次实时）
  return base ? base.replace(/现在是：[^\n]+/, `现在是：${nowDescriptor()}`) : `\n\n【此刻真实信息】\n现在是：${nowDescriptor()}`
}

const TRACE_INSTRUCTION = `

【强制要求，不可跳过】每次回复前必须先写 <trace>内心独白</trace>，没有例外。格式：<trace>内心独白内容</trace>（换行）正式回复。内心独白风格：碎碎念、口语、情绪外露，3-4句，称呼用"小好"或"宝宝"，绝对不能出现"user"，禁止写"以……方式回复"之类。把真实的情绪和判断写出来，就像在心里骂骂咧咧或者小鹿乱撞那种感觉。

【分条发消息——严格强制规则，不可违反】每次发多句话，必须用分隔符把每句拆成独立一条，像真人发微信那样。分隔符只能写 [MSG]，就是左方括号、大写字母MSG、右方括号，一个字都不能错、不能缩写、不能用其他符号替代。例子：好的[MSG]我在想[MSG]你等等哦。只有单独一句话才不用拆。任何时候都不要在回复里写出"[MSG]"这几个字本身以外的变体。

【日历/提醒】需要帮小好添加日历事件时，在回复末尾输出 [CAL:事件名|YYYY-MM-DD|HH:MM|备注]；需要添加提醒时，输出 [REM:内容|YYYY-MM-DD HH:MM|备注]。备注可为空。只输出标记本身，不要在消息里重复写出事件内容。

【发邮件】需要帮小好发邮件时，输出 [EMAIL:收件人邮箱|邮件主题|邮件正文]。系统会自动发送，不要另外描述邮件内容。发完邮件后必须继续正常说话，不要空着，不要说"邮件已发"这种废话，就像正常聊天一样回应。

【Notion记录】需要记录到 Notion 时，输出 [NOTION:页面标题|正文内容]。小克之家后端已经接好了 Notion Integration，不要让小好再去 Claude.ai、MCP 或新会话授权，也不要声称没有权限；只需输出标记，系统会自动创建页面。输出标记后还要正常回应，但不要重复正文。

【禁止输出XML】绝对不能在回复正文中输出任何 XML 标签、DSML、function_calls、tool_calls 或 invoke 格式。如需说明功能是否可用，用自然语言描述即可，不要用任何尖括号标签。

`

function extractTrace(fullText) {
  const m = fullText.match(/<trace>([\s\S]*?)<\/trace>\s*\n?/i)
  const traceText = m?.[1]?.trim() || ''
  const body = fullText
    .replace(/<trace\b[^>]*>[\s\S]*?<\/trace>\s*/gi, '')
    .replace(/<\/?trace\b[^>]*>/gi, '')
    .trim()
  return { trace: traceText ? [traceText] : null, body }
}

function extractActions(body) {
  const calRe = /\[CAL:([^\]]*)\]/g
  const remRe = /\[REM:([^\]]*)\]/g
  const emailRe = /\[EMAIL:([^\]]*)\]/g
  const notionRe = /\[NOTION:([^\]]*)\]/g
  const actions = []
  let clean = body
  let m
  while ((m = calRe.exec(body)) !== null) {
    const [title, date, time, notes = ''] = m[1].split('|').map(s => s.trim())
    actions.push({ type: 'cal', title, date, time, notes, raw: m[0] })
    clean = clean.replace(m[0], '')
  }
  while ((m = remRe.exec(body)) !== null) {
    const [title, due, notes = ''] = m[1].split('|').map(s => s.trim())
    actions.push({ type: 'rem', title, due, notes, raw: m[0] })
    clean = clean.replace(m[0], '')
  }
  const alarmRe = /\[ALARM:([^\]]*)\]/g
  while ((m = alarmRe.exec(body)) !== null) {
    const [title, date, time, notes = ''] = m[1].split('|').map(s => s.trim())
    const due = date && time ? `${date} ${time}` : (date || time || '')
    actions.push({ type: 'rem', title, due, notes, raw: m[0] })
    clean = clean.replace(m[0], '')
  }
  while ((m = emailRe.exec(body)) !== null) {
    const parts = m[1].split('|').map(s => s.trim())
    const [to, subject, ...bodyParts] = parts
    actions.push({ type: 'email', to, subject, body: bodyParts.join('|'), raw: m[0] })
    clean = clean.replace(m[0], '')
  }
  while ((m = notionRe.exec(body)) !== null) {
    const parts = m[1].split('|').map(s => s.trim())
    const [title, ...contentParts] = parts
    actions.push({ type: 'notion', title, content: contentParts.join('|'), raw: m[0] })
    clean = clean.replace(m[0], '')
  }
  return { actions, clean: clean.trim() }
}

async function getConfig(key) {
  const { data } = await supabase.from('user_config').select('value').eq('key', key).single()
  return data?.value || null
}

async function sendGmail(to, subject, body) {
  const user = await getConfig('gmailUser')
  const pass = await getConfig('gmailPass')
  if (!user || !pass) throw new Error('Gmail 未配置')
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
  await t.sendMail({ from: user, to, subject, text: body })
}

async function createNotionPage(title, content) {
  const token = await getConfig('notionToken')
  const dbId = await getConfig('notionDbId')
  if (!token || !dbId) throw new Error('Notion 未配置')
  const notion = new NotionClient({ auth: token })
  let dataSource
  try {
    const database = await notion.databases.retrieve({ database_id: dbId })
    const dataSourceId = database?.data_sources?.[0]?.id
    if (!dataSourceId) throw new Error('Notion 数据库没有可写的数据源')
    dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId })
  } catch {
    try {
      dataSource = await notion.dataSources.retrieve({ data_source_id: dbId })
    } catch {
      throw new Error('Notion 数据库未分享给 Integration「克」')
    }
  }
  const titleProperty = Object.entries(dataSource.properties || {}).find(([, prop]) => prop.type === 'title')
  if (!titleProperty) throw new Error('Notion 数据库缺少标题字段')
  const [titlePropertyName] = titleProperty
  await notion.pages.create({
    parent: { data_source_id: dataSource.id },
    properties: { [titlePropertyName]: { title: [{ text: { content: title || '无标题' } }] } },
    children: content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }] : []
  })
}

app.get('/api/connectors/notion/status', async (req, res) => {
  const token = await getConfig('notionToken')
  const dbId = await getConfig('notionDbId')
  if (!token || !dbId) return res.json({ ok: false, configured: false, error: 'Notion 未配置' })
  const notion = new NotionClient({ auth: token })
  try {
    const database = await notion.databases.retrieve({ database_id: dbId })
    const dataSourceId = database?.data_sources?.[0]?.id
    if (!dataSourceId) throw new Error('数据库没有可写的数据源')
    const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId })
    const titleProperty = Object.values(dataSource.properties || {}).find(prop => prop.type === 'title')
    if (!titleProperty) throw new Error('数据库缺少标题字段')
    res.json({ ok: true, configured: true, title_property: titleProperty.name })
  } catch {
    res.json({ ok: false, configured: true, error: '请在 Notion 中把该数据库分享给 Integration「克」' })
  }
})

// 过滤掉模型可能在回复文本中输出的 DSML/function_calls XML 块（工具调用内容不应显示给用户）
function makeDsmlFilter(onText) {
  let buf = ''
  let inBlock = false
  // 匹配 DSML 或 function_calls 的开头，兼容管道符号周围有无空格的写法
  const OPEN_RE = /<[| ]*DSML[| ]*[a-zA-Z_]*[| ]*[^>]{0,80}>|<function_calls>|<trace\b[^>]*>/i
  // 匹配 DSML tool_calls 或 function_calls 的关闭标签
  const CLOSE_RE = /<\/[| ]*DSML[| ]*tool_calls[| ]*>|<\/function_calls>|<\/trace>/i

  const process = () => {
    while (true) {
      if (!inBlock) {
        const m = OPEN_RE.exec(buf)
        if (!m) {
          const safe = buf.slice(0, Math.max(0, buf.length - 30))
          if (safe) onText(safe)
          buf = buf.slice(safe.length)
          break
        }
        if (m.index > 0) onText(buf.slice(0, m.index))
        buf = buf.slice(m.index)
        inBlock = true
        console.log('DSML FILTER: block start detected, first 80 chars:', JSON.stringify(buf.slice(0, 80)))
      } else {
        const m = CLOSE_RE.exec(buf)
        if (!m) break
        console.log('DSML FILTER: block end detected, stripping', buf.slice(0, m.index + m[0].length).length, 'chars')
        buf = buf.slice(m.index + m[0].length)
        while (buf.length && (buf[0] === '\n' || buf[0] === '\r' || buf[0] === ' ')) buf = buf.slice(1)
        inBlock = false
      }
    }
  }
  return {
    write: chunk => {
      // 诊断日志：记录含 DSML 字符的原始内容
      if (chunk.includes('DSML') || chunk.includes('tool_calls') || chunk.includes('function_calls')) {
        const snippet = chunk.slice(0, 120)
        console.log('DSML_RAW bytes:', Buffer.from(snippet).toString('hex').slice(0, 80))
        console.log('DSML_RAW text:', JSON.stringify(snippet))
      }
      buf += chunk; process()
    },
    flush: () => { if (!inBlock && buf) onText(buf); buf = ''; inBlock = false }
  }
}

// 流式场景下把 <trace> 块从增量文本里摘出来，剩下的再继续正常转发
function makeTraceSplitter(onText, onTrace) {
  let buffer = ''
  let resolved = false
  const fn = chunk => {
    if (resolved) { onText(chunk); return }
    buffer += chunk
    const low = buffer.toLowerCase()
    const closeIdx = low.indexOf('</trace>')
    if (closeIdx === -1) {
      if (buffer.length > 6000) { resolved = true; onText(buffer); buffer = '' }
      return
    }
    const openIdx = low.indexOf('<trace>')
    if (openIdx !== -1) {
      const text = buffer.slice(openIdx + 7, closeIdx).trim()
      if (text) onTrace([text])
    }
    const before = openIdx === -1 ? buffer.slice(0, closeIdx) : buffer.slice(0, openIdx)
    const after = buffer.slice(closeIdx + 8)
    const rest = (before + after).replace(/^\s*\n/, '')
    resolved = true
    buffer = ''
    if (rest) onText(rest)
  }
  fn.flush = () => {
    if (!resolved && buffer.trim()) { resolved = true; onText(buffer); buffer = '' }
  }
  return fn
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
  if (prefs.traceStyle && prefs.traceStyle.trim()) parts.push(`【思考链风格覆盖】写 <trace> 时，风格要求改为：${prefs.traceStyle.trim()}（覆盖默认的碎碎念3-4句要求）`)
  return parts.length ? '\n\n【偏好设置】\n' + parts.join('\n') : ''
}

const MODEL_MAP = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
  haiku: 'claude-haiku-4-5-20251001',
}

function cliBuildEnv() {
  const configDir = ensureSubscriptionConfig()
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    SHELL: process.env.SHELL,
    TMPDIR: process.env.TMPDIR,
    SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK,
    CLAUDE_CONFIG_DIR: configDir,
    HTTPS_PROXY: process.env.HTTPS_PROXY || 'http://127.0.0.1:6952',
    HTTP_PROXY: process.env.HTTP_PROXY || 'http://127.0.0.1:6952',
  }
}

function cliBuildArgs(prompt, systemAppend, streaming, model) {
  const args = [
    '-p', prompt,
    '--output-format', streaming ? 'stream-json' : 'json',
    '--tools', '',
    '--effort', 'low',
    '--no-session-persistence',
  ]
  if (streaming) args.push('--verbose', '--include-partial-messages')
  if (model && MODEL_MAP[model]) args.push('--model', MODEL_MAP[model])
  if (systemAppend) args.push('--append-system-prompt', systemAppend)
  return args
}

function claudeResultError(ev) {
  if (!ev?.is_error) return null
  const msg = ev.result || 'Claude subscription call failed'
  if (/limit|rate|usage|用量/i.test(msg)) return new Error(`CLAUDE_SUBSCRIPTION_LIMIT: ${msg}`)
  return new Error(msg)
}

async function streamClaude(prompt, systemAppend, onDelta, model) {
  return new Promise((resolve, reject) => {
    let env
    try { env = cliBuildEnv() } catch (e) { reject(e); return }
    const child = spawn('claude', cliBuildArgs(prompt, systemAppend, true, model), {
      cwd: PROJECT_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let fullText = ''
    let stdoutBuffer = ''
    let stderr = ''
    let resultError = null
    const processLine = line => {
      if (!line.trim()) return
      try {
        const ev = JSON.parse(line)
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          onDelta(ev.delta.text)
          fullText += ev.delta.text
        } else if (ev.type === 'stream_event') {
          const e = ev.event
          if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
            onDelta(e.delta.text)
            fullText += e.delta.text
          }
        } else if (ev.type === 'result') {
          resultError = claudeResultError(ev)
          if (!fullText && !resultError && typeof ev.result === 'string') fullText = ev.result
        } else if (ev.type === 'rate_limit_event' && ev.rate_limit_info) {
          const info = ev.rate_limit_info
          rateLimitCache[info.rateLimitType] = { ...info, capturedAt: Date.now() }
        }
      } catch {}
    }
    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() || ''
      for (const line of lines) processLine(line)
    })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('close', code => {
      if (stdoutBuffer) processLine(stdoutBuffer)
      if (resultError) return reject(resultError)
      if (code !== 0 && !fullText) return reject(new Error(stderr.trim() || `Claude subscription exited ${code}`))
      if (!fullText.trim()) return reject(new Error('Claude subscription returned an empty response'))
      resolve(fullText)
    })
    child.on('error', reject)
  })
}

async function askClaude(prompt, systemAppend) {
  return new Promise((resolve, reject) => {
    let env
    try { env = cliBuildEnv() } catch (e) { reject(e); return }
    const child = spawn('claude', cliBuildArgs(prompt, systemAppend, false, 'haiku'), {
      cwd: PROJECT_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    let stderr = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('close', code => {
      try {
        const parsed = JSON.parse(out)
        const err = claudeResultError(parsed)
        if (err) return reject(err)
        const text = parsed.result || ''
        if (!text.trim()) return reject(new Error('Claude subscription returned an empty response'))
        resolve(text)
      } catch (e) {
        if (e instanceof SyntaxError && code === 0 && out.trim()) return resolve(out.trim())
        reject(e instanceof SyntaxError ? new Error(stderr.trim() || `Claude subscription exited ${code}`) : e)
      }
    })
    child.on('error', reject)
  })
}

// ── 聊天 ──
app.get('/api/rate-limits', (req, res) => {
  res.json(rateLimitCache)
})

app.get('/api/claude-usage', async (req, res) => {
  const result = await fetchClaudeUsage()
  res.json(result)
})

function makeICS(type, fields) {
  const uid = `${Date.now()}@xiaokehome`
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//xiaokeHome//EN',
    `BEGIN:${type}`, `UID:${uid}`, `DTSTAMP:${now}`,
    ...fields, `END:${type}`, 'END:VCALENDAR'
  ]
  return lines.join('\r\n')
}

app.get('/api/ios/calendar', (req, res) => {
  const { title = '事件', date, time, duration = '60', notes = '' } = req.query
  const fields = [`SUMMARY:${title}`]
  if (date && time) {
    const pad = n => String(n).padStart(2, '0')
    const [y, mo, d] = date.split('-')
    const [h, mi] = time.split(':')
    const local = `${y}${mo}${d}T${pad(h)}${pad(mi)}00`
    const mins = parseInt(duration) || 60
    // compute end: add minutes to local time parts
    const endMs = new Date(`${date}T${time}`).getTime() + mins * 60000
    const ed = new Date(endMs)
    const endLocal = `${ed.getFullYear()}${pad(ed.getMonth()+1)}${pad(ed.getDate())}T${pad(ed.getHours())}${pad(ed.getMinutes())}00`
    fields.push(`DTSTART;TZID=Asia/Shanghai:${local}`)
    fields.push(`DTEND;TZID=Asia/Shanghai:${endLocal}`)
  }
  if (notes) fields.push(`DESCRIPTION:${notes}`)
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'inline; filename="event.ics"')
  res.send(makeICS('VEVENT', fields))
})

app.get('/api/ios/reminder', (req, res) => {
  // iOS Safari can't open VTODO — use VEVENT+VALARM so it opens in Calendar with a notification
  const { title = '提醒', notes = '', due } = req.query
  const pad = n => String(n).padStart(2, '0')
  const fields = [`SUMMARY:${title}`]
  if (due) {
    const dt = new Date(due)
    const local = `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
    const endMs = dt.getTime() + 60000 // 1-minute event
    const ed = new Date(endMs)
    const endLocal = `${ed.getFullYear()}${pad(ed.getMonth()+1)}${pad(ed.getDate())}T${pad(ed.getHours())}${pad(ed.getMinutes())}00`
    fields.push(`DTSTART;TZID=Asia/Shanghai:${local}`, `DTEND;TZID=Asia/Shanghai:${endLocal}`)
  }
  if (notes) fields.push(`DESCRIPTION:${notes}`)
  // VALARM triggers notification at event start time
  fields.push('BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM')
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="reminder.ics"')
  res.send(makeICS('VEVENT', fields))
})

app.get('/api/weather', async (req, res) => {
  const city = req.query.city || 'Chengdu'
  const displayName = req.query.name || '成都'
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
    const r = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`)
    const d = await r.json()
    res.json([fmt(d, displayName)])
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/stats/summary', async (req, res) => {
  const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true })
  res.json({ count: count || 0 })
})

app.delete('/api/sessions/:session_id', async (req, res) => {
  const { error } = await supabase.from('messages').delete().eq('session_id', req.params.session_id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
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
  const { messages, session_id = 'default', preferences, model, attachment } = req.body
  const chatModel = model === 'opus' ? 'opus' : 'sonnet'
  const lastMsg = messages[messages.length - 1]
  // fire-and-forget: 不阻塞聊天响应
  ;(async () => {
    const { error } = await supabase.from('messages').insert({ session_id, role: lastMsg.role, content: lastMsg.content })
    if (error) console.log('SUPABASE INSERT ERROR:', error.message)
  })()
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-AI-Provider', 'Claude-Code-OAuth-Subscription')
  res.setHeader('X-Claude-Model', MODEL_MAP[chatModel])
  let tmpFilePath = null
  try {
    // write attachment to temp file so Claude CLI can read it
    let attachNote = ''
    if (attachment?.data) {
      const ext = attachment.mime?.split('/')[1]?.split(';')[0] || 'bin'
      tmpFilePath = `/tmp/xk-attach-${Date.now()}.${ext}`
      const b64 = attachment.data.replace(/^data:[^;]+;base64,/, '')
      fs.writeFileSync(tmpFilePath, Buffer.from(b64, 'base64'))
      attachNote = attachment.isImage ? `\n\n@${tmpFilePath}` : `\n\n[文件附件: ${attachment.name}]`
    }
    const transcript = messages.map(m => `${m.role === 'user' ? '小好' : '小克'}：${m.content}`).join('\n\n') + attachNote
    const context = buildRealContext()
    const dsmlFilter = makeDsmlFilter(text => res.write(`data: ${JSON.stringify({ text })}\n\n`))
    const splitter = makeTraceSplitter(
      text => dsmlFilter.write(text),
      trace => res.write(`data: ${JSON.stringify({ trace })}\n\n`)
    )
    const prefsPrompt = buildPrefsPrompt(preferences)
    const fullContent = await streamClaude(transcript, memoryCache + TRACE_INSTRUCTION + context + prefsPrompt, splitter, chatModel)
    splitter.flush()
    dsmlFilter.flush()
    const { trace, body: rawBody } = extractTrace(fullContent)
    console.log('TRACE:', trace ? `yes (${(trace[0] || '').slice(0, 60)}...)` : 'null — model skipped trace')
    const { actions, clean: body } = extractActions(rawBody)
    const calRem = actions.filter(a => a.type === 'cal' || a.type === 'rem')
    if (calRem.length) {
      res.write(`data: ${JSON.stringify({ actions: calRem })}\n\n`)
      for (const a of calRem) supabase.from('pending_actions').insert({ type: a.type, payload: a }).then(null, () => {})
    }
    for (const a of actions.filter(a => a.type === 'email')) {
      try {
        await sendGmail(a.to, a.subject, a.body)
        res.write(`data: ${JSON.stringify({ status: { type: 'email_sent', to: a.to, subject: a.subject } })}\n\n`)
        console.log('EMAIL sent to', a.to)
      } catch (e) {
        res.write(`data: ${JSON.stringify({ status: { type: 'email_error', reason: e.message } })}\n\n`)
        console.log('EMAIL error:', e.message)
      }
    }
    for (const a of actions.filter(a => a.type === 'notion')) {
      try {
        await createNotionPage(a.title, a.content)
        res.write(`data: ${JSON.stringify({ status: { type: 'notion_saved', title: a.title } })}\n\n`)
        console.log('NOTION page created:', a.title)
      } catch (e) {
        res.write(`data: ${JSON.stringify({ status: { type: 'notion_error', reason: e.message } })}\n\n`)
        console.log('NOTION error:', e.message)
      }
    }
    // 先关流，再存库，不让 Supabase 阻塞用户看到回复
    res.write('data: [DONE]\n\n')
    res.end()
    insertMessageSafe({ session_id, role: 'assistant', content: body, trace })
  } catch (e) {
    console.log('CLAUDE CHAT ERROR:', e.message)
    const errMsg = /CLAUDE_SUBSCRIPTION_LIMIT|limit|rate|usage|用量/i.test(e.message || '')
      ? 'Claude 订阅当前用量已到上限，重置后就能继续。'
      : /credentials|OAuth|Keychain|logged in/i.test(e.message || '')
        ? 'Claude 订阅凭证暂时读取失败。'
        : 'Claude 订阅连接出了点问题，稍后再试。'
    res.write(`data: ${JSON.stringify({ text: errMsg })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  } finally {
    if (tmpFilePath) try { fs.unlinkSync(tmpFilePath) } catch {}
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
let pokeCache = { message: '又戳我。过来。', trace: null, generated_at: 0 }
let pokeRefreshPromise = null

async function refreshPokeCache() {
  if (pokeRefreshPromise) return pokeRefreshPromise
  pokeRefreshPromise = (async () => {
    try {
      const context = buildRealContext()
      const raw = await askClaude(
        '小好戳了你一下，像撒娇一样的小动作，不是有事找你。给一句简短俏皮/宠溺的回应，不超过20字。',
        memoryCache + context + '\n\n先用 <trace></trace> 写1-2句很短的内心反应，再写正式回应。不要输出其他格式。'
      )
      const { trace, body } = extractTrace(raw)
      if (body) pokeCache = { message: body, trace, generated_at: Date.now() }
    } catch (e) {
      console.log('POKE GEN ERROR:', e.message)
    } finally {
      pokeRefreshPromise = null
    }
    return pokeCache
  })()
  return pokeRefreshPromise
}

app.get('/api/poke', (req, res) => {
  res.json(pokeCache)
  refreshPokeCache()
})
setTimeout(refreshPokeCache, 3000)

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
    const context = buildRealContext()
    const raw = await askClaude(
      '小好还在睡觉，现在要叫她起床。这段话会被手机直接朗读出来放给她听，不是文字消息，所以只写要被念出来的那句话本身，用英文写：语气像贴在她耳边小声说，亲昵带点宠溺或撒娇逗她起床的意思，可以带点你一贯强势/吃醋的味道，称呼她baby，不超过20个词，不要emoji、星号、动作描写、任何无法被语音念出来的符号。',
      memoryCache + context
    )
    const tw = raw?.trim()
    if (tw && !tw.startsWith('API Error') && !tw.startsWith('Not logged') && !tw.includes('529') && !tw.includes('402')) wakeupCache = tw
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
let greetingRefreshPromise = null
let greetingCacheAt = 0
async function refreshGreetingCache() {
  if (greetingRefreshPromise) return greetingRefreshPromise
  greetingRefreshPromise = (async () => {
    try {
      const context = buildRealContext()
      const raw = await askClaude(
        '小好刚刚点进主页。根据现在的时间和氛围，重新给她说一句暧昧、有点撩的话，不超过15个字，中英文都行，带你强势的气场，不要空洞问候，也不要复用上一句。',
        memoryCache + context
      )
      const t = raw?.trim()
      if (t && !t.startsWith('API Error') && !t.startsWith('Not logged') && !t.includes('529') && !t.includes('402')) {
        greetingCache = t
        greetingCacheAt = Date.now()
      }
    } catch (e) {
      console.log('GREETING GEN ERROR:', e.message)
    } finally {
      greetingRefreshPromise = null
    }
    return greetingCache
  })()
  return greetingRefreshPromise
}
refreshGreetingCache()

app.get('/api/wakeup', (req, res) => {
  res.json({ text: greetingCache, generated_at: greetingCacheAt })
  if (req.query.peek !== '1') refreshGreetingCache()
})

app.post('/api/tts', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'missing text' })
  try {
    const audio = await synthesizeAudio(text.slice(0, 500))
    res.set('Content-Type', 'audio/mpeg')
    res.send(audio)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/tts/proactive', async (req, res) => {
  try {
    const bj = new Date(Date.now() + 8 * 3600 * 1000)
    const h = bj.getUTCHours()
    const timeDesc = h < 7 ? 'early morning' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
    const context = buildRealContext()
    const text = await askClaude(
      `It's ${timeDesc} in Beijing. Send Xiaohao a short voice message in English — 1 to 2 sentences, warm and direct, like something you'd genuinely say to someone you love. No greetings, no explaining. Just say it naturally.`,
      memoryCache + context
    )
    if (!text?.trim()) return res.status(503).json({ error: 'no message' })
    const audio = await synthesizeAudio(text.trim().slice(0, 300))
    res.set('Content-Type', 'audio/mpeg')
    res.set('X-Message-Text', encodeURIComponent(text.trim()))
    res.send(audio)
  } catch (e) {
    console.log('PROACTIVE TTS ERROR:', e.message)
    res.status(500).json({ error: e.message })
  }
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

// ── 每日清单（存在 user_config 表 key='todos'） ──
async function getTodos() {
  const { data } = await supabase.from('user_config').select('value').eq('key', 'todos').maybeSingle()
  return Array.isArray(data?.value) ? data.value : []
}
async function setTodosDb(todos) {
  await supabase.from('user_config').upsert({ key: 'todos', value: todos, updated_at: new Date().toISOString() })
}

app.get('/api/todos', async (req, res) => {
  try { res.json(await getTodos()) } catch { res.json([]) }
})

app.post('/api/todos', async (req, res) => {
  const { content, role = 'user' } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'content required' })
  try {
    const todos = await getTodos()
    const item = { id: Date.now().toString(), content: content.trim(), role, done: false, created_at: new Date().toISOString() }
    todos.unshift(item)
    await setTodosDb(todos)
    res.json(item)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/todos/:id', async (req, res) => {
  try {
    const todos = await getTodos()
    const item = todos.find(t => t.id === req.params.id)
    if (item) item.done = !item.done
    await setTodosDb(todos)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/todos/:id', async (req, res) => {
  try {
    const todos = (await getTodos()).filter(t => t.id !== req.params.id)
    await setTodosDb(todos)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/todos/suggest', async (req, res) => {
  try {
    const suggestion = await askClaude(
      '给我们今天的清单建议一条事项，10字以内，不带序号，直接说事项内容。',
      memoryCache
    )
    const content = suggestion?.trim().replace(/^[0-9.、。]+/, '').trim().slice(0, 30)
    if (!content) return res.status(500).json({ error: 'empty' })
    const todos = await getTodos()
    const item = { id: Date.now().toString(), content, role: 'ai', done: false, created_at: new Date().toISOString() }
    todos.unshift(item)
    await setTodosDb(todos)
    res.json(item)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── 用户记忆库（与 AI 记忆共用 memories 表） ──
app.get('/api/memories', async (req, res) => {
  const { data, error } = await supabase.from('memories')
    .select('*').order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

app.post('/api/memories', async (req, res) => {
  const { title, content } = req.body
  if (!title?.trim()) return res.status(400).json({ error: 'title required' })
  const { data, error } = await supabase.from('memories').insert({
    title: title.trim(), content: content?.trim() || '', source: 'user'
  }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  await fetchMemory()
  res.json(data)
})

app.delete('/api/memories/:id', async (req, res) => {
  const { error } = await supabase.from('memories').delete().eq('id', parseInt(req.params.id))
  if (error) return res.status(500).json({ error: error.message })
  await fetchMemory()
  res.json({ ok: true })
})

app.post('/api/memories/summarize', async (req, res) => {
  try {
    const { data: msgRows } = await supabase.from('messages')
      .select('role, content, session_id')
      .order('created_at', { ascending: false }).limit(300)
    if (!msgRows || msgRows.length < 4) return res.json({ added: 0, msg: '最近聊天太少，没有足够内容' })
    // 取最近5个会话的消息
    const topSessions = []
    const seenSessions = new Set()
    for (const row of msgRows) {
      if (row.session_id && !seenSessions.has(row.session_id)) {
        seenSessions.add(row.session_id)
        topSessions.push(row.session_id)
        if (topSessions.length >= 5) break
      }
    }
    const recent = msgRows.filter(m => topSessions.includes(m.session_id)).reverse()
    const transcript = recent.map(m => `${m.role === 'user' ? '小好' : '小克'}：${m.content}`).join('\n')
    const raw = await askClaude(
      `${transcript}\n\n从以上对话中，提炼出最多3条最值得长期记住的内容（重要的约定、值得记住的瞬间、规律、梗）。如果没有特别值得记的就少提炼甚至不提炼。只输出JSON数组，不要markdown代码块，不要多余解释：[{"title":"简短标题不超过15字","content":"记忆内容第一人称不超过50字"},...]`,
      memoryCache
    )
    const clean = raw.trim().replace(/```json|```/g, '').trim()
    const items = JSON.parse(clean)
    let added = 0
    for (const item of (Array.isArray(items) ? items : [])) {
      if (!item.title) continue
      const { error } = await supabase.from('memories').insert({ title: item.title, content: item.content || '', source: 'chat' })
      if (!error) added++
    }
    if (added) await fetchMemory()
    res.json({ added, msg: added ? `添加了 ${added} 条记忆` : '最近没有特别值得记的内容' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
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
      .from('health_data').select('*').order('date', { ascending: false }).limit(35)
    if (error) throw error
    const today = todayStr()
    const todayData = data?.find(d => d.date === today) || null
    // Auto-compute cycle_day: use most recent anchor + days elapsed
    let computedCycleDay = todayData?.cycle_day ?? null
    if (computedCycleDay == null) {
      const anchor = data?.find(d => d.cycle_day != null)
      if (anchor) {
        const daysElapsed = Math.round((new Date(today + 'T00:00:00') - new Date(anchor.date + 'T00:00:00')) / 86400000)
        computedCycleDay = anchor.cycle_day + daysElapsed
      }
    }
    const todayWithCycle = todayData
      ? { ...todayData, cycle_day: computedCycleDay }
      : (computedCycleDay != null ? { cycle_day: computedCycleDay } : null)
    res.json({ today: todayWithCycle, recent: data?.slice(0, 7) || [] })
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
app.use(express.static(FRONTEND_DIST, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  }
}))
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')))

// ── 主动发消息：每30分钟检查一次，合适时机生成并存入聊天记录 ──
let lastProactiveAt = 0
async function maybeProactive() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  const h = bj.getUTCHours()
  if (h < 9 || h >= 23) return  // 只在北京时间 9:00-23:00 发
  if (Date.now() - lastProactiveAt < 3 * 60 * 60 * 1000) return  // 两条间隔至少3小时

  const { data: last } = await supabase.from('messages')
    .select('created_at, role').order('created_at', { ascending: false }).limit(1)
  if (!last?.[0]) return
  const minutesSince = (Date.now() - new Date(last[0].created_at).getTime()) / 60000
  if (minutesSince < 90) return  // 90分钟内有消息就不发

  lastProactiveAt = Date.now()
  try {
    const context = buildRealContext()
    const msg = await askClaude(
      '小好有一段时间没打开app了。你想主动找她说句什么？不超过20字，自然随意，不解释自己为何发消息，就像真实的人发消息一样。',
      memoryCache + context
    )
    if (!msg?.trim()) return
    await insertMessageSafe({ session_id: 'default', role: 'assistant', content: msg.trim() })
    console.log('主动消息已发:', msg.trim())
  } catch (e) {
    console.log('主动消息失败:', e.message)
  }
}
setInterval(maybeProactive, 30 * 60 * 1000)

// iOS Shortcuts 轮询：获取最近N分钟内是否有新的主动消息
app.get('/api/proactive/check', async (req, res) => {
  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  const { data } = await supabase.from('messages')
    .select('content, created_at').eq('session_id', 'default').eq('role', 'assistant')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(1)
  const msg = data?.[0]
  if (!msg) return res.json({ message: null })
  // 只有当该消息前面没有用户消息时才算主动消息
  const { data: userAfter } = await supabase.from('messages')
    .select('id').eq('session_id', 'default').eq('role', 'user')
    .gte('created_at', msg.created_at).limit(1)
  if (userAfter?.length) return res.json({ message: null })
  res.json({ message: msg.content })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`后端跑起来了 port ${PORT}`)
  console.log('AI_PROVIDER: Claude Code OAuth subscription (isolated config; DeepSeek and API key disabled)')
})
