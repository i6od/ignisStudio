// Inspect what a packaged app.asar actually contains (asar header parse, no deps).
import fs from 'node:fs'

const p = process.argv[2] || 'D:/VConnectApp/release/win-unpacked/resources/app.asar'
const fd = fs.openSync(p, 'r')

const prefix = Buffer.alloc(16)
fs.readSync(fd, prefix, 0, 16, 0)
console.log('header framing:', [...prefix].map((b) => b).join(' ').slice(0, 60))

// Locate the header JSON instead of guessing the pickle layout: the asar header
// is the first JSON object in the file.
const probe = Buffer.alloc(4 * 1024 * 1024)
const read = fs.readSync(fd, probe, 0, probe.length, 0)
const start = probe.indexOf(0x7b)
if (start < 0) throw new Error('no JSON header found')

let depth = 0
let end = -1
let inString = false
let escaped = false
for (let i = start; i < read; i++) {
  const c = probe[i]
  if (inString) {
    if (escaped) escaped = false
    else if (c === 0x5c) escaped = true
    else if (c === 0x22) inString = false
    continue
  }
  if (c === 0x22) inString = true
  else if (c === 0x7b) depth++
  else if (c === 0x7d) {
    depth--
    if (depth === 0) {
      end = i + 1
      break
    }
  }
}
if (end < 0) throw new Error('header JSON larger than probe window')

const header = JSON.parse(probe.subarray(start, end).toString('utf8'))

const files = []
const walk = (node, path) => {
  for (const [name, child] of Object.entries(node.files || {})) {
    const full = `${path}/${name}`
    if (child.files) walk(child, full)
    else files.push({ file: full, size: child.size })
  }
}
walk(header, '')

const total = files.reduce((a, b) => a + b.size, 0)
console.log(`asar: ${p}`)
console.log(`files: ${files.length}  unpacked bytes: ${(total / 1024 / 1024).toFixed(1)} MB`)

console.log('\n--- top 12 largest entries ---')
for (const f of [...files].sort((a, b) => b.size - a.size).slice(0, 12)) {
  console.log(`${(f.size / 1024).toFixed(0).padStart(7)} KB  ${f.file}`)
}

const packages = new Map()
for (const f of files) {
  const m = f.file.match(/^\/node_modules\/(@?[^/]+(?:\/[^/]+))?/)
  if (m) packages.set(m[1], (packages.get(m[1]) || 0) + f.size)
}
console.log('\n--- top 12 node_modules packages ---')
for (const [name, size] of [...packages].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`${(size / 1024).toFixed(0).padStart(7)} KB  ${name}`)
}

console.log('\n--- app entries (non node_modules) ---')
for (const f of files.filter((f) => !f.file.startsWith('/node_modules'))) {
  console.log(`${(f.size / 1024).toFixed(0).padStart(7)} KB  ${f.file}`)
}

fs.closeSync(fd)
