(function (CD) {
    var rules = globalThis.CrushDiaryRecords.createRecordTools(CD);
    CD.mergeRecords = rules.mergeRecords;
    CD.normalizeFetched = rules.normalizeFetched;
    CD.keys = rules.keys;
    CD.isCloudEmpty = rules.isCloudEmpty;
    CD.newHistoryItemId = function () {
        return 'h-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    };

    CD.deleteRecord = function (section, id) {
        if (section !== 'wishes' && section !== 'anniversaries') return;
        var data = CD.store.cloudData;
        var key = section === 'wishes' ? CD.keys.wish : CD.keys.anniversary;
        var item = (data[section] || []).filter(function (entry) { return key(entry) === id; })[0];
        if (!item) return;
        var deleted = CD.mergeRecords(data, {}).deletedItems;
        deleted[section][id] = Math.max(deleted[section][id] || 0, Date.now());
        data.deletedItems = deleted;
        data[section] = data[section].filter(function (entry) { return key(entry) !== id; });
        CD.saveLocalBackup(data);
    };

})(window.CrushDiary);
