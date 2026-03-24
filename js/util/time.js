(function (CD) {
    CD.getTimeString = function () {
        var now = new Date();
        var m = (now.getMonth() + 1).toString();
        var d = now.getDate().toString().padStart(2, '0');
        var h = now.getHours().toString().padStart(2, '0');
        var min = now.getMinutes().toString().padStart(2, '0');
        return m + '-' + d + ' ' + h + ':' + min;
    };
})(window.CrushDiary);
