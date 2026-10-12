(function (CD) {
    var key = 'myCrushDiary_session_v2';
    var session = null, waiting = null, resolveWaiting = null, checking = null, loginAttempt = 0;
    CD.auth = { locked: true, generation: 0, user:null };
    var listeners=[];
    CD.onAuthChange=function(fn){listeners.push(fn);return function(){listeners=listeners.filter(function(x){return x!==fn;});};};
    function notify(){listeners.forEach(function(fn){try{fn({generation:CD.auth.generation,locked:CD.auth.locked,user:CD.auth.user});}catch(_){}});}
    function known(user){return user && ['yyf','zxr'].indexOf(user.id)>=0 && user.name===user.id.toUpperCase();}
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
        panel.innerHTML = '<h1>我们的恋爱日记</h1><p>选择自己的账号，打开属于你们的记录。</p>' +
            '<form id="auth-form"><label for="auth-username">你的账号</label><select id="auth-username" autocomplete="username"><option value="yyf">YYF</option><option value="zxr">ZXR</option></select><label for="auth-password">你的密码</label>' +
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
            CD.login(document.getElementById('auth-username').value, document.getElementById('auth-password').value, document.getElementById('auth-remember').checked).catch(function () {});
        });
    }
    function lock(message) {
        mount(); CD.auth.locked = true; CD.store.isSyncing = true;
        document.body.classList.add('auth-locked');
        document.getElementById('auth-panel').hidden = false;
        document.getElementById('auth-error').textContent = message || '';notify();
    }
    function unlock() {
        CD.auth.locked = false; CD.store.isSyncing = false;
        document.body.classList.remove('auth-locked');
        document.getElementById('auth-panel').hidden = true;notify();
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
        if (valid() && known(CD.auth.user)) { unlock(); return Promise.resolve(true); }
        if(valid()){
            if(checking)return checking;
            var active=session;
            checking=(async function(){
                try{
                    var response=await fetch(base()+'/auth/me',{headers:{Authorization:'Bearer '+active.token},cache:'no-store'});
                    var data=await response.json();
                    if(session!==active)return false;
                    if(!response.ok || !known(data.user))throw new Error('请重新登录。');
                    CD.auth.user=data.user;CD.auth.generation++;if(CD.activateUser)CD.activateUser(data.user);unlock();return true;
                }catch(error){if(session!==active)return false;session=null;clearTokens();lock('请重新登录以确认你的账号。');return CD.ensureAuthenticated();}
                finally{checking=null;}
            })();return checking;
        }
        session = null; clearTokens(); lock('');
        if (!waiting) waiting = new Promise(function (resolve) { resolveWaiting = resolve; });
        return waiting;
    };
    CD.login = async function (username, password, remember) {
        mount(); var attempt=++loginAttempt; var button = document.getElementById('auth-submit'); button.disabled = true;
        document.getElementById('auth-error').textContent = '';
        try {
            if (!base()) throw new Error('请先配置安全服务。');
            var response = await fetch(base() + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username:username, password: password }), cache: 'no-store' });
            if (!response.ok) throw new Error(response.status === 429 ? '尝试次数过多，请 15 分钟后重试。' : response.status === 401 ? '账号或密码不正确，请重新输入。' : '暂时无法登录，请检查网络或服务配置。');
            var data = await response.json();
            if(attempt!==loginAttempt)return false;
            if (!known(data.user) || data.user.id!==username || typeof data.token !== 'string' || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now() / 1000) throw new Error('登录响应异常，请重试。');
            if(CD.auth.user && CD.suspendUser)CD.suspendUser();
            session = { token: data.token, expiresAt: data.expiresAt }; CD.auth.generation++; CD.auth.user=data.user; clearTokens();
            if(CD.activateUser)CD.activateUser(data.user);
            document.getElementById('auth-session-warning').textContent = '';
            try { storage(remember ? 'local' : 'session').setItem(key, JSON.stringify(session)); }
            catch (_) { document.getElementById('auth-session-warning').textContent = '浏览器无法保存登录状态；本次仍可使用，刷新后需要重新登录。'; }
            document.getElementById('auth-password').value = ''; unlock();
            var hadWaiting = !!resolveWaiting;
            if (resolveWaiting) resolveWaiting(true);
            waiting = null; resolveWaiting = null;
            if (!hadWaiting && CD.loadDataFromCloud) await CD.loadDataFromCloud(CD.store.onRender);
            return true;
        } catch (error) { if(attempt===loginAttempt)lock(error.message); throw error; }
        finally { button.disabled = false; }
    };
    CD.authenticatedFetch = async function (path, options) {
        if (!valid() || !base()) {
            if(CD.suspendUser)CD.suspendUser();CD.auth.user=null;CD.auth.generation++;
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
            if(CD.suspendUser)CD.suspendUser();CD.auth.user=null;
            CD.auth.generation++; session = null; clearTokens(); lock('登录已过期，请重新打开日记。');
            var rejected = new Error('请重新登录'); rejected.authRequired = true; throw rejected;
        }
        return response;
    };
    CD.logout = function () {
        if(CD.suspendUser)CD.suspendUser();
        else if(CD.saveLocalBackup)CD.saveLocalBackup(CD.store.cloudData);
        session = null; CD.auth.user=null; CD.auth.generation++; loginAttempt++; clearTokens();
        CD.store.cloudData = CD.defaultCloudData();
        lock(''); if (CD.store.onRender) CD.store.onRender();
    };
    lock('');
})(window.CrushDiary);
