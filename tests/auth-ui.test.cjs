const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup({configured=true,blockedStorage=false}={}) {
 const local=new Map(),session=new Map(),calls=[],classes=new Set();
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:false,disabled:false,textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},focus(){},appendChild(){}});
  return nodes.get(id);
 };
 const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>{if(blockedStorage)throw new Error('storage blocked');map.set(key,value);},removeItem:key=>map.delete(key)});
 const cd={API_BASE_URL:configured?'https://fake-api.invalid':'',store:{cloudData:{messages:[{text:'pending'}]},isSyncing:false},saveLocalBackup:()=>{},defaultCloudData:()=>({}),isCloudEmpty:()=>false,setStatus:()=>{}};
 const ctx=vm.createContext({window:{CrushDiary:cd},localStorage:storage(local),sessionStorage:storage(session),Date,URL,Headers,Response,console,
  document:{body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},appendChild:panel=>nodes.set(panel.id,panel)},getElementById:id=>id==='auth-panel'&&!nodes.has(id)?null:node(id),createElement:()=>({innerHTML:'',setAttribute(){}})},
  fetch:async(url,options={})=>{
   calls.push({url,options});
   if(url.endsWith('/auth/login'))return Response.json({token:'fake.session',expiresAt:Math.floor(Date.now()/1000)+604800,user:{id:'yyf',name:'YYF'}});
   return Response.json({record:{messages:[]}});
  }
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui/auth.js'),'utf8'),ctx);
 return {cd,local,session,calls,classes,node,ctx};
}
test('logged-out visitors are gated and cannot fetch private records',async()=>{
 const env=setup();const waiting=env.cd.ensureAuthenticated();
 assert.equal(env.classes.has('auth-locked'),true);
 assert.equal(env.calls.length,0);
 await env.cd.login('yyf','private-password',false);
 assert.equal(await waiting,true);
 assert.equal(env.classes.has('auth-locked'),false);
 assert.equal([...env.session.values()].join('').includes('private-password'),false);
 assert.equal(env.local.size,0);
 assert.equal(env.session.size,1);
});
test('remembered login stores only a token locally and logout keeps the backup',async()=>{
 const env=setup();env.local.set('myCrushDiary_backup_v1','private-memories');
 await env.cd.login('yyf','private-password',true);
 assert.equal(env.local.get('myCrushDiary_backup_v1'),'private-memories');
 assert.equal(env.session.size,0);
 await env.cd.authenticatedFetch('/diary');
 const request=env.calls.at(-1);
 assert.equal(new Headers(request.options.headers).get('Authorization'),'Bearer fake.session');
 assert.equal(new Headers(request.options.headers).has('X-Master-Key'),false);
 const count=env.calls.length;env.cd.logout();
 assert.equal(env.calls.length,count);
 assert.equal(env.classes.has('auth-locked'),true);
 assert.equal(env.local.get('myCrushDiary_backup_v1'),'private-memories');
 assert.equal(env.local.size,1);
});
test('missing backend configuration performs no requests',async()=>{
 const env=setup({configured:false});
 assert.equal(await env.cd.ensureAuthenticated(),false);
 assert.equal(env.calls.length,0);
 assert.ok(env.node('auth-error').textContent.length>0);
});
test('storage failures keep a usable memory session with a visible warning',async()=>{
 const env=setup({blockedStorage:true});
 await env.cd.login('yyf','private-password',true);
 assert.equal(env.local.size,0);assert.equal(env.session.size,0);
 assert.ok(env.node('auth-session-warning').textContent.length>0);
 assert.equal(await env.cd.ensureAuthenticated(),true);
});

function integrate(env){
 for(const file of ['js/constants.js','js/store.js','shared/records.js','js/merge.js','js/api.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../',file),'utf8'),env.ctx);
 env.cd.setStatus=(text,color,busy)=>{env.cd.status=text;env.cd.store.isSyncing=!!busy||env.cd.auth.locked;};
}
const record=()=>({taScore:0,taHistory:[],myScore:0,myHistory:[],messages:[{text:'pending-only',time:'10-01'}],album:[],blogPosts:[],wishes:[],anniversaries:[]});
test('logout during a pending sync cannot overwrite pending-only backup',async()=>{
 const env=setup();await env.cd.login('yyf','private-password',false);integrate(env);
 env.cd.store.cloudData=record();let release;env.ctx.fetch=()=>new Promise(resolve=>release=resolve);
 const saving=env.cd.saveDataToCloud();env.cd.logout();
 release(Response.json({record:{}}));await saving;
 assert.equal(env.cd.loadLocalBackup().messages[0]?.text,'pending-only');
 assert.equal(env.cd.auth.locked,true);
});
test('blocked backup storage preserves pending memory across refresh and re-login',async()=>{
 const env=setup({blockedStorage:true});await env.cd.login('yyf','private-password',false);integrate(env);
 env.local.set('myCrushDiary_backup_v1',JSON.stringify({...record(),messages:[]}));env.cd.store.cloudData=record();
 env.ctx.fetch=async()=>{throw new Error('offline');};await env.cd.saveDataToCloud();
 assert.equal(env.cd.status.includes('已写入本机备份'),false);
 assert.ok(env.node('auth-backup-warning').textContent.includes('请勿刷新'));

 env.ctx.fetch=async url=>url.endsWith('/auth/login')?Response.json({token:'second-token',expiresAt:Math.floor(Date.now()/1000)+604800,user:{id:'yyf',name:'YYF'}}):Response.json({record:{}});
 await env.cd.loadDataFromCloud();assert.equal(env.cd.store.cloudData.messages[0]?.text,'pending-only');
 env.cd.logout();await env.cd.login('yyf','private-password',false);
 assert.equal(env.cd.store.cloudData.messages[0]?.text,'pending-only');
});

