// Rewrite the subagent model allowlist: keep the verified routes, append free-tier catalog routes.
const fs = require('node:fs')
const file = 'C:/Users/15593/.dsh/profiles/desktop/cordis.patch.yml'
const text = fs.readFileSync(file, 'utf8')
const marker = '# 子智能体模型选择'
const entry = '- id: subagent-model-selection-settings'
const start = text.indexOf(marker)
const entryAt = text.indexOf(entry)
if (start < 0 || entryAt < start) throw new Error('allowlist block not found; refusing to rewrite')
const routes = [
  ['deepseek-account', 'deepseek-flash'],
  ['deepseek-account', 'deepseek-v4-pro'],
  ['openai-codex', 'gpt-6.1-sol'],
  ['openrouter', 'google/gemma-4-31b-it:free'],
  ['openrouter', 'nvidia/nemotron-3-super-120b-a12b:free'],
  ['google', 'gemma-4-31b-it'],
  ['nvidia', 'nvidia/nemotron-3.5-lightning-30b-a3b'],
  ['nvidia', 'openai/gpt-oss-20b'],
  ['zai', 'glm-5.3-highspeed'],
  ['zai', 'glm-5.2-highspeed'],
]
const seen = new Set()
for (const [provider, model] of routes) {
  if (seen.has(provider + '/' + model)) throw new Error('duplicate route ' + provider + '/' + model)
  seen.add(provider + '/' + model)
}
const block = [
  '# 子智能体模型选择：允许 Agent 从下列授权模型中为每个子代理指定 provider / model / 推理强度。',
  '# 仅影响新会话（策略在会话开始时写入会话记录）。',
  '# pi-ai 提供方（openrouter / google / nvidia / zai）需先在「设置 → 模型」里填好对应 API key 才可用。',
  entry,
  "  name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings'",
  '  config:',
  '    enabled: true',
  '    allowedModels:',
  ...routes.map(([provider, model]) => `      - provider: ${provider}\n        model: ${model}`),
  '',
].join('\n')
fs.writeFileSync(file, text.slice(0, start) + block, 'utf8')
console.log('routes written: ' + routes.length)
