(function (CD) {
    CD.initSyncBar();
    CD.mountLoveCalendar();
    CD.updateLoveCalendar();

    async function updateScore(target, change, reason) {
        if (CD.store.isSyncing) return;
        var newRecord = {
            id: CD.newHistoryItemId(),
            change: change,
            reason: reason,
            time: CD.getTimeString()
        };
        if (target === 'ta') {
            CD.store.cloudData.taScore += change;
            CD.store.cloudData.taHistory.unshift(newRecord);
        } else if (target === 'my') {
            CD.store.cloudData.myScore += change;
            CD.store.cloudData.myHistory.unshift(newRecord);
        }
        CD.renderHome();
        await CD.saveDataToCloud();
    }

    function addCustomScore(target) {
        var reason = document.getElementById('reason-' + target).value.trim();
        var change = parseInt(document.getElementById('input-score-' + target).value, 10);
        if (!reason) {
            alert('要写原因哦！');
            return;
        }
        if (isNaN(change)) {
            alert('记得填数字🔢');
            return;
        }
        updateScore(target, change, reason);
        document.getElementById('reason-' + target).value = '';
        document.getElementById('input-score-' + target).value = '';
    }

    document.getElementById('btn-record-ta').addEventListener('click', function () { addCustomScore('ta'); });
    document.getElementById('btn-record-my').addEventListener('click', function () { addCustomScore('my'); });

    document.getElementById('btn-ta-plus5').addEventListener('click', function () { updateScore('ta', 5, '表现超棒 🥰'); });
    document.getElementById('btn-ta-plus2').addEventListener('click', function () { updateScore('ta', 2, '秒回消息 💬'); });
    document.getElementById('btn-ta-minus3').addEventListener('click', function () { updateScore('ta', -3, '惹我生气 😠'); });
    document.getElementById('btn-my-plus5').addEventListener('click', function () { updateScore('my', 5, '超可爱'); });
    document.getElementById('btn-my-plus2').addEventListener('click', function () { updateScore('my', 2, '贴心'); });
    document.getElementById('btn-my-minus3').addEventListener('click', function () { updateScore('my', -3, '小脾气'); });

    CD.loadDataFromCloud(CD.renderHome);
})(window.CrushDiary);
