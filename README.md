# Nudge 🦔

Your cheerful focus friend. A tiny, bright, zero-cost app that keeps you on
track Monday–Friday — built for ADHD, low executive function, and time
blindness. Nudge is a friend, not a taskmaster.

---

## What it does

- Reads your **daily schedule** from a Claude-generated HTML briefing
- Reads your **task list** from a plain Markdown file (`TASKS.md`)
- Shows you what you *should* be working on right now based on the clock
- Checks in every **10 minutes** with a warm prompt — and a hedgehog grunt 🦔
- Goes quiet **10 minutes before and after meetings**
- Lets you take a **timed or open break**
- Lets you **switch tasks** when you need a change
- Marks tasks **done** directly in your TASKS.md
- Copies a **"help me break this down"** prompt to clipboard and opens Claude when you're stuck
- Resets to a fresh start at **midnight** each night
- Plays a **custom hedgehog grunt sound** via `afplay` (bypasses macOS Focus/Do Not Disturb)

---

## Requirements

- **macOS** (uses `osascript` for notifications, `afplay` for sounds)
- **Node.js v18+** — install via [nodejs.org](https://nodejs.org) or `brew install node`
- **Claude** desktop app (for the "I'm stuck" feature — optional)

---

## New here? Start with the full setup guide

**[docs/SETUP.md](docs/SETUP.md)** — step-by-step walkthrough covering the daily briefing Claude Project, Nudge installation, and the Desktop launcher. Covers everything from scratch in about 30 minutes.

The briefing system prompt template is in **[docs/daily-briefing-prompt.md](docs/daily-briefing-prompt.md)**.

---

## Quick start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/nudge.git
cd nudge
npm install
```

### 2. Set up your files

Nudge needs two things:

**A. A task list — `TASKS.md`**

Create this file anywhere you like (e.g. `~/Documents/TASKS.md`).
Use GitHub-style checkboxes — Nudge reads unchecked items as your open tasks:

```markdown
- [ ] **Write the quarterly report** ⭐ HIGH PRIORITY — due Friday
  - [ ] Gather data from dashboard
  - [ ] Draft introduction
- [ ] **Reply to Jamie's email**
- [x] **Set up Nudge** ✅
```

Nudge only ever flips one `[ ]` → `[x]` at a time, so it won't touch your formatting.

**B. A daily briefing — an HTML schedule file**

Nudge reads your schedule from an HTML file that lists time blocks for the day.
The parser is tolerant of different formats — it just looks for time ranges like
`9:00 – 9:30` or `10am to 11am` anywhere on the page, followed by a title.

The easiest way to generate this is with a **Claude Project** that produces a
daily HTML briefing from your calendar and task list. See
[Setting up a daily briefing](#setting-up-a-daily-briefing) below for a template.

If you don't have a briefing set up yet, Nudge still works — it just won't show
a schedule, and will surface your next task from `TASKS.md` instead.

### 3. Configure your paths

Edit `nudge.config.json` to point at your files:

```json
{
  "tasksPath": "~/Documents/TASKS.md",
  "briefingPath": "~/Documents/my-daily-briefing/index.html"
}
```

Tilde (`~`) expands to your home folder. Use absolute paths if you prefer.

### 4. Run it

```bash
node server.js
```

Then open **http://localhost:3456** in your browser.

---

## Make it a double-click app (macOS)

Run this once in Terminal to create a `Nudge.app` on your Desktop:

```bash
node scripts/create-launcher.js
```

Then double-click **Nudge** on your Desktop to start. Drag it to your Dock
to keep it handy. The first time macOS may warn about an unverified developer —
right-click → **Open** → **Open** to allow it (one-time only).

---

## Setting up a daily briefing

The briefing is an HTML file Nudge reads each morning. Here's how to set one up
using a Claude Project:

1. Create a new **Claude Project** and name it something like "Daily Briefing".
2. Add a system prompt that tells Claude to generate an HTML file each morning
   with your schedule for the day, pulling from your calendar and task list.
   A simple starting point:

   > Each morning when I ask, generate a single HTML page with my schedule for
   > today in time order. Format each block as:
   > `TIME_START – TIME_END · TITLE`
   > with any notes on the next line. Save it as `index.html`.

3. Set the output path in `nudge.config.json` to wherever you save the file.
4. Each morning, run your briefing prompt → save the HTML → click **Let's go**.

Nudge auto-reloads the briefing file whenever it changes on disk, so if you
regenerate it mid-morning it'll pick up the new schedule within a second.

**Meeting detection:** Nudge recognises a block as a meeting if its title
contains words like *call*, *sync*, *meeting*, *standup*, *review*, *interview*,
or the ☎ / 📞 emoji. It goes quiet 10 minutes before and after.

---

## TASKS.md format

Any GitHub-style checkbox list works:

```markdown
- [ ] **Task title** optional-emoji PRIORITY — optional notes
  - [ ] subtask (also shown, indented)
- [x] **Already done task** (ignored by Nudge)
```

Nudge surfaces top-level open tasks (`- [ ]`) first, then subtasks. It matches
your current schedule block title to the most relevant tasks using word overlap,
so keeping task titles descriptive helps it find the right one.

---

## Keyboard / UI

| Button | What it does |
|---|---|
| **Yep, on it 💪** | Confirms you're still on task; resets the 10-min timer |
| **Switched 🔀** | Pick a different task to focus on |
| **Break 🍵** | 15 min, 30 min, or open-ended break |
| **I'm stuck 🧩** | Copies a breakdown prompt → opens Claude |
| **Done ✅** | Mark a task complete in TASKS.md |
| **Quit Nudge** | Gracefully shuts down the server |

---

## Project structure

```
nudge/
├── server.js               # Express server, state machine, SSE, API
├── schedule.js             # Daily briefing HTML parser
├── tasks.js                # TASKS.md reader / checkbox writer
├── messages.js             # Friendly phrases (no AI, just variety)
├── config.js               # Reads nudge.config.json, resolves paths
├── nudge.config.json       # ← Edit this with your paths
├── sounds/
│   ├── hog-grunt.wav       # Pre-generated hedgehog grunt
│   └── generate-grunt.mjs  # Re-generate the sound if needed
├── public/
│   ├── index.html          # Single-page UI
│   ├── nudge.js            # SSE client + button handlers
│   └── style.css           # Bright, cheerful styles
└── scripts/
    └── create-launcher.js  # Generates Nudge.app on your Desktop
```

---

## Licence

MIT — do whatever you like with it. Made with 🦔 for focus and kindness.
