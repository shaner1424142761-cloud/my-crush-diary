(function (CD) {
    function renderHistory(elementId, historyArray, color) {
        var el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = '';
        if (!historyArray || historyArray.length === 0) {
            el.innerHTML = '<div style="color:#ccc; font-size:11px;">暂无记录~</div>';
            return;
        }
        historyArray.forEach(function (item) {
            var div = document.createElement('div');
            div.className = 'history-item';
            div.style.borderLeftColor = item.change > 0 ? color : '#ccc';
            var sign = item.change > 0 ? '+' : '';
            var fontColor = item.change > 0 ? color : '#666';

            var left = document.createElement('span');
            var reason = document.createElement('span');
            reason.textContent = item.reason + ' ';
            var delta = document.createElement('span');
            delta.style.color = fontColor;
            delta.style.fontWeight = 'bold';
            delta.textContent = sign + item.change;
            left.appendChild(reason);
            left.appendChild(delta);

            var time = document.createElement('span');
            time.className = 'time';
            time.textContent = item.time || '';

            div.appendChild(left);
            div.appendChild(time);
            el.appendChild(div);
        });
    }

    CD.renderHome = function () {
        if (CD.updateLoveCalendar) CD.updateLoveCalendar();

        var cloudData = CD.store.cloudData;

        var scoreTa = document.getElementById('score-ta');
        var scoreMy = document.getElementById('score-my');
        if (scoreTa) scoreTa.textContent = cloudData.taScore;
        if (scoreMy) scoreMy.textContent = cloudData.myScore;

        renderHistory('history-ta', cloudData.taHistory, '#ff1493');
        renderHistory('history-my', cloudData.myHistory, '#38bdf8');

        var msgListEl = document.getElementById('msg-list');
        var msgCounter = document.getElementById('msg-counter');
        if (!msgListEl) return;

        var msgCount = cloudData.messages ? cloudData.messages.length : 0;
        if (msgCounter) {
            msgCounter.textContent = msgCount + '/' + CD.MAX_MESSAGES;
            if (msgCount >= CD.MAX_MESSAGES - 5) {
                msgCounter.style.color = 'red';
                msgCounter.style.fontWeight = 'bold';
            } else {
                msgCounter.style.color = '#ba55d3';
                msgCounter.style.fontWeight = 'normal';
            }
        }

        msgListEl.innerHTML = '';
        if (msgCount === 0) {
            var empty = document.createElement('div');
            empty.style.cssText = 'color:#aaa;text-align:center;font-size:12px;margin-top:20px;';
            empty.textContent = '还没有留言哦，来说第一句话吧！';
            msgListEl.appendChild(empty);
        } else {
            cloudData.messages.forEach(function (msg) {
                var div = document.createElement('div');
                div.className = 'msg-item';
                var t = document.createElement('div');
                t.textContent = msg.text;
                var time = document.createElement('div');
                time.className = 'msg-time';
                time.textContent = msg.time || '';
                div.appendChild(t);
                div.appendChild(time);
                msgListEl.appendChild(div);
            });
            msgListEl.scrollTop = msgListEl.scrollHeight;
        }
    };
})(window.CrushDiary);
