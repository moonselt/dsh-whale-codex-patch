// Deploy the whale patch guard into the DSH profile as a first-class bundle.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const here = import.meta.dirname
const profile = process.env.DSH_PROFILE_DIR || 'C:\\Users\\15593\\.dsh\\profiles\\desktop'
const name = 'dsh-whale-patch-guard'
const source = path.join(here, 'guard')
const vendor = path.join(profile, 'local-plugins', name)
const linked = path.join(profile, 'node_modules', name)
const packageFile = path.join(profile, 'package.json')
const dryRun = process.argv.includes('--dry-run')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

// --- 0) sanity: this really is the desktop profile ---------------------------------------
if (fs.realpathSync(profile).toLowerCase() !== path.resolve(profile).toLowerCase()) throw new Error('profile 路径不符，停止')
if (!fs.existsSync(packageFile)) throw new Error('找不到 profile package.json，停止')
const before = readJson(packageFile)
if (before.name !== 'dsh-profile-desktop') throw new Error('profile package.json 名称意外：' + before.name)

// --- 1) stage the guard outside node_modules so package installs cannot prune the source --
if (!dryRun) {
  fs.rmSync(vendor, { recursive: true, force: true })
  fs.mkdirSync(vendor, { recursive: true })
  for (const entry of ['package.json', 'index.js', 'cordis.patch.yml']) fs.copyFileSync(path.join(source, entry), path.join(vendor, entry))
  fs.cpSync(path.join(source, 'data'), path.join(vendor, 'data'), { recursive: true })
}

// --- 2) declare the dependency and put its bundle before the widget ----------------------
const after = JSON.parse(JSON.stringify(before))
after.dependencies[name] = `file:local-plugins/${name}`
const bundles = after.dsh.profile.bundles.filter((entry) => entry !== name)
const widgetAt = bundles.indexOf('dsh-whale-widget')
if (widgetAt < 0) throw new Error('bundles 里找不到 dsh-whale-widget，停止')
// Mount first: the guard rewrites the widget's files before the loader imports them.
bundles.splice(widgetAt, 0, name)
after.dsh.profile.bundles = bundles
if (JSON.stringify(after) !== JSON.stringify(before)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = path.join(here, 'settings-backup', `profile-package.json.${stamp}`)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  fs.copyFileSync(packageFile, backup)
  if (!dryRun) writeJson(packageFile, after)
  console.log('profile package.json 已更新（备份 ' + backup + '）')
} else {
  console.log('profile package.json 已是最新，无需改动')
}

// --- 3) make the package resolvable without touching the pnpm lockfile ------------------
if (!dryRun) {
  if (fs.existsSync(linked) && fs.lstatSync(linked).isSymbolicLink()) fs.rmSync(linked, { recursive: true, force: true })
  if (!fs.existsSync(linked)) fs.symlinkSync(vendor, linked, 'junction')
  const require = createRequire(packageFile)
  const resolved = require.resolve(`${name}/package.json`)
  if (fs.realpathSync(path.dirname(resolved)).toLowerCase() !== fs.realpathSync(vendor).toLowerCase()) throw new Error('解析到的守护包路径不符：' + resolved)
  if (readJson(resolved).dsh.bundle.patch !== './cordis.patch.yml') throw new Error('守护包未声明 bundle patch')
  console.log('守护包可被 profile 解析：' + resolved)
}

// --- 4) run the guard once in place; a healthy install reports nothing ------------------
process.env.DSH_PROFILE_DIR = profile
const guard = await import(pathToFileURL(path.join(dryRun ? source : vendor, 'index.js')).href)
const reported = []
guard.apply({ logger: { info: (message) => reported.push('INFO ' + message), warn: (message) => reported.push('WARN ' + message) }, effect: () => {} })
if (reported.length === 0) console.log('守护自检：当前安装已是完整补丁，未做修改')
else for (const line of reported) console.log(line)
console.log('部署完成。守护会在启动时先于小鲸鱼挂件运行，所以下次重启 DSH 后即生效。')
