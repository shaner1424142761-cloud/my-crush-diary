(function (CD) {
    CD.initSyncBar();
    CD.mountLoveCalendar();
    CD.updateLoveCalendar();

    function newAnnivId() {
        return 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }

    document.getElementById('btn-add-anniv').addEventListener('click', async function () {
        if (CD.store.isSyncing) return;
        var titleEl = document.getElementById('anniv-title');
        var dateEl = document.getElementById('anniv-date');
        var noteEl = document.getElementById('anniv-note');
        var title = (titleEl && titleEl.value || '').trim();
        var dateStr = (dateEl && dateEl.value || '').trim();
        var note = (noteEl && noteEl.value || '').trim();
        if (!title) {
            alert('给这个日子起个名字吧～');
            return;
        }
        if (!dateStr || !CD.parseYmd(dateStr)) {
            alert('请选择有效的日期');
            return;
        }
        if (!CD.store.cloudData.anniversaries) CD.store.cloudData.anniversaries = [];
        var now = Date.now();
        CD.store.cloudData.anniversaries.unshift({
            id: newAnnivId(),
            title: title.slice(0, CD.MAX_ANNIV_TITLE),
            date: dateStr,
            note: note.slice(0, CD.MAX_ANNIV_NOTE),
            time: CD.getTimeString(),
            updatedAt: now
        });
        if (CD.store.cloudData.anniversaries.length > CD.MAX_ANNIVERSARIES) {
            CD.store.cloudData.anniversaries.pop();
        }
        titleEl.value = '';
        dateEl.value = '';
        noteEl.value = '';
        CD.renderAnniversaries();
        await CD.saveDataToCloud();
    });

    document.getElementById('anniv-list').addEventListener('click', async function (e) {
        var t = e.target;
        if (!t || !t.classList || !t.classList.contains('anniv-item__del')) return;
        if (CD.store.isSyncing) return;
        var id = t.dataset.annivId;
        if (!confirm('确定删除这条纪念日吗？')) return;
        CD.store.cloudData.anniversaries = (CD.store.cloudData.anniversaries || []).filter(function (x) {
            return x.id !== id;
        });
        CD.renderAnniversaries();
        await CD.saveDataToCloud();
    });

    CD.loadDataFromCloud(CD.renderAnniversaries);
})(window.CrushDiary);
