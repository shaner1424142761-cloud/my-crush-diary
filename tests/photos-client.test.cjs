const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const revoked=[],requests=[],listeners=[],CD={auth:{generation:1,locked:false,user:{id:'yyf'}},onAuthChange:fn=>listeners.push(fn)};
 let response=()=>Response.json({});let seq=0;
 CD.authenticatedFetch=(url,options)=>{requests.push({url,options});return response(url,options);};
 const ctx=vm.createContext({window:{CrushDiary:CD},Blob,Response,Headers,AbortController,Uint8Array,crypto:globalThis.crypto,URL:{createObjectURL:()=> 'blob:'+ ++seq,revokeObjectURL:u=>revoked.push(u)},setTimeout,clearTimeout,document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob:fn=>fn(new Blob([new Uint8Array([255,216,1,255,217])],{type:'image/jpeg'}))})},createImageBitmap:async()=>({width:2400,height:1200,close(){}})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/photos.js'),'utf8'),ctx);
 return {CD,ctx,revoked,requests,set response(fn){response=fn;},logout(){CD.auth.generation++;CD.auth.locked=true;listeners.forEach(fn=>fn(CD.auth));}};
}
test('compression rejects unsupported/oversized images and hashes JPEG display bytes',async()=>{
 const {CD,ctx}=setup();
 await assert.rejects(CD.preparePhoto(new Blob(['x'],{type:'image/heic'})),/JPEG|PNG|WebP/);
 await assert.rejects(CD.preparePhoto({type:'image/jpeg',size:20*1024*1024+1}),/20/);
 const result=await CD.preparePhoto(new Blob(['x'],{type:'image/png'}));
 assert.equal(result.width,1600);assert.equal(result.height,800);assert.equal(result.blob.type,'image/jpeg');
 assert.equal(result.photoId,Buffer.from(await crypto.subtle.digest('SHA-256',await result.blob.arrayBuffer())).toString('hex'));
 ctx.createImageBitmap=async()=>({width:10000,height:10000,close(){}});await assert.rejects(CD.preparePhoto(new Blob(['x'],{type:'image/png'})),/像素/);
});
test('private reads deduplicate, validate and revoke cached object URLs',async()=>{
 const h=setup(),id='a'.repeat(64);h.response=async()=>new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}});
 const urls=await Promise.all([h.CD.getPhotoURL(id),h.CD.getPhotoURL(id)]);assert.deepEqual(urls,['blob:1','blob:1']);assert.equal(h.requests.length,1);
 h.CD.clearPhotoCache();assert.deepEqual(h.revoked,['blob:1']);
 h.response=async()=>new Response('wrong',{headers:{'Content-Type':'image/png'}});await assert.rejects(h.CD.getPhotoURL(id),/格式/);
 h.response=async()=>new Response(new Uint8Array(400*1024+1),{headers:{'Content-Type':'image/jpeg'}});await assert.rejects(h.CD.getPhotoURL(id),/400/);
});
test('logout cancels queued and delayed reads without accepting private URLs',async()=>{
 const h=setup(),releases=[];h.response=()=>new Promise(r=>releases.push(r));
 const jobs=Array.from({length:6},(_,n)=>h.CD.getPhotoURL(String(n).repeat(64)));
 await Promise.resolve();await Promise.resolve();assert.equal(h.requests.length,3);
 h.logout();const results=await Promise.allSettled(jobs);assert.ok(results.every(r=>r.status==='rejected'));assert.equal(h.requests.length,3);assert.equal(h.revoked.length,0);
 releases.forEach(r=>r(new Response('old',{headers:{'Content-Type':'image/jpeg'}})));
 h.CD.auth.locked=false;h.response=async()=>new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}});
 assert.equal(await h.CD.getPhotoURL('a'.repeat(64)),'blob:1');
});
test('logout during upload JSON parsing rejects the old response',async()=>{
 const h=setup();let release,entered;const paused=new Promise(r=>entered=r);
 h.response=async()=>({ok:true,status:200,json:()=>{entered();return new Promise(r=>release=r);}});
 const uploading=h.CD.uploadPhoto({photoId:'a'.repeat(64),blob:new Blob(['image'],{type:'image/jpeg'})});await paused;h.logout();
 await assert.rejects(uploading);release({photoId:'a'.repeat(64),bytes:5,usedBytes:5,limitBytes:200*1024*1024});
});
test('uncompressible images fail explicitly after quality and dimension reductions',async()=>{
 const h=setup();let sizes=[];
 h.ctx.document.createElement=()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(fn,type,quality){sizes.push([this.width,quality]);fn(new Blob([new Uint8Array(400*1024+1)],{type:'image/jpeg'}));}});
 await assert.rejects(h.CD.preparePhoto(new Blob(['x'],{type:'image/png'})),/400/);
 assert.ok(sizes.some(([w,q])=>w===1600 && q===.5));assert.ok(sizes.some(([w])=>w<1600));
});
module.exports={setup};
function albumSetup(){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,listeners:{},appendChild(){},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);};
 let uploaded=0,saved=false,previews=0;
 const CD={auth:{generation:1,locked:false,user:{id:'yyf'}},store:{isSyncing:false,cloudData:{album:[]}},onAuthChange(){},initSyncBar(){},mountLoveCalendar(){},updateLoveCalendar(){},loadDataFromCloud(){},renderAlbum(){},saveLocalBackup(){},newHistoryItemId:()=> 'stable-entry',preparePhoto:async()=>({photoId:'a'.repeat(64),blob:new Blob(['image'],{type:'image/jpeg'}),width:100,height:50}),uploadPhoto:async()=>{uploaded++;return {usedBytes:5,limitBytes:200*1024*1024};},saveDataToCloud:async()=>saved};
 const context=vm.createContext({window:{CrushDiary:CD},document:{getElementById:node,createElement:()=>({setAttribute(){},appendChild(){},addEventListener(){}})},URL:{createObjectURL:()=>{previews++;return 'blob:preview';},revokeObjectURL(){}},Date,alert(){}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/pages/album.js'),'utf8'),context);
 return {CD,context,node,get uploaded(){return uploaded;},get previews(){return previews;},set saved(value){saved=value;}};
}
test('upload metadata retry keeps one stable entry without uploading the photo again',async()=>{
 const h=albumSetup();h.CD.selectAlbumFiles([{name:'photo.png',type:'image/png',size:10}]);
 await h.CD.uploadAlbumQueue();assert.equal(h.uploaded,1);assert.equal(h.CD.store.cloudData.album.length,1);
 assert.ok(h.node('album-upload-status').textContent.includes('待同步'));
 h.saved=true;await h.CD.uploadAlbumQueue();assert.equal(h.uploaded,1);assert.equal(h.CD.store.cloudData.album.length,1);
 assert.ok(h.node('album-upload-status').textContent.includes('已保存'));
});
test('selection caps at nine and logout while preparing cannot append an entry',async()=>{
 const h=albumSetup();assert.equal(h.CD.selectAlbumFiles(Array.from({length:10},()=>({name:'x'}))),false);
 assert.equal(h.CD.selectAlbumFiles([{name:'x'}]),true);let release;h.CD.preparePhoto=()=>new Promise(r=>release=r);
 const upload=h.CD.uploadAlbumQueue();await Promise.resolve();await Promise.resolve();h.CD.auth.generation++;h.CD.auth.locked=true;
 release({photoId:'a'.repeat(64),blob:new Blob(['x'],{type:'image/jpeg'})});await upload;
 assert.equal(h.uploaded,0);assert.equal(h.CD.store.cloudData.album.length,0);
});
test('network timeout is retryable and does not masquerade as an account change',async()=>{
 const h=setup();let deadline;h.ctx.setTimeout=fn=>{deadline=fn;return 1;};h.response=()=>new Promise(()=>{});
 const upload=h.CD.uploadPhoto({photoId:'a'.repeat(64),blob:new Blob(['x'],{type:'image/jpeg'})});deadline();
 await assert.rejects(upload,error=>!error.superseded && error.message.includes('超时'));
});
test('selection prepares a bounded preview before upload so captions can be assigned visually',async()=>{
 const h=albumSetup();h.CD.selectAlbumFiles([{name:'photo.png',type:'image/png',size:10}]);
 await new Promise(setImmediate);assert.ok(h.previews>0);assert.equal(h.uploaded,0);
});
