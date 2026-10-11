const fs = require('node:fs');
const file='codex-whale/plugin/assets/whale-widget.js';
let s=fs.readFileSync(file,'utf8');
function edit(from,to){const n=s.split(from).length-1;if(n!==1)throw Error('Unexpected match '+n+': '+from.slice(0,80));s=s.replace(from,to)}
const core=fs.readFileSync('codex-whale/follow-core.js','utf8');
const wiring=`
var whaleFollowSelection = window.__dshWhaleCurrentModel || null
var whaleFollowRendered = ''
function bubbleFollowRefresh(force) {
  try {
    if (!bubbleShown || !bubbleScene || (bubbleScene.kind !== 'normal' && bubbleScene.kind !== 'custom')) return
    var view = whaleFollowView(whaleFollowSelection, apiModels, Date.now())
    var signature = JSON.stringify(view)
    if (!force && signature === whaleFollowRendered) return
    whaleFollowRendered = signature
    if (bubbleScene.kind === 'normal') render()
    else if (bubbleLiveMods) bubbleRowsTo(textBox, whaleFollowModules(bubbleLiveMods, view))
  } catch (err) {}
}
window.addEventListener('dsh-whale:current-model', function (event) {
  whaleFollowSelection = event.detail || null
  if (animId) { cancelAnimationFrame(animId); animId = null }
  shown = state.balance
  bubbleFollowRefresh(true)
  try { loadApiModels(function () { bubbleFollowRefresh(true) }, true) } catch (err) {}
})
`;
edit('var apiModels = [] // 最近一次拉到的模型列表（含实时余额 / 今日已用）','// WHALE_MODEL_FOLLOW_START\n'+core+'// WHALE_MODEL_FOLLOW_END\n'+wiring+'\nvar apiModels = [] // 最近一次拉到的模型列表（含实时余额 / 今日已用）');
edit('        apiModelsFlushWaiters()\n        return','        apiModelsFlushWaiters()\n        bubbleFollowRefresh(true)\n        return');
edit('    bubbleRowsTo(textBox, mods)\n  } catch (err) {}\n}\n// 编辑器真实泡泡预览',`    var liveView = bubbleScene && bubbleScene.kind === 'custom' ? whaleFollowView(whaleFollowSelection, apiModels, Date.now()) : null
    bubbleRowsTo(textBox, whaleFollowModules(mods, liveView))
  } catch (err) {}
}
// 编辑器真实泡泡预览`);
edit(`function animateAmount(from, to, currency, duration) {`, `function animateAmount(from, to, currency, duration) {
  if (!whaleFollowDeepSeek(whaleFollowSelection)) {
    if (animId) cancelAnimationFrame(animId)
    animId = null
    shown = to
    bubbleFollowRefresh(true)
    return
  }`);
edit(`    if (costBubbleActive) {
      animId = null
      return
    }`, `    if (costBubbleActive || !whaleFollowDeepSeek(whaleFollowSelection)) {
      animId = null
      shown = to
      return
    }`);
edit(`  if (costBubbleActive) return
  var amount, hint`, `  if (costBubbleActive) return
  var modelView = whaleFollowView(whaleFollowSelection, apiModels, Date.now())
  if ((!bubbleScene || bubbleScene.kind === 'normal') && modelView) {
    labelEl.textContent = modelView.label
    amountEl.textContent = modelView.balance
    setHint(modelView.today + ' · ' + modelView.peak)
    return
  }
  if (!bubbleScene || bubbleScene.kind === 'normal') labelEl.textContent = 'DeepSeek 余额'
  var amount, hint`);
edit(`setInterval(function () { pollLastTurn(); pollWaitState() }, 1000)`, `setInterval(function () { pollLastTurn(); pollWaitState(); bubbleFollowRefresh(false) }, 1000)`);
fs.writeFileSync(file,s);
console.log('Installed model-follow rendering in staged widget');
