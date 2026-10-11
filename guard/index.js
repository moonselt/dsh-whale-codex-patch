// dsh-whale-patch-guard
//
// 小鲸鱼挂件（dsh-whale-widget）每次升级都会整包替换，本地补丁随之消失。
// 本插件在 DSH 启动时（以及检测到安装目录变动时）把补丁重放回去：
//   只有「插件名 + 版本在白名单 + 原版文件哈希与记录一致 + 每个源码锚点唯一」四条同时成立才写盘；
//   任何一条不成立都只记录告警、绝不动文件。
//
// 写盘顺序刻意把 package.json 放最后：客户端模块声明一旦生效，宿主就会去加载 lib/client.js，
// 所以辅助文件必须先在位。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import vm from 'node:vm'
import cp from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Cordis 插件名。 */
export const name = 'whale-patch-guard'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(here, 'data')
const receiptDir = path.join(here, 'receipts')
const backupRoot = path.join(here, 'backups')
const packageName = 'dsh-whale-widget'
const watchedNames = ['package.json', 'lib', 'assets']
const WATCH_DEBOUNCE_MS = 3000

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const spec = readJson(path.join(dataDir, 'hunks.json'))
const clientBlock = readJson(path.join(dataDir, 'client-block.json'))
const upstreamHashes = readJson(path.join(dataDir, 'upstream-hashes.json'))
const helperFiles = Object.keys(spec.installed).filter((file) => file !== 'lib/index.js' && file !== 'assets/whale-widget.js' && file !== 'package.json')

/** 安装目录：优先用运行环境给出的 profile 目录，退回构建时记录的本机路径。 */
function targetDir() {
  const profile = process.env.DSH_PROFILE_DIR || (process.env.DSH_HOME ? path.join(process.env.DSH_HOME, 'profiles', 'desktop') : '')
  return profile ? path.join(profile, 'node_modules', packageName) : spec.fallbackTarget
}

/** 原子替换：同目录临时文件 + rename，避免半截文件被加载。 */
function writeFileAtomic(file, buffer) {
  const tmp = `${file}.guard-${process.pid}.tmp`
  fs.writeFileSync(tmp, buffer)
  fs.renameSync(tmp, file)
}

/** 收据：记录某个版本被守护写成的最终哈希，避免每次启动重算。 */
function writeReceipt(version, dir, hashes) {
  fs.mkdirSync(receiptDir, { recursive: true })
  writeFileAtomic(path.join(receiptDir, `${version}.json`), Buffer.from(`${JSON.stringify({ version, target: dir, hashes }, null, 2)}\n`, 'utf8'))
}

/**
 * 安装结果是否已经是我们的补丁（用于收据丢失时认领，而不是误判成"上游被改过"）。
 * 只认我们特有的标记，不看时间戳之类易变信息。
 * @param dir - 挂件安装目录。
 * @returns 是否已处于补丁状态。
 */
function patchedSignature(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (!pkg.exports || pkg.exports['./client'] !== clientBlock.exports['./client']) return false
    if (!pkg.dsh || !pkg.dsh.client || pkg.dsh.client.platform !== 'web') return false
    for (const file of helperFiles) if (!fs.existsSync(path.join(dir, file))) return false
    const backend = fs.readFileSync(path.join(dir, 'lib/index.js'), 'utf8')
    if (!backend.includes("from './codex-subscription.mjs'")) return false
    const frontend = fs.readFileSync(path.join(dir, 'assets/whale-widget.js'), 'utf8')
    return frontend.includes('WHALE_MODEL_FOLLOW_START') && frontend.includes('WHALE_MODEL_FOLLOW_END')
  } catch (error) {
    return false
  }
}

