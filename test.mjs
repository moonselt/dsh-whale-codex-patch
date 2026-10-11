import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CODEX_PROVIDER, subscriptionPlan, subscriptionStats, readSubscriptionUsage, isCodexSource } from './plugin/lib/codex-subscription.mjs'
const tests = []
function test(name, fn) { tests.push([name, fn]) }
const fixture = { fetchedAt: Date.now(), planType: 'pro', rateLimits: [{ id: 'codex', windows: [{ usedPercent: 12, windowSeconds: 18000, resetsAt: 1800000000 }, { usedPercent: 31, windowSeconds: 604800 }] }, { id: 'code_review', windows: [{ usedPercent: 99, windowSeconds: 18000 }] }] }
const event = (day, tokens, model='gpt-test') => ({ day, tokens, model, provider: CODEX_PROVIDER, usageSource: 'subscription-tokens', cost: 0 })
test('按 provider 区分订阅与 OpenAI API', () => { assert.equal(isCodexSource({provider:'openai',model:'gpt-test'}), false); assert.equal(isCodexSource({provider:CODEX_PROVIDER}),true) })
test('主额度窗口、秒转毫秒且排除 code review', () => { const p=subscriptionPlan(fixture); assert.equal(p.windows.length,2); assert.equal(p.windows[0].resetAt,1800000000000); assert.equal(p.windows[0].usedPct,12); assert.equal(p.windows[0].key,'rolling'); assert.equal(p.windows[1].key,'weekly'); assert.equal(p.windows[1].resetAt,null) })
test('未知窗口、缺失与无效额度不伪装成零', () => { assert.equal(subscriptionPlan({rateLimits:[]}).ok,false); assert.equal(subscriptionPlan({rateLimits:[{id:'codex',windows:[{usedPercent:null,windowSeconds:18000}]}]}).ok,false); assert.equal(subscriptionPlan({rateLimits:[{id:'codex',windows:[{usedPercent:0,windowSeconds:3600}]}]}).windows[0].usedPct,0) })
test('北京时间日/月/近七天聚合，不混入 API 事件', () => { const s=subscriptionStats([event('2026-10-01',100),event('2026-09-30',200),event('2026-10-01',300,'gpt-b'),{day:'2026-10-01',tokens:999,provider:'openai'}],'2026-10-01'); assert.equal(s.todayTokens,400); assert.equal(s.monthTokens,400); assert.equal(s.totalTokens,600); assert.equal(s.days7.reduce((n,d)=>n+d.tokens,0),600); assert.equal(s.models.length,2) })
const transport = (body, status=200) => ({requestRejection(){},createSharedFetchHandler(channel){ assert.equal(channel,'/api');return {async fetch(req){const e=await req.json();assert.equal(e.method,'codex-subscription/usage');assert.deepEqual(e.payload,{force:false});return new Response(JSON.stringify(body),{status})}}}})
test('复用只读 authenticated route 与标准 envelope', async () => { const p=await readSubscriptionUsage(transport({type:'server-response',rpcId:'whale-codex-usage',result:{ok:true,value:fixture}}),{});assert.equal(p.ok,true) })
test('未认证不调用额度、404插件缺失与业务失败', async () => { assert.equal((await readSubscriptionUsage({requestRejection(){return 401},createSharedFetchHandler(){throw Error('must not call')}},{})).ok,false);assert.equal(await readSubscriptionUsage(transport({},404),{}),null);assert.equal((await readSubscriptionUsage(transport({type:'server-response',rpcId:'whale-codex-usage',result:{ok:false,error:{message:'ChatGPT subscription is not signed in'}}}),{})).error,'请先在设置 → Codex 订阅中登录') })

