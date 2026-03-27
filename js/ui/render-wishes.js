(function (CD) {
    CD.renderWishlist = function () {
        var list = document.getElementById('wish-list');
        if (!list) return;
        list.innerHTML = '';
        var items = CD.store.cloudData.wishes || [];
        if (items.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'wish-empty';
            empty.textContent = '还没有愿望～写下第一件想一起做的事吧';
            list.appendChild(empty);
            return;
        }
        items.forEach(function (w) {
            var row = document.createElement('div');
            row.className = 'wish-item' + (w.done ? ' wish-item--done' : '');
            row.dataset.wishId = w.id;

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'wish-item__check';
            cb.checked = !!w.done;
            cb.setAttribute('aria-label', w.done ? '标记为未完成' : '标记为已完成');
            cb.dataset.wishId = w.id;

            var body = document.createElement('div');
            body.className = 'wish-item__body';
            var text = document.createElement('div');
            text.className = 'wish-item__text';
            text.textContent = w.text || '';
            var meta = document.createElement('div');
            meta.className = 'wish-item__meta';
            meta.textContent = w.time ? '添加于 ' + w.time : '';
            body.appendChild(text);
            body.appendChild(meta);

            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'wish-item__del';
            del.setAttribute('aria-label', '删除这条愿望');
            del.dataset.wishId = w.id;
            del.textContent = '×';

            row.appendChild(cb);
            row.appendChild(body);
            row.appendChild(del);
            list.appendChild(row);
        });
    };
})(window.CrushDiary);
