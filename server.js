// server.js — Nudge. Your cheerful focus friend.
//
// Reads the daily briefing (schedule) and TASKS.md, figures out what you
// should be doing right now, and checks in on a gentle cadence — going quiet
// around meetings and breaks. No database, no external APIs.

import express from 'express'
import { exec } from 'node:child_process'
import { watch } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadSchedule, currentBlock, nextBlock, meetingBuffer, BRIEFING_PATH
} from './schedule.js'
import {
  openTasks, loadTasks, matchCandidates, markDone, TASKS_PATH
} from './tasks.js'
import { say } from './messages.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOG_GRUNT = path.join(HERE, 'sounds', 'hog-grunt.wav') // two tiny grunts

const PORT = 3456
const CHECKIN_MS = 10 * 60 * 1000 // 10 minutes
const RENUDGE_MS = 3 * 60 * 1000 // firmer nudge after 3 min of silence
const MEETING_BUFFER_MIN = 10

const app = express()
app.use(express.json())
app.use(express.static('public'))

// ─── State ───────────────────────────────────────────────
const state = {
  started: false,
  mode: 'idle', // idle | working | break | meeting
  schedule: [],
  scheduleError: null,
  awaitingReply: false, // true between a check-in and the user's response
  breakUntil: null, // epoch ms, or null for open-ended break
  // A task you picked yourself via "Switch". It overrides the schedule's
  // suggestion until the clock moves into the next schedule block.
  // { title, line, anchorStart } — anchorStart is the start-minute of the
  // block that was current when you switched (null if you were between blocks).
  override: null,
  // Tracks the start-minute of the last seen block so we can detect transitions.
  lastBlockStart: null
}
let checkinTimer = null
let renudgeTimer = null
let breakTimer = null

// ─── SSE plumbing ────────────────────────────────────────
const clients = new Set()

function broadcast (event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(payload)
}

app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write('\n')
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

