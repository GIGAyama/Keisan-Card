/* =====================================================================
 *  install-hook.js — インストールの合図を いちばん先に うけとる
 *  ---------------------------------------------------------------------
 *  Chrome（Chromebook をふくむ）は 条件がそろうと すぐに
 *  beforeinstallprompt を出す。React の読みこみより あとで登録すると、
 *  通信がおそい端末では 合図を とりのがして「インストール」ボタンが
 *  出なくなる。そのため <head> のいちばん上で 同期読み込みする。
 *
 *  以前は index.html の中にインラインで書いていたが、CSP（script-src 'self'）
 *  を入れるとインラインは動かなくなる。'unsafe-inline' を足して解決すると
 *  CSP を入れた意味がほとんど無くなるので、小さな外部ファイルにした。
 *
 *  ※ グローバル名 `__deferredInstallPrompt` と イベント名
 *    `pwa-installable` / `pwa-installed` は src/App.jsx が見ている。
 *    変えないこと。
 * ===================================================================== */
(function () {
  'use strict';

  window.__deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    // 既定の案内（ブラウザ任せの小さなバー）を止めて、
    // アプリの中の「アプリとして インストール」ボタンから出す。
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    window.dispatchEvent(new Event('pwa-installable'));
  });

  window.addEventListener('appinstalled', function () {
    window.__deferredInstallPrompt = null;
    window.dispatchEvent(new Event('pwa-installed'));
  });
})();
