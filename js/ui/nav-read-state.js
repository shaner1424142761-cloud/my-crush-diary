(function (CD) {
    var MAX_KEYS_PER_SECTION = 500;
    var SECTION_IDS = ['index', 'album', 'blog', 'messages', 'wishes', 'anniversaries'];

    function loadSeenDoc() {
        try {
            var raw = localStorage.getItem(CD.SEEN_STORAGE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || o.v !== 1 || typeof o.sections !== 'object') return null;
            return o;
        } catch (e) {
            return null;
        }
    }

    function saveSeenDoc(doc) {
        try {
            localStorage.setItem(CD.SEEN_STORAGE_KEY, JSON.stringify(doc));
        } catch (e) { /* 私密模式等 */ }
    }

    function keySetForSection(data, sectionId) {
        var d = data || CD.defaultCloudData();
        var K = CD.keys;
        var set = {};
        function add(k) {
            if (k && typeof k === 'string') set[k] = true;
        }
        if (sectionId === 'index') {
            (d.taHistory || []).forEach(function (item) {
                if (item && typeof item.change === 'number') add('ta:' + K.history(item));
            });
            (d.myHistory || []).forEach(function (item) {
                if (item && typeof item.change === 'number') add('my:' + K.history(item));
            });
        } else if (sectionId === 'messages') {
            (d.messages || []).forEach(function (m) {
                if (m && typeof m.text === 'string') add(K.message(m));
            });
        } else if (sectionId === 'album') {
            (d.album || []).forEach(function (a) {
                if (a && typeof a.url === 'string' && a.url.trim()) add(K.album(a));
            });
        } else if (sectionId === 'blog') {
            (d.blogPosts || []).forEach(function (p) {
                if (!p || typeof p !== 'object') return;
                var t = typeof p.title === 'string' ? p.title : '';
                var b = typeof p.body === 'string' ? p.body : '';
                if (!t.trim() && !b.trim()) return;
                add(K.blog({ title: t, body: b, time: p.time || '' }));
            });
        } else if (sectionId === 'wishes') {
            (d.wishes || []).forEach(function (w) {
                if (!w || typeof w.text !== 'string' || !w.text.trim()) return;
                add(K.wish(w));
            });
        } else if (sectionId === 'anniversaries') {
            (d.anniversaries || []).forEach(function (a) {
                if (!a || typeof a !== 'object') return;
                var title = typeof a.title === 'string' ? a.title.trim() : '';
                var dateStr = typeof a.date === 'string' ? a.date.trim() : '';
                if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
                add(K.anniversary(a));
            });
        }
        return set;
    }

    function keysArrayFromSet(set) {
        var arr = Object.keys(set);
        if (arr.length > MAX_KEYS_PER_SECTION) arr = arr.slice(0, MAX_KEYS_PER_SECTION);
        return arr;
    }

    CD.markNavSectionRead = function (sectionId) {
        var doc = loadSeenDoc();
        if (!doc) doc = { v: 1, sections: {} };
        if (!doc.sections) doc.sections = {};
        var set = keySetForSection(CD.store.cloudData, sectionId);
        doc.sections[sectionId] = keysArrayFromSet(set);
        saveSeenDoc(doc);
    };

    function bootstrapSeenFromCurrent() {
        var doc = { v: 1, sections: {} };
        SECTION_IDS.forEach(function (sid) {
            doc.sections[sid] = keysArrayFromSet(keySetForSection(CD.store.cloudData, sid));
        });
        saveSeenDoc(doc);
    }

    CD.refreshNavBadges = function () {
        if (!loadSeenDoc() && !CD.isCloudEmpty(CD.store.cloudData)) {
            bootstrapSeenFromCurrent();
        }
        var doc = loadSeenDoc();
        SECTION_IDS.forEach(function (sid) {
            var unread = false;
            if (doc && doc.sections) {
                var seenArr = doc.sections[sid] || [];
                var seen = {};
                for (var i = 0; i < seenArr.length; i++) seen[seenArr[i]] = true;
                var cur = keySetForSection(CD.store.cloudData, sid);
                var k;
                for (k in cur) {
                    if (Object.prototype.hasOwnProperty.call(cur, k) && !seen[k]) {
                        unread = true;
                        break;
                    }
                }
            }
            var link = document.querySelector('a.side-menu__link[data-nav-section="' + sid + '"]');
            if (!link) return;
            var badge = link.querySelector('.side-menu__badge');
            if (!badge) return;
            badge.hidden = !unread;
            var labelEl = link.querySelector('.side-menu__link-label');
            var base = (labelEl && labelEl.textContent) || '';
            if (unread) {
                link.setAttribute('aria-label', base + '（有新内容）');
            } else {
                link.removeAttribute('aria-label');
            }
        });
    };
})(window.CrushDiary);
