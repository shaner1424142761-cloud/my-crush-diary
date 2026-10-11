const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(fetch) {
    const storage = new Map();
    const context = vm.createContext({
        window: { CrushDiary: { BIN_ID: 'test-only' } },
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value)
        },
        fetch: fetch || (() => { throw new Error('Unexpected network call'); }),
        console
    });
    function run(file) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    ['js/constants.js', 'js/store.js', 'js/merge.js'].forEach(run);
    const cd = context.window.CrushDiary;
    cd.setStatus = (text, color, syncing) => { cd.store.isSyncing = syncing; cd.status = text; };
    run('js/api.js');
    return { cd, storage, run, context };
}
function ledger(score = 10) {
    return {
        taScore: score, taHistory: [{ id: 'initial', change: 10, time: '10-01 12:00' }],
        myScore: 0, myHistory: [], messages: [], album: [], blogPosts: [],
        wishes: [{ id: 'wish-1', text: '旅行', done: false, time: '10-01 12:00', updatedAt: 1 }],
        anniversaries: [{ id: 'anniv-1', title: '在一起', date: '2026-03-23', updatedAt: 1 }]
    };
}
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

test('deductions survive merging an older cloud total', () => {
    const { cd } = setup();
    const remote = ledger();
    const local = ledger(7);
    local.taHistory.push({ id: 'minus', change: -3, time: '10-02 12:00' });
    assert.equal(cd.mergeRecords(remote, local).taScore, 7);
});
test('concurrent independent score changes are counted once', () => {
    const { cd } = setup();
    const remote = ledger(20);
    remote.taHistory.push({ id: 'plus', change: 10, time: '10-02 12:01' });
    const local = ledger(7);
    local.taHistory.push({ id: 'minus', change: -3, time: '10-02 12:00' });
    const merged = cd.mergeRecords(remote, local);
    assert.equal(merged.taScore, 17);
    assert.equal(cd.mergeRecords(merged, local).taScore, 17);
    assert.equal(merged.taHistory.length, 3);
});
test('legacy total offsets survive migration and later deductions', () => {
    const { cd } = setup();
    const remote = ledger(13);
    const migrated = cd.mergeRecords(remote, remote);
    assert.equal(migrated.taScore, 13);
    const local = plain(migrated);
    local.taScore -= 20;
    local.taHistory.push({ id: 'minus', change: -20, time: '10-02 12:00' });
    const merged = cd.mergeRecords(migrated, local);
    assert.equal(merged.taScore, -7);
    assert.equal(cd.mergeRecords(merged, remote).taScore, -7);
});
for (const section of ['wishes', 'anniversaries']) {
    test(`${section}: deletion survives repeated sync with a stale device`, () => {
        const { cd } = setup();
        const remote = ledger();
        const id = remote[section][0].id;
        const local = ledger();
        local[section] = [];
        local.deletedItems = { [section]: { [id]: 100 } };
        const merged = cd.mergeRecords(remote, local);
        assert.equal(merged[section].length, 0);
        assert.equal(cd.mergeRecords(merged, remote)[section].length, 0);
        assert.equal(cd.mergeRecords(remote, merged)[section].length, 0);
    });
}
test('backup and cloud normalization retain deletion and score metadata', () => {
    const { cd } = setup();
    const record = ledger(13);
    record.scoreBaseline = { ta: 3, my: 0 };
    record.deletedItems = { wishes: { 'deleted-wish': 100 }, anniversaries: {} };
    cd.saveLocalBackup(record);
    for (const restored of [cd.loadLocalBackup(), cd.normalizeFetched(record)]) {
        assert.deepEqual(plain(restored.scoreBaseline), record.scoreBaseline);
        assert.deepEqual(plain(restored.deletedItems), record.deletedItems);
    }
});
test('merging never silently discards old records when count limits are exceeded', () => {
    const { cd } = setup();
    const record = ledger();
    record.blogPosts = Array.from({ length: 25 }, (_, i) => ({ title: `日记${i}`, body: '记忆', time: String(i) }));
    record.album = Array.from({ length: 30 }, (_, i) => ({ url: `https://example.org/${i}.jpg`, caption: '', time: String(i) }));
    record.wishes = Array.from({ length: 60 }, (_, i) => ({ id: `wish-${i}`, text: `愿望${i}`, updatedAt: i }));
    record.anniversaries = Array.from({ length: 35 }, (_, i) => ({ id: `anniv-${i}`, title: `纪念${i}`, date: '2026-03-23', updatedAt: i }));
    const merged = cd.mergeRecords(record, record);
    assert.equal(merged.blogPosts.length, 25);
    assert.equal(merged.album.length, 30);
    assert.equal(merged.wishes.length, 60);
    assert.equal(merged.anniversaries.length, 35);
});
test('failed cloud refetch cannot upload a stale snapshot over other records', async () => {
    let puts = 0;
    const { cd } = setup(async (url, options = {}) => {
        if (options.method === 'PUT') { puts++; return { ok: true }; }
        throw new Error('Offline');
    });
    cd.store.cloudData = ledger();
    await cd.saveDataToCloud();
    assert.equal(puts, 0);
    assert.equal(cd.loadLocalBackup().wishes.length, 1);
    assert.equal(cd.store.isSyncing, false);
});
test('loading an empty cloud is read-only, even when a local backup exists', async () => {
    let puts = 0;
    const { cd } = setup(async (url, options = {}) => {
        if (options.method === 'PUT') puts++;
        return { ok: true, json: async () => ({ record: {} }) };
    });
    cd.saveLocalBackup(ledger());
    await cd.loadDataFromCloud(() => {});
    assert.equal(puts, 0);
    assert.equal(cd.store.cloudData.taHistory.length, 1);
});

