# Setting up Nudge 🦔 — Complete Guide

Welcome! This guide walks you through everything from scratch. You'll have two things running by the end:

1. **A daily briefing** — a Claude Project that reads your calendar and tasks each morning and generates a timed HTML schedule
2. **Nudge** — the focus app that reads that schedule and keeps you on track throughout the day

Total setup time: about 30 minutes.

---

## What you'll need

- **macOS** (Nudge uses macOS notifications and sounds)
- **Node.js v18+** — check by running `node --version` in Terminal. If you don't have it, install from [nodejs.org](https://nodejs.org) or run `brew install node`
- **Claude** desktop app (for the daily briefing and the "I'm stuck" feature)
- **Google Calendar** connected to Claude via MCP
- **Asana** connected to Claude via MCP (optional — Nudge works without it)

---

## Part 1 — Set up your daily briefing (15 min)

The daily briefing is a Claude Project that generates a timed HTML schedule each morning by reading your calendar and tasks. Nudge reads that file to know your plan for the day.

### Step 1 — Create a Claude Project

1. Open Claude (desktop app or claude.ai)
2. Click **Projects** → **New Project**
3. Name it something like **Daily Briefing** or **Morning Plan**

### Step 2 — Add the system prompt

In the Project settings, paste the system prompt from [`daily-briefing-prompt.md`](daily-briefing-prompt.md) into the **Project instructions** field.

Customise the two lines marked `← EDIT THIS`:
- Your name
- Your task file path (if you use a TASKS.md — see Part 2 for where to put it)

### Step 3 — Decide where to save the briefing file

Nudge reads the briefing from a path you configure. We recommend:

```
~/Documents/Claude/Artifacts/my-daily-briefing/index.html
```

Create that folder now:
```bash
mkdir -p ~/Documents/Claude/Artifacts/my-daily-briefing
```

### Step 4 — Generate your first briefing

In your new Claude Project, send this message:

> Generate my daily briefing for today and save it to `~/Documents/Claude/Artifacts/my-daily-briefing/index.html`

Claude will use your calendar and tasks to build the schedule and save the HTML file.

**Each morning after this:** open the project and send the same message (or just "Refresh my briefing"). Claude remembers the instructions from the system prompt.

> **Tip:** Bookmark the project or pin it in Claude so it's one click away each morning.

---

## Part 2 — Set up your task list (5 min)

Nudge reads a plain Markdown file for your tasks. Create it wherever suits you:

```
~/Documents/Claude/TASKS.md
```

Format — use GitHub-style checkboxes:

```markdown
- [ ] **Write the quarterly report** ⭐ HIGH PRIORITY — due Friday
  - [ ] Gather data
  - [ ] Draft introduction
- [ ] **Reply to Jamie's email**
- [x] **Already finished task** ✅
```

Rules:
- `- [ ]` = open task (Nudge will show these)
- `- [x]` = done (Nudge ignores these)
- Bold title with `**...**` is optional but helps Nudge match tasks to your schedule
- Indented `  - [ ]` subtasks are also shown

Nudge never rewrites your file — it only flips a single `[ ]` to `[x]` when you mark something done.

---

## Part 3 — Install Nudge (10 min)

### Step 1 — Get the code

```bash
git clone https://github.com/7272gonzalez/nudge.git
cd nudge
npm install
```

### Step 2 — Configure your paths

Open `nudge.config.json` in any text editor and set your paths:

```json
{
  "tasksPath": "~/Documents/Claude/TASKS.md",
  "briefingPath": "~/Documents/Claude/Artifacts/my-daily-briefing/index.html"
}
```

Use the same briefing path you chose in Part 1. `~` expands to your home folder.

### Step 3 — Test it

```bash
node server.js
```

Then open **http://localhost:3456** in your browser. You should see Nudge's start screen. Click **Let's go ☀️** — if your briefing is already generated, you'll see today's schedule.

### Step 4 — Create the Desktop launcher

Run this once to create a double-clickable app on your Desktop:

```bash
node scripts/create-launcher.js
```

You'll see **Nudge.app** appear on your Desktop with a hedgehog icon. Double-click it to start Nudge from now on — no Terminal needed.

> **First launch:** macOS may warn "Apple cannot verify this app". Right-click → **Open** → **Open** to allow it. You only need to do this once.

---

## Part 4 — Your morning routine

Each morning:

1. **Open your Daily Briefing Claude Project** → send "Refresh my briefing for today"
2. **Double-click Nudge** on your Desktop
3. Click **Let's go ☀️**

That's it. Nudge reads the fresh schedule and tells you what to focus on.

---

## How Nudge works day-to-day

| What you see | What it means |
|---|---|
| **Right now: [task]** | This is what your schedule says to work on |
| **Free until [time]** | Gap between blocks — pick something or take a breather |
| **You're in [meeting] 🤫** | Meeting time — Nudge goes quiet |
| **Next up: [task]** | Past the scheduled day — here's what to tackle next |

### Buttons

| Button | What it does |
|---|---|
| **Yep, on it 💪** | I'm still focused — reset the 10-min timer |
| **Switched 🔀** | I moved to a different task — pick it from the list |
| **Break 🍵** | 15 min, 30 min, or open-ended. Nudge waves you back |
| **I'm stuck 🧩** | Copies a breakdown prompt → opens Claude |
| **Done ✅** | Mark a task complete in your TASKS.md |
| **Skipped it — back to work 🏃** | Skipped a meeting — show me what to work on |
| **Pick something to work on 🏃** | Free time — open the task picker |
| **Quit Nudge** | Shut down the server cleanly |

### Check-ins

Every 10 minutes Nudge asks if you're still on task. One click to confirm. If you don't reply within 3 minutes, it gives a slightly louder nudge and a macOS notification — so it reaches you even if you've drifted into another window.

Nudge goes quiet for 10 minutes before and after any meeting block.

---

## Troubleshooting

**"I can't find today's briefing"**
Generate the briefing first (Part 1, Step 4), then click Let's go again. Nudge watches the file and reloads automatically within a second of it being saved.

**Schedule shows but meetings show as tasks**
The meeting title probably doesn't contain keywords like "meeting", "sync", "call", etc. Add "· Google Meet" or "· Zoom" to the attendees line in your briefing prompt — Nudge detects those too.

**The Desktop app isn't opening**
Right-click Nudge.app → Open → Open (first time only). If it still hangs, check `/tmp/nudge.log` for errors:
```bash
cat /tmp/nudge.log
```

**Nudge is already running when I double-click**
That's fine — double-clicking again just opens the browser tab. One server runs at a time.

**I want to stop Nudge**
Click **Quit Nudge** in the app, or run `pkill -f "node server.js"` in Terminal.

---

## Questions?

Open an issue on [github.com/7272gonzalez/nudge](https://github.com/7272gonzalez/nudge) or ask your Claude setup buddy. 🦔
