(function () {
    var refreshBtn = document.getElementById('btn-topbar-refresh');
    var backBtn = document.getElementById('btn-topbar-back');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', function () {
            window.location.reload();
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', function () {
            try {
                var ref = document.referrer;
                if (ref) {
                    var u = new URL(ref);
                    if (u.origin === window.location.origin) {
                        window.history.back();
                        return;
                    }
                }
            } catch (e) {}
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'index.html';
            }
        });
    }
})();
