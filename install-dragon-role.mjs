import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
const root=import.meta.dirname
const home=process.env.DSH_HOME || path.join(os.homedir(),'.dsh')
const dir=path.join(home,'whale-roles')
const id='role_gpt_dragon'
const image=path.join(dir,id+'.png')
const indexFile=path.join(dir,'roles.json')
const src=path.join(root,'role-assets','gpt-dragon-face.png')
const bytes=fs.readFileSync(src)
if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==768||bytes.readUInt32BE(20)!==768)throw Error('Dragon image is not the expected 768x768 PNG')
const digest=b=>crypto.createHash('sha256').update(b).digest('hex')
fs.mkdirSync(dir,{recursive:true})
const index=fs.existsSync(indexFile)?JSON.parse(fs.readFileSync(indexFile,'utf8')):{version:1,roles:[{id:'default',name:'小鲸鱼',pinnedAt:1,createdAt:0}]}
if(!Array.isArray(index.roles))throw Error('Unexpected roles.json schema')
const existing=index.roles.find(r=>r&&r.id===id)
if(existing&&fs.existsSync(image)){
  const current=fs.readFileSync(image)
  const original=digest(fs.readFileSync(path.join(root,'role-assets','gpt-dragon.png')))
  if(digest(current)!==original&&digest(current)!==digest(bytes))throw Error('Dragon role image was modified outside this patch; refusing overwrite')
  if(digest(current)!==digest(bytes)){
    const backup=image+'.before-face-crop-'+Date.now()+'.bak'
    fs.copyFileSync(image,backup)
    console.log('原角色图片备份:',backup)
  }
}
if(existing&&existing.name!=='GPT 小龙娘')throw Error('Dragon role ID belongs to a differently named role; refusing overwrite')
if(fs.existsSync(indexFile)){const backup=indexFile+'.before-gpt-dragon-'+Date.now()+'.bak';fs.copyFileSync(indexFile,backup);console.log('角色索引备份:',backup)}
if(!existing)index.roles.push({id,name:'GPT 小龙娘',format:'png',pinnedAt:0,createdAt:Date.now()})
fs.writeFileSync(image,bytes)
const tmp=indexFile+'.'+process.pid+'.tmp'
fs.writeFileSync(tmp,JSON.stringify(index,null,2)+'\n','utf8')
fs.renameSync(tmp,indexFile)
console.log('角色已导入:',image,'sha256='+digest(bytes),'角色数='+index.roles.length)
