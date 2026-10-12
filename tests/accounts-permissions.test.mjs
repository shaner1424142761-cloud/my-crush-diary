import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeChanges,legacyImport} from '../backend/permissions.mjs';
import '../shared/records.js';
const rules=globalThis.CrushDiaryRecords.createRecordTools();
const base=()=>({taScore:13,taHistory:[{id:'old',time:'old',change:10}],myScore:0,myHistory:[],messages:[{text:'old',time:'old'}]});
test('only the partner can add scores, and totals use trusted remote offsets',()=>{
 const remote=base();
 const local={...remote,myHistory:[{id:'new',time:'new',change:-5}],myScore:999,scoreBaseline:{ta:999,my:999}};
 const safe=authorizeChanges(remote,local,'yyf');
 const merged=rules.mergeRecords(rules.mergeRecords(remote,{}),safe);
 assert.equal(merged.taScore,13);assert.equal(merged.myScore,-5);
 assert.equal(safe.myHistory[0].authorId,'yyf');
 assert.throws(()=>authorizeChanges(remote,local,'zxr'),e=>e.status===403);
 assert.throws(()=>authorizeChanges(remote,{myHistory:[{id:'x',change:1,authorId:'zxr'}]},'yyf'),e=>e.status===403);
 const empty=rules.mergeRecords(rules.mergeRecords({},{}),authorizeChanges({}, {myScore:999,scoreBaseline:{my:999}},'yyf'));
 assert.equal(empty.myScore,0);
});
test('old snapshots preserve remote events while reused identifiers cannot edit them',()=>{
 const remote=base();
 assert.doesNotThrow(()=>authorizeChanges(remote,{taHistory:remote.taHistory},'yyf'));
 assert.throws(()=>authorizeChanges(remote,{taHistory:[{...remote.taHistory[0],change:99}]},'zxr'),e=>e.status===409);
 assert.throws(()=>authorizeChanges(remote,{messages:[{id:'new',text:'hi',authorId:'zxr'}]},'yyf'),e=>e.status===403);
 assert.throws(()=>authorizeChanges(remote,{messages:[{text:'new',time:'today'}]},'yyf'),e=>e.status===400);
});
test('same-time messages keep distinct IDs and trusted authors without labelling old messages',()=>{
 const remote=base();
 const a=authorizeChanges(remote,{messages:[{id:'a',text:'hi',time:'now'}]},'yyf');
 const b=authorizeChanges(remote,{messages:[{id:'b',text:'hi',time:'now'}]},'zxr');
 const merged=rules.mergeRecords(rules.mergeRecords(remote,a),b);
 assert.equal(merged.messages.length,3);assert.deepEqual(merged.messages[0],remote.messages[0]);
 assert.equal(merged.messages[1].authorId,'yyf');assert.equal(merged.messages[2].authorId,'zxr');
});
test('explicit legacy recovery is idempotent, role-bound, and keeps messages unsigned',async()=>{
 const request={target:'my',history:[{change:-2,time:'past'}],messages:[{text:'past',time:'past'}]};
 assert.throws(()=>legacyImport(base(),request,'zxr'),e=>e.status===403);
 const first=legacyImport(base(),request,'yyf');
 const merged=rules.mergeRecords(rules.mergeRecords(base(),{}),first);
 const twice=rules.mergeRecords(merged,legacyImport(merged,request,'yyf'));
 assert.equal(twice.myScore,-2);assert.equal(twice.myHistory.length,1);assert.equal(twice.messages.length,2);
 assert.equal(twice.messages[1].authorId,undefined);assert.equal(twice.messages[1].importedBy,'yyf');
});
test('explicit shared recovery preserves local-only memories, wish changes and deletions',()=>{
 const remote={...base(),wishes:[{id:'w',text:'trip',done:false,updatedAt:1},{id:'deleted',text:'remove',updatedAt:1}]};
 const request={target:'my',history:[],messages:[],shared:{album:[{url:'https://example.com/photo',caption:'old',time:'old'}],blogPosts:[{title:'old',body:'old',time:'old'}],wishes:[{id:'w',text:'trip',done:true,updatedAt:2}],anniversaries:[{id:'a',title:'day',date:'2026-01-01'}],deletedItems:{wishes:{deleted:3},anniversaries:{}}}};
 const merged=rules.mergeRecords(rules.mergeRecords(remote,{}),legacyImport(remote,request,'yyf'));
 for(const field of ['album','blogPosts','anniversaries'])assert.equal(merged[field].length,1);
 assert.equal(merged.wishes.length,1);assert.equal(merged.wishes[0].done,true);assert.equal(merged.deletedItems.wishes.deleted,3);
 const twice=rules.mergeRecords(merged,legacyImport(merged,request,'yyf'));assert.deepEqual(twice,merged);
});
