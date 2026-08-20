#!/usr/bin/env node
/* =====================================================================
 *  実ブラウザで測る（GIGA Standard v5 §7）
 *  ---------------------------------------------------------------------
 *  読むだけでは分からないことが多すぎる。ここで測るのは次の6つ。
 *
 *    1. コントラスト     … 全画面を歩いて、比 4.5（大きな文字は 3.0）未満を数える
 *    2. タップ領域       … ::after ぶんも入れて 44px 未満を数える
 *    3. 横スクロール     … 320px 幅で はみ出していないか
 *    4. CSP 違反・JS エラー
 *    5. Service Worker   … 登録されているか／初回に勝手にリロードしないか／
 *                          押すまで切りかわらないか／他アプリのキャッシュを消さないか
 *    6. オフライン       … 圏外で起動するか／offline.html が出るか
 *
 *  使い方：  npm run measure
 *  必要なもの：  npm i（optionalDependencies の playwright）
 *
 *  ⚠️ Google Fonts へは わざと出られないままで測る。
 *     学校のフィルタリングと まったく同じ状態になる（§7-4）。
 *     このアプリは 実行コードを CDN から取っていないので、
 *     その状態でも 画面が出るはずである。出なければ それが不具合。
 * ===================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, writeSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// 既定は このリポジトリ。--root=… を付けると 別の場所を測れる。
//   「改修前は壊れていた」と書くなら、その commit を実際に取り出して
//   ビルドして 測ること（§7-6）。測っていない状態について 壊れていたと書かない。
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const ROOT = rootArg
  ? rootArg.slice('--root='.length)
  : join(dirname(fileURLToPath(import.meta.url)), '..');
// PWA まわりの測定は このリポジトリのときだけ意味がある
const PWA_CHECKS = !rootArg;
// 本番と同じ「ドメイン直下」で配る。
// 独自ドメイン keisan-card.giga-school.com ではアプリがドメイン直下に置かれるので、
// ここを旧構成の '/Keisan-Card/' にすると、本番では 404 になるパスが
// 測定環境でだけ通り、壊れているのに「合格」と出る。
const BASE = '/';
const PORT = 8321;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const APP_URL = ORIGIN + BASE;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// 「新しい版が出た」ことにする つまみ。true にすると sw.js の中身が
// 1バイト変わるので、ブラウザから見て 別の Service Worker になる。
const state = { bumpVersion: false };

function serve() {
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    if (!p.startsWith(BASE)) {
      res.writeHead(404).end('not found');
      return;
    }
    p = p.slice(BASE.length);
    if (p === '' || p.endsWith('/')) p += 'index.html';
    const abs = join(ROOT, normalize(p));
    if (!abs.startsWith(ROOT) || !existsSync(abs)) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = await readFile(abs);
    if (state.bumpVersion && p === 'sw.js') body = Buffer.concat([body, Buffer.from('\n// 測定用の版ちがい\n')]);
    res.writeHead(200, {
      'content-type': MIME[extname(abs)] || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(body);
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  server.listen(PORT);
  // ⚠️ 圏外は context.setOffline では作れない。
  //   Playwright の route（横取り）を入れていると、setOffline を
  //   すり抜けて 通信が成功してしまい、「圏外で起動した」という
  //   まちがった結果になる（実際に そう出た）。
  //   サーバーそのものを 止めるのが いちばん確実。
  server.stop = () =>
    new Promise((r) => {
      for (const s of sockets) s.destroy();
      server.close(r);
    });
  return server;
}

/* --- ブラウザの中で走らせる測定コード ------------------------------- */

