const fs=require('node:fs');
const file='codex-whale/plugin/assets/whale-widget.js';
let s=fs.readFileSync(file,'utf8');
const start=s.indexOf('// WHALE_MODEL_FOLLOW_START\n');
const end=s.indexOf('// WHALE_MODEL_FOLLOW_END',start);
if(start<0||end<0)throw Error('Missing follow core markers');
s=s.slice(0,start)+'// WHALE_MODEL_FOLLOW_START\n'+fs.readFileSync('codex-whale/follow-core.js','utf8')+s.slice(end);
function edit(from,to){if(s.split(from).length!==2)throw Error('Unexpected match: '+from);s=s.replace(from,to)}
edit('function apiModelById(id) {\n  for',"function apiModelById(id) {\n  if (id === '__whale_current_codex__') return whaleFollowVirtualModel(whaleFollowSelection)\n  for");
edit('function apiPlanCountdownShortText(ms) {\n  var left = ms - Date.now()','function apiPlanCountdownShortText(ms, now) {\n  var left = ms - (now === undefined ? Date.now() : now)');
edit("    setHint(modelView.today + ' · ' + modelView.peak)","    var resetHint = modelView.subscription && modelView.plan.ok ? '重置 ' + modelView.peak : modelView.peak\n    setHint([modelView.today, resetHint].filter(Boolean).join(' · '))");
fs.writeFileSync(file,s);
console.log('Compact Codex card reuses native text/plan modules');
