(function (CD) {
    CD.initSyncBar();
    CD.mountLoveCalendar();
    CD.updateLoveCalendar();

    async function addMessage() {
        if (CD.store.isSyncing) return;
        var msgInput = document.getElementById('msg-input');
        var text = msgInput.value.trim();
        if (!text) {
            alert('你还没有写留言呢！');
            return;
        }
        if (!CD.store.cloudData.messages) CD.store.cloudData.messages = [];
        CD.store.cloudData.messages.push({ text: text, time: CD.getTimeString() });
        msgInput.value = '';
        CD.renderMessages();
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

    document.getElementById('btn-msg-send').addEventListener('click', function () { addMessage(); });
    document.getElementById('btn-msg-export').addEventListener('click', function () { exportMessages(); });

    CD.loadDataFromCloud(CD.renderMessages);
})(window.CrushDiary);