// コントラスト。
//   ⚠️ 色を文字列から数字で拾ってはいけない。Tailwind v4 は oklch() を返し、
//     素朴な取り出しだと どの要素も「ほぼ真っ黒」と判定されて比が 1.0 付近になる。
//     1px 実際に塗って getImageData で読むのが いちばん確実（§7-2）。
const CONTRAST_FN = `(() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (s) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    return a === 0 ? [0, 0, 0, 0] : [d[0] / a, d[1] / a, d[2] / a, a];
  };
  const lum = (c) => {
    const s = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  };
  const mix = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };

  // 背景色をさかのぼって求める。
  //   グラデーション背景は backgroundColor が透明になるので、
  //   backgroundImage も見ないと「白の上の白（比 1.0）」という誤報になる。
  const bgOf = (el) => {
    let cur = el, acc = null;
    while (cur) {
      const cs = getComputedStyle(cur);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { c: [128,128,128,1], gradient: true };
      const c = parse(cs.backgroundColor);
      if (c[3] > 0) {
        acc = acc ? mix(acc, c).concat(1) : c;
        if (c[3] >= 1) return { c: acc, gradient: false };
      }
      cur = cur.parentElement;
    }
    return { c: acc && acc[3] >= 1 ? acc : [255, 255, 255, 1], gradient: false };
  };

  const EMOJI = /[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{FE0F}]/u;
  const out = [];
  document.querySelectorAll('*').forEach((el) => {
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
      .trim();
    if (!text) return;
    // 絵文字はフォント自身の色で描かれ CSS の color が効かない → 除外
    if (EMOJI.test(text)) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    // 使用不可の状態は WCAG の対象外
    if (el.closest('[disabled],[aria-disabled="true"]')) return;

    const fg = parse(cs.color);
    const bg = bgOf(el);
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3.0 : 4.5;
    const got = ratio(mix(fg, bg.c), bg.c);
    if (got + 0.005 < need) {
      out.push({
        text: text.slice(0, 28), tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 70),
        color: cs.color, bg: cs.backgroundColor, size, weight,
        need, got: +got.toFixed(2), gradient: bg.gradient,
      });
    }
  });
  return out;
})()`;

// タップ領域。疑似要素 ::after ぶんも入れて実測する（§2-9）
const TAP_FN = `(() => {
  const out = [];
  document.querySelectorAll('a[href], button, input, select, [role="button"]').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    let w = r.width, h = r.height;
    for (const pe of ['::after', '::before']) {
      const p = getComputedStyle(el, pe);
      if (p.content === 'none') continue;
      const pw = parseFloat(p.width), ph = parseFloat(p.height);
      const mw = parseFloat(p.minWidth), mh = parseFloat(p.minHeight);
      if (Number.isFinite(pw)) w = Math.max(w, Math.max(pw, Number.isFinite(mw) ? mw : 0));
      if (Number.isFinite(ph)) h = Math.max(h, Math.max(ph, Number.isFinite(mh) ? mh : 0));
    }
    if (w + 0.5 < 44 || h + 0.5 < 44) {
      out.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24),
        cls: (el.className || '').toString().slice(0, 60),
        w: +w.toFixed(1), h: +h.toFixed(1),
      });
    }
  });
  return out;
})()`;

/* --- ここから本体 ---------------------------------------------------- */
const server = serve();
const { chromium } = await import('playwright');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(EXE) ? { executablePath: EXE } : {});

// 進み具合は そのつど 書き出す（まとめ書きされると、動いているのか
// 止まっているのか 分からなくなる）
const step_log = (m) => writeSync(1, m + '\n');

const problems = { contrast: [], tap: [], csp: [], jsError: [], overflow: [], pwa: [] };
const seen = new Set();
const note = (list, key, item) => {
  const k = key + JSON.stringify(item);
  if (seen.has(k)) return;
  seen.add(k);
  list.push(item);
};

/** 学校のフィルタリングと同じ状態を つくる（§7-4）。
 *  外へ出る通信は すべて 遮る。Google Fonts が届かなくても
 *  端末側のフォントに落ちるだけで アプリは動く、という前提を ここで実際に試す。
 *  （遮らずに測ると、通信が返ってくるまで 画面が出ず、
 *    測っているのか 待っているのか 分からなくなる） */
async function blockOutside(context) {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN)) return route.continue();
    return route.abort();
  });
}

async function newPage(context) {
  const page = await context.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) note(problems.csp, 'csp', { text: t.slice(0, 160) });
  });
  page.on('pageerror', (e) => note(problems.jsError, 'js', { text: String(e).slice(0, 160) }));
  return page;
}

// 画面を歩いてまわる手順。ラベルの文字で押していく。
const WALK = [
  { name: 'タイトル', clicks: [] },
  { name: 'せってい', clicks: ['[aria-label="せってい"]'] },
  { name: 'せってい／けす確認', clicks: ['[aria-label="せってい"]', 'text=きろくを すべて けす'] },
  { name: 'せいちょうの きろく', clicks: ['text=せいちょうの きろく'] },
  { name: 'カードを えらぶ', clicks: ['text=はじめる'] },
  { name: 'モードを えらぶ（あか）', clicks: ['text=はじめる', 'text=あかカード'] },
  { name: 'れんしゅう（あか・おもて）', clicks: ['text=はじめる', 'text=あかカード', 'text=じゅんばん'] },
  { name: 'れんしゅう（あか・うら）', clicks: ['text=はじめる', 'text=あかカード', 'text=じゅんばん', 'text=こたえを みる'] },
  { name: 'モードを えらぶ（あお）', clicks: ['text=はじめる', 'text=あおカード'] },
  { name: 'れんしゅう（あお・うら）', clicks: ['text=はじめる', 'text=あおカード', 'text=バラバラ', 'text=こたえを みる'] },
  { name: 'れんしゅう（きいろ・うら）', clicks: ['text=はじめる', 'text=きいろカード', 'text=じゅんばん', 'text=こたえを みる'] },
  { name: 'れんしゅう（みどり・うら）', clicks: ['text=はじめる', 'text=みどりカード', 'text=じゅんばん', 'text=こたえを みる'] },
  { name: 'インストール案内', clicks: ['text=アプリとして インストール'] },
];

