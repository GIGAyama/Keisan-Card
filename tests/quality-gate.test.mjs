/* =====================================================================
 *  品質ゲートを「わざと壊して」確かめる（GIGA Standard v5 Part III P4）
 *  ---------------------------------------------------------------------
 *  「0件でした」だけでは、検査が動いているのか
 *  何も見ていないのか 区別できない。
 *  実際、この確認をしたことで 共通の検査そのものの不具合が3件 見つかっている。
 *
 *  ここでは 壊した中身を 検査関数へ 直接わたして、
 *  ちゃんと ❌ が返ることを 確かめる。リポジトリのファイルは 触らない。
 * ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V5 from '../scripts/lib/giga-v5-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const hasError = (results, id) => results.some((r) => r.id === id && r.level === 'error');
const noError = (results) => results.every((r) => r.level !== 'error');

/* --- まず「いまの中身」では 落ちないこと ---------------------------- */

test('いまの index.html は 依存・viewport・CSP の検査を通る', () => {
  const files = [{ path: 'index.html', text: read('index.html') }];
  assert.ok(noError(V5.checkDependencies(files)), '依存');
  assert.ok(noError(V5.checkViewport(files)), 'viewport');
  assert.ok(noError(V5.checkCsp(read('index.html'), 'index.html')), 'CSP');
});

test('いまの sw.js / manifest は 検査を通る', () => {
  assert.ok(noError(V5.checkServiceWorker(read('sw.js'), 'keisan-')), 'sw.js');
  assert.ok(noError(V5.checkManifest(read('manifest.webmanifest'), 'Keisan-Card')), 'manifest');
});

/* --- ここから「わざと壊す」 ------------------------------------------ */

test('ブラウザ内 Babel を入れると 落ちる', () => {
  const broken = [
    {
      path: 'x.html',
      text: '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>',
    },
  ];
  const r = V5.checkDependencies(broken);
  assert.ok(hasError(r, 'DEP_BROWSER_BABEL'));
  assert.ok(hasError(r, 'DEP_CDN_EXEC'));
});

test('Tailwind CDN を入れると 落ちる', () => {
  const r = V5.checkDependencies([{ path: 'x.html', text: '<script src="https://cdn.tailwindcss.com"></script>' }]);
  assert.ok(hasError(r, 'DEP_TAILWIND_CDN'));
});

test('Google Fonts だけなら 落ちない（見た目だけの依存は許す。§2-7）', () => {
  const r = V5.checkDependencies([
    {
      path: 'x.html',
      text:
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' +
        '<link href="https://fonts.googleapis.com/css2?family=Kosugi+Maru" rel="stylesheet" />',
    },
  ]);
  assert.ok(noError(r));
});

test('CDN の話をコメントに書いただけでは 落ちない（誤検知よけ）', () => {
  const r = V5.checkDependencies([
    { path: 'x.html', text: '<!-- 以前は cdn.tailwindcss.com と @babel/standalone を使っていた -->' },
  ]);
  assert.ok(noError(r));
});

test('拡大を禁止すると 落ちる', () => {
  for (const bad of ['user-scalable=no', 'maximum-scale=1.0']) {
    const r = V5.checkViewport([
      { path: 'x.html', text: `<meta name="viewport" content="width=device-width, ${bad}, viewport-fit=cover">` },
    ]);
    assert.ok(hasError(r, 'VIEWPORT_NO_ZOOM'), bad);
  }
});

test('viewport-fit=cover が無いと 落ちる', () => {
  const r = V5.checkViewport([{ path: 'x.html', text: '<meta name="viewport" content="width=device-width">' }]);
  assert.ok(hasError(r, 'VIEWPORT_FIT'));
});

test('100vh の単独使用は 落ちる。@supports の中の 100vh は 落ちない', () => {
  const bad = V5.checkCss([{ path: 'x.css', text: '.a { height: 100dvh; }\n.b { height: 100vh; }' }]);
  assert.ok(hasError(bad, 'CSS_100VH'), '単独の 100vh を見のがしている');

  // 前方を見ないと、正しいフォールバックまで ❌ にしてしまう（実例あり）
  const good = V5.checkCss([
    {
      path: 'x.css',
      text:
        '.a { height: 100dvh; }\n@supports not (height: 100dvh) {\n  .a { height: 100vh; }\n}\n' +
        ':root{}\n.b{ padding: env(safe-area-inset-top); font-size: clamp(1px,2vw,3px); }\n' +
        '@media (forced-colors: active){ .b{border:1px solid ButtonText} }\n' +
        '@media (prefers-reduced-motion: reduce){ * { animation-duration:.01ms !important; }\n}',
    },
  ]);
  assert.ok(!hasError(good, 'CSS_100VH'), '@supports のフォールバックを 誤検知している');
});

test('prefers-reduced-motion を 0 にすると 落ちる（.01ms でないと中身が消える）', () => {
  const r = V5.checkCss([
    {
      path: 'x.css',
      text: '@media (prefers-reduced-motion: reduce){ * { animation-duration: 0s !important; }\n}',
    },
  ]);
  assert.ok(hasError(r, 'CSS_REDUCED_MOTION_ZERO'));
});

