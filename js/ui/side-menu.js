(function () {
    function currentPageKey() {
        var p = (window.location.pathname || '').replace(/\\/g, '/');
        var file = (p.split('/').pop() || '').toLowerCase();
        if (!file || file === 'index.html') return 'index';
        if (file === 'album.html') return 'album';
        if (file === 'blog.html') return 'blog';
        if (file === 'wishes.html') return 'wishes';
        if (file === 'anniversaries.html') return 'anniversaries';
        if (file === 'messages.html') return 'messages';
        return 'index';
    }

    var key = currentPageKey();
    var items = [
        { href: 'index.html', label: '随手记', id: 'index' },
        { href: 'album.html', label: '回忆相册', id: 'album' },
        { href: 'blog.html', label: '恋爱 Blog', id: 'blog' },
        { href: 'messages.html', label: '悄悄话', id: 'messages' },
        { href: 'wishes.html', label: '愿望清单', id: 'wishes' },
        { href: 'anniversaries.html', label: '纪念日', id: 'anniversaries' }
    ];

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'side-menu-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'side-menu-panel');
    toggle.setAttribute('aria-label', '打开侧边菜单');
    toggle.innerHTML =
        '<span class="side-menu-toggle__icon" aria-hidden="true"><span></span><span></span><span></span></span>';

    var backdrop = document.createElement('div');
    backdrop.className = 'side-menu-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');

    var panel = document.createElement('aside');
    panel.id = 'side-menu-panel';
    panel.className = 'side-menu';
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('aria-label', '侧边导航');

    var header = document.createElement('div');
    header.className = 'side-menu__header';
    var title = document.createElement('span');
    title.className = 'side-menu__title';
    title.textContent = '导航';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'side-menu__close';
    closeBtn.setAttribute('aria-label', '关闭菜单');
    closeBtn.textContent = '×';
    header.appendChild(title);
    header.appendChild(closeBtn);

    var nav = document.createElement('nav');
    nav.className = 'side-menu__nav';
    nav.setAttribute('aria-label', '页面导航');

    items.forEach(function (item) {
        var a = document.createElement('a');
        a.href = item.href;
        a.className = 'side-menu__link';
        a.dataset.navSection = item.id;
        var label = document.createElement('span');
        label.className = 'side-menu__link-label';
        label.textContent = item.label;
        var badge = document.createElement('span');
        badge.className = 'side-menu__badge';
        badge.hidden = true;
        badge.setAttribute('aria-hidden', 'true');
        a.appendChild(label);
        a.appendChild(badge);
        if (item.id === key) {
            a.classList.add('side-menu__link--current');
            a.setAttribute('aria-current', 'page');
        }
        nav.appendChild(a);
    });

    panel.appendChild(header);
    panel.appendChild(nav);

    var toggleHost = document.getElementById('side-menu-toggle-host');
    if (toggleHost) {
        toggleHost.appendChild(toggle);
    } else {
        document.body.appendChild(toggle);
    }
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    function setOpen(open) {
        document.body.classList.toggle('body--side-menu-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? '关闭侧边菜单' : '打开侧边菜单');
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        backdrop.hidden = !open;
        backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (open) {
            closeBtn.focus();
        } else {
            toggle.focus();
        }
    }

    function openMenu() {
        setOpen(true);
    }

    function closeMenu() {
        setOpen(false);
    }

    function toggleMenu() {
        setOpen(!document.body.classList.contains('body--side-menu-open'));
    }

    toggle.addEventListener('click', function () {
        toggleMenu();
    });
    closeBtn.addEventListener('click', function () {
        closeMenu();
    });
    backdrop.addEventListener('click', function () {
        closeMenu();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && document.body.classList.contains('body--side-menu-open')) {
            e.preventDefault();
            closeMenu();
        }
    });

    nav.addEventListener('click', function (e) {
        var t = e.target;
        var link = t && t.closest ? t.closest('a.side-menu__link') : null;
        if (link) closeMenu();
    });
})();
