window.__ModuleLoader__.load({
  id: 'dsh-whale-widget',
  factory: function () {
    function apply(ctx) {
      ctx.effect(function () {
        var main = ctx.get('uiSession').current
        var panels = ctx.get('layout').panelInfo
        var connection = ctx.get('connection')
        var directory = null, unwatchDirectory = null, selectionKey = '', current = null
        var controller = null, quotaTimeout = null, epoch = 0, disposed = false
        function publish(value) {
          if (disposed) return
          current = value
          window.__dshWhaleCurrentModel = value
          window.dispatchEvent(new CustomEvent('dsh-whale:current-model', { detail: value }))
        }
        function cancelQuota() { epoch++; if (quotaTimeout !== null) clearTimeout(quotaTimeout); quotaTimeout = null; if (controller) controller.abort(); controller = null }
        function safeUsage(value) {
          return { fetchedAt: Number.isFinite(value && value.fetchedAt) ? value.fetchedAt : null,
            rateLimits: (value && Array.isArray(value.rateLimits) ? value.rateLimits : []).map(function (l) {
              return { id: String(l.id || ''), name: typeof l.name === 'string' ? l.name : '',
                windows: (Array.isArray(l.windows) ? l.windows : []).map(function (w) {
                  return { usedPercent: w.usedPercent, windowSeconds: w.windowSeconds, resetsAt: w.resetsAt }
                }) }
            }) }
        }
        function quotaError(result) {
          var message = result && result.error && result.error.message
          if (message === 'ChatGPT subscription is not signed in') return '请先登录 Codex 订阅'
          if (message === 'ChatGPT sign-in needs to be renewed') return 'Codex 登录过期，请重新登录'
          return 'Codex 额度暂不可用'
        }
        function loadQuota(clear) {
          if (!current || current.provider !== 'openai-codex') return
          cancelQuota()
          var generation = epoch, expected = selectionKey
          var request = new AbortController()
          controller = request
          if (clear) publish(Object.assign({}, current, { usage: null, quotaError: '', loading: true }))
          var timeout = setTimeout(function () { request.abort() }, 18000)
          quotaTimeout = timeout
          connection.rpc.call('/api', 'codex-subscription/usage', { force: false }, request.signal)
            .then(function (result) {
              if (disposed || generation !== epoch || expected !== selectionKey) return
              publish(Object.assign({}, current, { usage: result && result.ok ? safeUsage(result.value) : null,
                loading: false, quotaError: result && result.ok ? '' : quotaError(result) }))
            }).catch(function () {
              if (disposed || generation !== epoch || expected !== selectionKey) return
              publish(Object.assign({}, current, { usage: null, loading: false, quotaError: 'Codex 额度读取超时或连接失败' }))
            }).finally(function () { clearTimeout(timeout); if (quotaTimeout === timeout) quotaTimeout = null; if (controller === request) controller = null })
        }
        function readSelection() {
          var selected = directory && directory.store.getSnapshot().current
          var owner = main.getSnapshot()
          var nextKey = selected ? JSON.stringify([owner.key, selected.provider, selected.model]) : ''
          if (nextKey === selectionKey) return
          cancelQuota()
          selectionKey = nextKey
          if (!selected) { publish(null); return }
          publish({ sessionId: owner.key, provider: selected.provider, model: selected.model,
            usage: null, quotaError: '', loading: selected.provider === 'openai-codex' })
          loadQuota(false)
        }
        function bindMain() {
          var owner = main.getSnapshot()
          var panel = panels.getSnapshot().activePanelId
          var next = null
          if (panel == null && owner && owner.key && owner.ctx) {
            try { next = owner.ctx.get('modelDirectories').directoryFor(owner.key) } catch (err) {}
          }
          if (next === directory) { readSelection(); return }
          if (unwatchDirectory) unwatchDirectory()
          unwatchDirectory = null
          directory = next
          cancelQuota()
          selectionKey = ''
          publish(null)
          if (!directory) return
          unwatchDirectory = directory.store.subscribe(readSelection)
          readSelection()
          // Read-only catalogue load; never selects or modifies a model.
          directory.load().catch(function () {})
        }
        function resetQuota() { loadQuota(true) }
        var unwatchMain = main.subscribe(bindMain)
        var unwatchPanels = panels.subscribe(bindMain)
        var unwatchReset = ctx.on('connection/reset', function () { resetQuota(); bindMain() })
        window.addEventListener('dsh-codex-subscription:refresh-quick-quota', resetQuota)
        var timer = setInterval(function () { loadQuota(false) }, 60000)
        publish(null)
        bindMain()
        return function () {
          if (unwatchDirectory) unwatchDirectory()
          unwatchMain(); unwatchPanels(); if (unwatchReset) unwatchReset()
          window.removeEventListener('dsh-codex-subscription:refresh-quick-quota', resetQuota)
          clearInterval(timer); cancelQuota()
          publish(null)
          disposed = true
        }
      }, 'whale-widget: follow visible session model')
    }
    return { apply: apply, inject: ['connection', 'uiSession', 'modelDirectories', 'layout'] }
  }
})
