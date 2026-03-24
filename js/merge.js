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
        var messages = msgs.slice(-CD.MAX_MESSAGES);

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

        var taScoreHist = taHistory.reduce(function (s, h) { return s + h.change; }, 0);
        var myScoreHist = myHistory.reduce(function (s, h) { return s + h.change; }, 0);
        var taScore = taHistory.length > 0 ? taScoreHist : Math.max(Number(r.taScore) || 0, Number(l.taScore) || 0);
        var myScore = myHistory.length > 0 ? myScoreHist : Math.max(Number(r.myScore) || 0, Number(l.myScore) || 0);

        return { taScore: taScore, taHistory: taHistory, myScore: myScore, myHistory: myHistory, messages: messages, album: album, blogPosts: blogPosts };
    };

    CD.isCloudEmpty = function (d) {
        if (!d) return true;
        var noHist = (!d.taHistory || d.taHistory.length === 0) && (!d.myHistory || d.myHistory.length === 0);
        var noMsg = !d.messages || d.messages.length === 0;
        var zeroScore = (d.taScore === 0 || d.taScore === undefined) && (d.myScore === 0 || d.myScore === undefined);
        return noHist && noMsg && zeroScore;
    };

    CD.normalizeFetched = function (fetched) {
        return {
            taScore: fetched.taScore !== undefined ? fetched.taScore : (fetched.score || 0),
            taHistory: fetched.taHistory || fetched.history || [],
            myScore: fetched.myScore || 0,
            myHistory: fetched.myHistory || [],
            messages: fetched.messages || [],
            album: fetched.album || [],
            blogPosts: fetched.blogPosts || []
        };
    };
})(window.CrushDiary);
