(function (CD) {
    CD.initSyncBar();
    CD.mountLoveCalendar();
    CD.updateLoveCalendar();

    function newWishId() {
        return 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }

    document.getElementById('wish-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-add-wish').click();
        }
    });

    document.getElementById('btn-add-wish').addEventListener('click', async function () {
        if (CD.store.isSyncing) return;
        var input = document.getElementById('wish-input');
        var raw = (input && input.value || '').trim();
        if (!raw) {
            alert('先写一点想做的事吧～');
            return;
        }
        if (!CD.store.cloudData.wishes) CD.store.cloudData.wishes = [];
        var now = Date.now();
        CD.store.cloudData.wishes.unshift({
            id: newWishId(),
            text: raw.slice(0, CD.MAX_WISH_TEXT),
            done: false,
            time: CD.getTimeString(),
            updatedAt: now
        });
        if (CD.store.cloudData.wishes.length > CD.MAX_WISHES) {
            CD.store.cloudData.wishes.pop();
        }
        input.value = '';
        CD.renderWishlist();
        await CD.saveDataToCloud();
    });

    document.getElementById('wish-list').addEventListener('change', async function (e) {
        var t = e.target;
        if (!t || t.type !== 'checkbox' || !t.classList.contains('wish-item__check')) return;
        if (CD.store.isSyncing) return;
        var id = t.dataset.wishId;
        var arr = CD.store.cloudData.wishes || [];
        var item = arr.filter(function (x) { return x.id === id; })[0];
        if (!item) return;
        item.done = t.checked;
        item.updatedAt = Date.now();
        CD.renderWishlist();
        await CD.saveDataToCloud();
    });

    document.getElementById('wish-list').addEventListener('click', async function (e) {
        var t = e.target;
        if (!t || !t.classList || !t.classList.contains('wish-item__del')) return;
        if (CD.store.isSyncing) return;
        var id = t.dataset.wishId;
        if (!confirm('确定删掉这条愿望吗？')) return;
        CD.store.cloudData.wishes = (CD.store.cloudData.wishes || []).filter(function (x) {
            return x.id !== id;
        });
        CD.renderWishlist();
        await CD.saveDataToCloud();
    });

    CD.loadDataFromCloud(CD.renderWishlist);
})(window.CrushDiary);
