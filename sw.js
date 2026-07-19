/* =====================================================================
 *  けいさんカード  Service Worker（PWA：オフライン対応・アプリ化）
 *  ---------------------------------------------------------------------
 *  ・CORE_ASSETS … このサイト自身のファイル（さいしょに まとめて保存）
 *  ・RUNTIME     … React / Tailwind / フォントなどの外部ファイル
 *                 （つかった ものから じどうで 保存 = 2回目からは オフラインでも動く）
 *
 *  アプリを 更新したときは、下の VERSION の数字を 1つ 上げてください。
 *  （古い 保存を 消して、新しい ファイルに 入れかえます）
 * ===================================================================== */

const VERSION = 'v1.0.0';
const CORE_CACHE = 'keisan-core-' + VERSION;
const RUNTIME_CACHE = 'keisan-runtime-' + VERSION;

// 自分のサイトのファイル（相対パス＝GitHub Pages のサブフォルダでも動く）
const CORE_ASSETS = [
  './',
  './index.html',
  './App.jsx',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// インストール：コアファイルを まとめて保存
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      // 1つでも失敗すると install が止まらないよう、個別に addAll する
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// 有効化：古いバージョンの保存を そうじ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CORE_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 取得：状況に応じて 保存 or 通信 を使い分ける
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ページの表示（ナビゲーション）：通信を試し、ダメなら保存した index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // 自分のファイル：まず保存を返し、うしろで新しいものに更新（速い＋最新化）
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CORE_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 外部ファイル（React / Tailwind / フォント）：保存を優先しつつ、うしろで更新
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});

// ページからの「すぐ更新して」に応える
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
