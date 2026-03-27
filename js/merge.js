(function (CD) {
    function historyKey(item) {
        return item.time + '|' + item.reason + '|' + item.change;
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

    CD.mergeRecords = function (remote, local) {
        var r = remote || {};
        var l = local || {};
        var taHist = [];
        var seenTa = {};
        function addTa(item) {
            if (!item || typeof item.change !== 'number') return;
            var k = historyKey(item);
            if (seenTa[k]) return;
            seenTa[k] = true;
            taHist.push(item);
        }
        (r.taHistory || []).forEach(addTa);
        (l.taHistory || []).forEach(addTa);

        var myHist = [];
        var seenMy = {};
        function addMy(item) {
            if (!item || typeof item.change !== 'number') return;
            var k = historyKey(item);
            if (seenMy[k]) return;
            seenMy[k] = true;
            myHist.push(item);
        }
        (r.myHistory || []).forEach(addMy);
        (l.myHistory || []).forEach(addMy);

        var msgs = [];
        var seenMsg = {};
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
        var taHistory = taHist.slice(0, CD.MAX_HISTORY);
        var myHistory = myHist.slice(0, CD.MAX_HISTORY);
        var messages = msgs;

        var albumMerged = [];
        var seenAlbum = {};
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
        var album = albumMerged.slice(0, CD.MAX_ALBUM);

        var blogMerged = [];
        var seenBlog = {};
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
        var blogPosts = blogMerged.slice(0, CD.MAX_BLOG);

        var wishMap = {};
        function addWish(w) {
            if (!w || typeof w.text !== 'string' || !w.text.trim()) return;
            var id = wishStableId(w);
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
        var wishes = wishesArr.slice(0, CD.MAX_WISHES);

        var annivMap = {};
        function addAnniv(a) {
            if (!a || typeof a !== 'object') return;
            var title = typeof a.title === 'string' ? a.title.trim() : '';
            var dateStr = typeof a.date === 'string' ? a.date.trim() : '';
            if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
            var id = annivStableId(a);
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
        var anniversaries = annivArr.slice(0, CD.MAX_ANNIVERSARIES);

        var taScoreHist = taHistory.reduce(function (s, h) { return s + h.change; }, 0);
        var myScoreHist = myHistory.reduce(function (s, h) { return s + h.change; }, 0);
        var taScore = taHistory.length > 0 ? taScoreHist : Math.max(Number(r.taScore) || 0, Number(l.taScore) || 0);
        var myScore = myHistory.length > 0 ? myScoreHist : Math.max(Number(r.myScore) || 0, Number(l.myScore) || 0);

        return {
            taScore: taScore,
            taHistory: taHistory,
            myScore: myScore,
            myHistory: myHistory,
            messages: messages,
            album: album,
            blogPosts: blogPosts,
            wishes: wishes,
            anniversaries: anniversaries
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
        return {
            taScore: fetched.taScore !== undefined ? fetched.taScore : (fetched.score || 0),
            taHistory: fetched.taHistory || fetched.history || [],
            myScore: fetched.myScore || 0,
            myHistory: fetched.myHistory || [],
            messages: fetched.messages || [],
            album: fetched.album || [],
            blogPosts: fetched.blogPosts || [],
            wishes: fetched.wishes || [],
            anniversaries: fetched.anniversaries || []
        };
    };
})(window.CrushDiary);
