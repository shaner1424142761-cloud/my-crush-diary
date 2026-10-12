(function (CD) {
    CD.defaultCloudData = function () {
        return {
            taScore: 0,
            taHistory: [],
            myScore: 0,
            myHistory: [],
            messages: [],
            album: [],
            blogPosts: [],
            wishes: [],
            anniversaries: []
        };
    };
    CD.store = {
        cloudData: CD.defaultCloudData(),
        isSyncing: false
    };
    var activeId=null, suspended=false, buffers=Object.create(null);
    function backupKey(){return activeId?'myCrushDiary_backup_v2_'+activeId:CD.auth?null:CD.STORAGE_KEY;}
    CD.activateUser=function(user){
        if(activeId===user.id){if(suspended)CD.store.cloudData=CD.loadLocalBackup() || CD.defaultCloudData();suspended=false;return;}
        if(activeId && !suspended)CD.saveLocalBackup(CD.store.cloudData);
        activeId=user.id;suspended=false;
        CD.store.cloudData=CD.loadLocalBackup() || CD.defaultCloudData();
    };
    CD.suspendUser=function(){
        if(activeId)CD.saveLocalBackup(CD.store.cloudData);
        CD.store.cloudData=CD.defaultCloudData();suspended=true;
        // Keep activeId and buffers so re-login to the same account can restore memory.
    };
    CD.loadLocalBackup = function () {
        if(activeId && buffers[activeId])return JSON.parse(JSON.stringify(buffers[activeId]));
        try {
            var raw = localStorage.getItem(backupKey());
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
                blogPosts: Array.isArray(o.blogPosts) ? o.blogPosts : [],
                wishes: Array.isArray(o.wishes) ? o.wishes : [],
                anniversaries: Array.isArray(o.anniversaries) ? o.anniversaries : [],
                scoreBaseline: o.scoreBaseline,
                deletedItems: o.deletedItems || { wishes: {}, anniversaries: {} }
            };
        } catch (e) {
            return null;
        }
    };
    CD.saveLocalBackup = function (data) {
        if(activeId)buffers[activeId]=JSON.parse(JSON.stringify(data));
        if(!backupKey())return false;
        try {
            localStorage.setItem(backupKey(), JSON.stringify(data));
            if (CD.updateBackupWarning) CD.updateBackupWarning(true);
            return true;
        } catch (e) { if (CD.updateBackupWarning) CD.updateBackupWarning(false); return false; }
    };
    CD.inspectLegacyBackup=function(remote){
        var old;try{old=JSON.parse(localStorage.getItem(CD.STORAGE_KEY));}catch(_){old=null;}
        var result={taHistory:[],myHistory:[],messages:[]};
        ['taHistory','myHistory','messages'].forEach(function(field){
            var items=old && (old[field] || (field==='taHistory'?old.history:null));
            var key=field==='messages'?function(x){return (x.time || '')+'|'+x.text;}:function(x){return x.id || (x.time || '')+'|'+(x.reason || '')+'|'+x.change;};
            var existing=new Set((remote[field] || []).map(key));
            result[field]=Array.isArray(items)?items.filter(function(x){return x && !x.authorId && !x.importedBy && !existing.has(key(x)) && !existing.has('import|'+key(Object.assign({},x,{id:undefined})) );}):[];
        });
        return result;
    };
    if(CD.auth && CD.auth.user)CD.activateUser(CD.auth.user);
})(window.CrushDiary);
