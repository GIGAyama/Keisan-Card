/* =====================================================================
 *  GIGA Standard v5 Part I の検査（静的に読める分）
 *  ---------------------------------------------------------------------
 *  ここは「読めば分かること」だけを見る。
 *  コントラスト・タップ領域・CSP 違反・Service Worker の挙動は
 *  読んでも分からないので、tools/measure.mjs（実ブラウザ）で測る。
 *
 *  ⚠️ 検査を足したら、かならず「わざと壊して」落ちることを確かめること。
 *     「0件でした」だけでは、検査が動いているのか
 *     何も見ていないのか区別できない（Part III P4）。
 *     tests/quality-gate.test.mjs が それを自動でやっている。
 * ===================================================================== */

/** コメントを落とす。
 *  「localStorage は操作しない」という注意書きに検査が反応した実例があるため、
 *  中身を判定する前にコメントを取りのぞく。 */
export function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/** addEventListener('名前', …) の中身を、かっこの数を数えて取り出す。
 *  正規表現で終わりを決めると、書き方のちがいで 見のがす。 */
export function listenerBody(code, eventName) {
  const re = new RegExp(`addEventListener\\s*\\(\\s*['"\`]${eventName}['"\`]`, 'g');
  const m = re.exec(code);
  if (!m) return null;
  // 開きかっこの位置から、対応する 閉じかっこ まで
  const open = code.indexOf('(', m.index);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1); // 閉じていない＝以降ぜんぶ
}

const ok = (id, detail) => ({ id, level: 'ok', detail });
const ng = (id, detail) => ({ id, level: 'error', detail });
const warn = (id, detail) => ({ id, level: 'warn', detail });

/* --- 依存（v5 の最重要チェック。§6） --------------------------------- */
export function checkDependencies(files) {
  const out = [];
  const html = files.filter((f) => /\.html?$/.test(f.path));
  const hits = [];
  for (const f of html) {
    const body = stripComments(f.text);
    // <script src> と <link href> の宛先だけを見る。
    // 説明文に CDN の名前が出てくるだけで落ちないようにする。
    const re = /<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(body))) {
      const url = m[1];
      if (!/^https?:/i.test(url)) continue;
      const isFont = /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url);
      const isStylesheet = /^<link/i.test(m[0]) && /rel\s*=\s*["']?stylesheet/i.test(m[0]);
      // フォントの CSS は「見た目だけ」の依存なので許す（§2-7）。
      // それ以外の外部 script / stylesheet は「実行コード」として扱う。
      if (isFont) continue;
      if (/^<script/i.test(m[0]) || isStylesheet) hits.push(`${f.path}: ${url}`);
    }
    if (/@babel\/standalone|babel\.min\.js/.test(body)) {
      out.push(ng('DEP_BROWSER_BABEL', `${f.path} がブラウザへ Babel を送っている（§6）`));
    }
    if (/cdn\.tailwindcss\.com/.test(body)) {
      out.push(ng('DEP_TAILWIND_CDN', `${f.path} が cdn.tailwindcss.com を読んでいる（§6）`));
    }
    if (/type\s*=\s*["']text\/babel["']/.test(body)) {
      out.push(ng('DEP_TEXT_BABEL', `${f.path} に type="text/babel" が残っている（§6）`));
    }
  }
  out.push(
    hits.length === 0
      ? ok('DEP_CDN_EXEC', 'CDN から取る実行コードは 0 バイト')
      : ng('DEP_CDN_EXEC', `CDN から実行コードを取っている：\n      ${hits.join('\n      ')}`)
  );
  return out;
}

