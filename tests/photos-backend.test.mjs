import test from 'node:test';
import assert from 'node:assert/strict';
import {PhotoObject,PHOTO_LIMIT,PHOTO_MAX} from '../backend/photo-object.mjs';
import {issueToken} from '../backend/auth.mjs';
import worker from '../backend/worker.mjs';
const jpeg=n=>new Uint8Array([255,216,255,n,255,217]);
const hash=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
async function setup(){
 let stored=new Map(),queue=Promise.resolve(),fail=false,reads=0;
 const env={YYF_PASSWORD:'local-yyf-password-123',ZXR_PASSWORD:'local-zxr-password-123',SESSION_SECRET:'local-test-secret-'.repeat(3),JSONBIN_KEY:'fake',JSONBIN_BIN_ID:'a'.repeat(24),ALLOWED_ORIGINS:'https://example.com',DIARY_STORE:{}};
 const tx={get:async k=>{reads++;return structuredClone(stored.get(k));},put:async(k,v)=>{if(fail && k==='usedBytes')throw Error('fail');stored.set(k,structuredClone(v));}};
 const ctx={blockConcurrencyWhile(fn){const job=queue.then(fn);queue=job.catch(()=>{});return job;},storage:{...tx,transaction:async fn=>{const snapshot=structuredClone(stored);try{return await fn(tx);}catch(e){stored=snapshot;throw e;}}}};
 const object=new PhotoObject(ctx,env);env.PHOTO_STORE={idFromName:()=> 'our-photos',get:()=>object};
 const token=(await issueToken(env,'yyf')).token;
 const call=(path,method='GET',bytes,auth=token,type='image/jpeg',origin='https://example.com')=>worker.fetch(new Request('https://api.invalid'+path,{method,headers:{Origin:origin,...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':type},body:bytes}),env);
 return {call,env,get reads(){return reads;},get stored(){return stored;},set fail(value){fail=value;}};
}
test('private JPEG round trip, idempotent retry and authenticated usage',async()=>{
 const h=await setup(),bytes=jpeg(1),id=await hash(bytes);
 assert.equal((await h.call('/photos/'+id,'GET',undefined,null)).status,401);assert.equal(h.reads,0);
 assert.equal((await h.call('/photos/'+id,'GET',undefined,undefined,'image/jpeg','https://wrong.invalid')).status,403);assert.equal(h.reads,0);
 assert.equal((await h.call('/photos/'+id)).status,404);
 for(let n=0;n<2;n++){const result=await h.call('/photos/'+id,'PUT',bytes);assert.equal(result.status,200);assert.equal((await result.json()).usedBytes,bytes.length);}
 const result=await h.call('/photos/'+id);assert.equal(result.headers.get('Content-Type'),'image/jpeg');assert.equal(result.headers.get('Cache-Control'),'no-store');assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
 assert.deepEqual(await(await h.call('/photo-usage')).json(),{usedBytes:bytes.length,limitBytes:PHOTO_LIMIT});
});
test('invalid bytes, streaming overflow, wrong MIME and digest never write',async()=>{
 const h=await setup(),id=await hash(jpeg(1));
 for(const [bytes,type,status] of [[jpeg(2),'image/jpeg',400],[new Uint8Array(),'image/jpeg',400],[new Uint8Array([1,2]),'image/jpeg',400],[jpeg(1),'image/png',400],[new Uint8Array(PHOTO_MAX+1),'image/jpeg',413]])assert.equal((await h.call('/photos/'+id,'PUT',bytes,undefined,type)).status,status);
 assert.equal((await h.call('/photos/nope','PUT',jpeg(1))).status,400);assert.equal(h.stored.size,0);
 assert.equal((await h.call('/photos/'+id,'DELETE')).status,405);
});
test('quota is atomic across concurrent uploads and storage failure rolls back both values',async()=>{
 const h=await setup(),a=jpeg(1),b=jpeg(2),idA=await hash(a),idB=await hash(b);
 h.stored.set('usedBytes',PHOTO_LIMIT-a.length);
 const responses=await Promise.all([h.call('/photos/'+idA,'PUT',a),h.call('/photos/'+idB,'PUT',b)]);
 assert.deepEqual(responses.map(r=>r.status).sort((a,b)=>a-b),[200,409]);assert.equal(h.stored.get('usedBytes'),PHOTO_LIMIT);
 const winner=responses[0].status===200?idA:idB,loser=winner===idA?idB:idA;
 assert.equal((await h.call('/photos/'+winner)).status,200);assert.equal((await h.call('/photos/'+loser)).status,404);
 const broken=await setup();broken.fail=true;assert.equal((await broken.call('/photos/'+idA,'PUT',a)).status,503);assert.equal(broken.stored.size,0);
});
