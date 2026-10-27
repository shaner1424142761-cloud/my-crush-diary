(function (CD) {
    var syncEl = null;
    var actionButtons = [];

    CD.initSyncBar = function () {
        syncEl = document.getElementById('syncStatus');
        if (syncEl && !document.getElementById('sync-actions')) {
            var actions = document.createElement('div'); actions.id = 'sync-actions'; actions.className = 'sync-actions'; actions.hidden = true;
            var retry = document.createElement('button'); retry.id = 'sync-retry'; retry.type = 'button'; retry.textContent = '重试同步';
            retry.addEventListener('click', function () { if (!CD.store.isSyncing && !(CD.auth && CD.auth.locked)) CD.saveDataToCloud(); });
            actions.appendChild(retry); syncEl.insertAdjacentElement('afterend', actions);
        }
        if (CD.onAuthChange) CD.onAuthChange(CD.refreshSyncRetry);
        CD.refreshSyncRetry();
        CD.refreshActionButtons();
    };

    CD.refreshSyncRetry = function () {
        var actions = document.getElementById('sync-actions'), retry = document.getElementById('sync-retry');
        var locked = !!(CD.auth && CD.auth.locked);
        if (actions) actions.hidden = locked || !CD.store.hasPending;
        if (retry) retry.disabled = locked || !!CD.store.isSyncing;
    };

    CD.refreshActionButtons = function () {
        actionButtons = Array.prototype.slice.call(document.querySelectorAll('main button'));
    };

    CD.setStatus = function (text, color, disabled) {
        disabled = !!disabled || !!(CD.auth && CD.auth.locked);
        CD.store.isSyncing = disabled;
        CD.refreshSyncRetry();
        if (!syncEl) return;
        syncEl.textContent = text;
        syncEl.style.color = color;
        CD.refreshActionButtons();
        actionButtons.forEach(function (btn) {
            btn.disabled = disabled;
        });
        if (CD.updateScoreControls) CD.updateScoreControls();
        if (CD.updateAlbumControls) CD.updateAlbumControls();
    };
})(window.CrushDiary);
