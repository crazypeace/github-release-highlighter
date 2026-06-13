// ==UserScript==
// @name         GitHub Release Auto Highlight
// @namespace    https://github.com/crazypeace
// @version      2.2.0
// @description  自动高亮 GitHub Release 推荐下载；监听失败时可手动点击按钮
// @author       crazypeace
// @match        https://github.com/*/*/releases/tag/*
// @match        https://github.com/*/*/releases/latest
// @match        https://github.com/*/*/releases
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ── 检测操作系统和架构 ──────────────────────────────────
    function detectPlatform() {
        var ua = navigator.userAgent || '';
        var plat = navigator.platform || '';
        var os = 'unknown';
        if (/Windows/.test(ua)) os = 'windows';
        else if (/Mac OS X|Macintosh|MacIntel|MacPPC|Mac68K/.test(ua) || /Mac/.test(plat)) os = 'darwin';
        else if (/Linux/.test(ua) || /Linux/.test(plat)) os = 'linux';
        else if (/CrOS/.test(ua)) os = 'linux';

        var arch = 'amd64';
        var lUA = ua.toLowerCase();
        var lPlat = plat.toLowerCase();
        if (/aarch64|arm64/.test(lUA) || /aarch64|arm64/.test(lPlat)) arch = 'arm64';
        else if (/loongarch64|loong64/.test(lUA)) arch = 'loong64';
        else if (/riscv64/.test(lUA)) arch = 'riscv64';

        // Windows 版本检测 (NT 6.1=Win7, 6.2=Win8, 6.3=Win8.1, 10.0+=Win10/11)
        var winVersion = null;
        if (os === 'windows') {
            var ntMatch = ua.match(/Windows NT (\d+\.\d+)/);
            if (ntMatch) {
                var ntVer = parseFloat(ntMatch[1]);
                if (ntVer <= 6.1) winVersion = '7';
                else if (ntVer <= 6.3) winVersion = '8';
                else winVersion = '10+';
            }
        }

        return { os: os, arch: arch, winVersion: winVersion };
    }

    // ── 匹配策略 ─────────────────────────────────────────────
    function matchScore(filename, os, arch, winVersion) {
        var lower = filename.toLowerCase();
        if (lower.includes('source code')) return -1;
        if (/\.(sha256|sha512|asc|sig|txt|dgst)$/.test(lower)) return -1;

        var osMatch = false;
        if (os === 'windows') osMatch = lower.includes('windows') || lower.includes('win32') || lower.includes('win-');
        else if (os === 'darwin') osMatch = lower.includes('darwin') || lower.includes('macos') || lower.includes('mac-') || lower.includes('osx');
        else if (os === 'linux') osMatch = lower.includes('linux') || lower.includes('debian') || lower.includes('ubuntu') || lower.includes('rhel') || lower.includes('fedora') || lower.includes('.rpm') || lower.includes('.deb') || lower.includes('appimage');
        if (!osMatch) return -1;

        var archMatch = false;
        if (arch === 'amd64') archMatch = lower.includes('amd64') || lower.includes('x86_64') || lower.includes('x64') || /[-_.]64[-_.]/.test(lower) || /[-_.]64$/.test(lower);
        else if (arch === 'arm64') archMatch = lower.includes('arm64') || lower.includes('aarch64');
        else if (arch === 'loong64') archMatch = lower.includes('loong64') || lower.includes('loongarch64');
        else if (arch === 'riscv64') archMatch = lower.includes('riscv64');
        else if (arch === 'arm') archMatch = /[-_.]arm[-_.v]/.test(lower) || /[-_.]arm$/.test(lower);
        if (!archMatch) return -1;

        var score = 100;
        if (lower.includes('-desktop')) score -= 5;
        if (lower.endsWith('.zip')) score += 3;
        if (os === 'windows') { if (lower.endsWith('.exe')) score += 10; else if (lower.endsWith('.msi')) score += 5; }
        if (os === 'darwin' && lower.endsWith('.dmg')) score += 3;
        if (os === 'linux') { if (lower.endsWith('.deb')) score += 5; else if (lower.endsWith('.rpm')) score += 3; else if (lower.endsWith('.appimage')) score += 3; }
        // Windows 7: windows-7 / windows7 / win-7 / win7
        if (os === 'windows' && /win(?:dows)?[-_]?7/i.test(lower)) {
            score += (winVersion === '7') ? 20 : -50;
        }
        return score;
    }

    // ── 样式注入 ──────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('gh-release-style')) return;
        var style = document.createElement('style');
        style.id = 'gh-release-style';
        style.textContent = [
            '@keyframes release-glow-pulse{0%,100%{box-shadow:0 0 4px rgba(46,160,67,.3)}50%{box-shadow:0 0 14px rgba(46,160,67,.7)}}',
            '.gh-release-highlight{background:rgba(46,160,67,.1)!important;border-left:4px solid #2ea043!important;border-radius:6px!important;animation:release-glow-pulse 2s ease-in-out 4}',
            '.gh-release-badge{display:inline-block;margin-left:8px;padding:2px 10px;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2ea043,#238636);border-radius:12px;vertical-align:middle;line-height:18px;letter-spacing:.3px}',
            'body[data-color-mode="dark"] .gh-release-highlight{background:rgba(46,160,67,.15)!important}',
            '.gh-release-btn{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 10px;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(135deg,#238636,#1a7f37);border:1px solid rgba(255,255,255,.15);border-radius:12px;cursor:pointer;line-height:20px;vertical-align:middle;transition:all .15s ease;white-space:nowrap}',
            '.gh-release-btn:hover{background:linear-gradient(135deg,#2ea043,#238636);box-shadow:0 0 8px rgba(46,160,67,.4);transform:scale(1.05)}',
            '.gh-release-btn:active{transform:scale(.97)}',
            '.gh-release-btn.done{background:linear-gradient(135deg,#1a7f37,#156d2e);opacity:.7;cursor:default}'
        ].join('');
        document.head.appendChild(style);
    }

    // ── 高亮容器内的最佳匹配行 ────────────────────────────────
    // 返回匹配的行数，0 表示无匹配
    function highlightInContainer(container) {
        var platform = detectPlatform();
        var rows = container.querySelectorAll('li.Box-row');
        if (rows.length === 0) return 0;

        // 先清除旧高亮和 badge，确保 textContent 干净
        for (var j = 0; j < rows.length; j++) {
            rows[j].classList.remove('gh-release-highlight');
            var old = rows[j].querySelector('.gh-release-badge');
            if (old) old.remove();
        }

        // 再匹配（textContent 已无 badge 污染）
        var bestRow = null, bestScore = -1;
        for (var i = 0; i < rows.length; i++) {
            var link = rows[i].querySelector('a');
            if (!link) continue;
            var score = matchScore(link.textContent.trim(), platform.os, platform.arch, platform.winVersion);
            if (score > bestScore) { bestScore = score; bestRow = rows[i]; }
        }

        if (bestRow && bestScore > 0) {
            bestRow.classList.add('gh-release-highlight');
            var a = bestRow.querySelector('a');
            if (a && !a.querySelector('.gh-release-badge')) {
                var badge = document.createElement('span');
                badge.className = 'gh-release-badge';
                badge.textContent = '\u2714 ' + platform.os + ' ' + platform.arch;
                a.appendChild(badge);
            }
            // 同步更新按钮状态
            syncButtonState(container);
            return rows.length;
        }
        return 0;
    }

    // ── 同步按钮状态（自动高亮成功后按钮也变 Done）──────────
    function syncButtonState(details) {
        var btn = details.querySelector('.gh-release-btn');
        if (!btn) return;
        if (details.querySelector('.gh-release-highlight')) {
            btn.textContent = '\u2714 Done';
            btn.classList.add('done');
            var h = details.querySelector('.gh-release-highlight');
            if (h) h.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    // ── 创建手动按钮 ──────────────────────────────────────────
    function createRecommendButton(details) {
        var platform = detectPlatform();
        var btn = document.createElement('span');
        btn.className = 'gh-release-btn';
        btn.textContent = '\uD83D\uDCE5 ' + platform.os + '/' + platform.arch;
        btn.title = '手动高亮推荐下载（自动检测失败时使用）';

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var count = highlightInContainer(details);
            if (count > 0) {
                btn.textContent = '\u2714 Done';
                btn.classList.add('done');
            } else {
                btn.textContent = '\u26A0 无匹配文件';
                setTimeout(function() {
                    btn.textContent = '\uD83D\uDCE5 ' + platform.os + '/' + platform.arch;
                }, 2000);
            }
        });

        return btn;
    }

    // ── 为 details 注册所有监听 + 添加按钮 ────────────────────
    function setupDetails(details) {
        injectStyles();

        // 1. 添加按钮（如果还没有）
        if (!details.querySelector('.gh-release-btn')) {
            var summary = details.querySelector('summary');
            if (summary) {
                var assetsSpan = summary.querySelector('.f3.text-bold');
                if (assetsSpan) {
                    assetsSpan.parentElement.appendChild(createRecommendButton(details));
                }
            }
        }

        // 2. 监听 details[open] 变化
        openObserver.observe(details, { attributes: true, attributeFilter: ['open'] });

        // 3. 为内部的 include-fragment 设置 load 监听
        var frag = details.querySelector('include-fragment[src*="expanded_assets"]');
        if (frag) setupFragmentListener(frag, details);

        // 4. 尝试立即高亮（如果 rows 已存在）
        highlightInContainer(details);
    }

    // ── 监听 include-fragment 加载完成 ────────────────────────
    function setupFragmentListener(fragment, details) {
        // 如果已加载，直接高亮
        if (details.querySelectorAll('li.Box-row').length > 0) {
            highlightInContainer(details);
            return;
        }

        fragment.addEventListener('load', function() {
            // fragment 已替换 innerHTML，延迟后在 details 里查找
            setTimeout(function() {
                highlightInContainer(details);
            }, 100);
        });
    }

    // ── details[open] 变化监听 ────────────────────────────────
    var openObserver = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var details = mutations[i].target;
            if (details.open) {
                var frag = details.querySelector('include-fragment[src*="expanded_assets"]');
                if (frag) setupFragmentListener(frag, details);
                // 延迟再试一次（等 fragment 加载）
                setTimeout(function() { highlightInContainer(details); }, 500);
                setTimeout(function() { highlightInContainer(details); }, 2000);
            }
        }
    });

    // ── DOM 变化监听 ──────────────────────────────────────────
    var domObserver = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;

                // 新增的 li.Box-row → 尝试高亮所有容器
                if ((node.classList && node.classList.contains('Box-row')) ||
                    (node.querySelector && node.querySelector('li.Box-row'))) {
                    var allD = document.querySelectorAll('details[data-target="details-toggle.detailsTarget"]');
                    for (var k = 0; k < allD.length; k++) {
                        highlightInContainer(allD[k]);
                    }
                }

                // 新增的 include-fragment
                if (node.tagName === 'INCLUDE-FRAGMENT' && node.getAttribute('src') && node.getAttribute('src').indexOf('expanded_assets') !== -1) {
                    var parentDetails = node.closest('details');
                    if (parentDetails) setupFragmentListener(node, parentDetails);
                }

                // 新增的 details
                if (node.tagName === 'DETAILS' && node.dataset.target === 'details-toggle.detailsTarget') {
                    setupDetails(node);
                }
            }
        }
    });

    // ── 主入口 ────────────────────────────────────────────────
    function init() {
        injectStyles();
        var allDetails = document.querySelectorAll('details[data-target="details-toggle.detailsTarget"]');
        for (var i = 0; i < allDetails.length; i++) {
            setupDetails(allDetails[i]);
        }
    }

    init();

    // GitHub SPA 导航
    document.addEventListener('pjax:end', init);
    document.addEventListener('turbo:load', init);
    document.addEventListener('turbo:render', init);

    // 启动 DOM 监听
    domObserver.observe(document.body, { childList: true, subtree: true });
})();
