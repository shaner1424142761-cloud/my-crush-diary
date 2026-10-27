// Only the local simulated Worker is used. Never reads real diary records.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{startPreview}=require('./local-preview.cjs');
(async()=>{
 const preview=await startPreview({port:8770,backendPort:8882,quiet:true});let browser;
 try{
  assert.equal((await fetch(preview.website+'/schedule.html')).status,200,'schedule page exists');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'America/New_York'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>window.CrushDiary&&!window.CrushDiary.auth.locked&&!window.CrushDiary.store.isSyncing);
  const saved=()=>page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('已保存'));
  await page.goto(preview.website+'/schedule.html');await page.selectOption('#auth-username','yyf');await page.fill('#auth-password',preview.passwords.yyf);await page.click('#auth-submit');await ready();
  assert.ok(await page.locator('#schedule-calendar-scroll').evaluate(el=>el.scrollTop>=280),'desktop opens near morning after initial async render');
  assert.equal(await page.locator('.app-footer').evaluate(el=>getComputedStyle(el).position),'static','footer does not cover calendar events');
  await page.fill('#schedule-week-date','2026-10-26');await page.dispatchEvent('#schedule-week-date','change');
  async function add(kind,title,date,owner='yyf',until=''){
   await page.click('#schedule-new');await page.selectOption('#schedule-kind',kind);await page.fill('#schedule-title',title);await page.selectOption('#schedule-owner',owner);await page.fill('#schedule-date',date);await page.fill('#schedule-start','09:00');
   if(kind!=='ddl')await page.fill('#schedule-end','10:00');
   if(kind==='weekly'){for(const day of [1,3])await page.check('#schedule-weekdays input[value="'+day+'"]');if(until)await page.fill('#schedule-until',until);}
   await page.click('#schedule-save');await saved();
  }
  await add('weekly','固定课程','2026-10-26');assert.equal(await page.locator('.schedule-event').filter({hasText:'固定课程'}).count(),2);
  await add('busy','临时会议','2026-10-27','zxr');await add('ddl','交作业','2026-10-28','both');
  await page.selectOption('#schedule-filter','zxr');assert.equal(await page.locator('.schedule-event').filter({hasText:'固定课程'}).count(),0);assert.equal(await page.locator('.schedule-event').filter({hasText:'交作业'}).count(),1);await page.selectOption('#schedule-filter','all');
  await page.locator('.schedule-event').filter({hasText:'固定课程'}).last().click();await page.click('#schedule-edit-once');await page.fill('#schedule-date','2026-11-03');await page.fill('#schedule-start','15:00');await page.fill('#schedule-end','16:00');await page.click('#schedule-save');await saved();assert.equal(await page.locator('.schedule-event').filter({hasText:'固定课程'}).count(),1);
  await page.click('#schedule-next');assert.equal(await page.locator('.schedule-event').filter({hasText:'固定课程'}).count(),3);await page.click('#schedule-prev');
  await page.locator('.schedule-event').filter({hasText:'固定课程'}).click();page.once('dialog',d=>d.accept());await page.click('#schedule-cancel-once');await saved();assert.equal(await page.locator('.schedule-event').filter({hasText:'固定课程'}).count(),0);await page.click('#schedule-next');assert.equal(await page.locator('.schedule-event').filter({hasText:'固定课程'}).count(),3);await page.click('#schedule-prev');
  await page.locator('.schedule-event').filter({hasText:'交作业'}).click();await page.click('#schedule-complete');await saved();assert.equal(await page.locator('.schedule-event.is-done').filter({hasText:'交作业'}).count(),1);
  await page.locator('.schedule-event').filter({hasText:'临时会议'}).click();page.once('dialog',d=>d.accept());await page.click('#schedule-delete');await saved();
  await page.reload();await ready();await page.fill('#schedule-week-date','2026-10-26');await page.dispatchEvent('#schedule-week-date','change');assert.equal(await page.locator('.schedule-event').filter({hasText:'临时会议'}).count(),0);assert.equal(await page.locator('.schedule-event').filter({hasText:'固定课程'}).count(),0);
  // A second real login sees the same saved schedules and can add their own.
  const other=await browser.newContext({timezoneId:'Asia/Singapore'}),p2=await other.newPage();await p2.goto(preview.website+'/schedule.html');await p2.selectOption('#auth-username','zxr');await p2.fill('#auth-password',preview.passwords.zxr);await p2.click('#auth-submit');await p2.waitForFunction(()=>!window.CrushDiary.auth.locked&&!window.CrushDiary.store.isSyncing);
  assert.equal(await p2.evaluate(()=>window.CrushDiary.store.cloudData.schedules.filter(e=>e.kind==='weekly').length),1);
  await p2.click('#schedule-new');await p2.fill('#schedule-title','ZXR 的安排');await p2.fill('#schedule-date','2026-10-29');await p2.fill('#schedule-start','12:00');await p2.fill('#schedule-end','13:00');await p2.click('#schedule-save');await p2.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('已保存'));
  await page.reload();await ready();assert.ok(await page.evaluate(()=>window.CrushDiary.store.cloudData.schedules.some(e=>e.title==='ZXR 的安排'&&e.owner==='zxr')));
  // Simulate offline save; a real pending backup must contain the new event.
  await page.route(preview.api+'/**',route=>route.abort());await addOffline();
  async function addOffline(){await page.click('#schedule-new');await page.fill('#schedule-title','离线安排');await page.fill('#schedule-date','2026-10-30');await page.fill('#schedule-start','11:00');await page.fill('#schedule-end','12:00');await page.click('#schedule-save');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('保存失败'));assert.ok(await page.evaluate(()=>window.CrushDiary.loadLocalBackup().schedules.some(e=>e.title==='离线安排')));}
  await page.unrouteAll();await page.click('#schedule-sync');await saved();
  await page.fill('#schedule-week-date','2026-10-26');await page.dispatchEvent('#schedule-week-date','change');
  await add('weekly','已结束固定安排','2026-10-26','yyf','2026-10-26');
  await page.locator('.schedule-event').filter({hasText:'已结束固定安排'}).click();page.once('dialog',d=>d.accept());await page.click('#schedule-cancel-once');await saved();assert.equal(await page.locator('.schedule-event').filter({hasText:'已结束固定安排'}).count(),0);
  await page.locator('.schedule-series summary').click();await page.locator('#schedule-series-list button').filter({hasText:'已结束固定安排'}).click();
  assert.equal(await page.locator('#schedule-editor-delete').count(),1,'management editor can delete a series with no visible occurrences');
  page.once('dialog',d=>d.accept());await page.click('#schedule-editor-delete');await saved();assert.equal(await page.locator('#schedule-series-list button').filter({hasText:'已结束固定安排'}).count(),0);await page.locator('.schedule-series summary').click();
  const out=path.join(__dirname,'../.wrangler/schedule-qa');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no mobile horizontal overflow');await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('Schedule runtime passed: recurrence, cross-week exception, filters, DDL completion, deletion, two accounts, offline retry, mobile; screenshots: '+out);
 }finally{if(browser)await browser.close();preview.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
