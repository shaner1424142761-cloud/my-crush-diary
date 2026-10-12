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
   if(url.endsWith('/auth/login'))return Response.json({token:'fake.session',expiresAt:Math.floor(Date.now()/1000)+604800});
   return Response.json({record:{messages:[]}});
  }
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui/auth.js'),'utf8'),ctx);
 return {cd,local,session,calls,classes,node};
}
test('logged-out visitors are gated and cannot fetch private records',async()=>{
 const env=setup();const waiting=env.cd.ensureAuthenticated();
 assert.equal(env.classes.has('auth-locked'),true);
 assert.equal(env.calls.length,0);
 await env.cd.login('private-password',false);
 assert.equal(await waiting,true);
 assert.equal(env.classes.has('auth-locked'),false);
 assert.equal([...env.session.values()].join('').includes('private-password'),false);
 assert.equal(env.local.size,0);
 assert.equal(env.session.size,1);
});
test('remembered login stores only a token locally and logout keeps the backup',async()=>{
 const env=setup();env.local.set('myCrushDiary_backup_v1','private-memories');
 await env.cd.login('private-password',true);
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
 await env.cd.login('private-password',true);
 assert.equal(env.local.size,0);assert.equal(env.session.size,0);
 assert.ok(env.node('auth-session-warning').textContent.length>0);
 assert.equal(await env.cd.ensureAuthenticated(),true);
});
