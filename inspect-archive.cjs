const fs = require('node:fs');
const fd = fs.openSync('D:/DeepSeek Harness/resources/app.asar', 'r');
const h = Buffer.alloc(16); fs.readSync(fd,h,0,16,0);
const b = Buffer.alloc(h.readUInt32LE(12)); fs.readSync(fd,b,0,b.length,16);
const root = JSON.parse(b.toString());
function walk(files,p='') { for(const [n,v] of Object.entries(files)) { const q=p+'/'+n; if(v.files) walk(v.files,q); else if(/connection|protocol/.test(q) && /\.(js|ts)$/.test(q)) { console.log(q); const data=Buffer.alloc(v.size); fs.readSync(fd,data,0,data.length,8+h.readUInt32LE(4)+Number(v.offset)); const out='codex-whale/core'+q; fs.mkdirSync(require('node:path').dirname(out),{recursive:true}); fs.writeFileSync(out,data); } } }
walk(root.files); fs.closeSync(fd);
