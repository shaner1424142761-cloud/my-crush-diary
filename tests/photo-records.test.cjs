const test=require('node:test'),assert=require('node:assert/strict');
require('../shared/records.js');const rules=globalThis.CrushDiaryRecords.createRecordTools();
test('private photo metadata and separate entries survive old snapshots without changing old links',()=>{
 const old={url:'https://example.com/old',caption:'original',time:'10-01',extra:'preserve'},id='a'.repeat(64);
 const first={id:'entry-a',photoId:id,url:'private-photo:'+id,caption:'new',time:'2026-10-12T00:00:00.000Z'};
 const second={...first,id:'entry-b'};
 const merged=rules.mergeRecords({album:[old,first]},{album:[old,first,second]});
 assert.equal(merged.album.length,3);assert.deepEqual(merged.album.find(x=>x.url===old.url),old);
 assert.deepEqual(merged.album.find(x=>x.id==='entry-a'),first);
 assert.deepEqual(rules.normalizeFetched(merged).album,merged.album);
 assert.deepEqual(rules.mergeRecords(merged,{album:[first]}).album,merged.album);
});
