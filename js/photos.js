(function(CD){
    var MAX=400*1024,LIMIT=200*1024*1024,cache=new Map(),pending=new Map(),controllers=new Set(),queue=[],active=0,epoch=0;
    function stale(){var error=new Error('登录状态已改变，请重新选择或重试照片。');error.superseded=true;return error;}
    function stamp(){return {generation:CD.auth.generation,epoch:epoch};}
    function current(mark){if(CD.auth.locked || mark.generation!==CD.auth.generation || mark.epoch!==epoch)throw stale();}
    function validId(id){return typeof id==='string' && /^[a-f0-9]{64}$/.test(id);}
    async function bounded(mark,operation){
        current(mark);var controller=new AbortController();controllers.add(controller);
        var rejectAbort;var aborted=new Promise(function(_,reject){rejectAbort=reject;});
        var cancel=function(){rejectAbort(stale());};controller.signal.addEventListener('abort',cancel,{once:true});
        var timer=setTimeout(function(){controller.abort();},20000);
        try{var result=await Promise.race([operation(controller.signal),aborted]);current(mark);return result;}
        finally{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);controllers.delete(controller);}
    }
    async function responseError(response){var data;try{data=await response.json();}catch(_){}throw new Error(data && data.message || '照片服务暂时不可用，请重试。');}
    CD.preparePhoto=async function(file){
        if(!file || !/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('请选择 JPEG、PNG 或 WebP 照片；HEIC 请先转换。');
        if(file.size>20*1024*1024)throw new Error('原图超过 20 MiB，请先缩小。');
        var bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch(_){throw new Error('浏览器无法解码这张照片，请转换后重试。');}
        try{
            if(!bitmap.width || !bitmap.height || bitmap.width*bitmap.height>40000000)throw new Error('照片像素超过 4000 万，请先缩小。');
            var canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法处理照片。');
            var longest=Math.min(1600,Math.max(bitmap.width,bitmap.height)),blob,width,height;
            while(true){
                var scale=Math.min(1,longest/Math.max(bitmap.width,bitmap.height));width=Math.max(1,Math.round(bitmap.width*scale));height=Math.max(1,Math.round(bitmap.height*scale));
                canvas.width=width;canvas.height=height;context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(bitmap,0,0,width,height);
                for(var quality of [.88,.8,.7,.6,.5]){
                    blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/jpeg',quality);});
                    if(blob && blob.type==='image/jpeg' && blob.size>0 && blob.size<=MAX)break;
                }
                if(blob && blob.type==='image/jpeg' && blob.size>0 && blob.size<=MAX)break;
                if(longest<=64)throw new Error('无法压缩到 400 KiB，请先缩小照片后重试。');
                longest=Math.max(64,Math.floor(longest*.75));
            }
            var bytes=await blob.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);
            return {blob:blob,photoId:Array.from(new Uint8Array(hash),function(b){return b.toString(16).padStart(2,'0');}).join(''),width:width,height:height};
        }finally{if(bitmap.close)bitmap.close();}
    };
    CD.uploadPhoto=async function(prepared){
        if(!validId(prepared.photoId) || prepared.blob.type!=='image/jpeg' || prepared.blob.size>MAX)throw new Error('照片格式有误，请重新选择。');
        var mark=stamp();return bounded(mark,async function(signal){
            var response=await CD.authenticatedFetch('/photos/'+prepared.photoId,{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:prepared.blob,signal:signal});
            if(!response.ok)return responseError(response);
            var data=await response.json();current(mark);
            if(data.photoId!==prepared.photoId || data.bytes!==prepared.blob.size || !Number.isFinite(data.usedBytes) || data.limitBytes!==LIMIT)throw new Error('照片保存响应异常，请用同一照片重试。');
            return data;
        });
    };
    async function readImage(response){
        if(response.headers.get('Content-Type')?.split(';')[0].toLowerCase()!=='image/jpeg')throw new Error('照片格式异常。');
        if(Number(response.headers.get('Content-Length'))>MAX)throw new Error('照片超过 400 KiB。');
        var reader=response.body.getReader(),chunks=[],length=0;
        try{
            while(true){var part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>MAX)throw new Error('照片超过 400 KiB。');chunks.push(part.value);}
        }catch(error){await reader.cancel().catch(function(){});throw error;}
        if(length<4)throw new Error('照片格式异常。');
        return new Blob(chunks,{type:'image/jpeg'});
    }
    function pump(){
        while(active<3 && queue.length){
            var job=queue.shift();active++;
            (function(job){
                bounded(job.mark,async function(signal){
                    var response=await CD.authenticatedFetch('/photos/'+job.id,{signal:signal});if(!response.ok)return responseError(response);
                    var blob=await readImage(response);current(job.mark);var url=URL.createObjectURL(blob);cache.set(job.id,url);return url;
                }).then(job.resolve,job.reject).finally(function(){
                    if(job.mark.epoch===epoch){active--;if(pending.get(job.id)===job.promise)pending.delete(job.id);pump();}
                });
            })(job);
        }
    }
    CD.getPhotoURL=function(id){
        if(!validId(id))return Promise.reject(new Error('照片标识有误。'));
        if(CD.auth.locked)return Promise.reject(stale());
        if(cache.has(id))return Promise.resolve(cache.get(id));if(pending.has(id))return pending.get(id);
        var job={id:id,mark:stamp()};job.promise=new Promise(function(resolve,reject){job.resolve=resolve;job.reject=reject;});pending.set(id,job.promise);queue.push(job);pump();return job.promise;
    };
    CD.clearPhotoCache=function(){
        epoch++;controllers.forEach(function(controller){controller.abort();});controllers.clear();
        queue.forEach(function(job){job.reject(stale());});queue=[];active=0;pending.clear();cache.forEach(function(url){URL.revokeObjectURL(url);});cache.clear();
    };
    var lastGeneration=CD.auth.generation,lastLocked=CD.auth.locked;
    CD.onAuthChange(function(state){if(state.generation!==lastGeneration || state.locked!==lastLocked)CD.clearPhotoCache();lastGeneration=state.generation;lastLocked=state.locked;});
})(window.CrushDiary);
