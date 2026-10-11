const fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('codex-whale/plugin/assets/whale-widget.js','utf8');
const between=(a,b)=>{const x=s.indexOf(a),y=s.indexOf(b,x+1);if(x<0||y<0)throw Error(a);return s.slice(x,y)};
const cssCtx={};vm.createContext(cssCtx);const cssStart=s.indexOf('var css = [');const cssEnd=s.indexOf("].join('\\n')",cssStart)+"].join('\\n')".length;vm.runInContext(s.slice(cssStart,cssEnd),cssCtx);
const frameCtx={};vm.createContext(frameCtx);vm.runInContext(between('var FRAME_CLASSIC_BIG_D =','// ===== v823'),frameCtx);
const sources=[between('// WHALE_MODEL_FOLLOW_START','// WHALE_MODEL_FOLLOW_END'),between('function apiModelById(id) {','function apiCanAdjustBalance(model) {'),between('function apiPlanOf(modelId) {','function bubbleTplHelpItems(m) {'),between('function bubbleContentText(m, autoTxt) {','function bubblePeakModuleLabel(m) {'),between('function bubbleModuleFontU(level) {','function bubbleAmountText() {'),between('function bubbleRowKeyOf(m) {','function bubbleRowsFlat(rows) {'),between('function bubbleRowContentOf(mod) {','var bubbleLiveMods'),between('var BUBBLE_DEFAULT_ITEMS = [','function bubbleParseDefaultItems()')];
const helper=`
var textBox=null,bubbleScene={kind:'custom'},apiModels=[],whaleFollowSelection=null;
function apiModelBalanceText(){return '--'} function apiModelTodayText(){return '--'}
function apiQuotaPctText(){return '--'} function apiQuotaUsedText(){return '--'}
function apiQuotaLeftText(){return '--'} function apiQuotaTotalText(){return '--'} function apiQuotaResetText(){return '--'}
function bubbleIsImgMod(m){return m && (m.type==='image'||m.type==='randimg')}
function bubbleIsPeakNow(){return false} function bubbleCountdownIsPeak(){return false}
function bubbleCountdownRegister(){throw Error('Unexpected DeepSeek countdown registration')}
function bubblePeakRowRegister(){throw Error('Unexpected DeepSeek peak registration')}
function bubbleRgbSchemeOk(){return true}
window.onerror=function(message){document.getElementById('report').textContent='FAIL '+message};
`;
const exercise=`
try {
 var failures=[],checks=0;
 var cases=[{name:'截图额度',used:60,week:9},{name:'完整百分比',used:0,week:0},{name:'额度耗尽',used:100,week:100},{name:'小数百分比',used:0.1,week:9.9}];
 [122,200,284,375,625].forEach(function(width){cases.forEach(function(c){
  var now=Date.now(),reset=Math.floor(now/1000)+10560;
  whaleFollowSelection={provider:'openai-codex',model:'gpt-sol',usage:{rateLimits:[{id:'codex',windows:[{usedPercent:c.used,windowSeconds:18000,resetsAt:reset},{usedPercent:c.week,windowSeconds:604800,resetsAt:reset+604800}]}]}};
  var host=document.createElement('div');host.style.cssText='position:relative;width:'+width+'px;height:'+Math.ceil(width*700/1026)+'px;--dshw-base:'+width+'px;font-family:"Segoe UI","Microsoft YaHei",sans-serif;';
  host.innerHTML='<div class="dshwv-pop dshwv-pop-open">'+FRAME_MARKUP+'<div class="dshwv-text"></div></div>';
  document.getElementById('examples').appendChild(host);textBox=host.querySelector('.dshwv-text');
  bubbleRowsTo(textBox,BUBBLE_DEFAULT_ITEMS[0].modules);
  var shape=host.querySelector('.dshwv-bshape'),svg=host.querySelector('svg');
  var rows=Array.from(textBox.querySelectorAll('.dshwv-trow'));
  if(rows.length!==4)failures.push(c.name+width+': row count '+rows.length);
  if(/tokens|今日|\\d\\d:\\d\\d:\\d\\d/.test(textBox.textContent))failures.push(c.name+width+': unwanted tokens/clock');
  rows.forEach(function(row){var box=row.getBoundingClientRect();
    [[box.left,box.top],[box.right,box.top],[box.left,box.bottom],[box.right,box.bottom]].forEach(function(point){
      var local=new DOMPoint(point[0],point[1]).matrixTransform(svg.getScreenCTM().inverse());
      if(!shape.isPointInFill(local))failures.push(c.name+width+': outside frame '+row.textContent);
      checks++;
    });
  });
 })});
 document.getElementById('report').textContent=failures.length?'FAIL '+JSON.stringify(failures):'PASS '+checks+' text-corner checks, 20 native-rendered cards';
}catch(e){document.getElementById('report').textContent='FAIL '+e.stack}
`;
const script=helper+'\n'+sources.join('\n')+'\nvar FRAME_MARKUP='+JSON.stringify(frameCtx.FRAME_CLASSIC_MARKUP)+';\n'+exercise;
fs.writeFileSync('codex-whale/layout-test.html','<!doctype html><meta charset="utf-8"><style>'+cssCtx.css+'\n*{transition:none!important;animation:none!important}body{margin:12px}#examples{display:flex;flex-wrap:wrap;gap:12px}</style><pre id="report">RUNNING</pre><div id="examples"></div><script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>');
console.log('Generated isolated browser test using original CSS/SVG/plan renderer; no login profile or network');
