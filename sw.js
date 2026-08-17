/* =====================================================================
 *  けいさんカード  Service Worker（PWA：オフライン対応・アプリ化）
 *  ---------------------------------------------------------------------
 *  ・CORE_ASSETS … このサイト自身のファイル（さいしょに まとめて保存）
 *  ・RUNTIME     … Google Fonts などの外部ファイル
 *                 （つかった ものから じどうで 保存 = 2回目からは オフラインでも動く）
 *
 *  ※ React も スタイルも アプリ本体も、いまは このサイト自身のファイルです。
 *    CDN から実行コードを取るのを やめたため（GIGA Standard v5 §6）、
 *    外の通信が ぜんぶ 止まっていても アプリは 起動します。
 *
 *  アプリを 更新したときは、下の VERSION の数字を 1つ 上げてください。
 *  （古い 保存を 消して、新しい ファイルに 入れかえます）
 *
 *  この Service Worker は localStorage を一切 操作しません。
 * ===================================================================== */

const VERSION = 'v1.4.1';

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
  './css/style.css',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './js/app.js',
  './js/pwa-boot.js',
  './install-hook.js',
  './studyLog.js',
  './manifest.webmanifest',
  './offline.html',
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
      // 1つでも失敗したときに全部が入らなくなるのを避けるため、1本ずつ入れる。
      // cache.addAll は「ぜんぶ成功か、ぜんぶ失敗か」しかない。校内Wi-Fiで
      // 1本だけ取りそこねると、offline.html を含めて何ひとつ保存されないまま
      // インストールが終わり、圏外のときに出す画面まで無くなってしまう。
      .then((cache) =>
        Promise.all(
          CORE_ASSETS.map((u) =>
            cache
              .add(new Request(u, { cache: 'reload' }))
              .catch(() => console.warn('[sw] 保存できなかったので飛ばす:', u))
          )
        )
      )
    // ここでは skipWaiting しない（GIGA Standard v5 §3-3）。
    //   児童が カードをめくっている さいちゅうに 画面が入れかわると、
    //   数えていた タイムも すすみ具合も 消えてしまう。
    //   新しい版が用意できたことは 画面側（js/pwa-boot.js）が
    //   「あたらしい ばんが あります」と おしらせし、
    //   児童が「さいしんに する」を 押したときだけ 切りかえる。
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
        caches.open(CORE_CACHE).then(async (c) => {
          // 保存した本体があればそれを出す（オフラインでも ふだんどおり使える）
          const app = await c.match('./index.html', { ignoreSearch: true });
          if (app) return app;
          // 本体がまだ保存されていない＝初回から圏外だった場合。
          // ここで何も返さないとブラウザの「接続できません」画面になり、
          // 児童には「アプリが壊れた」ようにしか見えない。
          const offline = await c.match('./offline.html');
          if (offline) return offline;
          return Response.error();
        })
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

  // 外部ファイル（いまは Google Fonts だけ）：保存を優先しつつ、うしろで更新。
  // ※ これは「見た目だけ」の依存です。届かなくても端末側のフォントに落ちるだけで、
  //   アプリの動作は 止まりません（§2-7）。
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

// ページからの「さいしんに する」に応える。
//   ここでだけ skipWaiting する。つまり「児童が 押したときだけ」切りかわる。
//   （文字列の 'SKIP_WAITING' は 前の版の画面から 送られてくることがあるので
//     どちらの形でも 受けとる）
self.addEventListener('message', (event) => {
  const data = event.data;
  const type = data && typeof data === 'object' ? data.type : data;
  if (type === 'SKIP_WAITING') self.skipWaiting();
});
