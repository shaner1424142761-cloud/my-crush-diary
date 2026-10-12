(function(CD){
    var renderId=0,observer=null,lightboxIndex=0,lightboxRequest=0,focusOrigin=null;
    function locked(){return CD.auth && CD.auth.locked;}
    function privateId(entry){return entry && /^[a-f0-9]{64}$/.test(entry.photoId || '') && entry.url==='private-photo:'+entry.photoId?entry.photoId:null;}
    function legacyURL(entry){try{var url=new URL(entry.url);return ['http:','https:'].indexOf(url.protocol)>=0?url.href:null;}catch(_){return null;}}
    function timeLabel(entry){return (privateId(entry)?'上传于 ':'')+(entry.time || '');}
    async function imageURL(entry){var id=privateId(entry);if(id)return CD.getPhotoURL(id);var url=legacyURL(entry);if(!url)throw new Error('图片链接格式有误');return url;}
    CD.renderAlbum=function(){
        var grid=document.getElementById('album-grid');if(!grid)return;
        renderId++;var own=renderId;if(observer)observer.disconnect();grid.innerHTML='';if(locked())return;
        var items=CD.store.cloudData.album || [];
        if(!items.length){var empty=document.createElement('p');empty.className='album-empty';empty.textContent='还没有照片，上传第一张共同的回忆吧。';grid.appendChild(empty);}
        if(typeof IntersectionObserver!=='undefined')observer=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){observer.unobserve(e.target);e.target.loadPhoto();}});},{rootMargin:'250px'});
        items.forEach(function(entry,index){
            var card=document.createElement('button');card.type='button';card.className='album-card';card.setAttribute('aria-label','查看照片：'+(entry.caption || '回忆'));
            var img=document.createElement('img');img.alt=entry.caption || '回忆';img.loading='lazy';
            var placeholder=document.createElement('span');placeholder.className='album-placeholder';placeholder.textContent='正在载入…';
            var cap=document.createElement('span');cap.className='album-cap';cap.textContent=entry.caption || '共同的回忆';
            var time=document.createElement('span');time.className='album-time';time.textContent=timeLabel(entry);
            card.appendChild(img);card.appendChild(placeholder);card.appendChild(cap);card.appendChild(time);grid.appendChild(card);
            function failed(){img.hidden=true;placeholder.hidden=false;placeholder.textContent='照片暂时无法显示 · 点击重试';}
            img.onerror=failed;img.onload=function(){placeholder.hidden=true;img.hidden=false;};
            card.loadPhoto=function(){imageURL(entry).then(function(url){if(own!==renderId || locked() || !card.isConnected)return;img.src=url;},function(){if(own===renderId && !locked() && card.isConnected)failed();});};
            card.addEventListener('click',function(){focusOrigin=card;CD.openAlbumPhoto(index);});
            if(observer)observer.observe(card);else card.loadPhoto();
        });
        if(CD.markNavSectionRead)CD.markNavSectionRead('album');if(CD.refreshNavBadges)CD.refreshNavBadges();
    };
    CD.openAlbumPhoto=function(index){
        if(locked())return;var dialog=document.getElementById('album-lightbox'),items=CD.store.cloudData.album || [];if(!dialog || !items.length)return;
        lightboxIndex=(index+items.length)%items.length;var entry=items[lightboxIndex],request=++lightboxRequest,img=document.getElementById('album-lightbox-img');
        img.removeAttribute('src');img.alt=entry.caption || '回忆';document.getElementById('album-lightbox-caption').textContent=entry.caption || '';
        document.getElementById('album-lightbox-time').textContent=timeLabel(entry);var status=document.getElementById('album-lightbox-status');status.textContent='正在载入…';
        if(!dialog.open){focusOrigin=focusOrigin || document.activeElement;dialog.showModal();document.getElementById('album-lightbox-close').focus();}
        imageURL(entry).then(function(url){if(locked() || request!==lightboxRequest || !dialog.open)return;img.src=url;status.textContent=(lightboxIndex+1)+' / '+items.length;},function(error){if(request===lightboxRequest && !locked())status.textContent=error.message;});
        img.onerror=function(){status.textContent='照片暂时无法显示，请稍后再试。';};
    };
    CD.closeAlbumPhoto=function(){
        lightboxRequest++;var dialog=document.getElementById('album-lightbox'),img=document.getElementById('album-lightbox-img');if(img)img.removeAttribute('src');
        if(dialog && dialog.open)dialog.close();if(focusOrigin && focusOrigin.isConnected && !locked())focusOrigin.focus();focusOrigin=null;
    };
    var dialog=document.getElementById('album-lightbox');
    if(dialog){
        document.getElementById('album-lightbox-close').addEventListener('click',CD.closeAlbumPhoto);
        document.getElementById('album-lightbox-prev').addEventListener('click',function(){CD.openAlbumPhoto(lightboxIndex-1);});
        document.getElementById('album-lightbox-next').addEventListener('click',function(){CD.openAlbumPhoto(lightboxIndex+1);});
        dialog.addEventListener('cancel',function(event){event.preventDefault();CD.closeAlbumPhoto();});
        dialog.addEventListener('click',function(event){if(event.target===dialog)CD.closeAlbumPhoto();});
        dialog.addEventListener('keydown',function(event){if(event.key==='ArrowLeft' || event.key==='ArrowRight'){event.preventDefault();CD.openAlbumPhoto(lightboxIndex+(event.key==='ArrowRight'?1:-1));}});
    }
    if(CD.onAuthChange)CD.onAuthChange(function(){CD.closeAlbumPhoto();renderId++;if(observer)observer.disconnect();var grid=document.getElementById('album-grid');if(grid)grid.innerHTML='';});
})(window.CrushDiary);
