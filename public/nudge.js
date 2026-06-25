// nudge.js — SSE client + button handlers for the single Nudge screen.

const $ = id => document.getElementById(id)
const api = (path, opts) => fetch(path, opts).then(r => r.json())
const post = (path, body) =>
  api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })

const views = ['start', 'now', 'checkin', 'meeting', 'break', 'breakpick', 'list', 'doneconfirm']
function show (name) {
  for (const v of views) $(`view-${v}`).classList.toggle('hidden', v !== name)
}

let lastSnapshot = null

function wiggle () {
  const m = $('mascot')
  m.classList.remove('wiggle')
  void m.offsetWidth
  m.classList.add('wiggle')
}

function toast (text) {
  const t = $('toast')
  t.textContent = text
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2600)
}

// ─── Render the steady-state "what now" / meeting / break view ──
// `force` = this render is the result of an explicit user action, so it may
// switch views even out of a check-in/picker. Passive SSE ticks pass force
// = false so they never yank you out of something you're interacting with.
function render (s, force = false) {
  lastSnapshot = s
  $('clock').textContent = `🕒 ${s.nowLabel}`
  if (!s.started) return show('start')

  const transient = !force && (
    !$('view-checkin').classList.contains('hidden') ||
    !$('view-list').classList.contains('hidden') ||
    !$('view-doneconfirm').classList.contains('hidden') ||
    !$('view-breakpick').classList.contains('hidden'))

  if (s.mode === 'break') {
    if (s.breakUntil) {
      const mins = Math.max(0, Math.round((s.breakUntil - Date.now()) / 60000))
      $('break-timer').textContent = `Back in about ${mins} min — or whenever you're ready.`
    } else {
      $('break-timer').textContent = ''
    }
    // Always show break/meeting — these are time-sensitive and must not be
    // blocked by the transient guard (which protects task pickers only).
    show('break')
    return
  }

  if (s.buffer) {
    const mtg = s.buffer.meeting
    if (s.buffer.phase === 'during') {
      $('meeting-text').textContent = `You're in ${mtg.title} 🤫`
    } else if (s.buffer.phase === 'before') {
      $('meeting-text').textContent = `${mtg.title} at ${mtg.label.split('–')[0].trim()} — wrapping up gently 💙`
    } else {
      $('meeting-text').textContent = `Just out of ${mtg.title} — easing back in 💙`
    }
    $('meeting-sub').textContent = mtg.sub || ''
    show('meeting')
    return
  }

  // Normal focus view.
  if (s.scheduleError) {
    $('now-lead').textContent = 'Heads up'
    $('now-title').textContent = "I couldn't find today's briefing"
    $('now-sub').textContent = 'Generate your daily briefing, then I\'ll know the plan!'
  } else if (s.focus && s.focus.title) {
    const chosen = s.focus.source === 'switch'
    $('now-lead').textContent = chosen ? 'You chose this ✨' : 'Right now'
    $('now-title').textContent = s.focus.title
    $('now-sub').textContent = chosen
      ? (s.next ? `Plan picks back up at ${s.next.label.split('–')[0].trim()}.` : '')
      : (s.focus.sub || '')
  } else if (s.next) {
    // Gap between scheduled blocks — next block is coming.
    const nextTime = s.next.label.split('–')[0].trim()
    $('now-lead').textContent = 'Free until'
    $('now-title').textContent = nextTime
    $('now-sub').textContent = `${s.next.title} is up next — use this time as you like.`
  } else {
    // Genuinely past the scheduled day — surface the next open task.
    api('/api/next').then(d => {
      $('now-lead').textContent = 'Next up'
      $('now-title').textContent = d.next ? d.next.title : "You're all caught up! 🎉"
      $('now-sub').textContent = d.next ? 'Scheduled day is done — get a head start if you like.' : 'Nothing left on the list. Amazing work today.'
    })
  }
  $('pace').textContent = 'I check in every 10 min 🦔'
  if (!transient) show('now')
}