/* --- 表示（§2） ------------------------------------------------------ */
export function checkViewport(files) {
  const out = [];
  for (const f of files.filter((x) => /\.html?$/.test(x.path))) {
    const m = f.text.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i);
    if (!m) {
      out.push(ng('VIEWPORT_MISSING', `${f.path} に viewport が無い`));
      continue;
    }
    const c = m[1];
    if (!/viewport-fit\s*=\s*cover/.test(c)) {
      out.push(ng('VIEWPORT_FIT', `${f.path} の viewport に viewport-fit=cover が無い（§2-1）`));
    }
    if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(c)) {
      out.push(
        ng('VIEWPORT_NO_ZOOM', `${f.path} が拡大を禁止している（§2-1。見えづらい子が拡大できない）`)
      );
    }
  }
  if (out.length === 0) out.push(ok('VIEWPORT', 'viewport-fit=cover あり／拡大の禁止なし'));
  return out;
}

export function checkCss(files) {
  const out = [];
  const css = files.filter((f) => /\.css$|\.html?$/.test(f.path));
  let dvh = false;
  const bare100vh = [];
  for (const f of css) {
    const body = stripComments(f.text);
    if (/\b100dvh\b/.test(body)) dvh = true;
    // @supports not (… 100dvh) { … 100vh } の中の 100vh は 正しいフォールバック。
    // 前方も見ないと 誤検知になる（実例あり）。
    const withoutSupports = body.replace(/@supports\s+not\s*\([^)]*dvh[^)]*\)\s*\{[\s\S]*?\}\s*\}?/g, '');
    for (const line of withoutSupports.split('\n')) {
      if (/\b100vh\b/.test(line)) bare100vh.push(`${f.path}: ${line.trim().slice(0, 70)}`);
    }
  }
  out.push(dvh ? ok('CSS_DVH', '100dvh を使用') : ng('CSS_DVH', '100dvh が使われていない（§2-2）'));
  out.push(
    bare100vh.length === 0
      ? ok('CSS_100VH', '@supports の外に 100vh 単独使用なし')
      : ng('CSS_100VH', `100vh が単独で使われている：\n      ${bare100vh.join('\n      ')}`)
  );

  const all = css.map((f) => stripComments(f.text)).join('\n');
  out.push(
    /safe-area-inset/.test(all)
      ? ok('CSS_SAFE_AREA', 'safe-area-inset を適用')
      : ng('CSS_SAFE_AREA', 'safe-area-inset が無い（§2-3）')
  );
  out.push(
    /clamp\s*\(/.test(all)
      ? ok('CSS_FLUID_TYPE', 'clamp() による fluid type あり')
      : ng('CSS_FLUID_TYPE', 'clamp() が無い（§2-4）')
  );
  out.push(
    /forced-colors\s*:\s*active/.test(all)
      ? ok('CSS_FORCED_COLORS', 'forced-colors 対応あり')
      : ng('CSS_FORCED_COLORS', 'forced-colors 対応が無い（§2-8）')
  );

  // prefers-reduced-motion は「あるか」ではなく「0 になっていないか」を見る。
  // 0 にすると animation-fill-mode: forwards が壊れ、
  // fadeIn 系の要素が opacity: 0 のまま消える（§2-10）。
  const rm = /@media[^{]*prefers-reduced-motion[^{]*\{([\s\S]*?)\n\}/.exec(all);
  if (!rm) {
    out.push(ng('CSS_REDUCED_MOTION', 'prefers-reduced-motion 対応が無い（§2-10）'));
  } else if (/animation-duration\s*:\s*0s?\s*(!important)?\s*;/.test(rm[1])) {
    out.push(
      ng('CSS_REDUCED_MOTION_ZERO', 'prefers-reduced-motion で 0 にしている（.01ms にすること。§2-10）')
    );
  } else {
    out.push(ok('CSS_REDUCED_MOTION', 'prefers-reduced-motion 対応あり（0 ではない）'));
  }

  out.push(
    /touch-action\s*:\s*manipulation/.test(all)
      ? ok('CSS_TOUCH_ACTION', 'touch-action: manipulation あり')
      : warn('CSS_TOUCH_ACTION', 'touch-action: manipulation が無い（§2-9）')
  );

  // ふりがなの色の決め打ち（§4）。使っていなければ 何も言わない。
  const rt = /(^|\})\s*rt\s*\{[^}]*color\s*:\s*#?[0-9a-z(]/im.exec(all);
  const inherits = /rt\s*\{[^}]*color\s*:\s*inherit/i.test(all);
  if (rt && !inherits) {
    out.push(ng('A11Y_RT_COLOR', 'rt の色を決め打ちしている（色のついた面で読めなくなる。§4）'));
  }
  return out;
}

/* --- PWA（§3） ------------------------------------------------------- */
export function checkManifest(manifestText, repoName) {
  const out = [];
  let m;
  try {
    m = JSON.parse(manifestText);
  } catch (e) {
    return [ng('PWA_MANIFEST_JSON', `manifest.webmanifest が JSON として読めない：${e.message}`)];
  }
  const want = `/${repoName}/`;
  for (const k of ['id', 'scope', 'start_url']) {
    const v = m[k];
    if (!v) out.push(ng('PWA_MANIFEST_ID', `manifest に ${k} が無い（§3-1）`));
    else if (!String(v).startsWith(want)) {
      out.push(
        ng('PWA_MANIFEST_ID', `manifest の ${k} = "${v}" がリポジトリ名の絶対パス（${want}）で始まっていない（§3-1）`)
      );
    }
  }
  const purposes = (m.icons || []).map((i) => i.purpose);
  if (!purposes.some((p) => /maskable/.test(p || ''))) {
    out.push(ng('PWA_MASKABLE', 'maskable のアイコンが無い（§3-1）'));
  }
  if (!purposes.some((p) => !p || /any/.test(p))) {
    out.push(ng('PWA_ICON_ANY', 'purpose:any のアイコンが無い（§3-1）'));
  }
  if (out.length === 0) out.push(ok('PWA_MANIFEST', 'id / scope / start_url がリポジトリ名の絶対パス'));
  return out;
}

export function checkServiceWorker(swText, cachePrefix) {
  const out = [];
  const body = stripComments(swText);

  // ⚠️ 「消す式」を正規表現で追うと (k) => caches.delete(k) を見落とす。
  //    見るべきは「startsWith で自アプリぶんに絞る式があるか」。
  const deletesCaches = /caches\.delete\s*\(/.test(body);
  const narrowed = new RegExp(`startsWith\\s*\\(\\s*['"\`]?${cachePrefix}|startsWith\\s*\\(\\s*CACHE_PREFIX`).test(
    body
  );
  out.push(
    !deletesCaches || narrowed
      ? ok('SW_CACHE_WIPE', '自アプリ接頭辞のキャッシュだけを削除している')
      : ng(
          'SW_CACHE_WIPE',
          'キャッシュを削除しているが startsWith で絞っていない（同じオリジンの他アプリを巻きぞえにする。§3-3）'
        )
  );

  out.push(
    /localStorage/.test(body)
      ? ng('SW_LOCALSTORAGE', 'Service Worker が localStorage に触れている（§3-3）')
      : ok('SW_LOCALSTORAGE', 'localStorage に触れていない')
  );

  // install の中の skipWaiting は禁止。児童の操作中に画面が入れかわる。
  //   ⚠️ 「addEventListener('install' … 改行 } );」と 正規表現で 区切ると、
  //     書き方が すこし ちがうだけで 見のがす（わざと壊す確認で 実際に見のがした）。
  //     かっこの数を 数えて 本文を 取り出す。
  const install = listenerBody(body, 'install');
  out.push(
    install !== null && /skipWaiting/.test(install)
      ? ng('SW_SKIP_WAITING_IN_INSTALL', 'install の中で skipWaiting している（§3-3）')
      : ok('SW_SKIP_WAITING_IN_INSTALL', 'install で skipWaiting していない')
  );

  const message = listenerBody(body, 'message');
  out.push(
    message !== null && /skipWaiting/.test(message)
      ? ok('SW_SKIP_WAITING_ON_MESSAGE', '画面から言われたときだけ skipWaiting する')
      : ng('SW_SKIP_WAITING_ON_MESSAGE', '更新の切りかえ（message → skipWaiting）が無い（§3-3）')
  );
  return out;
}

export function checkPwaHead(htmlText) {
  const out = [];
  // ⚠️ コメントを落としてから数える。落とさないと、
  //   「あとから <script> を書き足すと動かない」という注意書きに反応して
  //   「install-hook.js より前に 2 本の script がある」と誤って言う。
  const clean = htmlText.replace(/<!--[\s\S]*?-->/g, '');
  const head = clean.slice(0, clean.indexOf('</head>') + 1);

  // beforeinstallprompt の捕捉は <head> の できるだけ上で、かつ外部ファイルで。
  const scripts = [...head.matchAll(/<script\b[^>]*>/gi)];
  const hookIdx = scripts.findIndex((s) => /install-hook/.test(s[0]));
  if (hookIdx < 0) {
    out.push(ng('PWA_INSTALL_HOOK', 'install-hook.js（beforeinstallprompt の捕捉）が <head> に無い（§3-2）'));
  } else if (hookIdx !== 0) {
    out.push(warn('PWA_INSTALL_HOOK', `install-hook.js より前に ${hookIdx} 本の script がある（§3-2）`));
  } else {
    out.push(ok('PWA_INSTALL_HOOK', 'install-hook.js が <head> の最初の script'));
  }

  const apple = /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i.exec(htmlText);
  out.push(
    apple
      ? ok('PWA_APPLE_ICON', `apple-touch-icon = ${apple[1]}`)
      : ng('PWA_APPLE_ICON', 'apple-touch-icon が無い（§3-2）')
  );
  return out;
}

/* --- CSP（§2-13） ---------------------------------------------------- */
export function checkCsp(htmlText, path) {
  const out = [];
  const m = /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([\s\S]*?)["']\s*\/?>/i.exec(
    htmlText
  );
  if (!m) return [ng('CSP_MISSING', `${path} に CSP が無い（§2-13）`)];
  const csp = m[1].replace(/\s+/g, ' ');

  if (/frame-ancestors/.test(csp)) {
    out.push(ng('CSP_FRAME_ANCESTORS', `${path}: frame-ancestors は <meta> では無視される（§2-13）`));
  }
  const scriptSrc = /script-src\s+([^;]+)/.exec(csp);
  if (scriptSrc && /'unsafe-inline'|'unsafe-eval'/.test(scriptSrc[1])) {
    out.push(ng('CSP_UNSAFE_SCRIPT', `${path}: script-src に unsafe-inline/eval がある（§2-13）`));
  }
  if (!/object-src\s+'none'/.test(csp)) out.push(warn('CSP_OBJECT_SRC', `${path}: object-src 'none' が無い`));
  if (!/base-uri/.test(csp)) out.push(warn('CSP_BASE_URI', `${path}: base-uri が無い`));

  // CSP を入れたのにインラインの script / onclick= が残っていると、
  // ビルドも静的解析も通るのに、動かした瞬間に壊れる。
  const body = htmlText.replace(/<!--[\s\S]*?-->/g, '');
  const inline = [...body.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter(
    (x) => x[1].trim().length > 0
  );
  if (inline.length && scriptSrc && !/'unsafe-inline'/.test(scriptSrc[1])) {
    out.push(ng('CSP_INLINE_SCRIPT', `${path}: インラインの <script> が ${inline.length} 本ある（動かない。§2-13）`));
  }
  const onattr = [...body.matchAll(/\son(?:click|load|change|input|submit|error)\s*=\s*["']/gi)];
  if (onattr.length && scriptSrc && !/'unsafe-inline'/.test(scriptSrc[1])) {
    out.push(ng('CSP_INLINE_HANDLER', `${path}: onclick= などの属性が ${onattr.length} 個ある（動かない。§2-13）`));
  }
  if (out.every((x) => x.level !== 'error')) out.push(ok('CSP', `${path}: CSP あり／インラインなし`));
  return out;
}

/* --- アクセシビリティ（§4） ------------------------------------------ */
export function checkA11y(appText) {
  const out = [];
  const body = stripComments(appText);
  out.push(
    /aria-label=/.test(body) ? ok('A11Y_ARIA_LABEL', 'aria-label あり') : ng('A11Y_ARIA_LABEL', 'aria-label が無い（§4）')
  );
  out.push(
    /aria-live=/.test(body)
      ? ok('A11Y_ARIA_LIVE', 'aria-live あり')
      : ng('A11Y_ARIA_LIVE', '状態変化の読み上げ（aria-live）が無い（§4）')
  );
  const dialogs = (body.match(/role="dialog"/g) || []).length;
  const modals = (body.match(/aria-modal="true"/g) || []).length;
  out.push(
    dialogs > 0 && dialogs === modals
      ? ok('A11Y_DIALOG', `モーダル ${dialogs} 個に role="dialog" aria-modal="true"`)
      : ng('A11Y_DIALOG', `role="dialog" ${dialogs} 個 / aria-modal ${modals} 個（§4）`)
  );
  out.push(
    /key === 'Escape'|key === "Escape"/.test(body)
      ? ok('A11Y_ESC', 'Esc で閉じる処理あり')
      : ng('A11Y_ESC', 'モーダルを Esc で閉じられない（§4）')
  );
  return out;
}

/* --- 堅牢性・学習ログ ------------------------------------------------ */
export function checkRobustness(appText) {
  const out = [];
  const body = stripComments(appText);
  out.push(
    /localStorage\.clear\s*\(/.test(body)
      ? ng('ROBUST_LS_CLEAR', 'localStorage.clear() を使っている（他アプリの学習ログまで消える）')
      : ok('ROBUST_LS_CLEAR', 'localStorage.clear() を使っていない')
  );
  out.push(
    /addEventListener\s*\(\s*['"]pagehide['"]/.test(body)
      ? ok('ROBUST_PAGEHIDE', 'pagehide で記録を確定している')
      : ng('ROBUST_PAGEHIDE', 'pagehide での確定が無い（Chromebook のタブ破棄で記録が消える。§3-5）')
  );
  out.push(
    /study\.records\.v1|StudyLog/.test(body)
      ? ok('STUDY_LOG', '学習ログ study.v1 を使用')
      : warn('STUDY_LOG', '学習ログの呼び出しが見あたらない')
  );
  return out;
}

/* --- 秘密情報 -------------------------------------------------------- */
export function checkSecrets(files) {
  const out = [];
  const hits = [];
  const patterns = [
    [/AIza[0-9A-Za-z_\-]{30,}/, 'Google API キー'],
    [/AKIA[0-9A-Z]{16}/, 'AWS アクセスキー'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '秘密鍵'],
    [/\bghp_[0-9A-Za-z]{30,}/, 'GitHub トークン'],
    [/[\w.+-]+@(?!example\.)[\w-]+\.[a-z]{2,}/, 'メールアドレス'],
    [/\b1[A-Za-z0-9_-]{43}\b/, 'スプレッドシートID らしき文字列'],
  ];
  for (const f of files) {
    if (/^(node_modules|vendor|\.git)\//.test(f.path)) continue;
    const body = stripComments(f.text);
    for (const [re, name] of patterns) {
      const m = re.exec(body);
      if (m) {
        // 値そのものは報告に転記しない。ファイル名と行番号だけ（Part III 規則7）
        const line = body.slice(0, m.index).split('\n').length;
        hits.push(`${f.path}:${line} に ${name} らしき記述`);
      }
    }
  }
  out.push(
    hits.length === 0
      ? ok('SECRETS', '秘密情報・IDの直書きは見あたらない')
      : ng('SECRETS', `直書きの疑い：\n      ${hits.join('\n      ')}`)
  );
  return out;
}
