// Guard behaviour tests: simulate a fresh upstream install, then verify restore/refusal paths.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

const workspace = 'D:/用户/Documents/deepseek-harness/default-workspace'
const guardDir = path.join(workspace, 'codex-whale/guard')
const guard = await import(pathToFileURL(path.join(guardDir, 'index.js')).href)
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
const sandbox = path.join(workspace, 'codex-whale/guard-test')
const version = JSON.parse(fs.readFileSync(path.join(workspace, 'codex-whale/plugin/package.json'), 'utf8')).version
let count = 0
const test = (name, fn) => { fn(); count++; console.log('PASS ' + name) }

/** Lay down a pristine upstream install of one supported version. */
function seed(targetVersion, { mangle = null } = {}) {
  fs.rmSync(sandbox, { recursive: true, force: true })
  const upstream = targetVersion === '0.4.0'
    ? path.join(workspace, 'codex-whale/original')
    : path.join(workspace, `codex-whale/upgrade-${targetVersion}/upstream`)
  const install = path.join(sandbox, 'profile', 'node_modules', 'dsh-whale-widget')
  fs.mkdirSync(path.join(install, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(install, 'assets'), { recursive: true })
  for (const file of ['lib/index.js', 'assets/whale-widget.js']) fs.copyFileSync(path.join(upstream, file), path.join(install, file))
  fs.copyFileSync(path.join(upstream, 'package.json'), path.join(install, 'package.json'))
  fs.copyFileSync(path.join(workspace, 'codex-whale/plugin/lib/accounting.mjs'), path.join(install, 'lib/accounting.mjs'))
  if (mangle) mangle(install)
  process.env.DSH_PROFILE_DIR = path.join(sandbox, 'profile')
  return install
}
const read = (install, file) => fs.readFileSync(path.join(install, file))
const fakeCtx = () => ({ logger: { info() {}, warn() {} }, effect: (fn) => fn() })
const restore = () => guard.apply(fakeCtx())

test('全新 0.4.2 原版：重放补丁并写入收据', () => {
  const install = seed('0.4.2')
  restore()
  const pkg = JSON.parse(read(install, 'package.json').toString('utf8'))
  assert.equal(pkg.exports['./client'], './lib/client.js')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(read(install, 'lib/client.js').length > 0)
  assert.ok(read(install, 'lib/codex-subscription.mjs').length > 0)
  assert.ok(read(install, 'lib/index.js').toString('utf8').includes('CODEX_BUCKET_PREFIX'))
  assert.ok(read(install, 'assets/whale-widget.js').toString('utf8').includes('WHALE_MODEL_FOLLOW_START'))
  const receipt = JSON.parse(fs.readFileSync(path.join(guardDir, 'receipts/0.4.2.json'), 'utf8'))
  assert.equal(receipt.hashes['lib/index.js'], sha(read(install, 'lib/index.js')))
})

test('重复运行：识别为已打补丁，不重复改写', () => {
  const install = path.join(sandbox, 'profile', 'node_modules', 'dsh-whale-widget')
  const before = fs.statSync(path.join(install, 'lib/index.js')).mtimeMs
  restore()
  assert.equal(fs.statSync(path.join(install, 'lib/index.js')).mtimeMs, before)
})

test('外部已打好补丁（无收据）：认领并补写收据，不改动文件', () => {
  const install = seed('0.4.2')
  restore() // 先由守护打一次，模拟"手工脚本打过的状态"
  fs.rmSync(path.join(guardDir, 'receipts'), { recursive: true, force: true })
  const hashes = {}
  for (const file of fs.readdirSync(path.join(install, 'lib'))) hashes['lib/' + file] = sha(read(install, 'lib/' + file))
  const before = { index: sha(read(install, 'lib/index.js')), front: sha(read(install, 'assets/whale-widget.js')) }
  restore()
  const receipt = JSON.parse(fs.readFileSync(path.join(guardDir, 'receipts/0.4.2.json'), 'utf8'))
  assert.equal(receipt.hashes['lib/index.js'], before.index)
  assert.equal(receipt.hashes['assets/whale-widget.js'], before.front)
  assert.equal(sha(read(install, 'lib/index.js')), before.index)
})

test('上游正文被改动：拒绝写入并保持原样', () => {
  const mangled = 'const BUILD_VERSION = '
  const install = seed('0.4.2', { mangle: (dir) => { const file = path.join(dir, 'lib/index.js'); const text = fs.readFileSync(file, 'utf8'); fs.writeFileSync(file, text.replace(mangled, 'const BUILD_VERSION_UNKNOWN = ')) } })
  const before = read(install, 'lib/index.js')
  restore()
  assert.equal(sha(read(install, 'lib/index.js')), sha(before))
  assert.equal(fs.existsSync(path.join(install, 'lib/client.js')), false)
  assert.equal(fs.existsSync(path.join(install, 'package.json.guard')), false)
})

test('未适配的新版本：只告警，不落任何文件', () => {
  const install = seed('0.4.2', { mangle: (dir) => { const file = path.join(dir, 'package.json'); const pkg = JSON.parse(fs.readFileSync(file, 'utf8')); pkg.version = '0.9.9'; fs.writeFileSync(file, JSON.stringify(pkg, null, 2)) } })
  restore()
  assert.equal(JSON.parse(read(install, 'package.json').toString('utf8')).exports, undefined)
  assert.equal(fs.existsSync(path.join(install, 'lib/client.js')), false)
})

test('上游已自行声明客户端模块：停止，不覆盖别人的声明', () => {
  const install = seed('0.4.2', { mangle: (dir) => { const file = path.join(dir, 'package.json'); const pkg = JSON.parse(fs.readFileSync(file, 'utf8')); pkg.dsh = { ...(pkg.dsh || {}), client: { platform: 'web', inject: [] } }; fs.writeFileSync(file, JSON.stringify(pkg, null, 2)) } })
  restore()
  assert.deepEqual(JSON.parse(read(install, 'package.json').toString('utf8')).dsh.client, { platform: 'web', inject: [] })
  assert.equal(fs.existsSync(path.join(install, 'lib/client.js')), false)
})

test('已记录快照的每个版本都能重放', () => {
  const versions = JSON.parse(fs.readFileSync(path.join(guardDir, 'data/hunks.json'), 'utf8')).supportedVersions
  assert.ok(versions.length >= 2)
  for (const target of versions) {
    const install = seed(target)
    restore()
    assert.ok(read(install, 'assets/whale-widget.js').toString('utf8').includes('WHALE_MODEL_FOLLOW_END'), target)
  }
})

test('重放结果与原恢复脚本逐字节一致', () => {
  const install = seed('0.4.2')
  restore()
  for (const file of ['lib/index.js', 'assets/whale-widget.js', 'package.json', 'lib/client.js', 'lib/codex-subscription.mjs']) {
    assert.equal(sha(read(install, file)), sha(fs.readFileSync(path.join(workspace, 'codex-whale/plugin', file))), file)
  }
})
console.log(count + ' guard tests passed')