/** 重放补丁。返回 {status, version?, detail?}。 */
function restore() {
  const dir = targetDir()
  const pkgFile = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgFile)) return { status: 'absent' }
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
  } catch (error) {
    return { status: 'unreadable', detail: String(error && error.message || error) }
  }
  if (pkg.name !== packageName) return { status: 'foreign', detail: String(pkg.name) }
  const version = String(pkg.version || '')
  if (!spec.supportedVersions.includes(version)) return { status: 'unsupported', version }

  const files = Object.keys(spec.installed)
  // 外部已经打好补丁（例如手工跑过恢复脚本）：认领它并补写收据，不改动任何文件。
  if (patchedSignature(dir)) {
    writeReceipt(version, dir, Object.fromEntries(files.filter((file) => fs.existsSync(path.join(dir, file))).map((file) => [file, sha(fs.readFileSync(path.join(dir, file)))])))
    return { status: 'intact', version }
  }
  const receiptFile = path.join(receiptDir, `${version}.json`)
  if (fs.existsSync(receiptFile)) {
    try {
      const receipt = readJson(receiptFile)
      const intact = files.every((file) => {
        const full = path.join(dir, file)
        return fs.existsSync(full) && sha(fs.readFileSync(full)) === receipt.hashes[file]
      })
      if (intact) return { status: 'intact', version }
    } catch (error) {
      // 收据损坏：当作未打补丁，继续走重放。
    }
  }

  // 1) 原版与锚点校验（读只读，不落盘）
  const baseline = {}
  for (const file of files) {
    const full = path.join(dir, file)
    baseline[file] = fs.existsSync(full) ? fs.readFileSync(full) : null
  }
  const projections = {}
  for (const file of ['lib/index.js', 'assets/whale-widget.js']) {
    const input = baseline[file]
    if (!input) return { status: 'incomplete', version, detail: file }
    const recorded = upstreamHashes[version] && upstreamHashes[version][file]
    if (!recorded) return { status: 'no-baseline', version, detail: file }
    if (sha(input) !== recorded) return { status: 'baseline-mismatch', version, detail: file }
    let text = input.toString('utf8')
    for (const change of spec.files[file]) {
      const count = text.split(change.before).length - 1
      if (count !== 1) return { status: 'anchor-mismatch', version, detail: `${file}:${change.line}` }
      text = text.replace(change.before, change.after)
    }
    // 锚点之外的原文必须逐字节保留：防止新版正文被顺手改掉。
    let rest = input.toString('utf8')
    for (const change of spec.files[file]) {
      const at = rest.indexOf(change.before)
      rest = rest.slice(0, at) + '\u0000' + rest.slice(at + change.before.length)
    }
    for (const chunk of rest.split('\u0000')) {
      if (chunk && !text.includes(chunk)) return { status: 'content-loss', version, detail: file }
    }
    projections[file] = Buffer.from(text, 'utf8')
  }
  for (const file of helperFiles) projections[file] = fs.readFileSync(path.join(dataDir, 'files', file))
  const packageProjection = projectPackage(baseline['package.json'], version)
  if (!packageProjection.ok) return { status: 'package-refused', version, detail: packageProjection.reason }
  projections['package.json'] = Buffer.from(packageProjection.text, 'utf8')

  // 2) 语法自检：ESM 走 node --check，前端是经典脚本走 vm 编译。
  try {
    for (const file of ['lib/index.js', 'lib/client.js', 'lib/codex-subscription.mjs']) {
      const tmp = path.join(dataDir, `.check-${process.pid}.mjs`)
      fs.writeFileSync(tmp, projections[file])
      const result = cp.spawnSync(process.execPath, ['--check', tmp], { stdio: 'ignore', timeout: 20000 })
      fs.rmSync(tmp, { force: true })
      if (result.status !== 0) return { status: 'syntax', version, detail: file }
    }
    new vm.Script(projections['assets/whale-widget.js'].toString('utf8'))
  } catch (error) {
    return { status: 'syntax', version, detail: String(error && error.message || error) }
  }
  const frontend = projections['assets/whale-widget.js'].toString('utf8')
  if (!frontend.includes('WHALE_MODEL_FOLLOW_START') || !frontend.includes('WHALE_MODEL_FOLLOW_END')) return { status: 'marker', version, detail: 'assets/whale-widget.js' }

  // 3) 备份 + 写入（package.json 最后）
  const backup = path.join(backupRoot, `${version}-${Date.now()}`)
  for (const file of files) {
    if (!baseline[file]) continue
    const dest = path.join(backup, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, baseline[file])
  }
  const order = [...helperFiles, 'lib/index.js', 'assets/whale-widget.js', 'package.json']
  const written = []
  try {
    for (const file of order) {
      const full = path.join(dir, file)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      writeFileAtomic(full, projections[file])
      written.push(file)
    }
  } catch (error) {
    // 只回滚本来就存在的文件；新装的辅助文件在声明未生效时无害。
    for (const file of written.reverse()) {
      if (baseline[file]) fs.writeFileSync(path.join(dir, file), baseline[file])
    }
    return { status: 'write-failed', version, detail: String(error && error.message || error) }
  }
  fs.mkdirSync(receiptDir, { recursive: true })
  writeReceipt(version, dir, Object.fromEntries(files.map((file) => [file, sha(projections[file])])))
  return { status: 'restored', version, backup }
}

