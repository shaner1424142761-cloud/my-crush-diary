(function (CD) {
    var key = 'myCrushDiary_session_v1';
    var session = null, waiting = null, resolveWaiting = null;
    CD.auth = { locked: true, generation: 0 };
    function storage(name) { try { return name === 'local' ? localStorage : sessionStorage; } catch (_) { return null; } }
    function clearTokens() { ['local', 'session'].forEach(function (name) { try { storage(name).removeItem(key); } catch (_) {} }); }
    function valid() { return session && typeof session.token === 'string' && session.expiresAt > Date.now() / 1000; }
    function base() {
        try {
            var url = new URL(CD.API_BASE_URL);
            if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].indexOf(url.hostname) >= 0)) return '';
            if (url.username || url.password || url.search || url.hash) return '';
            return url.href.replace(/\/$/, '');
        } catch (_) { return ''; }
    }
    function mount() {
        if (document.getElementById('auth-panel')) return;
        var panel = document.createElement('section');
        panel.id = 'auth-panel'; panel.className = 'auth-panel';
        panel.innerHTML = '<h1>我们的恋爱日记</h1><p>输入共同密码，打开属于你们的记录。</p>' +
            '<form id="auth-form"><label for="auth-password">共同密码</label>' +
            '<input id="auth-password" type="password" autocomplete="current-password" required maxlength="256">' +
            '<label class="auth-remember"><input id="auth-remember" type="checkbox"> 在这台私人设备上记住我（7 天）</label>' +
            '<button id="auth-submit" type="submit">打开日记</button></form>' +
            '<p id="auth-error" role="alert"></p>';
        document.body.appendChild(panel);
        var warning = document.createElement('p'); warning.id = 'auth-session-warning'; warning.className = 'auth-warning';
        document.body.appendChild(warning);
        var backupWarning = document.createElement('p'); backupWarning.id = 'auth-backup-warning'; backupWarning.className = 'auth-warning';
        document.body.appendChild(backupWarning);
        document.getElementById('auth-form').addEventListener('submit', function (event) {
            event.preventDefault();
            CD.login(document.getElementById('auth-password').value, document.getElementById('auth-remember').checked).catch(function () {});
        });
    }
    function lock(message) {
        mount(); CD.auth.locked = true; CD.store.isSyncing = true;
        document.body.classList.add('auth-locked');
        document.getElementById('auth-panel').hidden = false;
        document.getElementById('auth-error').textContent = message || '';
    }
    function unlock() {
        CD.auth.locked = false; CD.store.isSyncing = false;
        document.body.classList.remove('auth-locked');
        document.getElementById('auth-panel').hidden = true;
    }
    ['session', 'local'].some(function (name) {
        try { session = JSON.parse(storage(name).getItem(key)); } catch (_) { session = null; }
        return !!valid();
    });
    CD.updateBackupWarning = function (available) {
        mount(); document.getElementById('auth-backup-warning').textContent = available ? '' : '本机备份不可用，未同步记录仅保留在当前页面，请勿刷新或关闭。';
    };
    CD.ensureAuthenticated = function () {
        mount();
        if (!base()) { lock('日记尚未连接安全服务，请先完成部署配置。'); return Promise.resolve(false); }
        if (valid()) { unlock(); return Promise.resolve(true); }
        session = null; clearTokens(); lock('');
        if (!waiting) waiting = new Promise(function (resolve) { resolveWaiting = resolve; });
        return waiting;
    };
    CD.login = async function (password, remember) {
        mount(); var button = document.getElementById('auth-submit'); button.disabled = true;
        document.getElementById('auth-error').textContent = '';
        try {
            if (!base()) throw new Error('请先配置安全服务。');
            var response = await fetch(base() + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password }), cache: 'no-store' });
            if (!response.ok) throw new Error(response.status === 429 ? '尝试次数过多，请 15 分钟后重试。' : response.status === 401 ? '密码不正确，请重新输入。' : '暂时无法登录，请检查网络或服务配置。');
            var data = await response.json();
            if (typeof data.token !== 'string' || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() / 1000) throw new Error('登录响应异常，请重试。');
            session = { token: data.token, expiresAt: data.expiresAt }; CD.auth.generation++; clearTokens();
            document.getElementById('auth-session-warning').textContent = '';
            try { storage(remember ? 'local' : 'session').setItem(key, JSON.stringify(session)); }
            catch (_) { document.getElementById('auth-session-warning').textContent = '浏览器无法保存登录状态；本次仍可使用，刷新后需要重新登录。'; }
            document.getElementById('auth-password').value = ''; unlock();
            var hadWaiting = !!resolveWaiting;
            if (resolveWaiting) resolveWaiting(true);
            waiting = null; resolveWaiting = null;
            if (!hadWaiting && CD.loadDataFromCloud) await CD.loadDataFromCloud(CD.store.onRender);
            return true;
        } catch (error) { lock(error.message); throw error; }
        finally { button.disabled = false; }
    };
    CD.authenticatedFetch = async function (path, options) {
        if (!valid() || !base()) {
            session = null; clearTokens(); lock('登录已过期，请重新打开日记。');
            var expired = new Error('请重新登录'); expired.authRequired = true; throw expired;
        }
        var headers = new Headers(options && options.headers); headers.set('Authorization', 'Bearer ' + session.token);
        var active = session;
        function changed() { var error = new Error('登录状态已改变'); error.authRequired = true; error.superseded = true; return error; }
        var response;
        try { response = await fetch(base() + path, Object.assign({}, options, { headers: headers, cache: 'no-store' })); }
        catch (error) { if (session !== active) throw changed(); throw error; }
        if (session !== active) throw changed();
        if (response.status === 401) {
            CD.auth.generation++; session = null; clearTokens(); lock('登录已过期，请重新打开日记。');
            var rejected = new Error('请重新登录'); rejected.authRequired = true; throw rejected;
        }
        return response;
    };
    CD.logout = function () {
        var backedUp = true;
        if (CD.store.cloudData && !CD.isCloudEmpty(CD.store.cloudData)) backedUp = CD.saveLocalBackup(CD.store.cloudData);
        session = null; CD.auth.generation++; clearTokens();
        if (backedUp !== false) CD.store.cloudData = CD.defaultCloudData();
        else CD.updateBackupWarning(false);
        lock(''); if (CD.store.onRender) CD.store.onRender();
    };
    lock('');
})(window.CrushDiary);
