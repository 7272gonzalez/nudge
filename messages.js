// messages.js — cheerful, friend-not-taskmaster phrases. No AI; just variety.
// {task} is substituted with the current focus title.

const pick = arr => arr[Math.floor(Math.random() * arr.length)]

const lines = {
  // Shown when starting the day.
  welcome: [
    "Morning! ☀️ Let's have a good one together.",
    "Hey, you made it! I'll keep us pointed in the right direction. 🦔",
    "Ready when you are — I've got your back today. 💛"
  ],

  // The "what now" headline lead-in.
  nowFocus: [
    "Right now, let's give this some love:",
    "Here's our thing for this moment:",
    "This is the one — you've got it:",
    "Let's pour energy into:"
  ],

  // Routine check-in prompts. The task itself is shown as the headline above
  // these, so the prompt stays short and warm (no {task} needed).
  checkin: [
    "Still rolling? 🦔",
    "How's it going? Just checking in. 💛",
    "Psst — still with it?",
    "Quick wave 👋 — how are we doing?"
  ],

  // Firmer (but still kind) re-nudge after no reply.
  renudge: [
    "Hey friend 👋 still here? Let's reconnect.",
    "No rush, but I lost you for a sec — shall we? 💛",
    "Knock knock 🚪 — drifting off? I'm right here when you're ready."
  ],

  // Celebrating a completed task.
  done: [
    "YES! 🎉 {task} — done and dusted!",
    "Look at you go! ✅ {task} is officially handled.",
    "Boom. 💥 {task} complete. So proud of you!"
  ],

  // When the user switches tasks out of boredom.
  switched: [
    "Totally fine — fresh task, fresh energy. Pick one! 🌱",
    "Switching it up keeps it fun. What sounds good? ✨",
    "New focus, let's go. Choose your next adventure: 🦔"
  ],

  // Meeting buffer message.
  meetingSoon: [
    "Meeting at {time} — let's wrap up gently. 💙",
    "Heads up: {meeting} coming at {time}. I'll go quiet. 🤫",
    "Meeting time soon ({time}). Breathe, you're ready. 💙"
  ],
  meetingNow: [
    "You're in {meeting} — I'll stay out of your way. 🤫",
    "Meeting mode. I'll wait right here. 💙"
  ],

  // Break mode.
  breakStart: [
    "Break time! Stretch, sip, breathe. I'll wave when you're back. 🍵",
    "Rest those gears. 🌿 Enjoy it — you earned it.",
    "Stepping away is part of the work too. See you soon! ☕"
  ],
  breakBack: [
    "Welcome back! 🌟 Let's ease into things.",
    "There you are! 💛 Ready to roll again?",
    "Refreshed? Let's pick up where we left off. 🦔"
  ],

  // When all scheduled blocks are done.
  listDone: [
    "Schedule's all wrapped — amazing! Here's the next thing to nibble on:",
    "You cleared the day's plan! 🎉 Want to get ahead on:",
    "All scheduled blocks done! Next up if you've got steam:"
  ],

  // Stuck.
  stuck: [
    "No shame in stuck — let's break it into tiny steps together. 🧩",
    "Stuck is just the start of figuring it out. Opening Claude for you… 🦔"
  ]
}

export function say (key, vars = {}) {
  let text = pick(lines[key] || [''])
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, v)
  }
  return text
}
