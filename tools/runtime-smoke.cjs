const assert=require('node:assert/strict');
const {startPreview}=require('./local-preview.cjs');
(async()=>{
 const preview=await startPreview({port:8770,backendPort:8882,quiet:true});let browser;
 try{
  const call=async(path,method='GET',data,token)=>fetch(preview.api+path,{method,headers:{Origin:preview.website,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
  assert.equal((await call('/diary')).status,401);
  const login=await call('/auth/login','POST',{username:'zxr',password:preview.passwords.zxr});assert.equal(login.status,200);const {token}=await login.json();
  const read=await call('/diary','GET',null,token);assert.equal(read.headers.get('Access-Control-Allow-Origin'),preview.website);const {record}=await read.json();assert.equal(record.taScore,13);
  const minus=structuredClone(record);minus.taHistory.push({id:'minus',change:-3,time:'10-02'});minus.taScore=10;minus.wishes=[];minus.deletedItems={wishes:{'demo-wish':100},anniversaries:{}};
  const plus=structuredClone(record);plus.taHistory.push({id:'plus',change:5,time:'10-03'});plus.taScore=18;
  const responses=await Promise.all([call('/diary','PUT',minus,token),call('/diary','PUT',plus,token)]);responses.forEach(response=>assert.equal(response.status,200));
  const final=(await(await call('/diary','GET',null,token)).json()).record;assert.equal(final.taScore,15);assert.equal(final.wishes.length,0);assert.equal(final.futureSection.demo,true);
  await call('/diary','PUT',minus,token);assert.equal((await(await call('/diary','GET',null,token)).json()).record.taScore,15);
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(preview.website);await page.selectOption('#auth-username','yyf');await page.fill('#auth-password',preview.passwords.yyf);await page.click('#auth-submit');
  await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing&&window.CrushDiary.store.cloudData.taScore===15);
  await page.click('#btn-my-minus3');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('已保存'));
  assert.equal((await(await call('/diary','GET',null,token)).json()).record.myScore,-3);
  for(const name of ['album','blog','messages','wishes','anniversaries']){await page.goto(preview.website+'/'+name+'.html');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);assert.equal(await page.locator('#auth-panel').isVisible(),false);}
  await page.evaluate(()=>window.CrushDiary.logout());assert.equal(await page.locator('.container').isVisible(),false);assert.deepEqual(errors,[]);
  console.log('Actual local Worker/SQLite + browser passed: authentication, CORS, concurrent saves, deletion, deductions, retry, unknown fields, six pages and logout.');
 }finally{if(browser)await browser.close();preview.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
