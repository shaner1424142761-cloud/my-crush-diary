(function (CD) {
    CD.initSyncBar();
    CD.mountLoveCalendar();
    CD.updateLoveCalendar();

    document.getElementById('btn-publish-blog').addEventListener('click', async function () {
        if (CD.store.isSyncing) return;
        var titleEl = document.getElementById('blog-title');
        var bodyEl = document.getElementById('blog-body');
        var title = (titleEl && titleEl.value || '').trim();
        var body = (bodyEl && bodyEl.value || '').trim();
        if (!title && !body) {
            alert('标题或正文至少填一项吧～');
            return;
        }
        if (!CD.store.cloudData.blogPosts) CD.store.cloudData.blogPosts = [];
        CD.store.cloudData.blogPosts.unshift({
            title: title.slice(0, 60),
            body: body.slice(0, 4000),
            time: CD.getTimeString()
        });
        if (CD.store.cloudData.blogPosts.length > CD.MAX_BLOG) CD.store.cloudData.blogPosts.pop();
        titleEl.value = '';
        bodyEl.value = '';
        CD.renderBlog();
        await CD.saveDataToCloud();
    });

    CD.loadDataFromCloud(CD.renderBlog);
})(window.CrushDiary);