// ─── SSE ─────────────────────────────────────────────────
const es = new EventSource('/events')
es.addEventListener('status', e => render(JSON.parse(e.data)))
es.addEventListener('message', e => {
  const d = JSON.parse(e.data)
  toast(d.text)
  wiggle()
})
es.addEventListener('checkin', e => {
  const d = JSON.parse(e.data)
  // Show the actual current focus as the headline, with a short warm prompt.
  $('checkin-focus').textContent = d.task || 'your work'
  $('checkin-lead').textContent = d.firm ? 'Still here? You were on' : 'Still on'
  $('checkin-text').textContent = d.text
  $('view-checkin').classList.toggle('firm', !!d.firm)
  show('checkin')
  wiggle()
})

// ─── Buttons ─────────────────────────────────────────────
$('btn-start').onclick = async () => { await post('/api/start'); }

const goOnit = async () => { const s = await post('/api/onit'); render(s, true) }
$('btn-onit').onclick = goOnit

// Break flow
const openBreakPicker = () => show('breakpick')
$('btn-break').onclick = openBreakPicker
$('btn-checkin-break').onclick = openBreakPicker
document.querySelectorAll('#view-breakpick button').forEach(b => {
  b.onclick = async () => { const s = await post('/api/break', { minutes: Number(b.dataset.min) }); render(s, true) }
})
$('btn-back').onclick = async () => { await post('/api/back') }

// Switch flow — just open the picker; nothing changes until you choose.
const openSwitch = async () => {
  const { tasks } = await api('/api/tasks')
  $('list-title').textContent = 'Pick your next adventure ✨'
  renderList($('list-items'), tasks, false)
  show('list')
}
$('btn-switch').onclick = openSwitch
$('btn-checkin-switch').onclick = openSwitch
$('btn-list-back').onclick = () => render(lastSnapshot, true)

function renderList (container, tasks, isDone) {
  container.innerHTML = ''
  if (!tasks.length) {
    container.innerHTML = '<div class="list-item">No open tasks — you legend! 🎉</div>'
    return
  }
  for (const t of tasks) {
    const el = document.createElement('div')
    el.className = 'list-item'
    el.innerHTML = t.title
    el.onclick = async () => {
      if (isDone) {
        const r = await post('/api/done', { line: t.line })
        if (r.ok) render(lastSnapshot, true)
      } else {
        // Adopt the chosen task as the active focus; the server makes it the
        // new "now" and resets the cadence. Render the snapshot it returns.
        const snap = await post('/api/switch', { line: t.line, title: t.title })
        render(snap, true)
      }
    }
    container.appendChild(el)
  }
}

// Done flow — confirm which TASKS.md line to check off.
const openDone = async () => {
  const title = lastSnapshot?.focus?.title || ''
  const { candidates, fallback } = await api(`/api/done/candidates?title=${encodeURIComponent(title)}`)
  $('doneconfirm-title').textContent = fallback
    ? 'Which task did you finish? 🎉'
    : 'Which one did you finish? 🎉'
  renderList($('done-items'), candidates, true)
  show('doneconfirm')
}
$('btn-done').onclick = openDone
$('btn-done-cancel').onclick = () => render(lastSnapshot, true)

// Stuck flow
const goStuck = async () => {
  const task = lastSnapshot?.block?.title || ''
  await post('/api/stuck', { task })
  toast('Prompt copied → opening Claude 🧩')
}
$('btn-stuck').onclick = goStuck
$('btn-checkin-stuck').onclick = goStuck

// Quit
$('btn-quit').onclick = async () => {
  if (!confirm('Shut down Nudge?')) return
  await post('/api/quit').catch(() => {})
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#6b6b7d;font-size:1.1rem;">Nudge has stopped. You can close this tab. 🦔</div>'
}

// Kick things off.
api('/api/state').then(render)
