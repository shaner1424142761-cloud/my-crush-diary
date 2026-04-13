(function (CD) {
    CD.renderMessages = function () {
        if (CD.updateLoveCalendar) CD.updateLoveCalendar();

        var msgListEl = document.getElementById('msg-list');
        var msgCounter = document.getElementById('msg-counter');
        if (!msgListEl) return;

        var cloudData = CD.store.cloudData;
        var msgCount = cloudData.messages ? cloudData.messages.length : 0;

        if (msgCounter) {
            msgCounter.textContent = '共 ' + msgCount + ' 条';
            msgCounter.style.color = '#ba55d3';
            msgCounter.style.fontWeight = 'normal';
        }

        msgListEl.innerHTML = '';
        if (msgCount === 0) {
            var empty = document.createElement('div');
            empty.style.cssText = 'color:#aaa;text-align:center;font-size:12px;margin-top:20px;';
            empty.textContent = '还没有留言哦，来说第一句话吧！';
            msgListEl.appendChild(empty);
            if (CD.markNavSectionRead) CD.markNavSectionRead('messages');
            if (CD.refreshNavBadges) CD.refreshNavBadges();
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
            if (CD.markNavSectionRead) CD.markNavSectionRead('messages');
            if (CD.refreshNavBadges) CD.refreshNavBadges();
        }
    };
})(window.CrushDiary);
