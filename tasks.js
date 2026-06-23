// tasks.js — read TASKS.md and safely check off a single line.
//
// TASKS.md uses GitHub-style checkboxes with bold titles, e.g.:
//   - [ ] **Review AFTAC document...** ⭐⭐ HIGHEST PRIORITY — due June 22
//     - [ ] a subtask
// We only ever flip a single "[ ]" -> "[x]" on a confirmed line, so edits
// stay surgical and never rewrite the whole file.

import { readFile, writeFile } from 'node:fs/promises'
import { TASKS_PATH } from './config.js'

const CHECKBOX_RE = /^(\s*)-\s\[( |x|X)\]\s+(.*)$/

// Strip markdown emphasis/strikethrough so titles read cleanly in the UI.
function prettify (text) {
  return text
    .replace(/~~/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
}

export async function loadTasks () {
  let raw
  try {
    raw = await readFile(TASKS_PATH, 'utf8')
  } catch {
    return { tasks: [], error: 'tasks-not-found' }
  }

  const lines = raw.split('\n')
  const tasks = []
  lines.forEach((line, i) => {
    const m = line.match(CHECKBOX_RE)
    if (!m) return
    const done = m[2].toLowerCase() === 'x'
    const indent = m[1].length
    tasks.push({
      line: i, // 0-based line index, the stable id for edits
      done,
      isSubtask: indent > 0,
      title: prettify(m[3])
    })
  })
  return { tasks, error: null }
}

// Open, incomplete top-level tasks, in file order (already priority-ordered
// by the briefing/owner). Used for the "pick another task" and
// "everything's done — here's the next thing" views.
export async function openTasks () {
  const { tasks, error } = await loadTasks()
  if (error) return { tasks: [], error }
  return { tasks: tasks.filter(t => !t.done && !t.isSubtask), error: null }
}

// Find candidate lines whose title best matches a schedule block title,
// so "Done" can ask the user to confirm which checkbox to flip.
export function matchCandidates (tasks, blockTitle) {
  const needle = normalize(blockTitle)
  const scored = tasks
    .filter(t => !t.done)
    .map(t => ({ task: t, score: overlap(normalize(t.title), needle) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, 5).map(s => s.task)
}

function normalize (s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Word-overlap score, ignoring tiny stopwords.
function overlap (a, b) {
  const stop = new Set(['the', 'a', 'an', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'part'])
  const wa = new Set(a.split(' ').filter(w => w.length > 2 && !stop.has(w)))
  const wb = b.split(' ').filter(w => w.length > 2 && !stop.has(w))
  let hits = 0
  for (const w of wb) if (wa.has(w)) hits++
  return hits
}

// Flip exactly one line's checkbox to done. Re-reads first so we never clobber
// edits made elsewhere; verifies the target line still looks right.
export async function markDone (lineIndex) {
  const raw = await readFile(TASKS_PATH, 'utf8')
  const lines = raw.split('\n')
  const line = lines[lineIndex]
  if (line === undefined) return { ok: false, error: 'line-gone' }
  const m = line.match(CHECKBOX_RE)
  if (!m) return { ok: false, error: 'not-a-checkbox' }
  if (m[2].toLowerCase() === 'x') return { ok: true, title: prettify(m[3]), already: true }

  lines[lineIndex] = line.replace(/-\s\[ \]/, '- [x]')
  await writeFile(TASKS_PATH, lines.join('\n'), 'utf8')
  return { ok: true, title: prettify(m[3]) }
}

export { TASKS_PATH }