const VIEWPORTS = [
  { name: '320×568（下限）', width: 320, height: 568 },
  { name: '375×667（iPhone SE）', width: 375, height: 667 },
  { name: '1366×768（Chromebook）', width: 1366, height: 768 },
];

step_log('■ 1〜4. 画面をひとつずつ歩いて測ります（Google Fonts へは出られないまま＝学校と同じ状態）');
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await blockOutside(context);
  for (const step of WALK) {
    const page = await newPage(context);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root h1, #root h2', { timeout: 10000 });
    let ok = true;
    for (const sel of step.clicks) {
      try {
        await page.click(sel, { timeout: 4000 });
        await page.waitForTimeout(120);
      } catch {
        ok = false;
        break;
      }
    }
    if (!ok) {
      step_log(`   … ${vp.name} / ${step.name}：たどりつけませんでした`);
      await page.close();
      continue;
    }
    await page.waitForTimeout(250);

    for (const c of await page.evaluate(CONTRAST_FN)) note(problems.contrast, 'c', { ...c, where: step.name });
    for (const t of await page.evaluate(TAP_FN)) note(problems.tap, 't', { ...t, where: `${vp.name} / ${step.name}` });

    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (over > 0) note(problems.overflow, 'o', { where: `${vp.name} / ${step.name}`, over });
    step_log(`   ✓ ${vp.name} / ${step.name}`);
    await page.close();
  }
  await context.close();
}

