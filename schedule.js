// schedule.js — parse the daily briefing artifact into timed blocks.
//
// Source: ~/Documents/Claude/Artifacts/sara-daily-briefing/index.html
// The briefing already merges calendar + Asana into a time-ordered plan, so
// Nudge just reads it.
//
// This parser is intentionally TOLERANT of format changes. It does not depend
// on specific CSS class names or div nesting. Instead it:
//   1. isolates the schedule region (heading containing "schedule"),
//   2. flattens the HTML to text lines (spans become field separators),
//   3. finds time ranges anywhere ("9:00 – 9:30", "1:15-2:30", "9am to 10am"),
//   4. takes the following text as the title and classifies it by keywords.
// If the briefing's markup is restyled, this keeps working as long as it still
// shows "start – end" times next to titles.

import { readFile } from 'node:fs/promises'
import { BRIEFING_PATH } from './config.js'

const SEP = '' // internal field separator we inject for inline spans

// A start–end time range, tolerant of dashes, "to", and optional am/pm.
const TIME_RANGE = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:[–—-]|\bto\b)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i

// Section labels we never want to mistake for a task.
const SECTION_LABELS = /^(morning|afternoon|evening|midday|lunch break)$/i

function decode (s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
}

// 12-hour times across a 9am–5pm workday. Honors explicit am/pm; otherwise
// assumes 1–8 are afternoon (so "1:15" => 13:15).
function toMinutes (raw) {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return null
  let hour = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const mer = m[3] ? m[3].toLowerCase() : null
  if (mer === 'pm' && hour !== 12) hour += 12
  else if (mer === 'am' && hour === 12) hour = 0
  else if (!mer && hour <= 8) hour += 12 // workday heuristic
  return hour * 60 + min
}

// Flatten HTML to trimmed text lines. Inline <span>s become SEP-delimited
// fields (that's where tag chips live); block elements become line breaks.
function htmlToLines (html) {
  let s = html
    .replace(/<span[^>]*>/gi, SEP)
    .replace(/<\/span>/gi, SEP)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|li|tr|p|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  s = decode(s)
  return s.split('\n').map(l => l.replace(/\s+/g, ' ').trim())
}

// Slice the document down to the schedule section so we don't pick up the
// calendar/events list (which also contains time ranges).
function scheduleRegion (html) {
  // Prefer an <h> tag containing "schedul" (most explicit).
  const headings = [...html.matchAll(/<h[1-6][^>]*>([^<]*schedul[^<]*)<\/h[1-6]>/gi)]
  if (headings.length) {
    return html.slice(headings[headings.length - 1].index)
  }
  // Current briefing format: <div class="card-title">🗓 Suggested Schedule …
  // Find the LAST element whose visible text contains "schedul" — last because
  // early JSON/meta blocks may also mention "schedule" before the real section.
  const textMatches = [...html.matchAll(/<[^/!][^>]*>([^<]*schedul)/gi)]
  if (textMatches.length) {
    return html.slice(textMatches[textMatches.length - 1].index)
  }
  // Class-name fallback.
  const itemIdx = html.search(/class="[^"]*schedul/i)
  if (itemIdx !== -1) return html.slice(itemIdx)
  return html // last resort: whole doc
}

// titleAndTags: title + tag chips (no sub-text — avoids false positives like
//   "finish before morning meeting"). sub: attendee/location line only, used
//   to catch video-call links that reliably indicate a meeting.
function classify (titleAndTags, sub = '') {
  const t = titleAndTags.toLowerCase()
  const s = sub.toLowerCase()
  if (/\b(meeting|google meet|zoom|teams|stand-?up|sync|catch-?up|1:1|call|webinar)\b/.test(t) ||
      /☎|📞/u.test(titleAndTags) ||
      /google meet|zoom\.us|teams\.microsoft|webex/.test(s)) {
    return 'meeting'
  }
  if (/^(break|lunch|break\s*\/\s*lunch|coffee)/.test(t) || /\bbreak\b/.test(t)) {
    return 'break'
  }
  return 'focus'
}

