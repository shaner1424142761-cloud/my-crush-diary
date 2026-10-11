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
