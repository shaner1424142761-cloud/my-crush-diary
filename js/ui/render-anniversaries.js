(function (CD) {
    CD.parseYmd = function (s) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
        if (!m) return null;
        var y = +m[1];
        var mo = +m[2];
        var d = +m[3];
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        var test = new Date(y, mo - 1, d);
        if (test.getFullYear() !== y || test.getMonth() !== mo - 1 || test.getDate() !== d) return null;
        return { y: y, mo: mo, d: d };
    };

    CD.daysUntilNextAnniversary = function (dateStr) {
        var p = CD.parseYmd(dateStr);
        if (!p) return null;
        var now = new Date();
        var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var y = now.getFullYear();
        var next = new Date(y, p.mo - 1, p.d);
        if (next < today0) next = new Date(y + 1, p.mo - 1, p.d);
        return Math.round((next - today0) / 86400000);
    };

    CD.anniversaryYearsPassed = function (dateStr) {
        var p = CD.parseYmd(dateStr);
        if (!p) return null;
        var now = new Date();
        var ty = now.getFullYear();
        var tm = now.getMonth();
        var td = now.getDate();
        var today0 = new Date(ty, tm, td);
        var thisOcc = new Date(ty, p.mo - 1, p.d);
        var n = ty - p.y;
        if (today0 < thisOcc) n--;
        return Math.max(0, n);
    };

    CD.formatAnnivDisplayDate = function (dateStr) {
        var p = CD.parseYmd(dateStr);
        if (!p) return dateStr || '';
        return p.y + '年' + p.mo + '月' + p.d + '日';
    };

    function countdownLabel(days) {
        if (days === null || days === undefined) return '';
        if (days === 0) return '就是今天 🎉';
        if (days === 1) return '明天就是这一天';
        return '距离下次还有 ' + days + ' 天';
    }

    CD.renderAnniversaries = function () {
        var list = document.getElementById('anniv-list');
        if (!list) return;
        list.innerHTML = '';
        var items = (CD.store.cloudData.anniversaries || []).slice();
        if (items.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'anniv-empty';
            empty.textContent = '还没有纪念日～记下第一次见面的日子、在一起的日期吧';
            list.appendChild(empty);
            return;
        }
        items.sort(function (a, b) {
            var da = CD.daysUntilNextAnniversary(a.date);
            var db = CD.daysUntilNextAnniversary(b.date);
            if (da === null) return 1;
            if (db === null) return -1;
            return da - db;
        });
        items.forEach(function (a) {
            var days = CD.daysUntilNextAnniversary(a.date);
            var years = CD.anniversaryYearsPassed(a.date);

            var row = document.createElement('div');
            row.className = 'anniv-item';
            row.dataset.annivId = a.id;

            var main = document.createElement('div');
            main.className = 'anniv-item__main';

            var title = document.createElement('div');
            title.className = 'anniv-item__title';
            title.textContent = a.title || '';

            var meta = document.createElement('div');
            meta.className = 'anniv-item__meta';
            meta.textContent = '每年 · ' + CD.formatAnnivDisplayDate(a.date);

            var badge = document.createElement('div');
            badge.className = 'anniv-item__badge' + (days === 0 ? ' anniv-item__badge--today' : '');
            badge.textContent = countdownLabel(days);

            main.appendChild(title);
            main.appendChild(meta);
            main.appendChild(badge);
            if (years !== null && years > 0) {
                var yearsLine = document.createElement('div');
                yearsLine.className = 'anniv-item__years';
                yearsLine.textContent = '已过第 ' + years + ' 个周年';
                main.appendChild(yearsLine);
            }

            if (a.note) {
                var note = document.createElement('div');
                note.className = 'anniv-item__note';
                note.textContent = a.note;
                main.appendChild(note);
            }

            var foot = document.createElement('div');
            foot.className = 'anniv-item__foot';
            if (a.time) {
                var t = document.createElement('span');
                t.className = 'anniv-item__time';
                t.textContent = '记录于 ' + a.time;
                foot.appendChild(t);
            }

            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'anniv-item__del';
            del.setAttribute('aria-label', '删除这条纪念日');
            del.dataset.annivId = a.id;
            del.textContent = '×';

            row.appendChild(main);
            row.appendChild(del);
            list.appendChild(row);
        });
    };
})(window.CrushDiary);
