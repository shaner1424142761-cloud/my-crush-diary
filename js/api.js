(function (CD) {
    async function fetchLatestRecord() {
        var response = await fetch(CD.FETCH_URL + '?t=' + Date.now(), {
            headers: { 'X-Master-Key': CD.API_KEY, 'Cache-Control': 'no-cache' },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('拉取失败');
        var data = await response.json();
        var rec = data.record;
        if (!rec || typeof rec !== 'object') return null;
        return {
            taScore: rec.taScore !== undefined ? rec.taScore : (rec.score || 0),
            taHistory: rec.taHistory || rec.history || [],
            myScore: rec.myScore || 0,
            myHistory: rec.myHistory || [],
            messages: rec.messages || [],
            album: rec.album || [],
            blogPosts: rec.blogPosts || [],
            wishes: rec.wishes || [],
            anniversaries: rec.anniversaries || []
        };
    }

    function afterLoadRender(onRender) {
        if (onRender) onRender();
        if (CD.refreshNavBadges) CD.refreshNavBadges();
    }

    CD.loadDataFromCloud = async function (onRender) {
        if (CD.BIN_ID.indexOf('这里填入') !== -1) {
            afterLoadRender(onRender);
            return;
        }

        var initialBackup = CD.loadLocalBackup();
        if (initialBackup) {
            CD.store.cloudData = initialBackup;
            afterLoadRender(onRender);
        }

        CD.setStatus('☁️ 正在拉取云端…', '#ffaa33', false);

        try {
            var response = await fetch(CD.FETCH_URL + '?t=' + Date.now(), {
                headers: { 'X-Master-Key': CD.API_KEY, 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (!response.ok) throw new Error('网络请求失败');
            var data = await response.json();
            var fetched = data.record;
            if (!fetched || typeof fetched !== 'object') throw new Error('云端数据格式异常');

            var normalized = CD.normalizeFetched(fetched);
            var backup = CD.loadLocalBackup();

            if (CD.isCloudEmpty(normalized) && backup && !CD.isCloudEmpty(backup)) {
                CD.store.cloudData = CD.mergeRecords(normalized, CD.store.cloudData);
                afterLoadRender(onRender);
                CD.setStatus('📦 已从本机备份合并，正在写回云端...', '#ffaa33', true);
                await CD.saveDataToCloud({ skipRefetch: true });
                if (CD.refreshNavBadges) CD.refreshNavBadges();
                return;
            }

            CD.store.cloudData = CD.mergeRecords(normalized, CD.store.cloudData);
            CD.saveLocalBackup(CD.store.cloudData);
            afterLoadRender(onRender);
            CD.setStatus('✅ 数据已最新', '#32cd32', false);
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

    CD.saveDataToCloud = async function (options) {
        options = options || {};
        CD.setStatus('⬆️ 上传中...', '#ffaa33', true);
        try {
            if (!options.skipRefetch) {
                try {
                    var remote = await fetchLatestRecord();
                    CD.store.cloudData = CD.mergeRecords(remote, CD.store.cloudData);
                } catch (e) { /* 拉取失败仍尝试上传 */ }
            }
            var response = await fetch(CD.UPDATE_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CD.API_KEY,
                    'X-Bin-Versioning': 'false'
                },
                body: JSON.stringify(CD.store.cloudData)
            });
            if (!response.ok) throw new Error('保存失败');
            CD.saveLocalBackup(CD.store.cloudData);
            CD.setStatus('✅ 数据已保存', '#32cd32', false);
        } catch (e) {
            CD.saveLocalBackup(CD.store.cloudData);
            CD.setStatus('❌ 保存失败（已写入本机备份）', 'red', false);
        }
        if (CD.refreshNavBadges) CD.refreshNavBadges();
    };
})(window.CrushDiary);
