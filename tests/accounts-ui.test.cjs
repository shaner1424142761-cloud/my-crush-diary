const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(blocked=false){
 const saved=new Map(),CD={STORAGE_KEY:'myCrushDiary_backup_v1',auth:{user:null}},context=vm.createContext({window:{CrushDiary:CD},localStorage:{getItem:k=>saved.get(k),setItem(k,v){if(blocked)throw Error('blocked');saved.set(k,v);}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/store.js'),'utf8'),context);
 return {CD,saved};
}
for(const blocked of [false,true])test('pending records remain isolated per account even with blocked storage '+blocked,()=>{
 const {CD,saved}=setup(blocked);
 CD.activateUser({id:'yyf',name:'YYF'});CD.store.cloudData.messages.push({id:'a',authorId:'yyf',text:'YYF pending'});CD.saveLocalBackup(CD.store.cloudData);
 CD.activateUser({id:'zxr',name:'ZXR'});assert.equal(CD.store.cloudData.messages.length,0);
 CD.store.cloudData.messages.push({id:'b',authorId:'zxr',text:'ZXR pending'});CD.saveLocalBackup(CD.store.cloudData);
 CD.activateUser({id:'yyf',name:'YYF'});assert.equal(CD.store.cloudData.messages.length,1);assert.equal(CD.store.cloudData.messages[0].id,'a');
 if(!blocked){assert.ok(saved.has('myCrushDiary_backup_v2_yyf'));assert.ok(saved.has('myCrushDiary_backup_v2_zxr'));}
});
test('legacy backup is kept for explicit inspection and is never assigned to an account',()=>{
 const {CD,saved}=setup();const legacy={taHistory:[{change:3,time:'old'}],messages:[{text:'old',time:'old'}]};
 saved.set('myCrushDiary_backup_v1',JSON.stringify(legacy));CD.activateUser({id:'yyf'});
 assert.equal(CD.store.cloudData.messages.length,0);assert.equal(saved.get('myCrushDiary_backup_v1'),JSON.stringify(legacy));
 const pending=CD.inspectLegacyBackup({taHistory:legacy.taHistory,messages:[]});
 assert.equal(pending.taHistory.length,0);assert.equal(pending.messages.length,1);
});
test('a finished sync cannot re-enable controls belonging to the other account',()=>{
 const buttons=[{disabled:false}],CD={auth:{locked:false,user:{id:'yyf'}},store:{},updateScoreControls(){buttons[0].disabled=true;}};
 const context=vm.createContext({window:{CrushDiary:CD},document:{getElementById:()=>({style:{}}),querySelectorAll:()=>buttons}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui/sync-bar.js'),'utf8'),context);
 CD.initSyncBar();CD.setStatus('saved','green',false);assert.equal(buttons[0].disabled,true);
});
