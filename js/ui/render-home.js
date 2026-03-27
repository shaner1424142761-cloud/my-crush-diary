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
    };
})(window.CrushDiary);
