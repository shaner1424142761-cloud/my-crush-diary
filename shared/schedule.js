/* Wall-clock dates in this calendar always mean Singapore (UTC+08:00). */
(function (root) {
    'use strict';
    var DAY = 86400000;
    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
        var date = new Date(value + 'T00:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    function validTime(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }
    function addDays(value, count) { return new Date(Date.parse(value + 'T00:00:00Z') + count * DAY).toISOString().slice(0, 10); }
    function weekday(value) { return new Date(value + 'T00:00:00Z').getUTCDay(); }
    function weekStart(value) { return addDays(value, -((weekday(value) + 6) % 7)); }
    function today(now) { return new Date((now || new Date()).getTime() + 8 * 3600000).toISOString().slice(0, 10); }
    function validEntry(e) {
        if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
        if (typeof e.id !== 'string' || !e.id.trim() || e.id.length > 256) return false;
        if (['weekly','busy','ddl','exception'].indexOf(e.kind) < 0 || ['yyf','zxr','both'].indexOf(e.owner) < 0) return false;
        if (typeof e.title !== 'string' || !e.title.trim() || e.title.length > 80) return false;
        if (e.note !== undefined && (typeof e.note !== 'string' || e.note.length > 500)) return false;
        if (!validDate(e.date) || !validTime(e.start) || !Number.isFinite(e.updatedAt) || e.updatedAt < 0) return false;
        if (e.done !== undefined && typeof e.done !== 'boolean') return false;
        if (e.cancelled !== undefined && typeof e.cancelled !== 'boolean') return false;
        if (e.kind !== 'ddl' && (!validTime(e.end) || e.end <= e.start)) return false;
        if (e.kind === 'weekly') {
            if (!Array.isArray(e.weekdays) || !e.weekdays.length || e.weekdays.length > 7 || e.weekdays.some(function (d) { return !Number.isInteger(d) || d < 0 || d > 6; }) || new Set(e.weekdays).size !== e.weekdays.length) return false;
            if (e.until && (!validDate(e.until) || e.until < e.date)) return false;
        }
        if (e.kind === 'exception' && (typeof e.seriesId !== 'string' || !e.seriesId || e.seriesId.length > 128 || !validDate(e.occurrenceDate))) return false;
        return true;
    }
    function occurs(series, date) {
        return date >= series.date && (!series.until || date <= series.until) && series.weekdays.indexOf(weekday(date)) >= 0;
    }
    function occurrences(entries, from, to) {
        if (!validDate(from) || !validDate(to) || to < from) return [];
        var items = (entries || []).filter(validEntry), series = new Map(), exceptions = new Map(), result = [];
        items.forEach(function (e) {
            if (e.kind === 'weekly') series.set(e.id, e);
            if (e.kind === 'exception') {
                var key = e.seriesId + '@' + e.occurrenceDate, old = exceptions.get(key);
                if (!old || e.updatedAt > old.updatedAt) exceptions.set(key, e);
            }
        });
        items.forEach(function (e) {
            if (e.kind === 'weekly') {
                for (var date = from; date <= to; date = addDays(date, 1)) {
                    if (occurs(e, date) && !exceptions.has(e.id + '@' + date)) result.push(Object.assign({}, e, {date:date, seriesId:e.id, occurrenceDate:date, occurrenceId:e.id + '@' + date}));
                    if (date === to) break;
                }
            } else if (e.kind !== 'exception' && e.date >= from && e.date <= to) result.push(Object.assign({}, e, {occurrenceId:e.id}));
        });
        exceptions.forEach(function (e) {
            var parent = series.get(e.seriesId);
            if (parent && occurs(parent, e.occurrenceDate) && !e.cancelled && e.date >= from && e.date <= to) result.push(Object.assign({}, e, {occurrenceId:e.seriesId + '@' + e.occurrenceDate}));
        });
        return result.sort(function (a,b) { return (a.date + a.start).localeCompare(b.date + b.start) || a.id.localeCompare(b.id); });
    }
    function deadlineMs(e) { return Date.parse(e.date + 'T' + e.start + ':00+08:00'); }
    root.CrushDiarySchedule = {validDate:validDate, validTime:validTime, validEntry:validEntry, today:today, addDays:addDays, weekStart:weekStart, occurrences:occurrences, deadlineMs:deadlineMs};
})(globalThis);
