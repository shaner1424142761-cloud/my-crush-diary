const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function tools() {
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/records.js'), 'utf8'), ctx);
    return ctx.CrushDiaryRecords.createRecordTools();
}
test('shared rules preserve future cloud fields without window or DOM', () => {
    const rules = tools();
    const remote = { taScore: 13, taHistory: [{id:'a',change:10,time:'10-01'}], futureSection:{note:'keep'} };
    const migrated = rules.mergeRecords(rules.normalizeFetched(remote), {});
    assert.equal(migrated.taScore, 13);
    assert.deepEqual(JSON.parse(JSON.stringify(migrated.futureSection)), {note:'keep'});
    const later = rules.mergeRecords(migrated, {taHistory:[{id:'b',change:-20,time:'10-02'}]});
    assert.equal(later.taScore, -7);
    assert.equal(rules.mergeRecords(later, remote).taScore, -7);
});
test('shared rules retain deletion markers and every uncapped memory', () => {
    const rules = tools();
    const old = { wishes: Array.from({length:60}, (_,i)=>({id:'w'+i,text:'wish'+i,updatedAt:i})) };
    const merged = rules.mergeRecords(old, {deletedItems:{wishes:{w0:100}}});
    assert.equal(merged.wishes.length, 59);
    assert.equal(rules.mergeRecords(merged, old).wishes.length, 59);
});

test('both home ledgers sort legacy unpadded months and days by calendar time',()=>{
 const rules=tools();const times=['9-30 23:59','10-01 08:00','2-10 09:00','12-01 00:00','10-1 09:00','10-01 09:00','10-01 08:59'];
 const history=times.map((time,i)=>({id:String(i),time,change:i%2?-1:2,reason:'keep'}));
 const original=JSON.stringify(history);const merged=rules.mergeRecords({taScore:17,myScore:23,taHistory:history,myHistory:history},{});
 for(const side of ['ta','my']){
  assert.deepEqual(Array.from(merged[side+'History'],item=>item.id),['3','4','5','6','1','0','2']);
  assert.equal(merged[side+'Score'],side==='ta'?17:23);
 }
 assert.equal(JSON.stringify(history),original);
});
