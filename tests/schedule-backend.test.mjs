import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../backend/http.mjs';
import {authorizeChanges} from '../backend/permissions.mjs';
const busy={id:'event',kind:'busy',owner:'yyf',title:'Meeting',date:'2026-10-27',start:'09:00',end:'10:00',updatedAt:1};
test('backend rejects invalid schedule data before cloud merge',()=>{assert.doesNotThrow(()=>validateRecord({schedules:[busy]}));for(const extra of [{date:'2026-02-30'},{owner:'unknown'},{end:'08:00'},{kind:'weekly',weekdays:[]},{title:'x'.repeat(81)}])assert.throws(()=>validateRecord({schedules:[{...busy,...extra}]}),e=>e.status===400);assert.throws(()=>validateRecord({schedules:'bad'}),e=>e.status===400);});
test('both authenticated accounts can collaborate on either schedule',()=>{for(const id of ['yyf','zxr'])assert.equal(authorizeChanges({}, {schedules:[busy]},id).schedules[0].title,'Meeting');});
