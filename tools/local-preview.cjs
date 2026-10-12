const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const passwords={yyf:'local-yyf-password-123',zxr:'local-zxr-password-123'};
async function startPreview({port=8765,backendPort=8877,quiet=false}={}){
 const state=path.join(root,'.wrangler','local-demo-'+Date.now());fs.mkdirSync(state,{recursive:true});
 const api='http://127.0.0.1:'+backendPort,website='http://127.0.0.1:'+port;
 const config=path.join(state,'wrangler.json');
 fs.writeFileSync(config,JSON.stringify({name:'diary-local-demo',main:path.join(root,'tests/fixtures/local-worker.mjs').replace(/\\/g,'/'),compatibility_date:'2026-10-11',workers_dev:false,
  vars:{YYF_PASSWORD:passwords.yyf,ZXR_PASSWORD:passwords.zxr,SESSION_SECRET:'local-demo-secret-12345678901234567890',JSONBIN_KEY:'fake-key-local-only',JSONBIN_BIN_ID:'a'.repeat(24),ALLOWED_ORIGINS:website},
  durable_objects:{bindings:[{name:'DIARY_STORE',class_name:'DiaryObject'}]},migrations:[{tag:'v1',new_sqlite_classes:['DiaryObject']}]}));
 const child=spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',config,'--local','--ip','127.0.0.1','--port',String(backendPort),'--persist-to',path.join(state,'storage')],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 let output='';child.stdout.on('data',chunk=>output=(output+chunk).slice(-5000));child.stderr.on('data',chunk=>output=(output+chunk).slice(-5000));
 const server=http.createServer((req,res)=>{
  try{
   const pathname=new URL(req.url,website).pathname;
   if(pathname==='/js/config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.CrushDiary={API_BASE_URL:${JSON.stringify(api)}};`);return;}
   const relative=pathname==='/'?'index.html':pathname.slice(1);
   if(!/^(?:[a-z]+\.html|(?:js|css|shared)\/[\w/.-]+)$/.test(relative))throw new Error('Not public');
   const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw new Error('Not public');
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.extname(target)]||'application/octet-stream');
   let content=fs.readFileSync(target);
   if(relative.endsWith('.html'))content=content.toString().replace(/<body([^>]*)>/,'<body$1><p style="color:#854b23;text-align:center">本地模拟调试 · 不连接真实记录</p>');
   res.end(content);
  }catch(_){res.writeHead(404);res.end('Not found');}
 });
 function stop(){server.close();child.kill();}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  let ready=false;
  for(let n=0;n<150;n++){
   if(child.exitCode!==null)throw new Error('Local Worker stopped: '+output);
   try{const response=await fetch(api+'/health');if(response.ok&&(await response.json()).configured){ready=true;break;}}catch(_){}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready)throw new Error('Local Worker did not become ready: '+output);
  if(!quiet)console.log('本地模拟预览：'+website+'\nYYF 测试密码：'+passwords.yyf+'\nZXR 测试密码：'+passwords.zxr+'\n真实记录不会被读取或修改。按 Ctrl+C 停止。');
  return {website,api,passwords,stop};
 }catch(error){stop();throw error;}
}
module.exports={startPreview};
if(require.main===module)startPreview().then(preview=>{process.once('SIGINT',()=>{preview.stop();process.exit();});process.once('SIGTERM',()=>{preview.stop();process.exit();});}).catch(error=>{console.error(error.message);process.exitCode=1;});