for(const phase of ['PUT response','JSON parsing'])test('logout protects the backup during delayed '+phase,async()=>{
 const env=setup();await env.cd.login('yyf','private-password',false);integrate(env);env.cd.store.cloudData=record();
 let release,entered;const paused=new Promise(resolve=>entered=resolve);
 env.ctx.fetch=async(url,options={})=>{
  if(options.method!=='PUT')return Response.json({record:{}});
  if(phase==='JSON parsing')return {ok:true,status:200,json:()=>{entered();return new Promise(resolve=>release=resolve);}};
  entered();return new Promise(resolve=>release=resolve);
 };
 const saving=env.cd.saveDataToCloud();await paused;env.cd.logout();
 release(phase==='JSON parsing'?{record:{}}:Response.json({record:{}}));await saving;
 assert.equal(env.cd.loadLocalBackup().messages[0]?.text,'pending-only');assert.equal(env.cd.auth.locked,true);
 assert.equal(env.cd.status.includes('已保存'),false);
});
test('a stale 401 cannot clear a newly established session',async()=>{
 const env=setup();await env.cd.login('yyf','private-password',false);
 let release;env.ctx.fetch=()=>new Promise(resolve=>release=resolve);
 const old=env.cd.authenticatedFetch('/diary');env.cd.logout();
 env.ctx.fetch=async()=>Response.json({token:'new-session',expiresAt:Math.floor(Date.now()/1000)+604800,user:{id:'yyf',name:'YYF'}});await env.cd.login('yyf','private-password',false);
 release(Response.json({},{status:401}));await assert.rejects(old,error=>error.superseded===true);
 assert.equal(env.cd.auth.locked,false);assert.equal(await env.cd.ensureAuthenticated(),true);
 assert.ok([...env.session.values()].some(value=>value.includes('new-session')));
});

test('remembered account claims are checked with me before activating records',async()=>{
 const env=setup();let activated=null;
 env.local.set('myCrushDiary_session_v2',JSON.stringify({token:'stored',expiresAt:Date.now()/1000+100,user:{id:'yyf',name:'YYF'}}));
 env.cd.activateUser=user=>activated=user.id;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui/auth.js'),'utf8'),env.ctx);
 env.ctx.fetch=async url=>{assert.ok(url.endsWith('/auth/me'));return Response.json({user:{id:'zxr',name:'ZXR'}});};
 assert.equal(await env.cd.ensureAuthenticated(),true);assert.equal(activated,'zxr');assert.equal(env.cd.auth.user.id,'zxr');
});

test('switching accounts preserves blocked-storage pending buffers and isolates the next account',async()=>{
 const env=setup({blockedStorage:true});integrate(env);
 env.ctx.fetch=async(url,options)=>{
  if(url.endsWith('/auth/login')){const id=JSON.parse(options.body).username;return Response.json({token:id,expiresAt:Date.now()/1000+100,user:{id,name:id.toUpperCase()}});}
  throw Error('offline');
 };
 await env.cd.login('yyf','password',false);env.cd.store.cloudData=record();env.cd.store.cloudData.messages[0].authorId='yyf';
 env.cd.logout();assert.equal(env.cd.store.cloudData.messages.length,0);
 await env.cd.login('zxr','password',false);assert.equal(env.cd.store.cloudData.messages.length,0);
 env.cd.store.cloudData.messages.push({id:'z',authorId:'zxr',text:'zxr-only'});
 env.cd.logout();await env.cd.login('yyf','password',false);
 assert.equal(env.cd.store.cloudData.messages.length,1);assert.equal(env.cd.store.cloudData.messages[0].text,'pending-only');
});
for(const blockedStorage of [false,true])test('multiple expired fetches and logout preserve the pending account buffer '+blockedStorage,async()=>{
 const env=setup({blockedStorage});await env.cd.login('yyf','private-password',false);integrate(env);env.cd.store.cloudData=record();
 const future=Date.now()+8*86400000;env.ctx.Date=class extends Date{static now(){return future;}};
 const results=await Promise.allSettled([env.cd.authenticatedFetch('/diary'),env.cd.authenticatedFetch('/diary')]);
 assert.ok(results.every(r=>r.status==='rejected'));env.cd.logout();env.cd.logout();env.ctx.Date=Date;
 await env.cd.login('yyf','private-password',false);assert.equal(env.cd.store.cloudData.messages[0]?.text,'pending-only');
});