test('both ledgers retain negative totals through reload and repeated sync', () => {
    const { cd } = setup();
    const remote = ledger();
    remote.myScore = 5;
    remote.myHistory = [{ id: 'my-initial', change: 5, time: '10-01 12:00' }];
    const local = plain(cd.mergeRecords(remote, remote));
    local.taHistory.push({ id: 'ta-minus', change: -15, time: '10-02 12:00' });
    local.myHistory.push({ id: 'my-minus', change: -10, time: '10-02 12:00' });
    const merged = cd.mergeRecords(remote, local);
    cd.saveLocalBackup(merged);
    const restored = cd.mergeRecords(merged, cd.loadLocalBackup());
    assert.equal(restored.taScore, -5);
    assert.equal(restored.myScore, -5);
});

test('delete action persists its marker before networking and keeps unrelated memories', () => {
    const { cd } = setup();
    cd.store.cloudData = ledger();
    cd.deleteRecord('wishes', 'wish-1');
    const backup = cd.loadLocalBackup();
    assert.equal(backup.wishes.length, 0);
    assert.ok(backup.deletedItems.wishes['wish-1'] > 0);
    assert.equal(backup.anniversaries.length, 1);
    assert.equal(backup.taHistory.length, 1);
});

test('a malformed cloud response cannot trigger a destructive upload', async () => {
    let puts = 0;
    const { cd } = setup(async (url, options = {}) => {
        if (options.method === 'PUT') puts++;
        return { ok: true, json: async () => ({ record: { messages: 'broken' } }) };
    });
    cd.store.cloudData = ledger();
    await cd.saveDataToCloud();
    assert.equal(puts, 0);
    assert.equal(cd.loadLocalBackup().taScore, 10);
});

test('pending local changes are backed up before awaiting the cloud', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const { cd } = setup(async (url, options = {}) => {
        if (options.method === 'PUT') return { ok: true };
        await waiting;
        throw new Error('Offline');
    });
    cd.store.cloudData = ledger();
    const saving = cd.saveDataToCloud();
    assert.equal(cd.loadLocalBackup()?.taHistory.length, 1);
    release();
    await saving;
});

test('successful sync persists deletion markers and redraws the merged score', async () => {
    let cloud = ledger();
    const { cd } = setup(async (url, options = {}) => {
        if (options.method === 'PUT') {
            cloud = JSON.parse(options.body);
            return { ok: true };
        }
        return { ok: true, json: async () => ({ record: plain(cloud) }) };
    });
    let displayedScore;
    await cd.loadDataFromCloud(() => { displayedScore = cd.store.cloudData.taScore; });
    cd.deleteRecord('wishes', 'wish-1');
    cd.store.cloudData.taScore -= 3;
    cd.store.cloudData.taHistory.push({ id: 'minus', change: -3, time: '10-02 12:00' });
    cloud.taHistory.push({ id: 'other-device', change: 5, time: '10-02 12:01' });
    cloud.taScore = 15;
    await cd.saveDataToCloud();
    assert.equal(cloud.taScore, 12);
    assert.equal(cloud.wishes.length, 0);
    assert.ok(cloud.deletedItems.wishes['wish-1']);
    assert.equal(displayedScore, 12);
    assert.equal(cd.store.isSyncing, false);
});

