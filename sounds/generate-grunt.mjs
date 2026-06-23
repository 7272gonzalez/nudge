// generate-grunt.mjs — synthesize "two tiny hog grunts" into a WAV.
//
// A hedgehog grunt is a short, low, noisy snuffle. We model each grunt as a
// low sine (~150 Hz) with a downward pitch slide, blended with a little noise,
// shaped by a quick attack / soft decay envelope. Two grunts, short gap.
// Run:  node sounds/generate-grunt.mjs   → writes sounds/hog-grunt.wav

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const here = path.dirname(fileURLToPath(import.meta.url))

// Deterministic tiny PRNG so the grunt sounds the same every regenerate.
let seed = 1337
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return (seed / 0x7fffffff) * 2 - 1
}

function grunt (durSec, f0) {
  const n = Math.floor(durSec * RATE)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const p = i / n
    // Pitch slides down a little over the grunt — that "uh" snuffle shape.
    const f = f0 * (1 - 0.25 * p)
    const phase = 2 * Math.PI * f * t
    // Quick attack, soft exponential decay.
    const env = Math.min(1, p / 0.08) * Math.exp(-3.2 * p)
    const tone = Math.sin(phase) + 0.3 * Math.sin(2 * phase) // a touch of growl
    const noise = rand()
    out[i] = env * (0.72 * tone + 0.28 * noise) * 0.5
  }
  return out
}

function silence (durSec) {
  return new Float32Array(Math.floor(durSec * RATE))
}

// Two grunts, second slightly lower in pitch, with a short gap between.
const samples = [
  ...grunt(0.13, 165),
  ...silence(0.09),
  ...grunt(0.14, 150)
]

// Encode as 16-bit PCM mono WAV.
const dataLen = samples.length * 2
const buf = Buffer.alloc(44 + dataLen)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataLen, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(1, 22) // mono
buf.writeUInt32LE(RATE, 24)
buf.writeUInt32LE(RATE * 2, 28)
buf.writeUInt16LE(2, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(dataLen, 40)
for (let i = 0; i < samples.length; i++) {
  const s = Math.max(-1, Math.min(1, samples[i]))
  buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
}

const outPath = path.join(here, 'hog-grunt.wav')
writeFileSync(outPath, buf)
console.log(`wrote ${outPath} (${(dataLen / 1024).toFixed(1)} KiB)`)
