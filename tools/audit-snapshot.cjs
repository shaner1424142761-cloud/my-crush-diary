const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('../shared/records.js');
try {
    const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
    const original = raw.record || raw;
    const tools = globalThis.CrushDiaryRecords.createRecordTools();
    const merged = tools.mergeRecords(tools.normalizeFetched(original), {});
    const plain = value => JSON.parse(JSON.stringify(value));
    const sections = { taHistory:'history', myHistory:'history', messages:'message', album:'album', blogPosts:'blog', wishes:'wish', anniversaries:'anniversary' };
    for (const [section, key] of Object.entries(sections)) {
        const sort = arr => arr.slice().sort((a,b)=>tools.keys[key](a).localeCompare(tools.keys[key](b)));
        assert.deepEqual(sort(plain(merged[section])), sort(original[section] || []), section);
        console.log(section + ': ' + merged[section].length + ' records preserved');
    }
    assert.equal(merged.taScore, original.taScore ?? original.score ?? 0);
    assert.equal(merged.myScore, original.myScore ?? 0);
    console.log('Original contents and both score totals preserved.');
} catch (error) {
    // Assertions may contain private content; only report the category.
    console.error('Snapshot audit failed: ' + (error.code || error.name));
    process.exitCode = 1;
}
