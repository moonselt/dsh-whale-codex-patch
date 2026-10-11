// Extract the bundled pi-ai provider catalog from the DSH ASAR for read-only inspection.
const fs = require('node:fs')
const path = require('node:path')
const archive = 'D:/DeepSeek Harness/resources/app.asar'
const fd = fs.openSync(archive, 'r')
const header = Buffer.alloc(16)
fs.readSync(fd, header, 0, 16, 0)
const headerSize = header.readUInt32LE(12)
const baseOffset = 8 + header.readUInt32LE(4)
const root = JSON.parse(fs.readFileSync(fd, { encoding: 'latin1' }).length ? (() => { const b = Buffer.alloc(headerSize); fs.readSync(fd, b, 0, headerSize, 16); return b.toString() })() : '{}')
const outRoot = 'codex-whale/research/archive/pi-ai'
const match = /@earendil-works[/\\]pi-ai[/\\]/
let extracted = 0
const files = []
function walk(node, prefix) {
  for (const [name, value] of Object.entries(node)) {
    const p = prefix + '/' + name
    if (value.files) { walk(value.files, p); continue }
    if (!match.test(p + '/')) continue
    files.push([p, value])
  }
}
walk(root.files, '')
for (const [p, value] of files) {
  const rel = p.split(match).slice(1).join(match.source)
  const dest = path.join(outRoot, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const data = Buffer.alloc(value.size)
  fs.readSync(fd, data, 0, data.length, baseOffset + Number(value.offset))
  fs.writeFileSync(dest, data)
  extracted++
}
fs.closeSync(fd)
console.log('pi-ai files extracted: ' + extracted)
