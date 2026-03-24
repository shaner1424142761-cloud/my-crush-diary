(function (CD) {
    CD.defaultCloudData = function () {
        return {
            taScore: 0,
            taHistory: [],
            myScore: 0,
            myHistory: [],
            messages: [],
            album: [],
            blogPosts: []
        };
    };
    CD.store = {
        cloudData: CD.defaultCloudData(),
        isSyncing: false
    };
    CD.loadLocalBackup = function () {
        try {
            var raw = localStorage.getItem(CD.STORAGE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return null;
            return {
                taScore: Number(o.taScore) || 0,
                taHistory: Array.isArray(o.taHistory) ? o.taHistory : [],
                myScore: Number(o.myScore) || 0,
                myHistory: Array.isArray(o.myHistory) ? o.myHistory : [],
                messages: Array.isArray(o.messages) ? o.messages : [],
                album: Array.isArray(o.album) ? o.album : [],
                blogPosts: Array.isArray(o.blogPosts) ? o.blogPosts : []
            };
        } catch (e) {
            return null;
        }
    };
    CD.saveLocalBackup = function (data) {
        try {
            localStorage.setItem(CD.STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* 私密模式等 */ }
    };
})(window.CrushDiary);
