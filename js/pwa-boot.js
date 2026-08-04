/* =====================================================================
 *  pwa-boot.js — Service Worker の登録・更新のおしらせ・自己点検
 *  ---------------------------------------------------------------------
 *  このファイルは 生成物ではありません。ここを直接 直してかまいません。
 *  （ビルドの対象は src/App.jsx と src/styles.css だけです）
 * ===================================================================== */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  /* -------------------------------------------------------------------
   *  1. 「さいしんに する」のおしらせ
   *     新しい版が用意できても、押されるまで 切りかえない。
   *     児童が カードをめくっている さいちゅうに 画面が入れかわると、
   *     数えていた タイムも すすみ具合も 消えてしまう。
   * ----------------------------------------------------------------- */
  var toastShown = false;

  function showUpdateToast(worker) {
    if (toastShown) return;
    toastShown = true;

    var wrap = document.createElement('div');
    wrap.className = 'update-toast';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');

    var inner = document.createElement('div');
    inner.className = 'update-toast__inner';

    var text = document.createElement('span');
    text.textContent = 'あたらしい ばんが あります';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'update-toast__btn';
    btn.textContent = 'さいしんに する';
    // onclick= は CSP（script-src 'self'）で動かないため addEventListener で繋ぐ
    btn.addEventListener('click', function () {
      userAskedUpdate = true;
      btn.disabled = true;
      btn.textContent = 'きりかえ中…';
      worker.postMessage({ type: 'SKIP_WAITING' });
    });

    inner.appendChild(text);
    inner.appendChild(btn);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
  }

  /* -------------------------------------------------------------------
   *  2. 切りかえ完了の受けとり
   *     ⚠️ controllerchange は、はじめて開いたときにも飛んでくる。
   *        sw.js の activate にある clients.claim() で ページが
   *        管理下に入るためである。これを素直に受けると
   *        「初回訪問が かならず1回リロードされる」ことになり、
   *        めくりかけのカードも 数えていたタイムも 消える。
   *     ⚠️ 「もともと管理下だったか」で分ける直し方は別の形で壊れる。
   *        入れた直後に更新を押した場合、切りかわったのに
   *        読み込み直されなくなる。
   *        見るべきは「利用者が押したかどうか」だけ。
   * ----------------------------------------------------------------- */
  var userAskedUpdate = false;
  var reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!userAskedUpdate || reloading) return;
    reloading = true;
    location.reload();
  });

  function watch(registration) {
    // 前回のうちに 新しい版が待機していた場合も拾う。
    // controller が居る＝初回インストールではなく更新。
    // 初回で通知すると「入れた直後に 更新があります」と出て混乱する。
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateToast(registration.waiting);
    }
    registration.addEventListener('updatefound', function () {
      var sw = registration.installing;
      if (!sw) return;
      sw.addEventListener('statechange', function () {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateToast(sw);
        }
      });
    });
  }

  /* -------------------------------------------------------------------
   *  3. 登録
   *     ⚠️ 「もう load が済んでいる」場合を必ず見ること（§3-6）。
   *        addEventListener('load', …) だけで書くと、読みこみが
   *        終わったあとに このファイルが走った場合に リスナーが
   *        二度と呼ばれず、Service Worker が黙って登録されないままになる。
   * ----------------------------------------------------------------- */
  function start() {
    navigator.serviceWorker
      .register('./sw.js')
      .then(watch)
      .catch(function () {
        /* 登録できなくてもアプリは通常どおり動きます */
      });
    selfCheckManifest();
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  /* -------------------------------------------------------------------
   *  4. アプリの「背番号（id）」があっているかの自己点検
   *     gigayama.github.io には多数のアプリが同居していて、ブラウザは
   *     manifest の id / scope でアプリを見わけている。リポジトリをコピーして
   *     別アプリを作ったときに id を書きかえ忘れると、Chromebook では
   *     「このアプリのページが、別のアプリのウィンドウで開いてしまう」
   *     という取りちがえが起きる。気づけるように コンソールに警告を出す
   *     （動作そのものは止めない）。
   * ----------------------------------------------------------------- */
  function selfCheckManifest() {
    try {
      fetch('./manifest.webmanifest', { cache: 'no-store' })
        .then(function (r) {
          return r.json();
        })
        .then(function (m) {
          var here = new URL('./', location.href).pathname; // 例：/Keisan-Card/
          var problems = [];
          ['id', 'scope', 'start_url'].forEach(function (k) {
            if (!m[k]) {
              problems.push(k + ' が未設定です');
              return;
            }
            var p = new URL(m[k], location.href).pathname;
            if (p.indexOf(here) !== 0) {
              problems.push(
                k + ' = "' + m[k] + '" が このフォルダ（' + here + '）の外を指しています'
              );
            }
          });
          if (problems.length) {
            console.warn(
              '[PWA] manifest.webmanifest の設定が このアプリの場所と合っていません。\n' +
                'このままだと、インストールしたアプリが 同じサイトの別アプリと 取りちがえられることがあります。\n' +
                '- ' +
                problems.join('\n- ') +
                '\n' +
                'manifest.webmanifest の id / scope / start_url を "' +
                here +
                '" から始まる値に直してください。'
            );
          }
        })
        .catch(function () {
          /* 点検できなくてもアプリは動きます */
        });
    } catch (e) {
      /* 同上 */
    }
  }
})();
