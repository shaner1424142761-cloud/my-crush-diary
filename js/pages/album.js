(function(CD){
    CD.initSyncBar();CD.mountLoveCalendar();CD.updateLoveCalendar();
    var queues=Object.create(null),running=false,lastUser=null,lastGeneration=CD.auth?CD.auth.generation:0;
    function userId(){return CD.auth && CD.auth.user && CD.auth.user.id;}
    function currentQueue(){var id=userId();if(!id)return [];return queues[id] || (queues[id]=[]);}
    function status(text){var el=document.getElementById('album-upload-status');if(el)el.textContent=text;}
    function check(generation,id){if(CD.auth.locked || CD.auth.generation!==generation || userId()!==id){var error=new Error('账号已改变');error.superseded=true;throw error;}}
    CD.updateAlbumControls=function(){
        var disabled=running || CD.store.isSyncing || !!(CD.auth && CD.auth.locked);
        ['album-files','btn-upload-photos','btn-add-album'].forEach(function(id){var el=document.getElementById(id);if(el)el.disabled=disabled;});
    };
    function renderQueue(){
        var list=document.getElementById('album-upload-queue');if(!list)return;list.innerHTML='';
        currentQueue().forEach(function(item){
            var row=document.createElement('div');row.className='upload-item';
            var img=document.createElement('img');img.alt=item.file.name || '待上传照片';
            if(!item.preview && item.prepared)item.preview=URL.createObjectURL(item.prepared.blob);
            if(item.preview)img.src=item.preview;
            var detail=document.createElement('div'),name=document.createElement('p');name.textContent=item.file.name || '照片';detail.appendChild(name);
            var caption=document.createElement('input');caption.type='text';caption.maxLength=80;caption.placeholder='给这张照片写一句话（可选）';caption.value=item.caption;caption.disabled=running || item.captionFixed;
            caption.addEventListener('input',function(){item.caption=caption.value.slice(0,80);});detail.appendChild(caption);
            var result=document.createElement('p');result.className='upload-item-status';result.textContent=item.stage+(item.error?' · '+item.error:'');detail.appendChild(result);
            if(!running && !item.appended){var remove=document.createElement('button');remove.type='button';remove.textContent='移出这张';remove.addEventListener('click',function(){if(running)return;var q=currentQueue(),at=q.indexOf(item);if(at>=0)q.splice(at,1);if(item.preview)URL.revokeObjectURL(item.preview);renderQueue();});detail.appendChild(remove);}
            row.appendChild(img);row.appendChild(detail);list.appendChild(row);
        });CD.updateAlbumControls();
    }
    CD.selectAlbumFiles=function(files){
        if(running || CD.store.isSyncing || !userId() || CD.auth.locked)return false;
        files=Array.prototype.slice.call(files || []);
        if(files.length>9){status('一次最多选择 9 张照片；请减少选择后重试。');return false;}
        var old=currentQueue();
        if(old.some(function(item){return item.stage!=='完成';})){status('请先重试当前队列，完成后再选择下一批。');return false;}
        old.forEach(function(item){if(item.preview)URL.revokeObjectURL(item.preview);});
        queues[userId()]=files.map(function(file){return {file:file,id:CD.newHistoryItemId(),time:new Date().toISOString(),caption:'',stage:'等待处理',uploaded:false,appended:false};});
        status(files.length?'已选择 '+files.length+' 张。上传前会压缩为展示照片。':'');renderQueue();return true;
    };
    CD.uploadAlbumQueue=async function(){
        if(running || CD.store.isSyncing || !userId() || CD.auth.locked)return false;
        var queue=currentQueue(),generation=CD.auth.generation,id=userId();if(!queue.length){status('请先选择照片。');return false;}
        running=true;renderQueue();status('正在处理和上传…');
        try{
            for(var item of queue){
                check(generation,id);if(item.stage==='完成')continue;item.error='';item.captionFixed=true;
                try{
                    if(!item.prepared){item.stage='处理中';renderQueue();item.prepared=await CD.preparePhoto(item.file);check(generation,id);}
                    if(!item.uploaded){item.stage='上传中';renderQueue();var usage=await CD.uploadPhoto(item.prepared);check(generation,id);item.uploaded=true;var capacity=document.getElementById('album-usage');if(capacity)capacity.textContent='照片容量：'+(usage.usedBytes/1024/1024).toFixed(1)+' / 200 MiB';}
                    item.stage='待同步';
                    if(!item.appended){
                        if(!(CD.store.cloudData.album || []).some(function(entry){return entry.id===item.id;}))CD.store.cloudData.album.unshift({id:item.id,photoId:item.prepared.photoId,url:'private-photo:'+item.prepared.photoId,caption:item.caption.slice(0,80),time:item.time});
                        item.appended=true;CD.saveLocalBackup(CD.store.cloudData);CD.renderAlbum();
                    }
                    renderQueue();var saved=await CD.saveDataToCloud();check(generation,id);
                    item.stage=saved?'完成':'待同步';if(!saved)item.error='图片已上传，相册记录未同步；重试只补同步';
                }catch(error){if(error.superseded)throw error;item.stage=item.uploaded?'待同步':'失败';item.error=error.message;}
                renderQueue();
            }
            var completed=queue.filter(function(item){return item.stage==='完成';}).length;
            status(completed===queue.length?'这批 '+completed+' 张照片已保存。':completed+' 张已保存；其余失败或待同步，请重试。');return completed===queue.length;
        }catch(error){if(!error.superseded)status(error.message);return false;}
        finally{if(generation===CD.auth.generation && id===userId()){running=false;renderQueue();}}
    };
    var files=document.getElementById('album-files'),upload=document.getElementById('btn-upload-photos');
    if(files)files.addEventListener('change',function(){CD.selectAlbumFiles(files.files);files.value='';});
    if(upload)upload.addEventListener('click',function(){CD.uploadAlbumQueue();});
    if(CD.onAuthChange)CD.onAuthChange(function(){
        var id=userId();if(id!==lastUser || CD.auth.generation!==lastGeneration || CD.auth.locked){running=false;Object.keys(queues).forEach(function(name){queues[name].forEach(function(item){if(item.preview)URL.revokeObjectURL(item.preview);item.preview=null;});});lastUser=id;lastGeneration=CD.auth.generation;}
        if(CD.auth.locked){var list=document.getElementById('album-upload-queue');if(list)list.innerHTML='';status('');}else renderQueue();CD.updateAlbumControls();
    });
    document.getElementById('btn-add-album').addEventListener('click',async function(){
        if(CD.store.isSyncing || running)return;
        var urlEl=document.getElementById('album-url'),capEl=document.getElementById('album-caption'),url=(urlEl && urlEl.value || '').trim();
        if(!/^https?:\/\//i.test(url)){alert('请填写以 http:// 或 https:// 开头的图片链接');return;}
        if(!CD.store.cloudData.album)CD.store.cloudData.album=[];
        CD.store.cloudData.album.unshift({id:CD.newHistoryItemId(),url:url,caption:(capEl && capEl.value || '').trim().slice(0,40),time:CD.getTimeString()});urlEl.value='';capEl.value='';CD.renderAlbum();await CD.saveDataToCloud();
    });
    CD.loadDataFromCloud(CD.renderAlbum);
})(window.CrushDiary);
