// Pure view projection: no writes to bubble configuration or monetary ledger.
function whaleFollowDeepSeek(selection) {
  return !!selection && (selection.provider === 'deepseek' || selection.provider === 'deepseek-account')
}
function whaleFollowWindows(usage, model) {
  if (!usage || !Array.isArray(usage.rateLimits)) return []
  function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') }
  var key = slug(model)
  var exact = usage.rateLimits.filter(function (l) { return slug(l.id) === key || slug(l.name) === key })
  var limits = exact.length ? exact : key === 'gpt-reserve' ? [] : /(^|-)spark($|-)/.test(key)
    ? usage.rateLimits.filter(function (l) { return /(^|-)spark($|-)/.test(slug(l.id)) || /(^|-)spark($|-)/.test(slug(l.name)) })
    : usage.rateLimits.filter(function (l) { return l.id === 'codex' })
  var out = []
  limits.forEach(function (l) {
    ;(Array.isArray(l.windows) ? l.windows : []).forEach(function (w) {
      if (!w || !Number.isFinite(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100 || !Number.isSafeInteger(w.windowSeconds) || w.windowSeconds <= 0) return
      out.push({ used: w.usedPercent, remaining: 100 - w.usedPercent, seconds: w.windowSeconds, reset: Number.isSafeInteger(w.resetsAt) && w.resetsAt > 0 ? w.resetsAt * 1000 : null })
    })
  })
  return out.sort(function (a, b) { return a.seconds - b.seconds })
}
function whaleFollowWindowLabel(seconds) {
  if (seconds === 604800) return '周'
  if (seconds % 86400 === 0) return seconds / 86400 + '天'
  if (seconds % 3600 === 0) return seconds / 3600 + 'h'
  return Math.round(seconds / 60) + '分钟'
}
function whaleFollowPercent(value) { return Number(value).toFixed(1).replace(/\.0$/, '') + '%' }
function whaleFollowReset(reset, now) {
  if (!reset) return '未返回重置时间'
  var left = reset - now
  if (left <= 0) return '等待额度刷新'
  var mins = Math.ceil(left / 60000)
  var days = Math.floor(mins / 1440)
  var hours = Math.floor((mins % 1440) / 60)
  return (days ? days + '天' : '') + (hours ? hours + '小时' : '') + (mins % 60 ? mins % 60 + '分' : '') + '后重置'
}
function whaleFollowView(selection, models, now) {
  if (whaleFollowDeepSeek(selection)) return null
  if (!selection || !selection.provider) return { label: '当前模型', balance: '…', today: '正在读取当前会话模型', peak: '模型加载中…' }
  if (selection.provider !== 'openai-codex') return { label: selection.model || selection.provider, balance: '—', today: '暂未接入该模型的余额或额度', peak: '不适用 DeepSeek 峰谷价' }
  var windows = whaleFollowWindows(selection.usage, selection.model)
  if (!windows.length) return { subscription: true, label: 'Codex 剩余额度', balance: '—', today: '', peak: selection.quotaError || (selection.loading ? '额度加载中…' : '账号未返回该模型额度'), plan: { ok: false, windows: [] } }
  var planWindows = windows.map(function (w, i) { return { key: 'window-' + i, label: whaleFollowWindowLabel(w.seconds), usedPct: w.used, resetAt: w.reset } })
  var first = windows[0]
  var rest = windows.slice(1, 2).map(function (w) { return whaleFollowWindowLabel(w.seconds) + ' ' + whaleFollowPercent(w.remaining) }).join(' · ')
  return { subscription: true, label: 'Codex 剩余额度', balance: whaleFollowWindowLabel(first.seconds) + ' ' + whaleFollowPercent(first.remaining), today: rest,
    peak: first.reset ? apiPlanCountdownShortText(first.reset, now) : '--', plan: { ok: true, windows: planWindows } }
}
function whaleFollowVirtualModel(selection) {
  if (!selection || selection.provider !== 'openai-codex') return null
  var view = whaleFollowView(selection, [], Date.now())
  return { id: '__whale_current_codex__', name: 'Codex 当前模型', provider: 'codex_subscription', subscription: true, planSupport: true, plan: view.plan }
}
function whaleFollowCompactModules(mods, view) {
  function heading(m) { return m && m.type === 'text' && /^\s*(DeepSeek|DS)\s*余额\s*$/i.test(String(m.text || '')) }
  function finance(m) { return m && (!m.modelId || m.modelId === 'deepseek') && (['balance', 'today', 'peak', 'nextpeak', 'bonus', 'recharge'].indexOf(m.type) >= 0 || heading(m)) }
  if (!view.subscription || !mods.some(function (m) { return finance(m) && m.type === 'balance' }) || !mods.every(finance)) return null
  var title = mods.find(heading) || {}
  var amount = mods.find(function (m) { return m.type === 'balance' }) || {}
  var hint = mods.find(function (m) { return m.type === 'today' }) || {}
  // Reuse the existing text/plan modules, original formatter and row renderer.
  // Only whitelist visual properties: no peakStyle=count can reach the ticker.
  function style(source, cap) {
    return { size: Math.min(Number(source.size) || cap, cap), color: source.color || '', rgb: source.rgb || '',
      bold: !!source.bold, fontFamily: source.fontFamily || '', italic: false, ul: false, bg: '', bgRgb: '' }
  }
  var card = [Object.assign(style(title, 5), { type: 'text', text: view.label, row: 1 })]
  if (!view.plan.ok) {
    card.push(Object.assign(style(amount, 16), { type: 'text', text: '—', bold: true, row: 2 }))
    card.push(Object.assign(style(hint, 2), { type: 'text', text: view.peak, row: 3 }))
    return card
  }
  var windows = view.plan.windows
  card.push(Object.assign(style(amount, 16), { type: 'plan', modelId: '__whale_current_codex__', planWin: windows[0].key, tpl: '{plan_left}', bold: true, row: 2 }))
  if (windows.length > 1) card.push(Object.assign(style(hint, 3), { type: 'plan', modelId: '__whale_current_codex__', planWin: windows[1].key, tpl: '{plan_left}', row: 3 }))
  card.push(Object.assign(style(hint, 2), { type: 'plan', modelId: '__whale_current_codex__', planWin: windows[0].key, tpl: '重置 {plan_reset}', row: 4 }))
  return card
}
function whaleFollowModules(mods, view) {
  if (!view || !Array.isArray(mods)) return mods
  var compact = whaleFollowCompactModules(mods, view)
  if (compact) return compact
  return mods.map(function (m) {
    if (!m || typeof m !== 'object') return m
    if (m.modelId && m.modelId !== 'deepseek') return m
    var text = null
    if (m.type === 'balance') text = view.balance
    else if (m.type === 'today') text = view.today
    else if (m.type === 'peak' || m.type === 'nextpeak') text = view.peak
    else if (m.type === 'bonus' || m.type === 'recharge') text = '不适用订阅额度'
    else if (m.type === 'text' && /^\s*(DeepSeek|DS)\s*余额\s*$/i.test(String(m.text || ''))) text = view.label
    if (text === null) return m
    var copy = Object.assign({}, m, { type: 'text', text: text, tpl: '' })
    if (m.type === 'balance' && !m.bold) copy.bold = true
    if (m.type === 'peak' || m.type === 'nextpeak') {
      delete copy.peakStyle
      copy.bg = m.offBg || m.bg || ''
      copy.bgRgb = m.offBgRgb || m.bgRgb || ''
      copy.color = m.offColor || m.color || ''
      copy.rgb = m.offRgb || m.rgb || ''
    }
    return copy
  })
}
