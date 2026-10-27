(function (CD, S) {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var week = S.weekStart(S.today()), selected = null, editing = null;
    var editor = $('schedule-editor'), detail = $('schedule-detail');
    var ownerNames = {yyf:'YYF', zxr:'ZXR', both:'我们一起'};
    var weekdayNames = ['周日','周一','周二','周三','周四','周五','周六'];
    var lastGeneration = CD.auth.generation, scrollInitialized = false;
    function allowed() { return !CD.store.isSyncing && !CD.auth.locked; }
    function entries() { return CD.store.cloudData.schedules || []; }
    function byId(id) { return entries().find(function (e) { return e.id === id; }); }
    function matches(e) { var filter = $('schedule-filter').value; return filter === 'all' || e.owner === filter || (filter !== 'both' && e.owner === 'both'); }
    function node(tag, text, className) { var el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
    function shortDate(date) { return Number(date.slice(5,7)) + '月' + Number(date.slice(8)) + '日'; }
    function nextStamp(old) { return Math.max(Date.now(), (old && old.updatedAt || 0) + 1); }
    function replace(entry) {
        var items = entries().filter(function (e) { return e.id !== entry.id; });
        items.push(entry); CD.store.cloudData.schedules = items;
    }
    function closeDialogs() { editor.close(); detail.close(); }
    async function save() { closeDialogs(); render(); await CD.saveDataToCloud(); }
    function countdown(entry) {
        var remaining = S.deadlineMs(entry) - Date.now(), absolute = Math.abs(remaining), amount;
        if (absolute < 60000) return remaining < 0 ? '刚刚截止' : '即将截止';
        if (absolute >= 86400000) amount = Math.ceil(absolute / 86400000) + ' 天';
        else if (absolute >= 3600000) amount = Math.ceil(absolute / 3600000) + ' 小时';
        else amount = Math.ceil(absolute / 60000) + ' 分钟';
        return (remaining < 0 ? '已逾期 ' : '还有 ') + amount;
    }
    function showDetail(item) {
        if (!allowed()) return;
        selected = item;
        var repeating = !!item.seriesId || item.kind === 'weekly';
        $('schedule-detail-title').textContent = item.title;
        $('schedule-detail-meta').textContent = ownerNames[item.owner] + ' · ' + item.date + ' ' + item.start + (item.kind === 'ddl' ? ' 截止' : '–' + item.end) + (repeating ? ' · 每周固定' + (item.kind === 'exception' ? '（本次已调整）' : '') : '');
        $('schedule-detail-note').textContent = item.note || '没有额外备注。';
        $('schedule-edit').hidden = repeating;
        $('schedule-edit-once').hidden = !repeating;
        $('schedule-edit-series').hidden = !repeating;
        $('schedule-cancel-once').hidden = !repeating;
        $('schedule-complete').hidden = item.kind !== 'ddl';
        $('schedule-complete').textContent = item.done ? '恢复为未完成' : '标记完成';
        $('schedule-delete').textContent = repeating ? '删除整个固定安排' : '删除安排';
        detail.showModal();
    }
    function eventButton(item, isDeadline) {
        var button = node('button', undefined, 'schedule-event' + (isDeadline ? ' is-deadline' : '') + (item.done ? ' is-done' : ''));
        button.type = 'button'; button.dataset.owner = item.owner;
        var prefix = isDeadline ? '◆ ' : item.seriesId ? '↻ ' : '';
        button.appendChild(node('strong', prefix + item.title));
        button.appendChild(node('span', item.start + (isDeadline ? ' 截止' : '–' + item.end) + ' · ' + ownerNames[item.owner]));
        button.setAttribute('aria-label', item.title + '，' + ownerNames[item.owner] + '，' + item.date + ' ' + item.start + (item.done ? '，已完成' : ''));
        button.title = item.title + '\n' + ownerNames[item.owner] + ' ' + item.start + (item.end ? '–' + item.end : '') + (item.note ? '\n' + item.note : '');
        button.disabled = !allowed();
        button.addEventListener('click', function () { showDetail(item); });
        return button;
    }
    function minutes(time) { return Number(time.slice(0,2)) * 60 + Number(time.slice(3)); }
    // Connected overlapping intervals share a lane count; no event covers another.
    function layout(items) {
        var groups = [], group = [], groupEnd = -1;
        items.forEach(function (item) {
            var start = minutes(item.start), end = Math.max(minutes(item.end), start + 36);
            if (start >= groupEnd && group.length) { groups.push(group); group = []; groupEnd = -1; }
            group.push({item:item, start:start, end:end}); groupEnd = Math.max(groupEnd, end);
        });
        if (group.length) groups.push(group);
        return groups.flatMap(function (batch) {
            var laneEnds = [];
            batch.forEach(function (record) { var lane = laneEnds.findIndex(function (end) { return end <= record.start; }); if (lane < 0) lane = laneEnds.length; laneEnds[lane] = record.end; record.lane = lane; });
            return batch.map(function (record) { record.lanes = laneEnds.length; return record; });
        });
    }
    function render() {
        var end = S.addDays(week, 6), today = S.today();
        var occurrences = S.occurrences(entries(), week, end).filter(matches);
        $('schedule-week-date').value = week;
        $('schedule-week-label').textContent = week.slice(0,4) + ' · ' + shortDate(week) + ' — ' + shortDate(end);
        $('schedule-summary').textContent = occurrences.length ? '这周有 ' + occurrences.length + ' 项安排 · 点击查看或调整' : '这一周还没有安排，记下一件事吧。';
        var calendar = $('schedule-week'); calendar.replaceChildren();
        var hours = node('div', undefined, 'schedule-hours'); hours.setAttribute('aria-hidden','true');
        hours.appendChild(node('div','DDL','schedule-hour-head'));
        var hourTrack = node('div', undefined, 'schedule-hour-track');
        for (var h = 0; h < 24; h++) { var label = node('span', String(h).padStart(2,'0') + ':00'); label.style.top = (h * 40) + 'px'; hourTrack.appendChild(label); }
        hours.appendChild(hourTrack); calendar.appendChild(hours);
        for (var i = 0; i < 7; i++) {
            var date = S.addDays(week, i), day = node('section', undefined, 'schedule-day' + (date === today ? ' is-today' : ''));
            day.dataset.date = date;
            var heading = node('h3', undefined, 'schedule-day-head'); heading.appendChild(node('span', weekdayNames[(i + 1) % 7] + (date === today ? ' · 今天' : ''))); heading.appendChild(node('strong', shortDate(date))); day.appendChild(heading);
            var daily = occurrences.filter(function (item) { return item.date === date; });
            var deadlines = node('div', undefined, 'schedule-day-ddls');
            daily.filter(function (item) { return item.kind === 'ddl'; }).forEach(function (item) { deadlines.appendChild(eventButton(item, true)); });
            day.appendChild(deadlines);
            var track = node('div', undefined, 'schedule-track');
            layout(daily.filter(function (item) { return item.kind !== 'ddl'; })).forEach(function (record) {
                var button = eventButton(record.item, false);
                button.style.top = (record.start * 2 / 3) + 'px';
                button.style.height = ((record.end - record.start) * 2 / 3) + 'px';
                button.style.left = 'calc(' + (record.lane * 100 / record.lanes) + '% + 2px)';
                button.style.width = 'calc(' + (100 / record.lanes) + '% - 4px)';
                track.appendChild(button);
            });
            if (!daily.length) track.appendChild(node('p','还没有安排，留一点时间给自己。','schedule-day-empty'));
            day.appendChild(track); calendar.appendChild(day);
        }
        var ddlList = $('schedule-deadlines'); ddlList.replaceChildren();
        var pending = entries().filter(function (e) { return e.kind === 'ddl' && S.validEntry(e) && !e.done && matches(e); }).sort(function (a,b) { return S.deadlineMs(a) - S.deadlineMs(b); });
        pending.forEach(function (e) {
            var button = node('button', undefined, 'schedule-deadline-card'); button.type = 'button'; button.disabled = !allowed();
            button.appendChild(node('strong', e.title)); button.appendChild(node('span', ownerNames[e.owner] + ' · ' + e.date + ' ' + e.start));
            button.appendChild(node('span', countdown(e), S.deadlineMs(e) < Date.now() ? 'is-overdue' : ''));
            button.addEventListener('click', function () { showDetail(e); }); ddlList.appendChild(button);
        });
        if (!pending.length) ddlList.appendChild(node('p','暂时没有未完成的 DDL，可以松一口气。','schedule-empty'));
        var seriesList = $('schedule-series-list'); seriesList.replaceChildren();
        entries().filter(function (e) { return e.kind === 'weekly' && matches(e); }).forEach(function (e) {
            var button = node('button',e.title + ' · ' + ownerNames[e.owner] + ' · ' + e.weekdays.map(function (d) { return weekdayNames[d]; }).join('、'));
            button.type = 'button'; button.disabled = !allowed(); button.addEventListener('click', function () { openEditor(e); }); seriesList.appendChild(button);
        });
        if (!seriesList.childElementCount) seriesList.appendChild(node('p','还没有固定安排。','schedule-empty'));
        if (CD.refreshActionButtons) CD.refreshActionButtons();
        if (!scrollInitialized && !CD.auth.locked) { $('schedule-calendar-scroll').scrollTop = 280; scrollInitialized = true; }
    }
    function updateFields() {
        var kind = $('schedule-kind').value, weekly = kind === 'weekly', ddl = kind === 'ddl';
        $('schedule-repeat-fields').hidden = !weekly;
        $('schedule-end-field').hidden = ddl; $('schedule-end').required = !ddl;
        $('schedule-date-label').textContent = weekly ? '从哪一天开始生效' : ddl ? '截止日期' : '日期';
        $('schedule-start-label').textContent = ddl ? '截止时间' : '开始时间';
    }
    function openEditor(entry) {
        if (!allowed()) return;
        detail.close(); editing = entry ? Object.assign({}, entry) : null;
        $('schedule-form').reset(); $('schedule-form-error').textContent = '';
        $('schedule-editor-title').textContent = entry ? '编辑安排' : '添加安排';
        $('schedule-editor-delete').hidden = !entry || entry.kind !== 'weekly';
        $('schedule-kind').disabled = !!entry;
        $('schedule-kind').value = entry ? entry.kind : 'busy';
        $('schedule-title').value = entry ? entry.title : '';
        $('schedule-owner').value = entry ? entry.owner : CD.auth.user.id;
        $('schedule-date').value = entry ? entry.date : S.today();
        $('schedule-start').value = entry ? entry.start : '09:00';
        $('schedule-end').value = entry && entry.end ? entry.end : '10:00';
        $('schedule-note').value = entry && entry.note || '';
        $('schedule-until').value = entry && entry.until || '';
        document.querySelectorAll('#schedule-weekdays input').forEach(function (box) { box.checked = !!(entry && entry.weekdays && entry.weekdays.indexOf(Number(box.value)) >= 0); });
        $('schedule-edit-hint').textContent = entry && entry.kind === 'exception' ? '只改变原定 ' + entry.occurrenceDate + ' 的这一次，其他周保持原样。' : entry && entry.kind === 'weekly' ? '这里会修改整个固定安排。某一周的调整请点击周视图中的安排。' : '为彼此留一份清楚的时间表。';
        updateFields(); editor.showModal();
    }
    function exceptionFor(item) {
        var seriesId = item.seriesId || item.id, originalDate = item.occurrenceDate || item.date;
        var id = 'ex|' + seriesId + '|' + originalDate, prior = byId(id);
        return Object.assign({}, item, {id:id, kind:'exception', seriesId:seriesId, occurrenceDate:originalDate, cancelled:false, updatedAt:nextStamp(prior)});
    }
    $('schedule-form').addEventListener('submit', async function (event) {
        event.preventDefault(); if (!allowed()) return;
        var kind = $('schedule-kind').value;
        var entry = Object.assign({}, editing || {}, {id:editing ? editing.id : 's_' + crypto.randomUUID(), kind:kind, title:$('schedule-title').value.trim(), owner:$('schedule-owner').value, date:$('schedule-date').value, start:$('schedule-start').value, note:$('schedule-note').value.trim(), updatedAt:nextStamp(editing && byId(editing.id))});
        if (kind !== 'ddl') entry.end = $('schedule-end').value;
        if (kind === 'weekly') { entry.weekdays = Array.from(document.querySelectorAll('#schedule-weekdays input:checked'), function (box) { return Number(box.value); }); entry.until = $('schedule-until').value; }
        if (!S.validEntry(entry)) { $('schedule-form-error').textContent = '请检查日期与时间：结束须晚于开始；固定安排至少选择一个星期，重复结束日不能早于生效日。'; return; }
        // Rendering-only occurrence metadata must never become part of persisted records.
        delete entry.occurrenceId;
        replace(entry); await save();
    });
    $('schedule-new').addEventListener('click', function () { openEditor(); });
    $('schedule-kind').addEventListener('change', updateFields);
    ['schedule-editor-close','schedule-cancel'].forEach(function (id) { $(id).addEventListener('click', function () { editor.close(); }); });
    $('schedule-detail-close').addEventListener('click', function () { detail.close(); });
    $('schedule-edit').addEventListener('click', function () { openEditor(byId(selected.id)); });
    $('schedule-edit-once').addEventListener('click', function () { openEditor(exceptionFor(selected)); });
    $('schedule-edit-series').addEventListener('click', function () { var e = byId(selected.seriesId || selected.id); if (e) openEditor(e); });
    $('schedule-cancel-once').addEventListener('click', async function () {
        if (!allowed() || !confirm('仅取消这一次安排？其他周不受影响。')) return;
        var entry = exceptionFor(selected); entry.cancelled = true; delete entry.occurrenceId; replace(entry); await save();
    });
    $('schedule-complete').addEventListener('click', async function () {
        if (!allowed()) return; var old = byId(selected.id); if (!old) return;
        replace(Object.assign({}, old, {done:!old.done, updatedAt:nextStamp(old)})); await save();
    });
    $('schedule-delete').addEventListener('click', async function () {
        if (!allowed()) return;
        var id = selected.seriesId || selected.id, repeating = !!selected.seriesId || selected.kind === 'weekly';
        if (!confirm(repeating ? '删除整个固定安排及其所有周次？' : '确定删除这条安排吗？')) return;
        CD.deleteRecord('schedules', id); await save();
    });
    $('schedule-editor-delete').addEventListener('click', async function () {
        if (!allowed() || !editing || editing.kind !== 'weekly' || !confirm('删除整个固定安排及其所有周次？')) return;
        CD.deleteRecord('schedules', editing.id); await save();
    });
    $('schedule-prev').addEventListener('click', function () { if (allowed() && week > '1900-01-07') { week = S.addDays(week,-7); render(); } });
    $('schedule-next').addEventListener('click', function () { if (allowed() && week < '9998-12-20') { week = S.addDays(week,7); render(); } });
    $('schedule-today').addEventListener('click', function () { if (allowed()) { week = S.weekStart(S.today()); render(); } });
    $('schedule-week-date').addEventListener('change', function () { var date = this.value; if (allowed() && S.validDate(date) && date < '9999-01-01' && date >= '1900-01-01') { week = S.weekStart(date); render(); } });
    $('schedule-filter').addEventListener('change', render);
    $('schedule-sync').addEventListener('click', async function () { if (allowed()) await CD.saveDataToCloud(); });
    CD.onAuthChange(function () {
        if (CD.auth.locked || lastGeneration !== CD.auth.generation) { closeDialogs(); selected = null; editing = null; $('schedule-form').reset(); $('schedule-week').replaceChildren(); $('schedule-deadlines').replaceChildren(); $('schedule-series-list').replaceChildren(); $('schedule-summary').textContent = ''; }
        lastGeneration = CD.auth.generation;
    });
    CD.initSyncBar();
    CD.loadDataFromCloud(render);
    setInterval(function () { if (allowed()) render(); }, 60000);
})(window.CrushDiary, globalThis.CrushDiarySchedule);
