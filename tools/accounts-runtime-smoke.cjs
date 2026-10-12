const assert=require('node:assert/strict'),{startPreview}=require('./local-preview.cjs');
(async()=>{
 const preview=await startPreview({port:8768,backendPort:8880,quiet:true});let browser;
 try{
  const call=(path,method='GET',data,token)=>fetch(preview.api+path,{method,headers:{Origin:preview.website,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
  const tokens={};for(const id of ['yyf','zxr']){const response=await call('/auth/login','POST',{username:id,password:'local-'+id+'-password-123'});assert.equal(response.status,200);tokens[id]=(await response.json()).token;}
  const initial=(await(await call('/diary','GET',null,tokens.yyf)).json()).record;
  for(const id of ['yyf','zxr']){
   const wrong=id==='yyf'?'taHistory':'myHistory';const bad={[wrong]:[...(initial[wrong]||[]),{id:'bad-'+id,change:99,time:'today'}]};
   assert.equal((await call('/diary','PUT',bad,tokens[id])).status,403);
  }
  assert.deepEqual((await(await call('/diary','GET',null,tokens.yyf)).json()).record,initial);
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({channel:'chrome',headless:true});
  const contexts=await Promise.all([browser.newContext(),browser.newContext()]),pages=await Promise.all(contexts.map(c=>c.newPage()));const errors=[];
  for(let n=0;n<2;n++){
   const id=n?'zxr':'yyf',page=pages[n];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(preview.website);await page.selectOption('#auth-username',id);await page.fill('#auth-password','local-'+id+'-password-123');await page.click('#auth-submit');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);
   assert.equal(await page.locator(n?'#btn-my-plus5':'#btn-ta-plus5').isDisabled(),true);
   await page.click(n?'#btn-ta-plus5':'#btn-my-minus3');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('已保存'));
  }
  await Promise.all(pages.map(p=>p.goto(preview.website+'/messages.html')));
  await Promise.all(pages.map(p=>p.waitForFunction(()=>!window.CrushDiary.store.isSyncing)));
  await Promise.all(pages.map(async p=>{await p.fill('#msg-input','same words');await p.click('#btn-msg-send');await p.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('已保存'));}));
  const final=(await(await call('/diary','GET',null,tokens.yyf)).json()).record;
  assert.equal(final.myScore,-3);assert.equal(final.taScore,18);assert.deepEqual(final.messages.filter(m=>m.text==='same words').map(m=>m.authorId).sort(),['yyf','zxr']);
  await pages[0].reload();await pages[0].waitForFunction(()=>!window.CrushDiary.store.isSyncing);
  assert.ok((await pages[0].locator('.msg-author').allTextContents()).includes('历史留言 · 未标注作者'));
  const legacy={target:'my',history:[{change:2,time:'past'}],messages:[{text:'recovered',time:'past'}]};
  for(let n=0;n<2;n++)assert.equal((await call('/legacy-import','POST',legacy,tokens.yyf)).status,200);
  const restored=(await(await call('/diary','GET',null,tokens.yyf)).json()).record;assert.equal(restored.myScore,-1);assert.equal(restored.messages.filter(m=>m.text==='recovered').length,1);assert.equal(restored.messages.find(m=>m.text==='recovered').authorId,undefined);
  for(const page of pages)await page.evaluate(()=>window.CrushDiary.logout());assert.deepEqual(errors,[]);
  console.log('Actual Worker/SQLite and two browsers passed: account controls, forbidden writes, score changes, trusted authors, unsigned history and idempotent recovery.');
 }finally{if(browser)await browser.close();preview.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
