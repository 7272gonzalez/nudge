#!/usr/bin/env node
// create-launcher.js — builds Nudge.app on the Desktop.
// Run once: node scripts/create-launcher.js

import { execSync, exec } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const HOME = os.homedir()
const DESKTOP = path.join(HOME, 'Desktop')
const APP = path.join(DESKTOP, 'Nudge.app')

// Find node — prefer the running binary, fall back to PATH lookup.
let nodePath = process.execPath
try {
  const found = execSync('which node', { encoding: 'utf8' }).trim()
  if (found) nodePath = found
} catch {}

const script = `-- Nudge Launcher
-- Starts the Nudge focus server (if not already running) and opens the app.

set nudgeDir to "${HERE}"
set nodePath to "${nodePath}"
set nudgePort to "3456"

try
  do shell script "lsof -ti:" & nudgePort
on error
  do shell script "cd " & quoted form of nudgeDir & " && nohup " & nodePath & " server.js > /tmp/nudge.log 2>&1 &"
  delay 1.5
end try

open location "http://localhost:" & nudgePort
`

const tmpScript = '/tmp/nudge-launcher.applescript'
writeFileSync(tmpScript, script)
execSync(`osacompile -o ${JSON.stringify(APP)} ${tmpScript}`)

// Generate a hedgehog emoji icon using Swift and apply it.
const swiftCode = `
import AppKit
let size = CGFloat(512)
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
let font = NSFont.systemFont(ofSize: size * 0.82)
let attrs: [NSAttributedString.Key: Any] = [.font: font]
let str = NSAttributedString(string: "🦔", attributes: attrs)
let strSize = str.size()
str.draw(at: NSPoint(x: (size - strSize.width)/2, y: (size - strSize.height)/2))
image.unlockFocus()
let tiff = image.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: "/tmp/nudge-icon.png"))
`
writeFileSync('/tmp/nudge-icon.swift', swiftCode)
try {
  execSync('swift /tmp/nudge-icon.swift')
  execSync(`osascript -e "
    use framework \\"AppKit\\"
    set img to current application's NSImage's alloc()'s initWithContentsOfFile_(\\"/tmp/nudge-icon.png\\")
    current application's NSWorkspace's sharedWorkspace()'s setIcon_forFile_options_(img, \\"${APP}\\", 0)
  "`)
} catch {
  // Icon is nice-to-have; don't fail the whole script.
}

console.log(`✅ Nudge.app created at ${APP}`)
console.log('   Double-click it to start Nudge.')
console.log('   Tip: drag it to your Dock for one-click access.')
