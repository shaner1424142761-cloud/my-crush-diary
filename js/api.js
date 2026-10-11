(function (CD) {
    async function fetchLatestRecord() {
        var response = await fetch(CD.FETCH_URL + '?t=' + Date.now(), {
            headers: { 'X-Master-Key': CD.API_KEY, 'Cache-Control': 'no-cache' },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('拉取失败');
        var data = await response.json();
        var rec = data.record;
        return CD.normalizeFetched(rec);
    }

    function afterLoadRender(onRender) {
        if (onRender) onRender();
        if (CD.refreshNavBadges) CD.refreshNavBadges();
    }

    CD.loadDataFromCloud = async function (onRender) {
        if (CD.store.isSyncing) return;
        CD.store.onRender = onRender;
        if (CD.BIN_ID.indexOf('这里填入') !== -1) {
            afterLoadRender(onRender);
            return;
        }

        var initialBackup = CD.loadLocalBackup();
        if (initialBackup) {
            CD.store.cloudData = initialBackup;
            afterLoadRender(onRender);
        }

        CD.setStatus('☁️ 正在拉取云端…', '#ffaa33', true);

        try {
            var normalized = await fetchLatestRecord();
            var backup = CD.loadLocalBackup();
            var localOnly = CD.isCloudEmpty(normalized) && backup && !CD.isCloudEmpty(backup);

            CD.store.cloudData = CD.mergeRecords(normalized, CD.store.cloudData);
            CD.saveLocalBackup(CD.store.cloudData);
            afterLoadRender(onRender);
            if (localOnly) {
                CD.setStatus('📦 云端为空，已显示本机备份；尚未上传', '#ff8800', false);
            } else {
                CD.setStatus('✅ 数据已最新', '#32cd32', false);
            }
        } catch (e) {
            var backup2 = CD.loadLocalBackup();
            if (backup2 && !CD.isCloudEmpty(backup2)) {
                CD.store.cloudData = backup2;
                afterLoadRender(onRender);
                CD.setStatus('⚠️ 云端不可用，已显示本机备份（换网络后可再试同步）', '#ff8800', false);
            } else {
                CD.setStatus('❌ 同步失败', 'red', false);
                afterLoadRender(onRender);
            }
        }
    };

    CD.saveDataToCloud = async function () {
        if (CD.store.isSyncing) return false;
        // Persist the user's action before the first network await.
        CD.saveLocalBackup(CD.store.cloudData);
        CD.setStatus('⬆️ 上传中...', '#ffaa33', true);
        var saved = false;
        try {
            // Never overwrite the cloud unless its current state was read successfully.
            var remote = await fetchLatestRecord();
            CD.store.cloudData = CD.mergeRecords(remote, CD.store.cloudData);
            CD.saveLocalBackup(CD.store.cloudData);
            var response = await fetch(CD.UPDATE_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CD.API_KEY,
                    'X-Bin-Versioning': 'true'
                },
                body: JSON.stringify(CD.store.cloudData)
            });
            if (!response.ok) throw new Error('保存失败');
            CD.saveLocalBackup(CD.store.cloudData);
            CD.setStatus('✅ 数据已保存', '#32cd32', false);
            saved = true;
        } catch (e) {
            CD.saveLocalBackup(CD.store.cloudData);
            CD.setStatus('❌ 保存失败（已写入本机备份）', 'red', false);
        }
        afterLoadRender(CD.store.onRender);
        return saved;
    };
})(window.CrushDiary);
