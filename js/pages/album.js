(function (CD) {
    CD.initSyncBar();
    CD.mountLoveCalendar();
    CD.updateLoveCalendar();

    document.getElementById('btn-add-album').addEventListener('click', async function () {
        if (CD.store.isSyncing) return;
        var urlEl = document.getElementById('album-url');
        var capEl = document.getElementById('album-caption');
        var url = (urlEl && urlEl.value || '').trim();
        if (!/^https?:\/\//i.test(url)) {
            alert('请填写以 http:// 或 https:// 开头的图片链接');
            return;
        }
        var caption = (capEl && capEl.value || '').trim().slice(0, 40);
        if (!CD.store.cloudData.album) CD.store.cloudData.album = [];
        CD.store.cloudData.album.unshift({ url: url, caption: caption, time: CD.getTimeString() });
        if (CD.store.cloudData.album.length > CD.MAX_ALBUM) CD.store.cloudData.album.pop();
        urlEl.value = '';
        capEl.value = '';
        CD.renderAlbum();
        await CD.saveDataToCloud();
    });

    CD.loadDataFromCloud(CD.renderAlbum);
})(window.CrushDiary);