// Run the complete plugin against isolated workspace storage and host mocks.
const home = path.resolve('codex-whale/test-home')
fs.mkdirSync(home,{recursive:true})
process.env.DSH_HOME=home
const preservedDay = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0,10)
const oldLedger = { date:preservedDay, todayUsage:7, history:{[preservedDay]:7}, events:[{day:preservedDay,ts:Date.now()-86400000,model:'old-api',tokens:1,cost:7}], settings:{} }
fs.writeFileSync(path.join(home,'.dshw-usage.json'),JSON.stringify(oldLedger))
const plugin = (await import('./plugin/lib/index.js')).default
const handlers = new Map(), routes = new Map(), effects = []
const conn = transport({type:'server-response',rpcId:'whale-codex-usage',result:{ok:true,value:fixture}})
const ctx = {
  on(name, fn){ const list=handlers.get(name)||[];list.push(fn);handlers.set(name,list);return ()=>{} },
  effect(fn){ effects.push(fn) }, inject(names, fn){fn(ctx)}, get(name){return name==='connection'?conn:null},
  credentials:{async resolve(){return null}},
  webServer:{register(r){routes.set(r.path,r.handler);return ()=>{}},tapIndex(){return ()=>{}}},
}
plugin.apply(ctx)
function emit(name,...args){for(const fn of handlers.get(name)||[])fn(...args)}
async function request(url) { let status=200, body='';const req={method:'GET',url,headers:{host:'127.0.0.1:19387'},socket:{remoteAddress:'127.0.0.1'}}; const res={writeHead(s){status=s},end(s){body=s||''},set statusCode(s){status=s}};await routes.get(url)(req,res);assert.equal(status,200);return JSON.parse(body) }
const session={id:'test-codex'}
function message(session,model,provider,turn=1){emit('session/event',session,{type:'assistant/message',data:{turn,usage:{inputTokens:100,cacheReadTokens:20,outputTokens:30,reasoningTokens:10},message:{source:{provider,model}}}})}
function end(session,turn=1){emit('session/event',session,{type:'turn/end',data:{turn}})}
test('完整插件：零金额 Codex 轮次照常写 token，完成提示无伪造金额', async () => {message(session,'gpt-test',CODEX_PROVIDER);end(session);const d=await request('/dsh-whale/last-turn.json');assert.equal(d.amount,null);assert.equal(d.tokens,150);assert.equal(d.codexTokens,150);const list=await request('/dsh-whale/api-models.json');const m=list.models.find(m=>m.id==='codex-subscription');assert.equal(m.codex.todayTokens,150);assert.equal(m.todayUsage,null);assert.equal(m.plan.windows[0].usedPct,12);assert.equal(m.canAdjustBalance,false) })
test('完整插件：订阅事件不进入人民币明细，旧账保留', async () => {const records=await request('/dsh-whale/usage-records.json');assert.equal(records.today.models.some(m=>m.model==='gpt-test'),false);assert.equal(records.codexSubscription.todayTokens,150);const led=JSON.parse(fs.readFileSync(path.join(home,'.dshw-usage.json'),'utf8'));assert.equal(led.history[preservedDay],7);assert.equal(led.events.find(e=>e.model==='gpt-test').cost,0) })
test('完整插件：API 与订阅同模型的混合轮次隔离，按会话结算', async () => {const a={id:'mixed'},b={id:'other'};message(a,'same-model',CODEX_PROVIDER);message(a,'same-model','deepseek');message(b,'gpt-second',CODEX_PROVIDER);end(b);end(a);const led=JSON.parse(fs.readFileSync(path.join(home,'.dshw-usage.json'),'utf8'));const same=led.events.filter(e=>e.model==='same-model');assert.equal(same.length,2);assert.equal(same.find(e=>e.provider===CODEX_PROVIDER).cost,0);assert.ok(same.find(e=>!e.provider).cost>0);assert.equal((await request('/dsh-whale/api-models.json')).models.find(m=>m.id==='codex-subscription').codex.todayTokens,450) })
test('混合轮次中缺失 source/model 的 API 消耗不漏记', async () => { const s={id:'missing-source'}; message(s,'gpt-test',CODEX_PROVIDER); emit('session/event',s,{type:'assistant/message',data:{turn:1,usage:{inputTokens:100,cacheReadTokens:20,outputTokens:30},message:{}}}); end(s); const led=JSON.parse(fs.readFileSync(path.join(home,'.dshw-usage.json'),'utf8'));const unknown=led.events.find(e=>e.model==='未知');assert.ok(unknown.cost>0);assert.equal(unknown.tokens,150);assert.equal((await request('/dsh-whale/api-models.json')).models.find(m=>m.id==='codex-subscription').codex.todayTokens,600) })
test('前端：只展示账号实际窗口，陈旧选择回退全部', async () => { const vm=await import('node:vm');const js=fs.readFileSync('codex-whale/plugin/assets/whale-widget.js','utf8');const part=js.slice(js.indexOf('var BUBBLE_PLAN_WIN_OPTS ='),js.indexOf('// 该模型的厂商模板是否声明了多窗口额度'));const context={apiModelById(){return {id:'codex-subscription',subscription:true}},apiPlanWinList(){return [{key:'window-0',label:'1h'}]}};vm.createContext(context);vm.runInContext(part,context);const m={modelId:'codex-subscription',planWin:'monthly'};assert.equal(context.bubblePlanWinOf(m),'all');assert.equal(context.bubblePlanWindowOptions(m).length,2);m.planWin='window-0';assert.equal(context.bubblePlanWinOf(m),'window-0');assert.equal(context.bubblePlanWinLabel('window-0',m),'1h');assert.ok(js.includes("subscriptionEvent ? apiFmtTokens(ev.tokens) + ' tokens' : usageMoney(ev.cost)")) })
for(const [name,fn] of tests){await fn();console.log('PASS '+name)}
console.log(`${tests.length} tests passed`)
for(const fn of effects){const dispose=fn();if(typeof dispose==='function')dispose()}