export async function loadSchedule () {
  let html
  try {
    html = await readFile(BRIEFING_PATH, 'utf8')
  } catch {
    return { blocks: [], error: 'briefing-not-found' }
  }
  return parseScheduleHtml(html)
}

// Pure HTML → blocks. Exported so it can be tested against any markup.
export function parseScheduleHtml (html) {
  const lines = htmlToLines(scheduleRegion(html))
  const blocks = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const tm = line.match(TIME_RANGE)
    if (!tm) continue

    const start = toMinutes(tm[1])
    const end = toMinutes(tm[2])
    if (start === null || end === null || end <= start) continue

    // Title: text after the time on the same line, else the next non-blank
    // line (skipping blank lines, stopping at the next time range or label).
    let titleLine = line.slice(tm.index + tm[0].length).trim()
    let j = i
    while (!titleLine && j + 1 < lines.length) {
      j++
      const cand = lines[j]
      if (!cand) continue // skip blank lines between time and title
      if (TIME_RANGE.test(cand) || SECTION_LABELS.test(cand)) break
      titleLine = cand
    }
    if (!titleLine) continue

    // Split off inline tag chips (the SEP-delimited trailing fields).
    const fields = titleLine.split(SEP).map(f => f.trim()).filter(Boolean)
    // Drop any leading separator left over from "9:00 — Title" style markup.
    const title = (fields[0] || '').replace(/^[\s\-–—:·•]+/, '').trim()
    const tags = fields.slice(1)
    if (!title) continue

    // Collect all sub-lines until the next time block (description + attendees).
    // The first line becomes the display sub; all lines feed into classification
    // so attendee info like "With: … · Google Meet" can mark a block as a meeting.
    let sub = ''
    const subLines = []
    for (let k = j + 1; k < lines.length; k++) {
      const cand = lines[k]
      if (!cand) continue
      if (TIME_RANGE.test(cand) || SECTION_LABELS.test(cand)) break
      subLines.push(cand.split(SEP).map(f => f.trim()).filter(Boolean).join(' '))
    }
    sub = subLines[0] || ''
    const subAll = subLines.join(' ')

    const fmtTime = raw => raw.replace(/\s+/g, '').toLowerCase()
    blocks.push({
      start,
      end,
      label: `${fmtTime(tm[1])} – ${fmtTime(tm[2])}`,
      title,
      sub,
      // Classify on the title + tag chips only — never the description, which
      // may merely mention a meeting (e.g. "finish before morning meeting").
      type: classify(`${title} ${tags.join(' ')}`, subAll),
      tags
    })
  }

  // De-dupe by start time (in case a restyle nests text twice) and sort.
  const seen = new Set()
  const deduped = blocks.filter(b => {
    if (seen.has(b.start)) return false
    seen.add(b.start)
    return true
  })
  deduped.sort((a, b) => a.start - b.start)

  if (!deduped.length) return { blocks: [], error: 'no-schedule-found' }
  return { blocks: deduped, error: null }
}

// Which block is happening at `minutes` (minutes-since-midnight)?
export function currentBlock (blocks, minutes) {
  return blocks.find(b => minutes >= b.start && minutes < b.end) || null
}

export function nextBlock (blocks, minutes) {
  return blocks.find(b => b.start > minutes) || null
}

// Are we within `buffer` minutes before or after any meeting block?
// Two-pass so "during" always wins — a new meeting starting right after a
// previous one is never hidden by the prior meeting's post-buffer.
export function meetingBuffer (blocks, minutes, buffer = 10) {
  const meetings = blocks.filter(b => b.type === 'meeting')
  for (const b of meetings) {
    if (minutes >= b.start && minutes < b.end) return { meeting: b, phase: 'during' }
  }
  for (const b of meetings) {
    if (minutes >= b.start - buffer && minutes < b.start) return { meeting: b, phase: 'before' }
    if (minutes >= b.end && minutes < b.end + buffer) return { meeting: b, phase: 'after' }
  }
  return null
}

export { BRIEFING_PATH }
