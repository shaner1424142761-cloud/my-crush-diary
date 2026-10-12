import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import { DiaryObject } from '../backend/diary-object.mjs';
import { issueToken, verifyToken } from '../backend/auth.mjs';
const origin='https://shaner1424142761-cloud.github.io';
const base=()=>({taScore:13,taHistory:[{id:'first',change:10,time:'10-01'}],myScore:0,myHistory:[],messages:[],album:[],blogPosts:[],wishes:[{id:'w',text:'旅行',updatedAt:1}],anniversaries:[],futureSection:{note:'keep'}});
function harness() {
 const storage=new Map();
 let cloud=base(), calls=[], failRead=false, failWrite=false, loseReply=false;
 const env={YYF_PASSWORD:'test-password-123456',ZXR_PASSWORD:'other-password-123456',SESSION_SECRET:'test-secret-'.repeat(4),JSONBIN_KEY:'fake-key-never-real',JSONBIN_BIN_ID:'a'.repeat(24),ALLOWED_ORIGINS:origin};
 let queue=Promise.resolve();
 const ctx={storage:{
  get:async key=>structuredClone(storage.get(key)),
  put:async (key,value)=>{storage.set(key,structuredClone(value));},
  delete:async key=>{storage.delete(key);},
  list:async ({prefix='',limit=1000}={})=>new Map([...storage].filter(([k])=>k.startsWith(prefix)).slice(0,limit))
 },blockConcurrencyWhile(callback){const job=queue.then(callback);queue=job.catch(()=>{});return job;}};
 const fetcher=async (url,options={})=>{
  calls.push({url,method:options.method||'GET',headers:options.headers});
  await new Promise(resolve=>setTimeout(resolve,2));
  if(options.method==='PUT'){
   if(failWrite)return Response.json({message:'private failure fake-key-never-real'},{status:500});
   cloud=JSON.parse(options.body);
   if(loseReply){loseReply=false;throw new Error('reply lost');}
   return Response.json({record:cloud});
  }
  if(failRead)throw new Error('offline');
  return Response.json({record:structuredClone(cloud)});
 };
 let object=new DiaryObject(ctx,env,fetcher);
 env.DIARY_STORE={idFromName:()=> 'same-object',get:()=>({fetch:request=>object.fetch(request)})};
 const request=async (path,method='GET',data,token)=>{
  const headers={Origin:origin,'CF-Connecting-IP':'192.0.2.1'};
  if(token)headers.Authorization='Bearer '+token;
  if(data!==undefined)headers['Content-Type']='application/json';
  return worker.fetch(new Request('https://test.invalid'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
 };
 return {env,storage,calls,request,get cloud(){return cloud;},set cloud(value){cloud=value;},set failRead(v){failRead=v;},set failWrite(v){failWrite=v;},set loseReply(v){loseReply=v;},restart(){object=new DiaryObject(ctx,env,fetcher);}};
}
test('signed sessions expire after seven days and reject tampering',async()=>{
 const h=harness();const {token,expiresAt}=await issueToken(h.env,'zxr',100);
 assert.equal(expiresAt,604900);
 assert.equal(await verifyToken(token,h.env,100),true);
 assert.equal(await verifyToken(token,h.env,expiresAt),false);
 assert.equal(await verifyToken(token+'x',h.env,100),false);
});
test('invalid authentication never accesses the cloud',async()=>{
 const h=harness();const expired=await issueToken(h.env,'zxr',1);
 for(const token of [undefined,'broken','x'.repeat(3000),expired.token]){
  assert.equal((await h.request('/diary','GET',undefined,token)).status,401);
 }
 assert.equal(h.calls.length,0);
});
test('health and error responses contain no secrets or memories',async()=>{
 const h=harness();const response=await h.request('/health');
 assert.deepEqual(await response.json(),{configured:true});
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 const denied=await h.request('/auth/login','POST',{username:'zxr',password:'bad'});
 assert.equal(denied.status,401);
 assert.equal((await denied.text()).includes(h.env.JSONBIN_KEY),false);
 assert.equal(h.calls.length,0);
});
test('login rate limits persist when a Durable Object is reconstructed',async()=>{
 const h=harness();
 for(let i=0;i<5;i++)assert.equal((await h.request('/auth/login','POST',{username:'zxr',password:'bad'})).status,401);
 h.restart();
 assert.equal((await h.request('/auth/login','POST',{username:'zxr',password:h.env.ZXR_PASSWORD})).status,429);
 for(const [key,value]of h.storage)if(key.startsWith('rate:'))h.storage.set(key,{...value,expiresAt:0});
 assert.equal((await h.request('/auth/login','POST',{username:'zxr',password:h.env.ZXR_PASSWORD})).status,200);
});
test('GET is read-only and two overlapping writes keep both changes',async()=>{
 const h=harness();const {token}=await issueToken(h.env,'zxr');
 assert.equal((await h.request('/diary','GET',undefined,token)).status,200);
 assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);
 const a=base(),b=base();
 a.taHistory.push({id:'minus',change:-3,time:'10-02'});a.taScore=10;
 a.deletedItems={wishes:{w:100}};
 b.taHistory.push({id:'plus',change:5,time:'10-03'});b.taScore=18;
 b.messages=[{text:'一起看海',time:'10-03'}];
 const replies=await Promise.all([h.request('/diary','PUT',a,token),h.request('/diary','PUT',b,token)]);
 assert.deepEqual(replies.map(r=>r.status),[200,200]);
 assert.equal(h.cloud.taScore,15);assert.equal(h.cloud.wishes.length,0);assert.equal(h.cloud.messages.length,1);
 assert.deepEqual(h.cloud.futureSection,{note:'keep'});
});
test('cloud failures do not overwrite data and successful writes keep only three backups',async()=>{
 const h=harness();const {token}=await issueToken(h.env,'zxr');
 h.failRead=true;
 assert.equal((await h.request('/diary','PUT',base(),token)).status,502);
 assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);
 h.failRead=false;h.failWrite=true;
 assert.equal((await h.request('/diary','PUT',base(),token)).status,502);
 assert.equal(h.cloud.taScore,13);
 h.failWrite=false;
 for(let i=0;i<5;i++)assert.equal((await h.request('/diary','PUT',base(),token)).status,200);
 assert.equal(h.storage.get('snapshots').length,3);
});
test('a lost PUT reply is safely retried without duplicating scores',async()=>{
 const h=harness();const {token}=await issueToken(h.env,'zxr');const data=base();
 data.taHistory.push({id:'minus',change:-3,time:'10-02'});data.taScore=10;
 h.loseReply=true;
 assert.equal((await h.request('/diary','PUT',data,token)).status,502);
 assert.equal((await h.request('/diary','PUT',data,token)).status,200);
 assert.equal(h.cloud.taScore,10);assert.equal(h.cloud.taHistory.length,2);
});
test('CORS, malformed records and large requests fail without modifying records',async()=>{
 const h=harness();const {token}=await issueToken(h.env,'zxr');
 const preflight=await h.request('/diary','OPTIONS');
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
 const forbidden=await worker.fetch(new Request('https://test.invalid/diary',{headers:{Origin:'https://evil.invalid',Authorization:'Bearer '+token}}),h.env);
 assert.equal(forbidden.status,403);
 assert.equal((await h.request('/diary','PUT',{messages:'invalid'},token)).status,400);
 assert.equal((await h.request('/diary','PUT',{messages:[null]},token)).status,400);
 assert.equal((await h.request('/diary','PUT',{junk:'x'.repeat(1048577)},token)).status,413);
 assert.equal((await h.request('/unknown')).status,404);
 assert.equal(h.calls.length,0);
});
test('malformed cloud data produces an upstream failure and never writes',async()=>{
 const h=harness();const {token}=await issueToken(h.env,'zxr');
 h.cloud={messages:'broken'};
 assert.equal((await h.request('/diary','PUT',base(),token)).status,502);
 assert.equal(h.calls.filter(c=>c.method==='PUT').length,0);
});
test('distributed login attempts cannot grow persistent rate storage past its bound',async()=>{
 const h=harness();
 for(let i=0;i<512;i++)h.storage.set('rate:old'+i,{count:1,expiresAt:Date.now()+900000});
 assert.equal((await h.request('/auth/login','POST',{username:'zxr',password:'bad'})).status,429);
 assert.equal([...h.storage.keys()].filter(k=>k.startsWith('rate:')).length,512);
});
