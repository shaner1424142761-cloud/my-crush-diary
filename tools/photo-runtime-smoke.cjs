const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{startPreview}=require('./local-preview.cjs');
const sha=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
(async()=>{
 const preview=await startPreview({port:8767,backendPort:8879,quiet:true});let browser;
 try{
  const call=(route,method='GET',body,token,type='application/json')=>fetch(preview.api+route,{method,headers:{Origin:preview.website,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':type},body:body===undefined?undefined:type==='application/json'?JSON.stringify(body):body});
  const login=await call('/auth/login','POST',{username:'yyf',password:preview.passwords.yyf});assert.equal(login.status,200);const token=(await login.json()).token;
  assert.equal((await call('/photo-usage','GET',undefined,token)).status,200);
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({channel:'chrome',headless:true});
  const contexts=await Promise.all([browser.newContext({viewport:{width:1200,height:900}}),browser.newContext({viewport:{width:390,height:844}})]),pages=await Promise.all(contexts.map(c=>c.newPage()));const errors=[];
  for(let n=0;n<2;n++){
   const page=pages[n],id=n?'zxr':'yyf';page.on('pageerror',e=>errors.push(e.message));await page.goto(preview.website+'/album.html');await page.selectOption('#auth-username',id);await page.fill('#auth-password',preview.passwords[id]);await page.click('#auth-submit');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);
  }
  const generated=await pages[0].evaluate(async()=>{
   const shapes=[[2200,1100],[900,1800],[1,8000],[2000,2000]],result=[];
   for(let n=0;n<shapes.length;n++){
    const canvas=document.createElement('canvas');[canvas.width,canvas.height]=shapes[n];const c=canvas.getContext('2d');
    if(n===3){const pixels=c.createImageData(canvas.width,canvas.height);let seed=12345;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}c.putImageData(pixels,0,0);}
    else{c.fillStyle=n===1?'rgba(190,210,255,.5)':'#ecc4ac';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#ab7899';c.fillRect(0,0,canvas.width/2,canvas.height/2);}
    result.push(canvas.toDataURL('image/png').split(',')[1]);
   }return result;
  });
  const payloads=generated.map((base64,n)=>({name:'synthetic-'+n+'.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')}));
  await pages[0].setInputFiles('#album-files',[...payloads,{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('invalid')}]);await pages[0].click('#btn-upload-photos');
  await pages[0].waitForFunction(()=>document.getElementById('album-upload-status').textContent.includes('4 张已保存'),{},{timeout:30000});
  assert.equal(await pages[0].locator('.album-card').count(),4);assert.ok((await pages[0].locator('.upload-item-status').allTextContents()).some(s=>s.includes('无法解码')));
  const record=(await(await call('/diary','GET',undefined,token)).json()).record;assert.equal(record.album.length,4);
  const all=[];
  for(const entry of record.album){
   assert.equal((await call('/photos/'+entry.photoId)).status,401);
   const response=await call('/photos/'+entry.photoId,'GET',undefined,token);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length<=400*1024);assert.equal(await sha(bytes),entry.photoId);all.push(bytes);
  }
  const dimensions=await pages[0].evaluate(async entries=>Promise.all(entries.map(async entry=>{const url=await window.CrushDiary.getPhotoURL(entry.photoId),b=await createImageBitmap(await(await fetch(url)).blob()),c=document.createElement('canvas');c.width=1;c.height=1;c.getContext('2d').drawImage(b,0,0,1,1);const result={width:b.width,height:b.height,alpha:c.getContext('2d').getImageData(0,0,1,1).data[3]};b.close();return result;})),record.album);
  assert.ok(dimensions.every(d=>Math.max(d.width,d.height)<=1600 && d.alpha===255));assert.ok(dimensions.some(d=>d.width===1));
  const before=(await(await call('/photo-usage','GET',undefined,token)).json()).usedBytes;
  await Promise.all(all.map(async(bytes,n)=>assert.equal((await call('/photos/'+record.album[n].photoId,'PUT',bytes,token,'image/jpeg')).status,200)));
  assert.equal((await(await call('/photo-usage','GET',undefined,token)).json()).usedBytes,before);
  assert.equal((await call('/photos/'+'a'.repeat(64),'PUT',Buffer.alloc(400*1024+1),token,'image/jpeg')).status,413);
  const oldURL=preview.website+'/legacy-photo.jpg';await pages[0].route(oldURL,route=>route.fulfill({contentType:'image/png',body:payloads[0].buffer}));
  assert.equal((await call('/diary','PUT',{album:[{url:oldURL,caption:'旧链接保留',time:'10-01'}]},token)).status,200);
  await pages[0].reload();await pages[0].waitForFunction(()=>!window.CrushDiary.store.isSyncing);assert.equal(await pages[0].locator('.album-card').count(),5);assert.ok((await pages[0].locator('.album-time').allTextContents()).includes('10-01'));
  await pages[1].reload();await pages[1].waitForFunction(()=>!window.CrushDiary.store.isSyncing);await pages[1].waitForFunction(()=>Array.from(document.querySelectorAll('.album-card img')).some(i=>i.src.startsWith('blob:')&&i.naturalWidth>0));
  assert.equal(await pages[0].locator('#album-grid').evaluate(el=>getComputedStyle(el).columnCount),'3');assert.equal(await pages[1].locator('#album-grid').evaluate(el=>getComputedStyle(el).columnCount),'2');
  await pages[1].locator('.album-card').first().click();await pages[1].waitForFunction(()=>document.getElementById('album-lightbox-img').naturalWidth>0);await pages[1].keyboard.press('ArrowRight');await pages[1].keyboard.press('Escape');assert.equal(await pages[1].locator('#album-lightbox').isVisible(),false);
  let failOnce=true,uploads=0;pages[0].on('request',req=>{if(req.method()==='PUT' && req.url().includes('/photos/'))uploads++;});
  await pages[0].route(preview.api+'/diary',route=>{if(route.request().method()==='PUT' && failOnce){failOnce=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'模拟同步失败'})});}return route.continue();});
  await pages[0].setInputFiles('#album-files',[payloads[0]]);await pages[0].click('#btn-upload-photos');await pages[0].waitForFunction(()=>document.getElementById('album-upload-status').textContent.includes('待同步'));
  const pendingLength=await pages[0].evaluate(()=>window.CrushDiary.store.cloudData.album.length);assert.equal(pendingLength,6);
  await pages[0].click('#btn-upload-photos');await pages[0].waitForFunction(()=>document.getElementById('album-upload-status').textContent.includes('这批 1 张照片已保存'));
  assert.equal(uploads,1);assert.equal((await(await call('/diary','GET',undefined,token)).json()).record.album.length,6);assert.equal((await(await call('/photo-usage','GET',undefined,token)).json()).usedBytes,before);
  assert.equal(await pages[0].evaluate(()=>Object.values(localStorage).some(v=>v.includes('blob:'))),false);
  const tooMany=Array.from({length:10},(_,n)=>({...payloads[0],name:'many-'+n+'.png'}));await pages[0].setInputFiles('#album-files',tooMany);assert.ok((await pages[0].locator('#album-upload-status').textContent()).includes('最多选择 9'));
  assert.equal(await pages[0].locator('.album-card img').evaluateAll(imgs=>imgs.every(img=>img.getBoundingClientRect().height<=440)),true);
  assert.equal(await pages[0].locator('.app-footer').evaluate(el=>getComputedStyle(el).position),'static');
  const screenshots=path.resolve(__dirname,'../.wrangler/photo-qa');fs.mkdirSync(screenshots,{recursive:true});for(let n=0;n<2;n++){await pages[n].screenshot({path:path.join(screenshots,n?'mobile.png':'desktop.png'),fullPage:true});await pages[n].evaluate(()=>window.CrushDiary.logout());assert.equal(await pages[n].locator('.album-card').count(),0);assert.equal(await pages[n].locator('#album-lightbox-img').getAttribute('src'),null);}
  const jpegA=new Uint8Array([255,216,255,1,255,217]),jpegB=new Uint8Array([255,216,255,2,255,217]),idA=await sha(jpegA),idB=await sha(jpegB);
  assert.equal((await call('/__test/photo-control','POST',{mode:'failure'},token)).status,200);
  assert.equal((await call('/photos/'+idA,'PUT',jpegA,token,'image/jpeg')).status,503);
  assert.equal((await call('/photos/'+idA,'GET',undefined,token)).status,404);
  assert.equal((await(await call('/photo-usage','GET',undefined,token)).json()).usedBytes,before);
  assert.equal((await call('/__test/photo-control','POST',{mode:'capacity',usedBytes:200*1024*1024-jpegA.byteLength},token)).status,200);
  const nearQuota=await Promise.all([call('/photos/'+idA,'PUT',jpegA,token,'image/jpeg'),call('/photos/'+idB,'PUT',jpegB,token,'image/jpeg')]);assert.deepEqual(nearQuota.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  assert.equal((await call('/photos/'+record.album[0].photoId,'GET',undefined,token)).status,200);
  assert.deepEqual(errors,[]);console.log('Actual photo Worker/SQLite and two browsers passed: compression, extreme ratio, bad input, private reads, repeat/concurrent writes, metadata retry, legacy link, photo wall, lightbox and logout. Synthetic screenshots: '+screenshots);
 }finally{if(browser)await browser.close();preview.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