/* --- 5. PWA の挙動（§7-5） ------------------------------------------- */
if (PWA_CHECKS) {
  step_log('■ 5. PWA の挙動を測ります');
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await blockOutside(context);
  const page = await newPage(context);
  let navigations = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations += 1;
  });

  // 他アプリのキャッシュを2つ置いてから始める（巻きぞえで消えないことの確認用）
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await caches.open('hiragana-master-core-v1');
    await caches.open('townmap-mikke-static-v3');
  });
  await page.waitForTimeout(2500);

  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r ? { scope: r.scope, active: !!r.active } : null;
  });
  if (!reg || !reg.active) note(problems.pwa, 'p', { 項目: 'Service Worker が登録されていない', 実測: JSON.stringify(reg) });

  // 初回訪問で勝手にリロードしないこと（画面遷移が1回なら正常）
  if (navigations !== 1) note(problems.pwa, 'p', { 項目: '初回訪問で画面遷移が1回でない', 実測: `${navigations}回` });

  const keys = await page.evaluate(() => caches.keys());
  const others = keys.filter((k) => !k.startsWith('keisan-'));
  if (others.length !== 2) note(problems.pwa, 'p', { 項目: '他アプリのキャッシュが残っていない', 実測: JSON.stringify(keys) });

  const offlineShell = await page.evaluate(async () => {
    // ⚠️ 「core を含むキャッシュ」で探すと、わざと置いた
    //   hiragana-master-core-v1（他アプリ）を つかんでしまい、
    //   「先読みに何も入っていない」という まちがった結果になる（実際に そう出た）。
    //   自アプリの接頭辞で 絞ること。
    const key = (await caches.keys()).find((k) => k.startsWith('keisan-') && k.includes('core'));
    if (!key) return null;
    const c = await caches.open(key);
    return {
      index: !!(await c.match('./index.html')),
      offline: !!(await c.match('./offline.html')),
      app: !!(await c.match('./js/app.js')),
      react: !!(await c.match('./vendor/react.production.min.js')),
      css: !!(await c.match('./css/style.css')),
    };
  });
  if (!offlineShell || Object.values(offlineShell).some((v) => !v)) {
    note(problems.pwa, 'p', { 項目: '先読みに入っていないファイルがある', 実測: JSON.stringify(offlineShell) });
  }

  /* --- 更新は 押すまで 切りかわらないか（§7-5） --- */
  state.bumpVersion = true; // ここから sw.js の中身が変わる＝新しい版が出たことにする
  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await page.waitForTimeout(3000); // 3秒 放置して、待機のままかを見る
  const waiting = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { waiting: !!r.waiting, active: r.active && r.active.scriptURL ? 'あり' : 'なし' };
  });
  if (!waiting.waiting) {
    note(problems.pwa, 'p', { 項目: '新しい版が 待機していない（更新に気づけない）', 実測: JSON.stringify(waiting) });
  } else {
    // おしらせが 画面に出ているか
    const toast = await page
      .waitForSelector('text=あたらしい ばんが あります', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!toast) note(problems.pwa, 'p', { 項目: '更新のおしらせが 画面に出ない', 実測: '見あたらない' });

    // 押すまで 切りかわらないこと
    const stillWaiting = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return !!r.waiting;
    });
    if (!stillWaiting) note(problems.pwa, 'p', { 項目: '押していないのに 切りかわった', 実測: 'waiting が消えた' });

    // 押したら 切りかわること
    await page.click('text=さいしんに する').catch(() => {});
    await page.waitForTimeout(3000);
    const after = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { waiting: !!r.waiting };
    });
    if (after.waiting) note(problems.pwa, 'p', { 項目: '押しても 切りかわらない', 実測: 'waiting が残ったまま' });
  }
  state.bumpVersion = false;

  /* --- 圏外（§7-5）---
   *  サーバーそのものを 止める。context.setOffline では、
   *  route（横取り）を入れているときに すり抜けて 通信が成功してしまう。 */
  await server.stop();

  await page.goto(APP_URL + '?measure-offline=1', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const offlineOk = await page
    .waitForSelector('text=はじめる', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!offlineOk) note(problems.pwa, 'p', { 項目: '圏外で起動しない', 実測: '本体が出なかった' });

  // 本体のキャッシュだけ消すと offline.html が出るか
  const removed = await page.evaluate(async () => {
    let n = 0;
    for (const k of await caches.keys()) {
      if (!k.startsWith('keisan-')) continue;
      const c = await caches.open(k);
      for (const r of await c.keys()) {
        if (/\/(index\.html)?$/.test(new URL(r.url).pathname)) {
          await c.delete(r);
          n++;
        }
      }
    }
    return n;
  });
  if (removed === 0) note(problems.pwa, 'p', { 項目: '本体が先読みに入っていない', 実測: '消すものが無かった' });
  await page.goto(APP_URL + '?measure-offline=2', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const offlinePage = await page
    .waitForSelector('text=つながっていません', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!offlinePage) note(problems.pwa, 'p', { 項目: 'offline.html が出ない', 実測: '出なかった' });

  // 他アプリのキャッシュが 巻きぞえで消えていないこと（最後にもう一度見る）
  const finalKeys = await page.evaluate(() => caches.keys());
  const survived = finalKeys.filter((k) => !k.startsWith('keisan-'));
  if (survived.length !== 2) {
    note(problems.pwa, 'p', { 項目: '他アプリのキャッシュを巻きぞえにした', 実測: JSON.stringify(finalKeys) });
  }

  await context.close();
}

await browser.close();
await server.stop().catch(() => {});

/* --- 結果 ------------------------------------------------------------ */
const show = (title, list, fmt) => {
  console.log(`\n【${title}】 ${list.length}件`);
  // 全部出す。「…ほか87件」で切ると、何が残っているのか分からず
  // 直しようがない（同じ要素が 画面のぶんだけ 数えられている、なども見えない）。
  list.forEach((x) => console.log('   ' + fmt(x)));
};
show('コントラスト基準未満', problems.contrast, (x) =>
  `比 ${x.got}（必要 ${x.need}） ${x.size}px/${x.weight} 「${x.text}」 ${x.color} on ${x.bg}  [${x.where}] ${x.cls}`
);
show('タップ領域 44px 未満', problems.tap, (x) => `${x.w}×${x.h} <${x.tag}> 「${x.text}」 [${x.where}]`);
show('横スクロール', problems.overflow, (x) => `${x.where} で ${x.over}px はみ出し`);
show('CSP 違反', problems.csp, (x) => x.text);
show('JS エラー', problems.jsError, (x) => x.text);
show('PWA', problems.pwa, (x) => `${x.項目}：${x.実測}`);

// あとから数え直せるよう、生の結果も書き出しておく
const reportPath = join(ROOT, 'measure-report.json');
try {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(reportPath, JSON.stringify(problems, null, 2));
  console.log(`\n（詳しい結果を ${reportPath} に書きました）`);
} catch {
  /* 書けなくても 測定結果は 上に出ている */
}

const total = Object.values(problems).reduce((n, l) => n + l.length, 0);
console.log(`\n${total === 0 ? '✓ すべて 0件' : `✗ 合計 ${total}件`}`);
process.exit(total === 0 ? 0 : 1);
