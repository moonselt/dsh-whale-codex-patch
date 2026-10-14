import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import path from 'node:path'
const root=import.meta.dirname
const text=fs.readFileSync(path.join(root,'plugin/assets/whale-widget.js'),'utf8')
const block=text.split('// WHALE_MODEL_ROLE_START')[1]?.split('// WHALE_MODEL_ROLE_END')[0]
assert(block,'role block must be present')
const calls=[]
const context=vm.createContext({IMG_URL:'/dsh-whale/image.png',whaleFollowDeepSeek:s=>s.provider==='deepseek-account'||s.provider==='deepseek',whaleFollowSelection:null,roleList:[],currentRole:{id:'default'},img:{getAttribute:()=>'/dsh-whale/image.png'},applyRole:(...args)=>calls.push(args)})
vm.runInContext(block,context)
const roles=[{id:'default',name:'小鲸鱼',url:'/dsh-whale/image.png'},{id:'role_gpt_dragon',name:'GPT 小龙娘',url:'/dsh-whale/role-image.png?id=role_gpt_dragon'}]
context.roleList=roles
for(const [provider,model,expected] of [['openai-codex','gpt-6.1-sol','role_gpt_dragon'],['openai','gpt-6-astra','role_gpt_dragon'],['deepseek-account','deepseek-v4-pro','default'],['google','gemini-3','none']]){
  context.whaleFollowSelection={provider,model};context.currentRole={id:expected==='default'?'role_gpt_dragon':'default'};calls.length=0;context.whaleSyncModelRole();assert.equal(calls[0]?.[0]||'none',expected,provider+'/'+model);if(calls.length){assert.equal(calls[0][3],true);if(expected==='role_gpt_dragon')assert.match(calls[0][2],/v=face-2$/)}
}
context.roleList=roles.filter(r=>r.id!=='role_gpt_dragon');context.whaleFollowSelection={provider:'openai-codex',model:'gpt-6-sol'};calls.length=0;context.whaleSyncModelRole();assert.equal(calls.length,0,'missing asset must not force an invalid role')
assert(text.includes('if (nextKey !== previousKey) whaleSyncModelRole()'),'session selection event triggers role switch')
assert(text.includes('if (whaleSyncModelRole()) return'),'async role load must trigger role switch')
assert(text.includes("if (!automatic) { try { localStorage.setItem('dshw-role', id)"),'automatic switch must not overwrite manual preference')
const follow=text.split('// WHALE_MODEL_FOLLOW_START')[1]?.split('// WHALE_MODEL_FOLLOW_END')[0]
assert(follow)
const ui=vm.createContext({apiPlanCountdownShortText:()=> '2h26m'})
vm.runInContext(follow,ui)
const view=ui.whaleFollowView({provider:'openai-codex',model:'gpt-6-sol',usage:{rateLimits:[{id:'codex',windows:[{usedPercent:53,windowSeconds:18000,resetsAt:1800000000},{usedPercent:29,windowSeconds:604800,resetsAt:1800000000}]}]}},[],Date.now())
const modules=[{type:'text',text:'DeepSeek 余额',color:'#536ba9'},{type:'balance',color:'#536ba9'},{type:'today',color:'#536ba9'},{type:'peak',color:'#536ba9'}]
const colored=ui.whaleFollowModules(modules,view)
assert.equal(colored[0].color,'#66588b');assert.equal(colored[1].color,'#7462a8');assert.equal(colored[2].color,'#917db0');assert.equal(colored[3].color,'#8f7bac')
assert.equal(ui.whaleFollowView({provider:'deepseek-account'},[],Date.now()),null)
assert(text.includes("labelEl.style.color = modelView && modelView.subscription ? '#66588b' : ''"))
console.log('GPT / DeepSeek role projection, face cache and palette passed')
