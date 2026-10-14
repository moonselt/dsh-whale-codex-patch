import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {pathToFileURL} from 'node:url'
const root=import.meta.dirname
const profile=process.env.DSH_PROFILE_DIR||'C:\\Users\\15593\\.dsh\\profiles\\desktop'
const widget=path.join(profile,'node_modules','dsh-whale-widget')
const vendor=path.join(profile,'local-plugins','dsh-whale-patch-guard')
const target=path.join(widget,'assets','whale-widget.js')
const source=path.join(root,'plugin','assets','whale-widget.js')
const receipt=JSON.parse(fs.readFileSync(path.join(vendor,'receipts','0.4.2.json'),'utf8'))
const digest=b=>crypto.createHash('sha256').update(b).digest('hex')
if(fs.realpathSync(widget).toLowerCase()!==path.resolve(widget).toLowerCase())throw Error('Unexpected widget path')
if(JSON.parse(fs.readFileSync(path.join(widget,'package.json'),'utf8')).version!=='0.4.2')throw Error('Unsupported installed widget version')
if(receipt.target.toLowerCase()!==widget.toLowerCase())throw Error('Receipt target mismatch')
const current=fs.readFileSync(target)
if(digest(current)!==receipt.hashes['assets/whale-widget.js'])throw Error('Installed widget differs from previous approved receipt; abort')
const next=fs.readFileSync(source)
if(!next.toString('utf8').includes('WHALE_MODEL_ROLE_START'))throw Error('Missing role switch marker')
const stamp=new Date().toISOString().replace(/[:.]/g,'-')
const backup=path.join(root,'restore-backups','dragon-'+stamp)
fs.mkdirSync(backup,{recursive:true})
fs.writeFileSync(path.join(backup,'whale-widget.js'),current)
for(const file of ['index.js','data/hunks.json','data/client-block.json','data/upstream-hashes.json']){
  const existing=path.join(vendor,file)
  if(fs.existsSync(existing)){
    const saved=path.join(backup,'guard',file);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.copyFileSync(existing,saved)
  }
}
const atomic=(file,data)=>{const tmp=file+'.dragon-'+process.pid+'.tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file)}
atomic(target,next)
atomic(path.join(vendor,'index.js'),fs.readFileSync(path.join(root,'guard','index.js')))
for(const file of ['hunks.json','client-block.json','upstream-hashes.json'])atomic(path.join(vendor,'data',file),fs.readFileSync(path.join(root,'guard','data',file)))
console.log('Widget frontend updated: sha256='+digest(fs.readFileSync(target)))
const result=[]
const mod=await import(pathToFileURL(path.join(vendor,'index.js')).href+'?dragon='+Date.now())
mod.apply({logger:{info:m=>result.push('INFO '+m),warn:m=>result.push('WARN '+m)},effect:()=>{}})
if(result.some(s=>s.includes('未做修改')||s.includes('出错')))throw Error('Guard verification failed: '+result.join('; '))
console.log('Guard verified: '+(result.join('; ')||'intact'))
console.log('Backup:',backup)
