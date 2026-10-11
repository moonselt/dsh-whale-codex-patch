const fs = require('node:fs');
const backend = 'codex-whale/plugin/lib/index.js';
const frontend = 'codex-whale/plugin/assets/whale-widget.js';
let b = fs.readFileSync(backend, 'utf8'), f = fs.readFileSync(frontend, 'utf8');
function replace(s, from, to, all=false) {
  const count = s.split(from).length - 1;
  if ((!all && count !== 1) || (all && count < 1)) throw new Error('Unexpected match count ' + count + ': ' + from.slice(0,100));
  return all ? s.split(from).join(to) : s.replace(from,to);
}
b = replace(b, "import fs from 'node:fs'", "import { CODEX_WIDGET_ID, CODEX_PROVIDER, CODEX_BUCKET_PREFIX, isCodexSource, isCodexEvent, subscriptionStats, readSubscriptionUsage } from './codex-subscription.mjs'\nimport fs from 'node:fs'");
b = replace(b, 'if (agg && agg.cost > 0) {', 'if (agg && (agg.cost > 0 || agg.tokens > 0)) {');
b = replace(b, 'lastTurn = { turn: agg.turn, amount: agg.cost, tokens: agg.tokens, ts: agg.lastTs }', 'lastTurn = { turn: agg.turn, amount: agg.codexTokens && !agg.apiMessages ? null : agg.cost, tokens: agg.tokens, codexTokens: agg.codexTokens || 0, ts: agg.lastTs }');
b = replace(b, `            appendUsageEvent({ ts: agg.lastTs, model: mname, cost: byModel[mname], tokens: byModelTokens[mname] || 0 })`, `            const subscription = mname.startsWith(CODEX_BUCKET_PREFIX)
            const modelName = subscription ? mname.slice(CODEX_BUCKET_PREFIX.length) : mname
            appendUsageEvent({ ts: agg.lastTs, model: modelName, cost: byModel[mname], tokens: byModelTokens[mname] || 0,
              ...(subscription ? { provider: CODEX_PROVIDER, usageSource: 'subscription-tokens' } : {}) })`);
b = replace(b, '            apiAttributeEvent(mname, byModel[mname], byModelTokens[mname] || 0)', '            if (!subscription) apiAttributeEvent(mname, byModel[mname], byModelTokens[mname] || 0)');
b = replace(b, `        const model = d.message && d.message.source ? d.message.source.model : ''`, `        const source = d.message && d.message.source
        const model = source ? source.model : ''
        if (isCodexSource(source)) {
          const key = CODEX_BUCKET_PREFIX + String(model || '未知')
          agg.codexTokens = (agg.codexTokens || 0) + toks
          agg.byModel[key] = 0
          agg.byModelTokens[key] = (agg.byModelTokens[key] || 0) + toks
          agg.lastTs = Date.now()
          return
        }
        agg.apiMessages = (agg.apiMessages || 0) + 1`);
b = replace(b, '        tokens: Math.round(Number(ev.tokens) || 0),', `        tokens: Math.round(Number(ev.tokens) || 0),
        ...(isCodexEvent(ev) ? { provider: CODEX_PROVIDER, usageSource: 'subscription-tokens' } : {}),`);
b = replace(b, '          if (e.day !== day) continue', '          if (e.day !== day || isCodexEvent(e)) continue');
b = replace(b, `        settings: readUsageSettings(),\n      }\n    }\n    // 用量相关设置`, `        codexSubscription: subscriptionStats(events, today),
        settings: readUsageSettings(),
      }
    }
    // 用量相关设置`);
b = replace(b, `    function apiModelById(id) {\n      if (String(id || '') === API_BUILTIN_ID) return apiBuiltinModel()`, `    function apiCodexSubscriptionModel() {
      return { id: CODEX_WIDGET_ID, name: 'Codex 订阅', provider: 'codex_subscription', currency: 'CNY', keyRef: '', builtin: true, matchIds: [] }
    }
    function apiModelById(id) {
      if (String(id || '') === CODEX_WIDGET_ID) return apiCodexSubscriptionModel()
      if (String(id || '') === API_BUILTIN_ID) return apiBuiltinModel()`);
