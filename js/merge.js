(function (CD) {
    CD.newHistoryItemId = function () {
        return 'h-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    };

    function historyKey(item) {
        if (item && typeof item.id === 'string' && item.id) return item.id;
        return (item.time || '') + '|' + (item.reason || '') + '|' + item.change;
    }
    function messageKey(m) {
        return m.time + '|' + m.text;
    }
    function albumKey(a) {
        return a.time + '|' + (a.caption || '') + '|' + (a.url || '');
    }
    function blogKey(p) {
        return p.time + '|' + (p.title || '') + '|' + (p.body || '');
    }

    function wishStableId(w) {
        if (w && typeof w.id === 'string' && w.id) return w.id;
        var t = (w && w.time) || '';
        var tx = (w && w.text) || '';
        return 'legacy|' + t + '|' + tx.slice(0, 40);
    }

    function annivStableId(a) {
        if (a && typeof a.id === 'string' && a.id) return a.id;
        var t = (a && a.time) || '';
        var title = (a && a.title) || '';
        var d = (a && a.date) || '';
        return 'legacy|anniv|' + t + '|' + title.slice(0, 24) + '|' + d;
    }

    function historySum(history) {
        var seen = Object.create(null);
        return (history || []).reduce(function (sum, item) {
            if (!item || !Number.isFinite(item.change)) return sum;
            var key = historyKey(item);
            if (seen[key]) return sum;
            seen[key] = true;
            return sum + item.change;
        }, 0);
    }

    function scoreBaseline(remote, local, side) {
        // Preserve any historical balance not represented in the old ledger.
        // Once migrated, a stale client's total must not recreate that balance.
        if (remote.scoreBaseline && Number.isFinite(remote.scoreBaseline[side])) {
            return remote.scoreBaseline[side];
        }
        if (local.scoreBaseline && Number.isFinite(local.scoreBaseline[side])) {
            return local.scoreBaseline[side];
        }
        var source = (remote[side + 'History'] || []).length || Number(remote[side + 'Score'])
            ? remote : local;
        return (Number(source[side + 'Score']) || 0) - historySum(source[side + 'History']);
    }

    function mergeDeletions(remote, local) {
        var result = { wishes: Object.create(null), anniversaries: Object.create(null) };
        ['wishes', 'anniversaries'].forEach(function (section) {
            [remote, local].forEach(function (data) {
                var entries = data.deletedItems && data.deletedItems[section];
                if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;
                Object.keys(entries).forEach(function (id) {
                    var stamp = entries[id];
                    if (Number.isFinite(stamp) && stamp >= 0) {
                        result[section][id] = Math.max(result[section][id] || 0, stamp);
                    }
                });
            });
        });
        return result;
    }

    CD.deleteRecord = function (section, id) {
        if (section !== 'wishes' && section !== 'anniversaries') return;
        var data = CD.store.cloudData;
        var key = section === 'wishes' ? wishStableId : annivStableId;
        var item = (data[section] || []).filter(function (entry) { return key(entry) === id; })[0];
        if (!item) return;
        var deleted = mergeDeletions(data, {});
        deleted[section][id] = Math.max(deleted[section][id] || 0, Date.now());
        data.deletedItems = deleted;
        data[section] = data[section].filter(function (entry) { return key(entry) !== id; });
        CD.saveLocalBackup(data);
    };

    CD.mergeRecords = function (remote, local) {
        var r = remote || {};
        var l = local || {};
        var deletedItems = mergeDeletions(r, l);
        var taHist = [];
        var seenTa = Object.create(null);
        function addTa(item) {
            if (!item || !Number.isFinite(item.change)) return;
            var k = historyKey(item);
            if (seenTa[k]) return;
            seenTa[k] = true;
            taHist.push(item);
        }
        (r.taHistory || []).forEach(addTa);
        (l.taHistory || []).forEach(addTa);

        var myHist = [];
        var seenMy = Object.create(null);
        function addMy(item) {
            if (!item || !Number.isFinite(item.change)) return;
            var k = historyKey(item);
            if (seenMy[k]) return;
            seenMy[k] = true;
            myHist.push(item);
        }
        (r.myHistory || []).forEach(addMy);
        (l.myHistory || []).forEach(addMy);

        var msgs = [];
        var seenMsg = Object.create(null);
        function addMsg(m) {
            if (!m || typeof m.text !== 'string') return;
            var k = messageKey(m);
            if (seenMsg[k]) return;
            seenMsg[k] = true;
            msgs.push(m);
        }
        (r.messages || []).forEach(addMsg);
        (l.messages || []).forEach(addMsg);

        taHist.sort(function (a, b) { return (b.time || '').localeCompare(a.time || ''); });
        myHist.sort(function (a, b) { return (b.time || '').localeCompare(a.time || ''); });
        var taScoreHistSum = taHist.reduce(function (s, h) { return s + h.change; }, 0);
        var myScoreHistSum = myHist.reduce(function (s, h) { return s + h.change; }, 0);
        var taHistory = taHist;
        var myHistory = myHist;
        var messages = msgs;

        var albumMerged = [];
        var seenAlbum = Object.create(null);
        function addAlbum(a) {
            if (!a || typeof a.url !== 'string' || !a.url.trim()) return;
            var k = albumKey(a);
            if (seenAlbum[k]) return;
            seenAlbum[k] = true;
            albumMerged.push({
                url: a.url.trim(),
                caption: typeof a.caption === 'string' ? a.caption.slice(0, 80) : '',
                time: a.time || ''
            });
        }
        (r.album || []).forEach(addAlbum);
        (l.album || []).forEach(addAlbum);
        albumMerged.sort(function (a, b) { return (b.time || '').localeCompare(a.time || ''); });
        var album = albumMerged;

        var blogMerged = [];
        var seenBlog = Object.create(null);
        function addBlog(p) {
            if (!p || typeof p !== 'object') return;
            var t = typeof p.title === 'string' ? p.title : '';
            var b = typeof p.body === 'string' ? p.body : '';
            if (!t.trim() && !b.trim()) return;
            var norm = { title: t, body: b, time: p.time || '' };
            var k = blogKey(norm);
            if (seenBlog[k]) return;
            seenBlog[k] = true;
            blogMerged.push({
                title: t.slice(0, 80),
                body: b.slice(0, 4000),
                time: norm.time
            });
        }
        (r.blogPosts || []).forEach(addBlog);
        (l.blogPosts || []).forEach(addBlog);
        blogMerged.sort(function (a, b) { return (b.time || '').localeCompare(a.time || ''); });
        var blogPosts = blogMerged;

        var wishMap = Object.create(null);
        function addWish(w) {
            if (!w || typeof w.text !== 'string' || !w.text.trim()) return;
            var id = wishStableId(w);
            if (Object.prototype.hasOwnProperty.call(deletedItems.wishes, id)) return;
            var text = w.text.trim().slice(0, CD.MAX_WISH_TEXT);
            var ua = typeof w.updatedAt === 'number' && !isNaN(w.updatedAt) ? w.updatedAt : 0;
            var norm = {
                id: id,
                text: text,
                done: !!w.done,
                time: typeof w.time === 'string' ? w.time.slice(0, 40) : '',
                updatedAt: ua
            };
            var ex = wishMap[id];
            if (!ex || norm.updatedAt >= (ex.updatedAt || 0)) {
                wishMap[id] = norm;
            }
        }
        (r.wishes || []).forEach(addWish);
        (l.wishes || []).forEach(addWish);
        var wishesArr = Object.keys(wishMap).map(function (k) { return wishMap[k]; });
        wishesArr.sort(function (a, b) {
            if (a.done !== b.done) return a.done ? 1 : -1;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        var wishes = wishesArr;

        var annivMap = Object.create(null);
        function addAnniv(a) {
            if (!a || typeof a !== 'object') return;
            var title = typeof a.title === 'string' ? a.title.trim() : '';
            var dateStr = typeof a.date === 'string' ? a.date.trim() : '';
            if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
            var id = annivStableId(a);
            if (Object.prototype.hasOwnProperty.call(deletedItems.anniversaries, id)) return;
            var ua = typeof a.updatedAt === 'number' && !isNaN(a.updatedAt) ? a.updatedAt : 0;
            var norm = {
                id: id,
                title: title.slice(0, CD.MAX_ANNIV_TITLE),
                date: dateStr,
                note: typeof a.note === 'string' ? a.note.trim().slice(0, CD.MAX_ANNIV_NOTE) : '',
                time: typeof a.time === 'string' ? a.time.slice(0, 40) : '',
                updatedAt: ua
            };
            var ex = annivMap[id];
            if (!ex || norm.updatedAt >= (ex.updatedAt || 0)) {
                annivMap[id] = norm;
            }
        }
        (r.anniversaries || []).forEach(addAnniv);
        (l.anniversaries || []).forEach(addAnniv);
        var annivArr = Object.keys(annivMap).map(function (k) { return annivMap[k]; });
        annivArr.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        var anniversaries = annivArr;
        var baseline = { ta: scoreBaseline(r, l, 'ta'), my: scoreBaseline(r, l, 'my') };
        var taScore = taScoreHistSum + baseline.ta;
        var myScore = myScoreHistSum + baseline.my;

        return {
            taScore: taScore,
            taHistory: taHistory,
            myScore: myScore,
            myHistory: myHistory,
            messages: messages,
            album: album,
            blogPosts: blogPosts,
            wishes: wishes,
            anniversaries: anniversaries,
            scoreBaseline: baseline,
            deletedItems: deletedItems
        };
    };

    CD.isCloudEmpty = function (d) {
        if (!d) return true;
        var noHist = (!d.taHistory || d.taHistory.length === 0) && (!d.myHistory || d.myHistory.length === 0);
        var noMsg = !d.messages || d.messages.length === 0;
        var zeroScore = (d.taScore === 0 || d.taScore === undefined) && (d.myScore === 0 || d.myScore === undefined);
        var noAlbum = !d.album || d.album.length === 0;
        var noBlog = !d.blogPosts || d.blogPosts.length === 0;
        var noWish = !d.wishes || d.wishes.length === 0;
        var noAnniv = !d.anniversaries || d.anniversaries.length === 0;
        return noHist && noMsg && zeroScore && noAlbum && noBlog && noWish && noAnniv;
    };

    CD.normalizeFetched = function (fetched) {
        if (!fetched || typeof fetched !== 'object' || Array.isArray(fetched)) {
            throw new Error('云端数据格式异常');
        }
        ['taHistory', 'myHistory', 'history', 'messages', 'album', 'blogPosts', 'wishes', 'anniversaries'].forEach(function (key) {
            if (fetched[key] !== undefined && !Array.isArray(fetched[key])) {
                throw new Error('云端数据格式异常：' + key);
            }
        });
        return {
            taScore: fetched.taScore !== undefined ? fetched.taScore : (fetched.score || 0),
            taHistory: fetched.taHistory || fetched.history || [],
            myScore: fetched.myScore || 0,
            myHistory: fetched.myHistory || [],
            messages: fetched.messages || [],
            album: fetched.album || [],
            blogPosts: fetched.blogPosts || [],
            wishes: fetched.wishes || [],
            anniversaries: fetched.anniversaries || [],
            scoreBaseline: fetched.scoreBaseline,
            deletedItems: fetched.deletedItems || { wishes: {}, anniversaries: {} }
        };
    };

    CD.keys = {
        history: historyKey,
        message: messageKey,
        album: albumKey,
        blog: blogKey,
        wish: wishStableId,
        anniversary: annivStableId
    };
})(window.CrushDiary);
