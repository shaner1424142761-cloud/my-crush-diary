/**
 * 固定角挂历：纪念日 2026-03-23 起算，第 0 天为当天
 * 仅宽屏（>760px）通过 CSS 显示；手机端不展示。
 */
(function (CD) {
    var LOVE_START = new Date(2026, 2, 23);

    CD.mountLoveCalendar = function () {
        if (document.getElementById('wall-calendar')) return;
        var aside = document.createElement('aside');
        aside.id = 'wall-calendar';
        aside.className = 'wall-calendar';
        aside.setAttribute('aria-label', '今日挂历与恋爱天数');
        aside.innerHTML =
            '<div class="wall-calendar__hook" aria-hidden="true"></div>' +
            '<div class="wall-calendar__sheet">' +
            '<div class="wall-calendar__header" id="wall-cal-ym"></div>' +
            '<div class="wall-calendar__day" id="wall-cal-dom"></div>' +
            '<div class="wall-calendar__weekday" id="wall-cal-wd"></div>' +
            '<div class="wall-calendar__rip" aria-hidden="true"></div>' +
            '<div class="wall-calendar__together" id="wall-cal-together" aria-live="polite"></div>' +
            '</div>';
        document.body.appendChild(aside);
    };

    function fillTogether(el, diffDays) {
        el.textContent = '';
        function addNum(n) {
            var s = document.createElement('span');
            s.className = 'wall-calendar__together-num';
            s.textContent = String(n);
            el.appendChild(s);
        }
        if (diffDays < 0) {
            el.appendChild(document.createTextNode('还有 '));
            addNum(-diffDays);
            el.appendChild(document.createTextNode(' 天到纪念日（3月23日）'));
        } else {
            el.appendChild(document.createTextNode('在一起 '));
            addNum(diffDays);
            el.appendChild(document.createTextNode(' 天了'));
        }
    }

    CD.updateLoveCalendar = function () {
        var root = document.getElementById('wall-calendar');
        if (!root) return;

        var now = new Date();
        var ymEl = document.getElementById('wall-cal-ym');
        var domEl = document.getElementById('wall-cal-dom');
        var wdEl = document.getElementById('wall-cal-wd');
        var togetherEl = document.getElementById('wall-cal-together');
        if (!ymEl || !domEl || !wdEl || !togetherEl) return;

        ymEl.textContent =
            now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
        domEl.textContent = String(now.getDate());
        wdEl.textContent = '周' + ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

        var start = new Date(LOVE_START);
        start.setHours(0, 0, 0, 0);
        var today = new Date(now);
        today.setHours(0, 0, 0, 0);
        var diffDays = Math.round((today.getTime() - start.getTime()) / 86400000);
        fillTogether(togetherEl, diffDays);
    };
})(window.CrushDiary);
