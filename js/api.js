(function (CD) {
    function generation() { return CD.auth ? CD.auth.generation : 0; }
    function assertCurrent(value) {
        if (value !== generation()) { var error = new Error('登录状态已改变'); error.superseded = true; error.authRequired = true; throw error; }
    }
    async function fetchLatestRecord() {
        var active = generation();
        var response = await CD.authenticatedFetch('/diary');
        if (!response.ok) throw new Error('拉取失败');
        var data = await response.json();
        assertCurrent(active);
        var rec = data.record;
        return CD.normalizeFetched(rec);
    }

    function afterLoadRender(onRender) {
        if (onRender) onRender();
        if (CD.refreshNavBadges) CD.refreshNavBadges();
    }

    function hasPendingChanges(remote, local) {
        // Compare the effective merged records, so old caches, server-assigned
        // authors and absent optional fields do not create false pending states.
        return JSON.stringify(CD.mergeRecords(remote, {})) !== JSON.stringify(CD.mergeRecords(remote, local));
    }

    CD.loadDataFromCloud = async function (onRender) {
        if (CD.store.isSyncing && !(CD.auth && CD.auth.locked)) return;
        CD.store.onRender = onRender;
        if (!(await CD.ensureAuthenticated())) return;
        var active = generation();

        var initialBackup = CD.loadLocalBackup();
        if (initialBackup) {
            CD.store.cloudData = CD.mergeRecords(initialBackup, CD.store.cloudData);
            afterLoadRender(onRender);
        }

        CD.setStatus('☁️ 正在拉取云端…', '#ffaa33', true);

        try {
            var normalized = await fetchLatestRecord();
            var backup = CD.loadLocalBackup();
            var localOnly = CD.isCloudEmpty(normalized) && backup && !CD.isCloudEmpty(backup);

            CD.store.cloudData = CD.mergeRecords(normalized, CD.store.cloudData);
            CD.store.hasPending = hasPendingChanges(normalized, CD.store.cloudData);
            CD.saveLocalBackup(CD.store.cloudData);
            afterLoadRender(onRender);
            if(CD.showLegacyRecovery)CD.showLegacyRecovery(normalized);
            if (localOnly) {
                CD.setStatus('📦 云端为空，已显示本机备份；尚未上传', '#ff8800', false);
            } else if (CD.store.hasPending) {
                CD.setStatus('📦 有本机记录待同步，请点击“重试同步”上传', '#ff8800', false);
            } else {
                CD.setStatus('✅ 数据已最新', '#32cd32', false);
            }
        } catch (e) {
            if (active !== generation() || e.superseded) return;
            if (e.authRequired) {
                var backedUp = CD.saveLocalBackup(CD.store.cloudData);
                CD.setStatus(backedUp === false ? '请重新登录；记录仅在当前页面，请勿刷新' : '请重新登录，记录仍在本机备份', '#ff8800', false); return;
            }
            var backup2 = CD.loadLocalBackup();
            if (backup2 && !CD.isCloudEmpty(backup2)) {
                CD.store.hasPending = true;
                CD.store.cloudData = CD.mergeRecords(backup2, CD.store.cloudData);
                afterLoadRender(onRender);
                CD.setStatus('⚠️ 云端不可用，已显示本机备份（换网络后可再试同步）', '#ff8800', false);
            } else {
                CD.setStatus('❌ 同步失败', 'red', false);
                afterLoadRender(onRender);
            }
        }
    };

    CD.saveDataToCloud = async function () {
        if (CD.store.isSyncing) return false;
        var active = generation();
        // Persist the user's action before the first network await.
        CD.saveLocalBackup(CD.store.cloudData);
        CD.store.hasPending = true;
        CD.setStatus('⬆️ 上传中...', '#ffaa33', true);
        var saved = false;
        try {
            // Never overwrite the cloud unless its current state was read successfully.
            var remote = await fetchLatestRecord();
            CD.store.cloudData = CD.mergeRecords(remote, CD.store.cloudData);
            CD.saveLocalBackup(CD.store.cloudData);
            var response = await CD.authenticatedFetch('/diary', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(CD.store.cloudData)
            });
            if (!response.ok) {var failure=await response.json();assertCurrent(active);throw new Error(failure.message || '保存失败');}
            var data = await response.json();
            assertCurrent(active);
            var acknowledged = CD.normalizeFetched(data.record);
            CD.store.hasPending = hasPendingChanges(acknowledged, CD.store.cloudData);
            CD.store.cloudData = CD.mergeRecords(acknowledged, CD.store.cloudData);
            var backedUp = CD.saveLocalBackup(CD.store.cloudData);
            if (CD.store.hasPending) throw new Error('云端尚未确认全部记录，请重试同步');
            CD.setStatus(backedUp === false ? '✅ 云端已保存；本机备份不可用' : '✅ 数据已保存', '#32cd32', false);
            saved = true;
        } catch (e) {
            if (active !== generation() || e.superseded) return false;
            var backedUp = CD.saveLocalBackup(CD.store.cloudData);
            CD.setStatus(backedUp === false ? '❌ 保存失败（仅保留在当前页面，请勿刷新或关闭）' : '❌ 保存失败：'+e.message+'（已写入本机备份）', 'red', false);
        }
        afterLoadRender(CD.store.onRender);
        return saved;
    };
    CD.showLegacyRecovery=function(remote){
        if(!CD.auth || !CD.auth.user || !CD.inspectLegacyBackup)return;
        var pending=CD.inspectLegacyBackup(remote);
        var target=CD.auth.user.id==='yyf'?'my':'ta';
        var history=pending[target+'History'];
        var sharedFields=['album','blogPosts','wishes','anniversaries'];
        var total=pending.taHistory.length+pending.myHistory.length+pending.messages.length+sharedFields.reduce(function(n,field){return n+pending[field].length;},0)+Object.keys(pending.deletedItems.wishes).length+Object.keys(pending.deletedItems.anniversaries).length;
        var panel=document.getElementById('legacy-recovery');
        if(!total){if(panel)panel.hidden=true;return;}
        if(!panel){panel=document.createElement('section');panel.id='legacy-recovery';panel.className='legacy-recovery';document.body.appendChild(panel);}
        panel.hidden=false;panel.innerHTML='';
        var heading=document.createElement('h2');heading.textContent='发现旧设备备份';panel.appendChild(heading);
        var note=document.createElement('p');note.textContent='原备份会保留。核对后可恢复属于当前账号打分目标的历史和未署名留言；另一方向的打分请换账号恢复。';panel.appendChild(note);
        var selections=[];
        function row(item,type){
            var label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';
            label.appendChild(box);var text=document.createElement('span');text.textContent=' '+(item.time || '')+' · '+(type==='history'?(item.reason || '')+' ('+item.change+')':type==='message'?item.text:JSON.stringify(item));label.appendChild(text);label.style.display='block';panel.appendChild(label);selections.push({item:item,type:type,box:box});
        }
        history.forEach(function(item){row(item,'history');});pending.messages.forEach(function(item){row(item,'message');});
        sharedFields.forEach(function(field){pending[field].forEach(function(item){row(item,field);});});
        ['wishes','anniversaries'].forEach(function(field){Object.keys(pending.deletedItems[field]).forEach(function(id){row({section:field,id:id,time:pending.deletedItems[field][id]},'deletion');});});
        var button=document.createElement('button');button.textContent='恢复勾选内容';panel.appendChild(button);
        var status=document.createElement('p');status.setAttribute('role','status');panel.appendChild(status);
        button.addEventListener('click',async function(){
            if(CD.store.isSyncing || CD.auth.locked)return;
            var selected=selections.filter(function(x){return x.box.checked;});if(!selected.length){status.textContent='请先勾选需要恢复的内容。';return;}
            var shared={deletedItems:{wishes:{},anniversaries:{}}};sharedFields.forEach(function(field){shared[field]=selected.filter(function(x){return x.type===field;}).map(function(x){return x.item;});});selected.filter(function(x){return x.type==='deletion';}).forEach(function(x){shared.deletedItems[x.item.section][x.item.id]=x.item.time;});
            var active=generation();button.disabled=true;CD.setStatus('正在恢复旧备份…','#ffaa33',true);
            try{
                var response=await CD.authenticatedFetch('/legacy-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:target,shared:shared,history:selected.filter(function(x){return x.type==='history';}).map(function(x){return x.item;}),messages:selected.filter(function(x){return x.type==='message';}).map(function(x){return x.item;})})});
                var data=await response.json();assertCurrent(active);if(!response.ok)throw new Error(data.message || '恢复失败');
                CD.store.cloudData=CD.mergeRecords(CD.normalizeFetched(data.record),CD.store.cloudData);CD.saveLocalBackup(CD.store.cloudData);afterLoadRender(CD.store.onRender);CD.setStatus('旧备份已恢复，原备份仍保留','#32cd32',false);CD.showLegacyRecovery(data.record);
            }catch(error){if(active!==generation())return;status.textContent=error.message;CD.setStatus('恢复失败，原备份仍保留','red',false);}
            finally{button.disabled=false;}
        });
    };
})(window.CrushDiary);