test('saving requests a cloud history version instead of destroying the last snapshot', async () => {
    let versioning;
    const { cd } = setup(async (url, options = {}) => {
        if (options.method === 'PUT') {
            versioning = options.headers['X-Bin-Versioning'];
            return { ok: true };
        }
        return { ok: true, json: async () => ({ record: ledger() }) };
    });
    cd.store.cloudData = ledger();
    await cd.saveDataToCloud();
    assert.equal(versioning, 'true');
});

function pageSetup(page, data, remoteData = data) {
    const env = setup(async (url, options = {}) => {
        if (options.method === 'PUT') return { ok: true };
        return { ok: true, json: async () => ({ record: plain(remoteData) }) };
    });
    const elements = new Map();
    env.context.document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, {
                value: '', listeners: {},
                addEventListener(type, handler) { this.listeners[type] = handler; }
            });
            return elements.get(id);
        }
    };
    env.context.alert = message => { throw new Error(message); };
    env.context.confirm = () => true;
    for (const method of ['initSyncBar', 'mountLoveCalendar', 'updateLoveCalendar', 'renderWishlist', 'renderAnniversaries', 'renderAlbum', 'renderBlog']) {
        env.cd[method] = () => {};
    }
    // These page tests exercise event handlers; cloud loading is covered above.
    env.cd.loadDataFromCloud = () => {};
    env.cd.store.cloudData = plain(data);
    env.run('js/util/time.js');
    env.run('js/pages/' + page + '.js');
    env.element = id => env.context.document.getElementById(id);
    return env;
}

for (const section of ['wishes', 'anniversaries']) {
    test(`${section}: clicking delete writes a lasting deletion marker`, async () => {
        const data = ledger();
        const env = pageSetup(section, data);
        const wish = section === 'wishes';
        const id = wish ? 'wish-1' : 'anniv-1';
        const button = {
            classList: { contains: name => name === (wish ? 'wish-item__del' : 'anniv-item__del') },
            dataset: wish ? { wishId: id } : { annivId: id }
        };
        await env.element(wish ? 'wish-list' : 'anniv-list').listeners.click({ target: button });
        assert.equal(env.cd.store.cloudData[section].length, 0);
        assert.ok(env.cd.loadLocalBackup().deletedItems[section][id]);
    });
}

for (const entry of [
    { page: 'album', field: 'album', count: 24, button: 'btn-add-album', inputs: { 'album-url': 'https://example.org/new.jpg', 'album-caption': '新的回忆' }, item: i => ({ url: `https://example.org/${i}.jpg`, caption: '旧照片', time: String(i) }) },
    { page: 'blog', field: 'blogPosts', count: 20, button: 'btn-publish-blog', inputs: { 'blog-title': '新日记', 'blog-body': '记忆' }, item: i => ({ title: `旧日记${i}`, body: '记忆', time: String(i) }) },
    { page: 'wishes', field: 'wishes', count: 50, button: 'btn-add-wish', inputs: { 'wish-input': '新的愿望' }, item: i => ({ id: `w-${i}`, text: `旧愿望${i}`, done: false, time: String(i), updatedAt: i }) },
    { page: 'anniversaries', field: 'anniversaries', count: 30, button: 'btn-add-anniv', inputs: { 'anniv-title': '新纪念日', 'anniv-date': '2026-03-23', 'anniv-note': '记忆' }, item: i => ({ id: `a-${i}`, title: `旧纪念日${i}`, date: '2026-03-23', note: '记忆', time: String(i), updatedAt: i }) }
]) {
    test(`${entry.page}: adding beyond the old limit retains all earlier memories`, async () => {
        const data = ledger();
        data[entry.field] = Array.from({ length: entry.count }, (_, i) => entry.item(i));
        const remote = plain(data);
        // One earlier memory is still local-only: a refetch cannot rescue it.
        remote[entry.field] = remote[entry.field].slice(0, -1);
        const env = pageSetup(entry.page, data, remote);
        if (entry.page === 'anniversaries') env.run('js/ui/render-anniversaries.js');
        // The renderer is irrelevant to persistence; keep the real date parser.
        if (entry.page === 'anniversaries') env.cd.renderAnniversaries = () => {};
        for (const [id, value] of Object.entries(entry.inputs)) env.element(id).value = value;
        await env.element(entry.button).listeners.click();
        const saved = env.cd.loadLocalBackup()[entry.field];
        assert.equal(saved.length, entry.count + 1);
        for (const old of data[entry.field]) assert.ok(saved.some(item => JSON.stringify(item) === JSON.stringify(old)), 'old memory missing');
    });
}
