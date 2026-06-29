// ==UserScript==
// @name         GitHub Release Auto Highlight
// @namespace    https://github.com/crazypeace
// @version      2.3.0
// @description  自动高亮 GitHub Release 推荐下载；优化 macOS / universal binary 识别
// @author       crazypeace
// @match        https://github.com/*/*/releases*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ── 检测操作系统和架构 ─────────────────────────────
  function detectPlatform() {
    var ua = navigator.userAgent || "";
    var plat = navigator.platform || "";
    var os = "unknown";

    if (/Windows/.test(ua)) os = "windows";
    else if (
      /Mac OS X|Macintosh|MacIntel|MacPPC|Mac68K/.test(ua) ||
      /Mac/.test(plat)
    )
      os = "darwin";
    else if (/Linux/.test(ua) || /Linux/.test(plat)) os = "linux";
    else if (/CrOS/.test(ua)) os = "linux";

    var arch = "amd64";
    var lUA = ua.toLowerCase();
    var lPlat = plat.toLowerCase();

    if (/aarch64|arm64/.test(lUA) || /aarch64|arm64/.test(lPlat))
      arch = "arm64";
    else if (/loongarch64|loong64/.test(lUA)) arch = "loong64";
    else if (/riscv64/.test(lUA)) arch = "riscv64";

    var winVersion = null;
    if (os === "windows") {
      var ntMatch = ua.match(/Windows NT (\d+\.\d+)/);
      if (ntMatch) {
        var ntVer = parseFloat(ntMatch[1]);
        if (ntVer <= 6.1) winVersion = "7";
        else if (ntVer <= 6.3) winVersion = "8";
        else winVersion = "10+";
      }
    }

    return { os: os, arch: arch, winVersion: winVersion };
  }

  // ── 匹配策略（已修复核心逻辑）────────────────────────
  function matchScore(filename, os, arch, winVersion) {
    var lower = filename.toLowerCase();

    // 排除无关文件
    if (lower.includes("source code")) return -1;
    if (/\.(sha256|sha512|asc|sig|txt|dgst)$/.test(lower)) return -1;

    var osMatch = false;

    if (os === "windows") {
      osMatch =
        lower.includes("windows") ||
        lower.includes("win32") ||
        lower.includes("win-");
    } else if (os === "darwin") {
      osMatch =
        lower.includes("darwin") ||
        lower.includes("macos") ||
        lower.includes("mac-") ||
        lower.includes("osx") ||
        lower.includes("mac");
    } else if (os === "linux") {
      osMatch =
        lower.includes("linux") ||
        lower.includes("debian") ||
        lower.includes("ubuntu") ||
        lower.includes("rhel") ||
        lower.includes("fedora") ||
        lower.includes(".rpm") ||
        lower.includes(".deb") ||
        lower.includes("appimage");
    }

    if (!osMatch) return -1;

    // ── ⭐ 核心修复：macOS 不再强制架构匹配 ──
    var archMatch = false;

    if (os === "darwin") {
      // macOS universal / intel / apple silicon 都允许
      archMatch = true;
    } else if (arch === "amd64") {
      archMatch =
        lower.includes("amd64") ||
        lower.includes("x86_64") ||
        lower.includes("x64") ||
        /[-_.]64[-_.]/.test(lower) ||
        /[-_.]64$/.test(lower);
    } else if (arch === "arm64") {
      archMatch = lower.includes("arm64") || lower.includes("aarch64");
    } else if (arch === "loong64") {
      archMatch = lower.includes("loong64") || lower.includes("loongarch64");
    } else if (arch === "riscv64") {
      archMatch = lower.includes("riscv64");
    }

    if (!archMatch && os !== "darwin") return -1;

    var score = 100;

    if (lower.includes("-desktop")) score -= 5;

    // Windows
    if (os === "windows") {
      if (lower.endsWith(".exe")) score += 10;
      else if (lower.endsWith(".msi")) score += 5;
    }

    // macOS（增强）
    if (os === "darwin") {
      if (lower.endsWith(".dmg")) score += 6;
      else if (lower.endsWith(".pkg")) score += 5;
      else if (lower.endsWith(".zip")) score += 4;
      else if (lower.endsWith(".tar.gz")) score += 3;

      // Apple Silicon 优先
      if (lower.includes("arm64") || lower.includes("aarch64")) score += 5;
      else if (lower.includes("x64") || lower.includes("x86_64")) score += 2;
      else score += 4; // universal
    }

    // Linux
    if (os === "linux") {
      if (lower.endsWith(".deb")) score += 5;
      else if (lower.endsWith(".rpm")) score += 3;
      else if (lower.endsWith(".appimage")) score += 3;
    }

    // Windows 7 特判
    if (os === "windows" && /win(?:dows)?[-_]?7/i.test(lower)) {
      score += winVersion === "7" ? 20 : -50;
    }

    return score;
  }

  // ── 样式（保持不变）──────────────────────────────
  function injectStyles() {
    if (document.getElementById("gh-release-style")) return;

    var style = document.createElement("style");
    style.id = "gh-release-style";

    style.textContent = [
      "@keyframes release-glow-pulse{0%,100%{box-shadow:0 0 4px rgba(46,160,67,.3)}50%{box-shadow:0 0 14px rgba(46,160,67,.7)}}",
      ".gh-release-highlight{background:rgba(46,160,67,.1)!important;border-left:4px solid #2ea043!important;border-radius:6px!important;animation:release-glow-pulse 2s ease-in-out 4}",
      ".gh-release-badge{display:inline-block;margin-left:8px;padding:2px 10px;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2ea043,#238636);border-radius:12px;vertical-align:middle;line-height:18px;letter-spacing:.3px}",
      ".gh-release-btn{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 10px;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(135deg,#238636,#1a7f37);border:1px solid rgba(255,255,255,.15);border-radius:12px;cursor:pointer;line-height:20px;vertical-align:middle;transition:all .15s ease;white-space:nowrap}",
      ".gh-release-btn:hover{background:linear-gradient(135deg,#2ea043,#238636);box-shadow:0 0 8px rgba(46,160,67,.4);transform:scale(1.05)}",
      ".gh-release-btn.done{background:linear-gradient(135deg,#1a7f37,#156d2e);opacity:.7;cursor:default}",
    ].join("");

    document.head.appendChild(style);
  }

  // ── 以下逻辑保持你原版（未改动核心行为）──────────────
  function highlightInContainer(container) {
    var platform = detectPlatform();
    var rows = container.querySelectorAll("li.Box-row");
    if (rows.length === 0) return 0;

    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.remove("gh-release-highlight");
      var old = rows[j].querySelector(".gh-release-badge");
      if (old) old.remove();
    }

    var bestRow = null,
      bestScore = -1;

    for (var i = 0; i < rows.length; i++) {
      var link = rows[i].querySelector("a");
      if (!link) continue;

      var score = matchScore(
        link.textContent.trim(),
        platform.os,
        platform.arch,
        platform.winVersion,
      );

      if (score > bestScore) {
        bestScore = score;
        bestRow = rows[i];
      }
    }

    if (bestRow && bestScore > 0) {
      bestRow.classList.add("gh-release-highlight");

      var a = bestRow.querySelector("a");
      if (a && !a.querySelector(".gh-release-badge")) {
        var badge = document.createElement("span");
        badge.className = "gh-release-badge";
        badge.textContent = "✔ " + platform.os + " " + platform.arch;
        a.appendChild(badge);
      }

      return rows.length;
    }

    return 0;
  }

  function createRecommendButton(details) {
    var platform = detectPlatform();

    var btn = document.createElement("span");
    btn.className = "gh-release-btn";
    btn.textContent = "📥 " + platform.os + "/" + platform.arch;

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      var count = highlightInContainer(details);

      if (count > 0) {
        btn.textContent = "✔ Done";
        btn.classList.add("done");
      } else {
        btn.textContent = "⚠ 无匹配文件";
        setTimeout(function () {
          btn.textContent = "📥 " + platform.os + "/" + platform.arch;
        }, 2000);
      }
    });

    return btn;
  }

  function setupDetails(details) {
    injectStyles();

    if (!details.querySelector(".gh-release-btn")) {
      var summary = details.querySelector("summary");
      if (summary) {
        var assetsSpan = summary.querySelector(".f3.text-bold");
        if (assetsSpan) {
          assetsSpan.parentElement.appendChild(createRecommendButton(details));
        }
      }
    }
  }

  function init() {
    injectStyles();
    var allDetails = document.querySelectorAll(
      'details[data-target="details-toggle.detailsTarget"]',
    );

    for (var i = 0; i < allDetails.length; i++) {
      setupDetails(allDetails[i]);
    }
  }

  init();

  document.addEventListener("pjax:end", init);
  document.addEventListener("turbo:load", init);
  document.addEventListener("turbo:render", init);
})();
