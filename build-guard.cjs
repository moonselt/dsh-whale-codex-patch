// Assemble the guard plugin's data directory from the reviewed workspace artifacts.
// One development flow: edit patch sources here, run this, deploy the guard.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = __dirname
const guard = path.join(root, 'guard')
const dataDir = path.join(guard, 'data')
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const compat = JSON.parse(fs.readFileSync(path.join(root, 'compat-patches.json'), 'utf8'))
const profilePkg = JSON.parse(fs.readFileSync(path.join(root, 'plugin', 'package.json'), 'utf8'))
// The guard may only speak for versions whose complete upstream snapshot we keep,
// so an unknown or partially recorded install is refused instead of half-patched.
const guardVersions = compat.supportedVersions.filter((version) => {
  const base = version === '0.4.0' ? path.join(root, 'original') : path.join(root, `upgrade-${version}`, 'upstream')
  return ['lib/index.js', 'assets/whale-widget.js', 'package.json'].every((file) => fs.existsSync(path.join(base, file)))
})

fs.rmSync(dataDir, { recursive: true, force: true })
fs.mkdirSync(path.join(dataDir, 'files', 'lib'), { recursive: true })

// 1) hunks + installed file list + fallback target
const installed = {}
for (const file of ['lib/codex-subscription.mjs', 'lib/client.js', 'lib/index.js', 'assets/whale-widget.js', 'package.json']) installed[file] = true
fs.writeFileSync(path.join(dataDir, 'hunks.json'), `${JSON.stringify({
  supportedVersions: guardVersions,
  files: compat.files,
  installed,
  fallbackTarget: 'C:\\Users\\15593\\.dsh\\profiles\\desktop\\node_modules\\dsh-whale-widget',
}, null, 2)}\n`)

// 2) client declaration block lifted from the patched package.json
fs.writeFileSync(path.join(dataDir, 'client-block.json'), `${JSON.stringify({
  exports: profilePkg.exports,
  client: profilePkg.dsh.client,
}, null, 2)}\n`)

// 3) upstream hashes per supported version (only versions with a complete snapshot)
const upstreamHashes = {}
for (const version of guardVersions) {
  const base = version === '0.4.0' ? path.join(root, 'original') : path.join(root, `upgrade-${version}`, 'upstream')
  const record = {}
  for (const file of ['lib/index.js', 'assets/whale-widget.js']) {
    const full = path.join(base, file)
    if (!fs.existsSync(full)) throw new Error(`缺少 ${version} 的原版快照：${file}`)
    record[file] = sha(fs.readFileSync(full))
  }
  upstreamHashes[version] = record
}
fs.writeFileSync(path.join(dataDir, 'upstream-hashes.json'), `${JSON.stringify(upstreamHashes, null, 2)}\n`)

// 4) helper payloads installed verbatim
for (const file of ['lib/client.js', 'lib/codex-subscription.mjs']) {
  fs.copyFileSync(path.join(root, 'plugin', file), path.join(dataDir, 'files', file))
}
// 5) helper payloads are the only new files the guard introduces
console.log('guard data assembled: ' + compat.supportedVersions.join(' / ') + ', hunks ' + Object.values(compat.files).reduce((n, list) => n + list.length, 0))
