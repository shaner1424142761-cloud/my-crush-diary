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
        if (!syncEl) return;
        CD.store.isSyncing = disabled;
        syncEl.textContent = text;
        syncEl.style.color = color;
        CD.refreshActionButtons();
        actionButtons.forEach(function (btn) {
            btn.disabled = disabled;
        });
    };
})(window.CrushDiary);
