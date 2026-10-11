// Validate the profile patch: structure, target entry, and effective routes.
const fs = require('node:fs')
const path = 'C:/Users/15593/.dsh/profiles/desktop/cordis.patch.yml'
const bytes = fs.readFileSync(path)
if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('patch file gained a UTF-8 BOM')
const YAML = require('C:/Users/15593/.dsh/profiles/desktop/node_modules/yaml')
const doc = YAML.parse(bytes.toString('utf8'))
if (!Array.isArray(doc)) throw new Error('profile patch must stay a YAML sequence')
const owned = doc.filter((row) => row && row.id === 'subagent-model-selection-settings')
if (owned.length !== 1) throw new Error('expected exactly one settings row, found ' + owned.length)
const config = owned.at(-1).config
if (config.enabled !== true) throw new Error('enabled is not true')
const routes = config.allowedModels
if (!Array.isArray(routes) || routes.length === 0) throw new Error('allowedModels must be a non-empty array')
const seen = new Set()
for (const route of routes) {
  if (typeof route.provider !== 'string' || typeof route.model !== 'string' || !route.provider || !route.model) throw new Error('malformed route ' + JSON.stringify(route))
  const key = route.provider + '/' + route.model
  if (seen.has(key)) throw new Error('duplicate route ' + key)
  seen.add(key)
}
const declared = doc.find((row) => row && row.id === 'subagent-model-selection-settings').name
if (declared !== '@deepseek-ai/dsh-tool-subagent/model-selection-settings') throw new Error('entry name mismatch: ' + declared)
const untouched = doc.filter((row) => row && row.insert)
console.log('patch rows: ' + doc.length + ', insert rows preserved: ' + untouched.length)
console.log('enabled: true')
for (const route of routes) console.log('allowed: ' + route.provider + '/' + route.model)
