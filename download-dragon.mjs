import fs from 'node:fs'
import path from 'node:path'
const url='https://raw.githubusercontent.com/Yang-huai406/GPT-Dragon-Girl/main/assets/gpt-chibi.png'
const response=await fetch(url,{signal:AbortSignal.timeout(30000)})
if(!response.ok)throw Error('Image download HTTP '+response.status)
const bytes=Buffer.from(await response.arrayBuffer())
if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Downloaded file is not PNG')
const directory=path.join(import.meta.dirname,'role-assets')
fs.mkdirSync(directory,{recursive:true})
fs.writeFileSync(path.join(directory,'gpt-dragon.png'),bytes)
fs.writeFileSync(path.join(directory,'SOURCE.md'),'# GPT 小龙娘素材\n\n来源：https://github.com/Yang-huai406/GPT-Dragon-Girl\n\n原图：https://raw.githubusercontent.com/Yang-huai406/GPT-Dragon-Girl/main/assets/gpt-chibi.png\n\n仅用于用户本机挂件角色。媒体权利独立于代码 MIT 许可，不声明为 OpenAI 官方授权或原创。\n')
console.log('Downloaded PNG',bytes.length,'bytes')
