(function (CD) {
    CD.initSyncBar();
    CD.mountLoveCalendar();
    CD.updateLoveCalendar();

    async function updateScore(target, change, reason) {
        if (CD.store.isSyncing) return;
        var newRecord = { change: change, reason: reason, time: CD.getTimeString() };
        if (target === 'ta') {
            CD.store.cloudData.taScore += change;
            CD.store.cloudData.taHistory.unshift(newRecord);
            if (CD.store.cloudData.taHistory.length > CD.MAX_HISTORY) CD.store.cloudData.taHistory.pop();
        } else if (target === 'my') {
            CD.store.cloudData.myScore += change;
            CD.store.cloudData.myHistory.unshift(newRecord);
            if (CD.store.cloudData.myHistory.length > CD.MAX_HISTORY) CD.store.cloudData.myHistory.pop();
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

    async function addMessage() {
        if (CD.store.isSyncing) return;
        var msgInput = document.getElementById('msg-input');
        var text = msgInput.value.trim();
        if (!text) {
            alert('你还没有写留言呢！');
            return;
        }
        if (CD.store.cloudData.messages && CD.store.cloudData.messages.length >= CD.MAX_MESSAGES) {
            var wantExport = confirm('⚠️ 留言板快装不下啦！\n\n需要现在先把之前的留言导出保存下来吗？');
            if (wantExport) {
                exportMessages();
                return;
            }
        }
        CD.store.cloudData.messages.push({ text: text, time: CD.getTimeString() });
        if (CD.store.cloudData.messages.length > CD.MAX_MESSAGES) CD.store.cloudData.messages.shift();
        msgInput.value = '';
        CD.renderHome();
        await CD.saveDataToCloud();
    }

    function exportMessages() {
        if (!CD.store.cloudData.messages || CD.store.cloudData.messages.length === 0) {
            alert('目前还没有留言可以导出哦~');
            return;
        }
        var textContent = '💖 我们的专属留言板记录 💖\n=================================\n\n';
        CD.store.cloudData.messages.forEach(function (msg) {
            textContent += '[' + msg.time + '] ' + msg.text + '\n';
        });
        textContent += '\n=================================\n导出于：' + CD.getTimeString();

        var blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = '我们的专属心动留言记录.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('✅ 留言记录已开始下载啦！记得保存好哦~');
    }

    document.getElementById('btn-record-ta').addEventListener('click', function () { addCustomScore('ta'); });
    document.getElementById('btn-record-my').addEventListener('click', function () { addCustomScore('my'); });
    document.getElementById('btn-msg-send').addEventListener('click', function () { addMessage(); });
    document.getElementById('btn-msg-export').addEventListener('click', function () { exportMessages(); });

    document.getElementById('btn-ta-plus5').addEventListener('click', function () { updateScore('ta', 5, '表现超棒 🥰'); });
    document.getElementById('btn-ta-plus2').addEventListener('click', function () { updateScore('ta', 2, '秒回消息 💬'); });
    document.getElementById('btn-ta-minus3').addEventListener('click', function () { updateScore('ta', -3, '惹我生气 😠'); });
    document.getElementById('btn-my-plus5').addEventListener('click', function () { updateScore('my', 5, '超可爱'); });
    document.getElementById('btn-my-plus2').addEventListener('click', function () { updateScore('my', 2, '贴心'); });
    document.getElementById('btn-my-minus3').addEventListener('click', function () { updateScore('my', -3, '小脾气'); });

    CD.loadDataFromCloud(CD.renderHome);
})(window.CrushDiary);