b = replace(b, '    async function apiModelsPayload() {', '    async function apiModelsPayload(req) {');
b = replace(b, `        out.push(entry)\n      }\n      return {\n        ok: true,\n        builtinId: API_BUILTIN_ID,`, `        out.push(entry)
      }
      // Reuse the installed subscription plugin's safe projection only after host authentication.
      let subscriptionPlan = null
      if (req) {
        try { subscriptionPlan = await readSubscriptionUsage(connectionFence(), req) }
        catch (err) { subscriptionPlan = { ok: false, error: 'Codex 额度读取超时或暂不可用' } }
      }
      const stats = subscriptionStats(readUsageLedger().events, todayKey())
      if (subscriptionPlan || stats.events) {
        out.push({ ...apiCodexSubscriptionModel(), subscription: true, hasKey: true, hasBalanceApi: false,
          canAdjustBalance: false, balanceMode: 'subscription', balance: null, todayUsage: null,
          usageSource: 'subscription-tokens', codex: stats, planSupport: true,
          plan: subscriptionPlan || { ok: false, error: 'Codex 订阅插件未启用' },
          error: null, settings: settings.models && settings.models[CODEX_WIDGET_ID] || null })
      }
      return {
        ok: true,
        builtinId: API_BUILTIN_ID,`);
b = replace(b, 'await apiModelsPayload()', 'await apiModelsPayload(req)', true);
b = replace(b, 'tokens: lastTurn.tokens, ts: lastTurn.ts', 'tokens: lastTurn.tokens, codexTokens: lastTurn.codexTokens || 0, ts: lastTurn.ts');
// Frontend: reuse the subscription-window module, but do not offer API bill controls.
f = replace(f, "else if (am.codex && am.codex.ok) infoTxt = apiCodexRowText(am)", "else if (am.codex && am.codex.ok) infoTxt = apiCodexRowText(am) + (am.subscription && planOn ? (' · ' + apiPlanSummary(am.id)) : '')");
f = replace(f, "    rowOf('余额预警', function () {", "    if (!m.subscription) {\n    rowOf('余额预警', function () {");
f = replace(f, "      function () { openModelQuotaEditor(modelId) })\n    // Codex 模式", "      function () { openModelQuotaEditor(modelId) })\n    }\n    // Codex 模式");
f = replace(f, "      var ct = document.createElement('div')\n      ct.className = 'dshwv-audiorow'", "      if (!m.subscription) {\n      var ct = document.createElement('div')\n      ct.className = 'dshwv-audiorow'");
f = replace(f, '      card.appendChild(ct)\n      // 用量行', '      card.appendChild(ct)\n      }\n      // 用量行');
f = replace(f, "    btns.appendChild(apiBtn('密钥 / 接口', 'dshwv-bubbtn dshwv-bubbtn-no', function () { openApiModelPanel(modelId) }))", "    if (!m.subscription) btns.appendChild(apiBtn('密钥 / 接口', 'dshwv-bubbtn dshwv-bubbtn-no', function () { openApiModelPanel(modelId) }))");
f = replace(f, "  var txt = 'Codex 今日 '", "  var txt = (am.subscription ? 'DSH Codex 今日 ' : 'Codex 今日 ')");
f = replace(f, "  var s = '今日 ' + apiFmtTokens(c.todayTokens)", "  var s = '今日 ' + apiFmtTokens(c.todayTokens)");
f = replace(f, "    '（' + (c.sessions || 0) + ' 个会话文件）'", "    (c.source === 'dsh-subscription' ? '（接入后 DSH 记录；非金额）' : '（' + (c.sessions || 0) + ' 个会话文件）')");
f = replace(f, '  if (!am) return false\n  var list = apiTemplates || []', '  if (!am) return false\n  if (am.subscription) return true\n  var list = apiTemplates || []');
// Monetary history remains separate. Subscription detail is shown on its own model row.
fs.writeFileSync(backend,b); fs.writeFileSync(frontend,f);
console.log('Patched backend and frontend');
