// Controlled restoration for reviewed upstream releases. Never reads user ledgers or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=__dirname,workspace=path.dirname(root);
const target='C:\\Users\\15593\\.dsh\\profiles\\desktop\\node_modules\\dsh-whale-widget';
const spec=JSON.parse(fs.readFileSync(path.join(root,'compat-patches.json'),'utf8'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=(base,file)=>fs.readFileSync(path.join(base,file));
const files=['lib/codex-subscription.mjs','lib/client.js','lib/index.js','assets/whale-widget.js','package.json'];
const helpers='upgrade-0.4.1/previous-patched';
function expected(version,file){const source=version==='0.4.0'?'original':'upgrade-'+version+'/upstream';return read(path.join(root,source),file)}
// Prove the projection only adds: every upstream byte outside a replaced anchor must survive.
function assertUpstreamPreserved(version,file,projected){
  let rest=expected(version,file).toString('utf8');
  for(const change of spec.files[file]){
    const at=rest.indexOf(change.before);
    if(at<0)throw Error('锚点在上游中缺失：'+file+':'+change.line);
    rest=rest.slice(0,at)+'\u0000'+rest.slice(at+change.before.length);
  }
  for(const chunk of rest.split('\u0000'))if(chunk&&!projected.includes(chunk))throw Error('上游内容未被保留：'+file);
}
function project(version,file,input){
  if(sha(input)!==sha(expected(version,file)))throw Error('上游原版哈希不匹配，停止覆盖：'+file);
  let result=input.toString('utf8');
  for(const change of spec.files[file]){const count=result.split(change.before).length-1;if(count!==1)throw Error('源码锚点不唯一或不兼容：'+file+':'+change.line);result=result.replace(change.before,change.after)}
  return Buffer.from(result,'utf8');
}
function packageProjection(input){
  const pkg=JSON.parse(input.toString('utf8'));
  if(pkg.exports && (typeof pkg.exports!=='object'||Array.isArray(pkg.exports)))throw Error('新版exports格式未支持，停止');
  if(pkg.exports?.['./client'] && pkg.exports['./client']!=='./lib/client.js')throw Error('已有其它客户端导出，停止覆盖');
  pkg.exports={...(pkg.exports||{}),'.':pkg.exports?.['.']||'./lib/index.js','./client':'./lib/client.js','./package.json':pkg.exports?.['./package.json']||'./package.json','./cordis.patch.yml':pkg.exports?.['./cordis.patch.yml']||'./cordis.patch.yml'};
  const previous=JSON.parse(read(path.join(root,helpers),'package.json').toString('utf8'));
  if(pkg.dsh?.client)throw Error('新版已声明官方客户端，请人工适配，停止覆盖');
  pkg.dsh={...pkg.dsh,client:previous.dsh.client};
  return Buffer.from(JSON.stringify(pkg,null,2)+'\n','utf8');
}
function candidate(version,rawPackage){return {
  'lib/codex-subscription.mjs':read(path.join(root,helpers),'lib/codex-subscription.mjs'),
  'lib/client.js':read(path.join(root,helpers),'lib/client.js'),
  'lib/index.js':project(version,'lib/index.js',read(target,'lib/index.js')),
  'assets/whale-widget.js':project(version,'assets/whale-widget.js',read(target,'assets/whale-widget.js')),
  'package.json':packageProjection(rawPackage)
}}
function selfTest(){
  for(const version of spec.supportedVersions){
    const upstream={};
    for(const file of Object.keys(spec.files))upstream[file]=expected(version,file);
    for(const file of Object.keys(spec.files)){
      const projected=project(version,file,upstream[file]).toString('utf8');
      assertUpstreamPreserved(version,file,projected);
      // The release's own version marker must survive the projection.
      const markers=upstream[file].toString('utf8').split("'"+version+"'").length-1;
      if(markers>0&&projected.split("'"+version+"'").length-1!==markers)throw Error('上游版本标记数量变化：'+file);
    }
  }
  const newest=spec.supportedVersions[spec.supportedVersions.length-1];
  const relative='lib/index.js';const original=expected(newest,relative);
  if(!project(newest,relative,original).toString('utf8').includes("const BUILD_VERSION = '"+newest+"'"))throw Error('新版后端版本标记未保留');
  const frontend=expected(newest,'assets/whale-widget.js').toString('utf8');
  if(!frontend.includes('frameEditShapeBoxOnCanvas')||!frontend.includes('// v879'))throw Error('新版前端缺少预期的编辑/命中修复，需人工复核');
  let refused=false;try{project(newest,relative,Buffer.concat([original,Buffer.from('\n// changed upstream\n')]))}catch(e){refused=true}
  if(!refused)throw Error('变更上游拒绝测试失败');
  console.log('兼容测试通过：'+spec.supportedVersions.join(' / ')+' 全部锚点并保留上游内容；未知源码哈希拒绝。');
}
function main(){
  const mode=process.argv[2]||'--prepare';
  if(mode==='--self-test'){selfTest();return}
  if(!['--prepare','--install','--check'].includes(mode))throw Error('使用 --prepare / --install / --check / --self-test');
  if(fs.realpathSync(target).toLowerCase()!==target.toLowerCase())throw Error('安装路径与预期不符，停止');
  const raw=read(target,'package.json'),pkg=JSON.parse(raw.toString('utf8'));
  if(pkg.name!=='dsh-whale-widget'||!spec.supportedVersions.includes(pkg.version))throw Error('尚未验证插件版本 '+pkg.version+'；停止自动改写，请重新检查新版差异');
  const receiptFile=path.join(root,'receipts',pkg.version+'.json');
  if(fs.existsSync(receiptFile)){
    const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
    if(files.every(file=>fs.existsSync(path.join(target,file))&&sha(read(target,file))===receipt.hashes[file])){console.log('补丁完整且文件校验通过，无需重复安装。版本 '+pkg.version);return}
  }
  if(mode==='--check'){console.log('补丁缺失或不完整。支持版本：'+pkg.version+'；运行恢复入口以检查并重应用。');return}
  const projected=candidate(pkg.version,raw),baseline={};
  for(const file of files){const full=path.join(target,file);baseline[file]=fs.existsSync(full)?read(target,file):null;
    if(!Object.hasOwn(spec.files,file)&&file!=='package.json'&&baseline[file]&&sha(baseline[file])!==sha(projected[file]))throw Error('已有其它客户端/辅助模块，停止覆盖：'+file);
  }
  for(const [file,bytes] of Object.entries(projected)){const dest=path.join(root,'plugin',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes)}
  // Test against the actual installed accounting dependency, not an older bundled copy.
  if(sha(read(target,'lib/accounting.mjs'))!==sha(read(path.join(root,'plugin'),'lib/accounting.mjs')))throw Error('新版 accounting.mjs 已变化，需先人工同步并复核测试');
  if(mode==='--prepare'){console.log('已暂存 '+pkg.version+' 兼容补丁；上游版本与新增代码保留。');return}
  for(const file of ['lib/index.js','lib/client.js','assets/whale-widget.js']){
    const result=cp.spawnSync(process.execPath,['--check',path.join(root,'plugin',file)],{stdio:'inherit'});if(result.status!==0)throw Error('语法检查失败：'+file)
  }
  for(const test of ['test.mjs','test-follow.mjs']){const result=cp.spawnSync(process.execPath,[path.join(root,test)],{cwd:workspace,stdio:'inherit'});if(result.status!==0)throw Error('回归测试失败，未安装：'+test)}
  // Validate again after tests to refuse concurrent package upgrades.
  for(const file of files){const full=path.join(target,file),now=fs.existsSync(full)?read(target,file):null;if((now===null)!==(baseline[file]===null)||now&&sha(now)!==sha(baseline[file]))throw Error('测试期间插件发生变化，未安装：'+file)}
  const backup=path.join(root,'restore-backups',pkg.version+'-'+Date.now());
  for(const file of files)if(baseline[file]){const dest=path.join(backup,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,baseline[file])}
  const written=[];
  try{
    // Manifest last: native loader cannot see a half-installed client declaration.
    for(const file of files){fs.writeFileSync(path.join(target,file),projected[file]);written.push(file);if(sha(read(target,file))!==sha(projected[file]))throw Error('安装后哈希不匹配：'+file)}
  }catch(error){
    // Restore only pre-existing files. New inert helper files can remain safely without the manifest.
    for(const file of written.reverse())if(baseline[file])fs.writeFileSync(path.join(target,file),baseline[file]);
    throw error;
  }
  fs.mkdirSync(path.dirname(receiptFile),{recursive:true});
  fs.writeFileSync(receiptFile,JSON.stringify({version:pkg.version,target,backup,hashes:Object.fromEntries(files.map(file=>[file,sha(projected[file])]))},null,2)+'\n');
  console.log('已恢复并校验 '+pkg.version+'：Codex记账、模型跟随、紧凑气泡。请重启DSH加载后端和客户端声明。');
}
try{main()}catch(error){console.error(error.message);process.exitCode=1}
