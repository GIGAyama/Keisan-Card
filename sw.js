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

const VERSION = 'v1.2.0';

// このアプリ専用の目じるし。
// キャッシュ置き場（CacheStorage）は gigayama.github.io というサイト全体で
// 共有されていて、同じサイトに置いた他のアプリの保存も一緒に見えてしまう。
// 「自分の名札が付いた保存だけ」を消すために、必ずこの接頭辞を使うこと。
const CACHE_PREFIX = 'keisan-';
const CORE_CACHE = CACHE_PREFIX + 'core-' + VERSION;
const RUNTIME_CACHE = CACHE_PREFIX + 'runtime-' + VERSION;

// 自分のサイトのファイル（相対パス＝GitHub Pages のサブフォルダでも動く）
const CORE_ASSETS = [
  './',
  './index.html',
  './App.jsx',
  './studyLog.js',
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
// ※ 消すのは「keisan- で始まる＝このアプリの保存」だけ。
//   ここで全部を消すと、同じ gigayama.github.io に置いた他のアプリ
//   （ひらがなマスターなど）のオフライン用データまで巻きぞえで消えてしまう。
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX))
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

  // ページの表示（ナビゲーション）：通信を試し、ダメなら保存した index.html
  // ※ caches.match（置き場ぜんたい検索）ではなく、必ず自分のキャッシュから探す。
  //   置き場はサイト全体で共有なので、ぜんたい検索だと他のアプリが保存した
  //   ページを取りだしてしまうおそれがある。
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches
          .open(CORE_CACHE)
          .then((c) => c.match('./index.html', { ignoreSearch: true }))
      )
    );
    return;
  }

  // 自分のフォルダ（/Keisan-Card/…）の中かどうか。
  // 同じサイトでも他のアプリのファイルには手を出さない。
  const inScope = req.url.startsWith(self.registration.scope);

  // マニフェスト：かならず通信を先に試す（オフラインのときだけ保存を使う）。
  // ブラウザはこの中身の id / scope で「どのアプリか」を判断している。
  // 保存を優先すると 古い id を返してしまい、アプリを直しても直らない・
  // 同じサイトの別アプリと 取りちがえられる、といった不具合の原因になる。
  if (inScope && new URL(req.url).pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CORE_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.open(CORE_CACHE).then((c) => c.match(req)).then((r) => r || Response.error())
        )
    );
    return;
  }

  if (inScope) {
    // 自分のファイル：まず保存を返し、うしろで新しいものに更新（速い＋最新化）
    event.respondWith(
      caches.open(CORE_CACHE).then((cache) => cache.match(req)).then((cached) => {
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

  // 同じサイトの「自分のフォルダの外」＝他のアプリのページやファイル。
  // 横取り（キャッシュ）せず、そのまま通信にまかせる。
  if (new URL(req.url).origin === self.location.origin) return;

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
