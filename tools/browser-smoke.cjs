// Local fake-cloud browser acceptance only. No production URLs or credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
require('../shared/records.js');
const tools=globalThis.CrushDiaryRecords.createRecordTools();
const root=path.resolve(__dirname,'..');
let cloud={taScore:13,taHistory:[{id:'first',change:10,time:'10-01',reason:'模拟积分'}],myScore:0,myHistory:[],messages:[{text:'模拟留言',time:'10-01'}],album:[],blogPosts:[],wishes:[{id:'w',text:'模拟愿望',done:false,updatedAt:1}],anniversaries:[]};
let reject=false,offline=false,puts=0,reads=0;
const server=http.createServer(async(req,res)=>{
 try {
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')) {
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
   let body='';for await(const chunk of req)body+=chunk;
   if(pathname==='/api/auth/login'){res.end(JSON.stringify({token:'mock-session',expiresAt:Math.floor(Date.now()/1000)+604800}));return;}
   if(reject || req.headers.authorization!=='Bearer mock-session'){res.writeHead(401);res.end('{}');return;}
   if(offline){res.writeHead(503);res.end('{}');return;}
   if(req.method==='PUT'){puts++;cloud=tools.mergeRecords(cloud,JSON.parse(body));}else reads++;
   res.end(JSON.stringify({record:cloud}));return;
  }
  if(pathname==='/js/config.js') {res.setHeader('Content-Type','text/javascript');res.end(`window.CrushDiary={API_BASE_URL:'http://127.0.0.1:${server.address().port}/api'};`);return;}
  const relative=pathname==='/'?'index.html':pathname.slice(1);
  if(!/^(?:[a-z]+\.html|(?:js|css|shared)\/[^.][\w/.-]+)$/.test(relative)){res.writeHead(404);res.end();return;}
  const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))throw new Error('path');
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(target)];
  res.setHeader('Content-Type',type||'application/octet-stream');res.end(fs.readFileSync(target));
 }catch(_){res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url);await page.waitForSelector('#auth-panel');assert.equal(reads,0);
  assert.equal(await page.locator('.container').isVisible(),false);
  await page.fill('#auth-password','mock-private-password');await page.click('#auth-submit');
  await page.waitForFunction(()=>window.CrushDiary.store.cloudData.taScore===13 && !window.CrushDiary.store.isSyncing);
  await page.click('#btn-ta-minus3');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('已保存'));assert.equal(cloud.taScore,10);
  for(const file of ['album','blog','messages','wishes','anniversaries']){
   await page.goto(url+'/'+file+'.html');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);assert.equal(await page.locator('#auth-panel').isVisible(),false);
  }
  await page.goto(url+'/wishes.html');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);
  page.once('dialog',dialog=>dialog.accept());await page.click('.wish-item__del');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('已保存'));assert.equal(cloud.wishes.length,0);
  await page.goto(url+'/messages.html');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);
  offline=true;await page.fill('#msg-input','模拟离线留言');await page.click('#btn-msg-send');await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('保存失败'));
  assert.ok(await page.evaluate(()=>localStorage.getItem('myCrushDiary_backup_v1').includes('模拟离线留言')));
  offline=false;await page.click('#btn-topbar-refresh');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);
  await page.evaluate(()=>window.CrushDiary.saveDataToCloud());assert.ok(cloud.messages.some(item=>item.text==='模拟离线留言'));
  reject=true;await page.click('#btn-topbar-refresh');await page.waitForSelector('#auth-panel',{state:'visible'});assert.equal(await page.locator('.container').isVisible(),false);
  reject=false;await page.fill('#auth-password','mock-private-password');await page.click('#auth-submit');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);
  const before=puts;await page.evaluate(()=>window.CrushDiary.logout());assert.equal(puts,before);
  assert.ok(await page.evaluate(()=>!!localStorage.getItem('myCrushDiary_backup_v1')));
  await page.setViewportSize({width:390,height:844});await page.check('#auth-remember');await page.fill('#auth-password','mock-private-password');await page.click('#auth-submit');await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);
  await page.reload();await page.waitForFunction(()=>!window.CrushDiary.store.isSyncing);assert.equal(await page.locator('#auth-panel').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('Browser acceptance passed: six pages, deductions, deletion, offline recovery, expiry, logout, remembered mobile login.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
