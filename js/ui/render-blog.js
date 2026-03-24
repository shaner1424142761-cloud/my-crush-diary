(function (CD) {
    CD.renderBlog = function () {
        var list = document.getElementById('blog-list');
        if (!list) return;
        list.innerHTML = '';
        var posts = CD.store.cloudData.blogPosts || [];
        if (posts.length === 0) {
            var empty = document.createElement('div');
            empty.style.cssText = 'color:#ccc;font-size:12px;text-align:center;padding:16px;';
            empty.textContent = '还没有文章～';
            list.appendChild(empty);
            return;
        }
        posts.forEach(function (post) {
            var div = document.createElement('div');
            div.className = 'blog-item';
            var h3 = document.createElement('h3');
            h3.textContent = post.title || '无标题';
            var body = document.createElement('div');
            body.className = 'blog-body';
            body.textContent = post.body || '';
            var meta = document.createElement('div');
            meta.className = 'blog-meta';
            meta.textContent = post.time || '';
            div.appendChild(h3);
            div.appendChild(body);
            div.appendChild(meta);
            list.appendChild(div);
        });
    };
})(window.CrushDiary);