/** 在新版 package.json 上补 exports['./client'] 与 dsh.client 声明。 */
function projectPackage(input, version) {
  if (!input) return { ok: false, reason: 'package.json 缺失' }
  let pkg
  try {
    pkg = JSON.parse(input.toString('utf8'))
  } catch (error) {
    return { ok: false, reason: 'package.json 不是合法 JSON' }
  }
  if (pkg.exports && (typeof pkg.exports !== 'object' || Array.isArray(pkg.exports))) return { ok: false, reason: 'exports 格式未支持' }
  if (pkg.exports && pkg.exports['./client'] && pkg.exports['./client'] !== clientBlock.exports['./client']) return { ok: false, reason: '已有其它客户端导出' }
  if (pkg.dsh && pkg.dsh.client) return { ok: false, reason: '新版已自带客户端声明' }
  pkg.exports = { ...(pkg.exports || {}), ...clientBlock.exports }
  pkg.dsh = { ...(pkg.dsh || {}), client: clientBlock.client }
  return { ok: true, text: `${JSON.stringify(pkg, null, 2)}\n` }
}

const messages = {
  absent: '未找到小鲸鱼挂件目录，跳过补丁检查。',
  unreadable: '小鲸鱼 package.json 读不出来，跳过补丁检查：',
  foreign: '同名目录不是小鲸鱼挂件，跳过：',
  unsupported: '小鲸鱼版本尚未适配本次补丁，未做任何修改：',
  incomplete: '小鲸鱼安装目录不完整，未做修改：',
  'no-baseline': '缺少该版本的原版哈希记录，未做修改：',
  'baseline-mismatch': '原版文件与记录不符（可能被改过或安装中断），未做修改：',
  'anchor-mismatch': '源码锚点不再唯一，未做修改：',
  'content-loss': '重放会丢掉上游原文，未做修改：',
  'package-refused': 'package.json 未满足重放前提，未做修改：',
  syntax: '重放结果语法自检未通过，未做修改：',
  marker: '重放结果缺少模型跟随标记，未做修改：',
  'write-failed': '写入失败，已回滚到原文件：',
}

/**
 * 挂载守护：先跑一次补丁检查，再监听安装目录变化。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx) {
  const logger = ctx && ctx.logger ? ctx.logger : console
  const report = (result) => {
    if (result.status === 'intact') return
    if (result.status === 'restored') {
      logger.info(`whale-patch-guard：已把小鲸鱼 ${result.version} 的 Codex 补丁重放回去（备份 ${result.backup}）。`)
      return
    }
    const text = `${messages[result.status] || '未知状态：'}${result.detail ? ' ' + result.detail : ''}${result.version ? `（版本 ${result.version}）` : ''}`
    if (result.status === 'unsupported' || result.status.startsWith('baseline') || result.status.startsWith('anchor') || result.status === 'content-loss') logger.warn(`whale-patch-guard：${text}`)
    else logger.info(`whale-patch-guard：${text}`)
  }
  try {
    report(restore())
  } catch (error) {
    logger.warn(`whale-patch-guard：检查过程出错，未做修改：${String(error && error.message || error)}`)
  }
  const dir = targetDir()
  const watchers = []
  let timer = null
  const onChange = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      try {
        const result = restore()
        if (result.status === 'restored') logger.warn(`whale-patch-guard：检测到小鲸鱼被更新，已重放补丁（版本 ${result.version}）。后端与客户端模块需要重启 DSH 才会加载。`)
        else report(result)
      } catch (error) {
        logger.warn(`whale-patch-guard：更新后重放出错：${String(error && error.message || error)}`)
      }
    }, WATCH_DEBOUNCE_MS)
  }
  for (const entry of watchedNames) {
    const full = path.join(dir, entry)
    if (!fs.existsSync(full)) continue
    try {
      watchers.push(fs.watch(full, { persistent: false, recursive: false }, onChange))
    } catch (error) {
      // 监听不可用不影响启动时的那次检查。
    }
  }
  const dispose = () => {
    if (timer) clearTimeout(timer)
    for (const watcher of watchers) {
      try { watcher.close() } catch (error) {}
    }
    watchers.length = 0
  }
  if (ctx && typeof ctx.effect === 'function') ctx.effect(() => dispose, 'whale-patch-guard: 安装目录监听')
  return dispose
}
