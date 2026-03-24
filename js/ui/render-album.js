(function (CD) {
    CD.renderAlbum = function () {
        var grid = document.getElementById('album-grid');
        if (!grid) return;
        grid.innerHTML = '';
        var items = CD.store.cloudData.album || [];
        if (items.length === 0) {
            var empty = document.createElement('div');
            empty.style.cssText = 'grid-column:1/-1;text-align:center;color:#bbb;font-size:12px;padding:20px 8px;';
            empty.textContent = '还没有照片～ 粘贴图片链接即可加入（支持 https 图床）';
            grid.appendChild(empty);
            return;
        }
        items.forEach(function (entry) {
            var card = document.createElement('div');
            card.className = 'album-card';
            var img = document.createElement('img');
            img.alt = entry.caption || '回忆';
            img.src = entry.url || '';
            img.onerror = function () {
                this.style.display = 'none';
                if (card.querySelector('.album-placeholder')) return;
                var ph = document.createElement('div');
                ph.className = 'album-placeholder';
                ph.textContent = '🔗';
                ph.title = '链接失效或禁止外链';
                card.insertBefore(ph, card.firstChild);
            };
            var cap = document.createElement('div');
            cap.className = 'album-cap';
            cap.textContent = (entry.caption || '').trim() || (entry.time || '');
            card.appendChild(img);
            card.appendChild(cap);
            grid.appendChild(card);
        });
    };
})(window.CrushDiary);
