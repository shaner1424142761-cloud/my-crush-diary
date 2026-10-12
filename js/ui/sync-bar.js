(function (CD) {
    var syncEl = null;
    var actionButtons = [];

    CD.initSyncBar = function () {
        syncEl = document.getElementById('syncStatus');
        CD.refreshActionButtons();
    };

    CD.refreshActionButtons = function () {
        actionButtons = Array.prototype.slice.call(document.querySelectorAll('main button'));
    };

    CD.setStatus = function (text, color, disabled) {
        disabled = !!disabled || !!(CD.auth && CD.auth.locked);
        CD.store.isSyncing = disabled;
        if (!syncEl) return;
        syncEl.textContent = text;
        syncEl.style.color = color;
        CD.refreshActionButtons();
        actionButtons.forEach(function (btn) {
            btn.disabled = disabled;
        });
    };
})(window.CrushDiary);
