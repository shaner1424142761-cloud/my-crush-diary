import test from 'node:test';
import assert from 'node:assert/strict';
import {configured,passwordMatches,issueToken,readSession,verifyToken} from '../backend/auth.mjs';
import worker from '../backend/worker.mjs';
const env={YYF_PASSWORD:'local-yyf-password-123',ZXR_PASSWORD:'local-zxr-password-123',SESSION_SECRET:'test-session-secret-'.repeat(3),JSONBIN_KEY:'fake',JSONBIN_BIN_ID:'a'.repeat(24),ALLOWED_ORIGINS:'https://example.com',DIARY_STORE:{}};
test('each fixed account has its own password and signed identity',async()=>{
 for(const id of ['yyf','zxr']){
  assert.equal(await passwordMatches(env[id.toUpperCase()+'_PASSWORD'],env,id),true);
  assert.equal(await passwordMatches(env[(id==='yyf'?'ZXR':'YYF')+'_PASSWORD'],env,id),false);
  const session=await issueToken(env,id,100);
  assert.deepEqual(session.user,{id,name:id.toUpperCase()});
  assert.deepEqual(await readSession(session.token,env,100),session.user);
  assert.equal(await verifyToken(session.token,env,100),true);
  assert.equal(await readSession(session.token,env,session.expiresAt),null);
  const parts=session.token.split('.');
  const payload=JSON.parse(Buffer.from(parts[0],'base64url'));
  assert.equal(payload.v,2);assert.equal(payload.sub,id);
  payload.sub=id==='yyf'?'zxr':'yyf';
  assert.equal(await readSession(Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+parts[1],env,100),null);
 }
 assert.equal(await passwordMatches(env.YYF_PASSWORD,env,'other'),false);
});
test('rejects signed old or unknown identity tokens and oversized tokens',async()=>{
 for(const payload of [{v:1,exp:200,nonce:'old'},{v:2,sub:'other',exp:200,nonce:'unknown'}]){
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('base64url');
  assert.equal(await readSession(body+'.'+sig,env,100),null);
 }
 assert.equal(await readSession('x'.repeat(1025),env),null);
});
test('requires two distinct configured passwords',()=>{
 assert.equal(configured(env),true);
 assert.equal(configured({...env,ZXR_PASSWORD:undefined}),false);
 assert.equal(configured({...env,ZXR_PASSWORD:env.YYF_PASSWORD}),false);
});
test('me resolves trusted identity without touching the diary object',async()=>{
 const noCloud={...env,DIARY_STORE:{idFromName(){throw Error('must not touch cloud');}}};
 const request=token=>new Request('https://api.invalid/auth/me',{headers:token?{Authorization:'Bearer '+token}:{}});
 assert.equal((await worker.fetch(request(),noCloud)).status,401);
 const session=await issueToken(env,'yyf');
 const result=await worker.fetch(request(session.token),noCloud);
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{user:session.user});
});
