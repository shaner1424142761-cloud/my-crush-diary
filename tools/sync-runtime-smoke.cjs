// Real local Worker and synthetic scores only; no production URLs or user data.
const assert=require('node:assert/strict'),{startPreview}=require('./local-preview.cjs');
(async()=>{
 const preview=await startPreview({port:8771,backendPort:8883,quiet:true});let browser;
 try{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(preview.website);await page.selectOption('#auth-username','yyf');await page.fill('#auth-password',preview.passwords.yyf);await page.click('#auth-submit');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing&&!window.CrushDiary.auth.locked);
  // GET works while PUT fails: precisely the production symptom.
  await page.route(preview.api+'/diary',route=>route.request().method()==='PUT'?route.fulfill({status:502,contentType:'application/json',headers:{'Access-Control-Allow-Origin':preview.website},body:JSON.stringify({message:'模拟记录库拒绝保存（HTTP 403）'})}):route.continue());
  await page.click('#btn-my-plus5');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('保存失败'));
  assert.equal(await page.evaluate(()=>window.CrushDiary.loadLocalBackup().myScore),5);
  await page.reload();await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing&&!window.CrushDiary.auth.locked);
  assert.match(await page.locator('#syncStatus').textContent(),/待同步/);
  assert.equal(await page.locator('#sync-retry').isVisible(),true,'home page has a retry action');
  await page.unrouteAll();await page.click('#sync-retry');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('数据已保存'));assert.equal(await page.locator('#sync-retry').isVisible(),false);
  await page.reload();await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing&&!window.CrushDiary.auth.locked);assert.equal(await page.evaluate(()=>window.CrushDiary.store.cloudData.myScore),5);assert.equal(await page.evaluate(()=>window.CrushDiary.store.cloudData.myHistory.length),1);
  // A second device/account sees the recovered score, without duplicate retries.
  const other=await browser.newContext(),second=await other.newPage();await second.goto(preview.website);await second.selectOption('#auth-username','zxr');await second.fill('#auth-password',preview.passwords.zxr);await second.click('#auth-submit');await second.waitForFunction(()=>!window.CrushDiary.store.isSyncing&&!window.CrushDiary.auth.locked);assert.equal(await second.locator('#score-my').textContent(),'5');
  assert.deepEqual(errors,[]);console.log('Score recovery passed: failed PUT, safe local backup, reload pending warning, one-click retry from home, confirmed cloud persistence and second account visibility, no duplicate score.');
 }finally{if(browser)await browser.close();preview.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