test('ふりがなの色を決め打ちすると 落ちる。継がせていれば 落ちない', () => {
  const base = '.a{height:100dvh;padding:env(safe-area-inset-top);font-size:clamp(1px,2vw,3px)}\n@media (forced-colors: active){.a{border:0}}\n@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms !important;}\n}';
  const bad = V5.checkCss([{ path: 'x.css', text: base + '\nrt { color: #666; }' }]);
  assert.ok(hasError(bad, 'A11Y_RT_COLOR'));
  const good = V5.checkCss([
    { path: 'x.css', text: base + '\nrt { color: #5f6368; }\nbutton rt, [class*="bg-"] rt { color: inherit; }' },
  ]);
  assert.ok(!hasError(good, 'A11Y_RT_COLOR'));
});

test('sw.js が キャッシュを全部消すと 落ちる', () => {
  // ⚠️ 「消す式」を正規表現で追うと (k) => caches.delete(k) を見のがす。
  //    見るべきは「startsWith で絞る式があるか」。
  const wipe = `
    self.addEventListener('activate', (e) => e.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    ));
    self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
  `;
  assert.ok(hasError(V5.checkServiceWorker(wipe, 'keisan-'), 'SW_CACHE_WIPE'));
});

test('sw.js の install で skipWaiting すると 落ちる', () => {
  const bad = `
    self.addEventListener('install', (e) => { e.waitUntil(caches.open('keisan-x')); self.skipWaiting();
    });
    self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
  `;
  assert.ok(hasError(V5.checkServiceWorker(bad, 'keisan-'), 'SW_SKIP_WAITING_IN_INSTALL'));
});

test('「localStorage は操作しない」という注意書きでは 落ちない（誤検知よけ）', () => {
  const swWithComment = `
    /* この Service Worker は localStorage を一切 操作しません。 */
    // localStorage も 同じ理由で 使わない
    self.addEventListener('activate', (e) => e.waitUntil(
      caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('keisan-')).map((k) => caches.delete(k))))
    ));
    self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
  `;
  assert.ok(!hasError(V5.checkServiceWorker(swWithComment, 'keisan-'), 'SW_LOCALSTORAGE'));
  // ほんとうに触っていれば 落ちる
  assert.ok(hasError(V5.checkServiceWorker(swWithComment + '\nlocalStorage.setItem("a",1);', 'keisan-'), 'SW_LOCALSTORAGE'));
});

test('manifest の id をコピー元のまま放置すると 落ちる', () => {
  const bad = JSON.stringify({
    id: '/Kana-Master/',
    scope: '/Kana-Master/',
    start_url: '/Kana-Master/',
    icons: [{ purpose: 'any' }, { purpose: 'maskable' }],
  });
  assert.ok(hasError(V5.checkManifest(bad, 'Keisan-Card'), 'PWA_MANIFEST_ID'));
});

test('CSP に frame-ancestors を書くと 落ちる（<meta> では無視される）', () => {
  const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; frame-ancestors 'none';">`;
  assert.ok(hasError(V5.checkCsp(html, 'x.html'), 'CSP_FRAME_ANCESTORS'));
});

test('CSP を入れたのに インラインの script / onclick= が残っていると 落ちる', () => {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self';">`;
  assert.ok(hasError(V5.checkCsp(csp + '<script>initGame()</script>', 'x.html'), 'CSP_INLINE_SCRIPT'));
  assert.ok(hasError(V5.checkCsp(csp + '<button onclick="initGame()">ok</button>', 'x.html'), 'CSP_INLINE_HANDLER'));
  // コメントの中の <script> では 落ちない
  assert.ok(!hasError(V5.checkCsp(csp + '<!-- <script>むかしはこう書いていた</script> -->', 'x.html'), 'CSP_INLINE_SCRIPT'));
});

test('localStorage.clear() を使うと 落ちる', () => {
  assert.ok(hasError(V5.checkRobustness('function reset(){ localStorage.clear(); }'), 'ROBUST_LS_CLEAR'));
  // 「使ってはいけません」という注意書きでは 落ちない
  assert.ok(
    !hasError(V5.checkRobustness("// localStorage.clear() も 同じ理由で 使ってはいけません\naddEventListener('pagehide', f)"), 'ROBUST_LS_CLEAR')
  );
});

test('pagehide での確定が無いと 落ちる', () => {
  assert.ok(hasError(V5.checkRobustness('const a = 1;'), 'ROBUST_PAGEHIDE'));
});

test('install-hook.js は <head> の最初の script。コメント内の <script> は数えない', () => {
  const good = `<head><!-- あとから <script> を足すと動かない --><script src="./install-hook.js"></script><script src="x.js"></script></head><link rel="apple-touch-icon" href="a.png">`;
  const r = V5.checkPwaHead(good);
  assert.ok(!r.some((x) => x.id === 'PWA_INSTALL_HOOK' && x.level !== 'ok'), 'コメントを数えている');

  // ほんとうに あとに置いてあれば ⚠️ になる
  const late = `<head><script src="react.js"></script><script src="./install-hook.js"></script></head><link rel="apple-touch-icon" href="a.png">`;
  assert.ok(V5.checkPwaHead(late).some((x) => x.id === 'PWA_INSTALL_HOOK' && x.level === 'warn'));
  // 無ければ ❌
  assert.ok(hasError(V5.checkPwaHead('<head></head>'), 'PWA_INSTALL_HOOK'));
});

test('モーダルに role="dialog" が無いと 落ちる', () => {
  assert.ok(hasError(V5.checkA11y('<div aria-label="x" aria-live="polite"></div>'), 'A11Y_DIALOG'));
});
