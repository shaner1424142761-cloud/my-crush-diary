(function (CD) {
    var B = CD.BIN_ID;
    CD.FETCH_URL = 'https://api.jsonbin.io/v3/b/' + B + '/latest';
    CD.UPDATE_URL = 'https://api.jsonbin.io/v3/b/' + B;
    CD.STORAGE_KEY = 'myCrushDiary_backup_v1';
    CD.MAX_ALBUM = 24;
    CD.MAX_BLOG = 20;
    CD.MAX_WISHES = 50;
    CD.MAX_WISH_TEXT = 120;
    CD.MAX_ANNIVERSARIES = 30;
    CD.MAX_ANNIV_TITLE = 40;
    CD.MAX_ANNIV_NOTE = 160;
})(window.CrushDiary);
