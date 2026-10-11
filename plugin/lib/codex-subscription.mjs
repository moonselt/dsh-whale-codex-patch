// Subscription usage is not an API bill. Never turn its tokens into CNY.
export const CODEX_WIDGET_ID = 'codex-subscription'
export const CODEX_PROVIDER = 'openai-codex'
export const CODEX_BUCKET_PREFIX = '__codex_subscription__:'
export function isCodexSource(source) { return source?.provider === CODEX_PROVIDER }
export function isCodexEvent(event) { return event?.provider === CODEX_PROVIDER && event?.usageSource === 'subscription-tokens' }

export function subscriptionStats(events, today) {
  const rows = (Array.isArray(events) ? events : []).filter(isCodexEvent)
  const days = new Map()
  const models = new Map()
  let totalTokens = 0, monthTokens = 0
  for (const row of rows) {
    const tokens = Number(row.tokens)
    if (!Number.isSafeInteger(tokens) || tokens < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.day || '')) continue
    totalTokens += tokens
    if (row.day.slice(0, 7) === today.slice(0, 7)) monthTokens += tokens
    days.set(row.day, (days.get(row.day) || 0) + tokens)
    const name = String(row.model || '未知')
    models.set(name, (models.get(name) || 0) + tokens)
  }
  const base = Date.parse(today + 'T00:00:00+08:00')
  const days7 = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(base - i * 86400000 + 8 * 3600000).toISOString().slice(0, 10)
    return { day, tokens: days.get(day) || 0 }
  })
  return {
    ok: true, source: 'dsh-subscription', todayTokens: days.get(today) || 0,
    monthTokens, totalTokens, days7, events: rows.length,
    models: Array.from(models, ([model, tokens]) => ({ model, tokens })),
    note: '仅统计接入后 DSH 已完成的会话事件（本地保留期内），不是订阅金额或全部历史用量',
  }
}

export function subscriptionPlan(usage) {
  if (!usage || !Array.isArray(usage.rateLimits)) return { ok: false, error: 'Codex 额度响应无效' }
  const limit = usage.rateLimits.find(item => item?.id === 'codex')
  const windows = (Array.isArray(limit?.windows) ? limit.windows : []).flatMap((w, i) => {
    if (!Number.isFinite(w?.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100 || !Number.isSafeInteger(w.windowSeconds) || w.windowSeconds <= 0) return []
    const seconds = w.windowSeconds
    const key = seconds === 18000 ? 'rolling' : seconds === 604800 ? 'weekly' : 'window-' + i
    const label = seconds % 86400 === 0 ? seconds / 86400 + '天' : seconds % 3600 === 0 ? seconds / 3600 + 'h' : Math.round(seconds / 60) + '分钟'
    return [{ key, label, usedPct: w.usedPercent, resetAt: Number.isSafeInteger(w.resetsAt) && w.resetsAt > 0 ? w.resetsAt * 1000 : null }]
  })
  if (!windows.length) return { ok: false, error: '账号未返回 Codex 主额度窗口（不是额度为零）' }
  return { ok: true, windows, level: typeof usage.planType === 'string' ? usage.planType : '', fetchedAt: Number.isFinite(usage.fetchedAt) ? usage.fetchedAt : null }
}

// Dispatch only the read-only, authenticated host route; no OAuth records or
// bearer tokens are read by this plugin. The caller supplies the admitted request.
export async function readSubscriptionUsage(connection, req) {
  if (!connection || typeof connection.requestRejection !== 'function' || typeof connection.createSharedFetchHandler !== 'function') return null
  const denial = connection.requestRejection(req)
  if (denial !== undefined && denial !== null && denial !== false) return { ok: false, error: 'Codex 额度请求未通过宿主认证' }
  const rpcId = 'whale-codex-usage'
  const response = await connection.createSharedFetchHandler('/api').fetch(new Request('http://localhost/api/codex-subscription/usage', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'codex-subscription/usage', payload: { force: false } }),
    signal: AbortSignal.timeout(18000),
  }))
  if (response.status === 404) return null
  if (!response.ok) return { ok: false, error: 'Codex 额度接口暂不可用（HTTP ' + response.status + '）' }
  const envelope = await response.json()
  if (envelope?.type !== 'server-response' || envelope.rpcId !== rpcId) return { ok: false, error: 'Codex 额度响应格式无效' }
  const result = envelope.result
  if (!result?.ok) {
    const message = result?.error?.message
    return { ok: false, error: message === 'ChatGPT subscription is not signed in' ? '请先在设置 → Codex 订阅中登录' : message === 'ChatGPT sign-in needs to be renewed' ? 'Codex 登录已过期，请重新登录' : '无法读取 Codex 额度，请在 Codex 订阅设置中检查' }
  }
  return subscriptionPlan(result.value)
}
