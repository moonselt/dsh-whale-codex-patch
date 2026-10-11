// Enumerate built-in pi-ai models that the shipped catalog prices at zero.
const fs = require('node:fs')
const path = require('node:path')
const dir = 'codex-whale/research/archive/pi-ai/dist/providers/data'
const rows = []
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.json') || file.startsWith('.')) continue
  const provider = file.slice(0, -5)
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  for (const [api, models] of Object.entries(data)) {
    for (const [key, model] of Object.entries(models || {})) {
      const cost = model.cost || {}
      rows.push({
        provider, api, key,
        id: model.id || key,
        name: model.name || '',
        input: Number(cost.input) || 0,
        output: Number(cost.output) || 0,
        context: model.contextWindow || 0,
        reasoning: model.reasoning === true,
      })
    }
  }
}
const zero = rows.filter((row) => row.input === 0 && row.output === 0)
const byProvider = new Map()
for (const row of zero) {
  if (!byProvider.has(row.provider)) byProvider.set(row.provider, [])
  byProvider.get(row.provider).push(row)
}
console.log('catalog models: ' + rows.length + ', zero-priced: ' + zero.length)
for (const [provider, list] of [...byProvider].sort((a, b) => b[1].length - a[1].length)) {
  console.log('\n## ' + provider + '  (' + list.length + ')')
  for (const row of list.slice(0, 14)) {
    console.log('  ' + row.id + '  | ' + row.name + ' | ctx ' + row.context + (row.reasoning ? ' | reasoning' : ''))
  }
  if (list.length > 14) console.log('  ... +' + (list.length - 14) + ' more')
}
const freeNamed = rows.filter((row) => /free/i.test(row.id) || /free/i.test(row.name))
console.log('\n## ids/names containing "free": ' + freeNamed.length)
for (const row of freeNamed.slice(0, 40)) console.log('  ' + row.provider + '/' + row.id + '  | ' + row.name + ' | in ' + row.input + ' out ' + row.output)