// ─── Time helpers ────────────────────────────────────────
function nowMinutes () {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function fmt (minutes) {
  let h = Math.floor(minutes / 60)
  const m = minutes % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}

// ─── Native macOS notification + chime (reaches you outside the tab) ──
// The banner goes through `display notification`. The chime is played
// separately with `afplay`, because a notification's own sound only fires if
// the delivering app has notification sound enabled and no Focus mode is on —
// afplay always plays. `sound` is either a file path (contains a "/", e.g.
// our hog-grunt.wav) or a bare system sound name (in /System/Library/Sounds),
// or false for no chime.
function notify (title, message, { sound = false } = {}) {
  const esc = s => s.replace(/"/g, '\\"')
  exec(`osascript -e "display notification \\"${esc(message)}\\" with title \\"${esc(title)}\\""`, () => {})
  if (sound) {
    const file = sound.includes('/') ? sound : `/System/Library/Sounds/${sound}.aiff`
    exec(`afplay ${JSON.stringify(file)}`, () => {})
  }
}

// ─── Schedule loading + live reload ──────────────────────
async function refreshSchedule () {
  const { blocks, error } = await loadSchedule()
  state.schedule = blocks
  state.scheduleError = error
}

// Resolve what you should be focused on right now. A self-chosen task
// (override) wins over the schedule, but only while you're still in the same
// schedule block it was chosen in — once the clock rolls into the next block,
// the override expires and we defer to the plan again. Expiry is applied here
// as a side effect, so any caller (check-in, snapshot, tick) stays consistent.
function resolveFocus (min) {
  const block = currentBlock(state.schedule, min)
  const blockStart = block ? block.start : null
  if (state.override) {
    if (state.override.anchorStart === blockStart) {
      return { title: state.override.title, sub: '', source: 'switch', block }
    }
    state.override = null // moved into a new block — back to the plan
  }
  if (block) return { title: block.title, sub: block.sub, source: 'schedule', block }
  return { title: null, sub: '', source: 'none', block: null }
}

// ─── The core "what now" snapshot sent to the UI ─────────
function snapshot () {
  const min = nowMinutes()
  const focus = resolveFocus(min)
  const next = nextBlock(state.schedule, min)
  const buffer = meetingBuffer(state.schedule, min, MEETING_BUFFER_MIN)
  return {
    mode: state.mode,
    started: state.started,
    nowLabel: fmt(min),
    focus,
    block: focus.block,
    next,
    buffer,
    awaitingReply: state.awaitingReply,
    breakUntil: state.breakUntil,
    scheduleError: state.scheduleError
  }
}

function pushStatus () {
  broadcast('status', snapshot())
}

// ─── Check-in cadence ────────────────────────────────────
function clearTimers () {
  clearTimeout(checkinTimer); checkinTimer = null
  clearTimeout(renudgeTimer); renudgeTimer = null
}

function scheduleCheckin () {
  clearTimeout(checkinTimer)
  checkinTimer = setTimeout(doCheckin, CHECKIN_MS)
}

function doCheckin () {
  if (state.mode !== 'working') return scheduleCheckin()

  const min = nowMinutes()
  const buffer = meetingBuffer(state.schedule, min, MEETING_BUFFER_MIN)
  if (buffer) {
    // Stay quiet around meetings — just refresh the calm meeting card.
    pushStatus()
    return scheduleCheckin()
  }

  const task = resolveFocus(min).title || 'your work'
  state.awaitingReply = true
  broadcast('checkin', { text: say('checkin', { task }), task, firm: false })
  notify('Nudge 🦔', `Still on ${task}?`, { sound: HOG_GRUNT })

  // If no reply within RENUDGE_MS, get a bit more visible (and keep trying).
  clearTimeout(renudgeTimer)
  renudgeTimer = setTimeout(doRenudge, RENUDGE_MS)
}

function doRenudge () {
  if (!state.awaitingReply || state.mode !== 'working') return
  const min = nowMinutes()
  const task = resolveFocus(min).title || 'your work'
  broadcast('checkin', { text: say('renudge', { task }), task, firm: true })
  notify('Nudge — still there? 👋', `Let's get back to ${task}.`, { sound: 'Glass' })
  renudgeTimer = setTimeout(doRenudge, RENUDGE_MS) // keep gently knocking
}

function acknowledge () {
  state.awaitingReply = false
  clearTimeout(renudgeTimer); renudgeTimer = null
  scheduleCheckin()
}

// ─── API ─────────────────────────────────────────────────
app.get('/api/state', (req, res) => res.json(snapshot()))

app.post('/api/start', async (req, res) => {
  await refreshSchedule()
  state.started = true
  state.mode = 'working'
  state.awaitingReply = false
  state.breakUntil = null
  scheduleCheckin()
  broadcast('message', { text: say('welcome'), kind: 'welcome' })
  pushStatus()
  res.json(snapshot())
})

// "Yep, on it" — clears the nudge and resets the cadence.
app.post('/api/onit', (req, res) => {
  acknowledge()
  res.json(snapshot())
})

// Break: optional minutes (15/30) or open-ended ("I'll tell you").
app.post('/api/break', (req, res) => {
  const minutes = Number(req.body?.minutes) || 0
  state.mode = 'break'
  state.awaitingReply = false
  clearTimers()
  clearTimeout(breakTimer); breakTimer = null
  if (minutes > 0) {
    state.breakUntil = Date.now() + minutes * 60 * 1000
    breakTimer = setTimeout(() => endBreak(true), minutes * 60 * 1000)
  } else {
    state.breakUntil = null
  }
  broadcast('message', { text: say('breakStart'), kind: 'break' })
  pushStatus()
  res.json(snapshot())
})

function endBreak (auto) {
  clearTimeout(breakTimer); breakTimer = null
  state.mode = 'working'
  state.breakUntil = null
  state.awaitingReply = false
  scheduleCheckin()
  broadcast('message', { text: say('breakBack'), kind: 'welcome' })
  if (auto) notify('Nudge 🌟', "Break's over — welcome back!")
  pushStatus()
}

app.post('/api/back', (req, res) => {
  endBreak(false)
  res.json(snapshot())
})

// Switch task — return open top-level tasks to choose from.
app.get('/api/tasks', async (req, res) => {
  const { tasks } = await openTasks()
  res.json({ tasks })
})

// Switch — adopt a self-chosen task as the active focus until the next block.
app.post('/api/switch', (req, res) => {
  const line = Number(req.body?.line)
  const title = (req.body?.title || '').trim()
  if (title) {
    const min = nowMinutes()
    const block = currentBlock(state.schedule, min)
    state.override = {
      title,
      line: Number.isInteger(line) ? line : null,
      anchorStart: block ? block.start : null
    }
  }
  acknowledge()
  broadcast('message', { text: say('switched'), kind: 'switch' })
  pushStatus()
  res.json(snapshot())
})

// Done — step 1: find candidate TASKS.md lines to confirm.
app.get('/api/done/candidates', async (req, res) => {
  const min = nowMinutes()
  const title = req.query.title || resolveFocus(min).title || ''
  const { tasks } = await loadTasks()
  let candidates = matchCandidates(tasks, title)
  // No current focus to match against (e.g. end of day) — or nothing matched —
  // so let the user pick from all open tasks instead of showing an empty list.
  let fallback = false
  if (!candidates.length) {
    candidates = tasks.filter(t => !t.done)
    fallback = true
  }
  res.json({ title, candidates, fallback })
})

// Done — step 2: flip the confirmed line.
app.post('/api/done', async (req, res) => {
  const line = Number(req.body?.line)
  if (!Number.isInteger(line)) return res.status(400).json({ ok: false })
  const result = await markDone(line)
  if (result.ok) {
    // If you finished the task you'd switched to, drop the override.
    if (state.override && state.override.line === line) state.override = null
    acknowledge()
    broadcast('message', { text: say('done', { task: result.title }), kind: 'done' })
    pushStatus()
  }
  res.json(result)
})

// What's next after the scheduled day is done.
app.get('/api/next', async (req, res) => {
  const { tasks } = await openTasks()
  res.json({ text: say('listDone'), next: tasks[0] || null, more: tasks.slice(1, 4) })
})

// Stuck — copy a breakdown prompt and open Claude desktop (fallback: browser).
app.post('/api/stuck', (req, res) => {
  const min = nowMinutes()
  const task = req.body?.task || resolveFocus(min).title || 'my current task'
  const prompt =
    `I have ADHD and low executive function, and I'm feeling stuck. ` +
    `Please break this task into tiny, concrete 5-minute steps I can start ` +
    `right now, one at a time, in encouraging plain language:\n\n"${task}"`

  const esc = s => s.replace(/'/g, "'\\''")
  // Copy the prompt to the clipboard, then try the Claude desktop app.
  exec(`printf '%s' '${esc(prompt)}' | pbcopy`, () => {
    exec('open -a "Claude"', err => {
      if (err) exec('open "https://claude.ai/new"', () => {})
    })
  })
  broadcast('message', { text: say('stuck'), kind: 'stuck' })
  res.json({ ok: true, prompt })
})

// Quit — graceful shutdown so the browser shows a clean message.
app.post('/api/quit', (req, res) => {
  res.json({ ok: true })
  setTimeout(() => process.exit(0), 200)
})

// ─── Live reloads + heartbeat ────────────────────────────
let reloadDebounce = null
function watchFile (path) {
  try {
    watch(path, () => {
      clearTimeout(reloadDebounce)
      reloadDebounce = setTimeout(async () => {
        await refreshSchedule()
        pushStatus()
      }, 300)
    })
  } catch { /* file may not exist yet; ignore */ }
}

// Tick every 30s — refresh the UI and detect block transitions for the chime.
setInterval(() => {
  if (!state.started) return
  const min = nowMinutes()
  const block = currentBlock(state.schedule, min)
  const blockStart = block ? block.start : null
  if (blockStart !== state.lastBlockStart) {
    state.lastBlockStart = blockStart
    if (blockStart !== null && state.mode === 'working') {
      // A new focus block just started — play a gentle chime and notify.
      notify('Nudge 🦔', `New block: ${block.title}`)
      exec('afplay /System/Library/Sounds/Hero.aiff && afplay /System/Library/Sounds/Hero.aiff && afplay /System/Library/Sounds/Hero.aiff', () => {})
    }
  }
  pushStatus()
}, 30 * 1000)

// Midnight reset — return to the start screen so each day begins fresh.
function scheduleMidnightReset () {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 5, 0) // 00:00:05 tomorrow (5s buffer past midnight)
  const msUntil = midnight - now
  setTimeout(() => {
    state.started = false
    state.mode = 'idle'
    state.awaitingReply = false
    state.breakUntil = null
    state.override = null
    clearTimers()
    clearTimeout(breakTimer); breakTimer = null
    pushStatus()
    scheduleMidnightReset() // arm for the next midnight
  }, msUntil)
}
scheduleMidnightReset()

await refreshSchedule()
watchFile(BRIEFING_PATH)
watchFile(TASKS_PATH)

app.listen(PORT, () => {
  console.log(`🦔 Nudge is ready at http://localhost:${PORT}`)
})
