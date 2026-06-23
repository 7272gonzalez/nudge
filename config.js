// config.js — reads nudge.config.json and resolves ~ paths.
// Edit nudge.config.json to point at your TASKS.md and daily briefing.

import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function resolvePath (p) {
  if (!p) return null
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

let cfg = {}
try {
  cfg = JSON.parse(readFileSync(path.join(HERE, 'nudge.config.json'), 'utf8'))
} catch {
  // No config file — fall back to defaults below.
}

export const TASKS_PATH = resolvePath(cfg.tasksPath)
  || path.join(os.homedir(), 'Documents/Claude/TASKS.md')

export const BRIEFING_PATH = resolvePath(cfg.briefingPath)
  || path.join(os.homedir(), 'Documents/Claude/Artifacts/sara-daily-briefing/index.html')
