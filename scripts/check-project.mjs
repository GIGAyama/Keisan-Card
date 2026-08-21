#!/usr/bin/env node
/* =====================================================================
 *  品質ゲート（GIGA Standard v5 Part III P4）
 *  ---------------------------------------------------------------------
 *  構成
 *    scripts/check-project.mjs   … ここ。設定を読んで検査を合成し、結果を出す
 *    scripts/lib/giga-v5-checks.mjs … Part I の検査（読めば分かる分）
 *    quality.config.json         … このリポジトリ固有の値と「対象外」の理由
 *
 *  ※ フリート共通の正本（scripts/lib/project-quality.mjs）は
 *    このリポジトリにはまだ置いていない。置かれたら、ここから
 *    合成できるように 分けてある（正本は 丸ごと差し替えで受ける）。
 *
 *  読んでも分からないもの（コントラスト・タップ領域・CSP 違反・
 *  Service Worker の挙動・オフライン）は tools/measure.mjs で 実測する。
 *  このゲートは それを肩代わりしない。
 * ===================================================================== */
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
// このリポジトリ独自の検査（正本 Part I は scripts/check-standard.mjs が受け持つ）
import * as V5 from './lib/local-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'quality.config.json'), 'utf8'));

const SKIP_DIRS = new Set(['node_modules', '.git', '.github']);
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else acc.push({ path: relative(ROOT, abs), abs, size: st.size });
  }
  return acc;
}

const TEXT_EXT = new Set(['.html', '.css', '.js', '.jsx', '.mjs', '.json', '.webmanifest', '.md']);
const all = walk(ROOT);
const textFiles = all
  .filter((f) => TEXT_EXT.has(extname(f.path)))
  .map((f) => ({ ...f, text: readFileSync(f.abs, 'utf8') }));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const results = [];
const add = (list) => results.push(...list);

/* --- 法務・配布 ------------------------------------------------------ */
for (const [f, id] of [
  ['LICENSE', 'LEGAL_LICENSE'],
  ['.gitignore', 'LEGAL_GITIGNORE'],
  ['.github/dependabot.yml', 'LEGAL_DEPENDABOT'],
  ['.github/workflows/ci.yml', 'LEGAL_CI'],
  ['README.md', 'DOC_README'],
  ['MANUAL.md', 'DOC_MANUAL'],
  ['AUDIT.md', 'DOC_AUDIT'],
]) {
  results.push(
    existsSync(join(ROOT, f))
      ? { id, level: 'ok', detail: `${f} あり` }
      : { id, level: 'error', detail: `${f} が無い` }
  );
}
// CI は pull_request でも動くこと（push だけだと PR の時点で気づけない）
if (existsSync(join(ROOT, '.github/workflows/ci.yml'))) {
  const ci = read('.github/workflows/ci.yml');
  results.push(
    /pull_request/.test(ci)
      ? { id: 'LEGAL_CI_PR', level: 'ok', detail: 'CI が pull_request でも動く' }
      : { id: 'LEGAL_CI_PR', level: 'error', detail: 'CI が pull_request で動かない' }
  );
}

/* --- 秘密情報・依存・表示・PWA・CSP・a11y ---------------------------- */
add(V5.checkSecrets(textFiles));
add(V5.checkDependencies(textFiles));
add(V5.checkViewport(textFiles));
add(V5.checkCss(textFiles));
add(V5.checkManifest(read(cfg.manifest), cfg.repoName, existsSync(join(ROOT, 'CNAME'))));
add(V5.checkServiceWorker(read(cfg.serviceWorker), cfg.cachePrefix));
add(V5.checkPwaHead(read('index.html')));
for (const h of cfg.entryHtml) add(V5.checkCsp(read(h), h));
add(V5.checkA11y(read('src/App.jsx')));
add(V5.checkRobustness(read('src/App.jsx')));

// offline.html は「ネットにつながらず、アプリ本体も手元にない」ときに出る画面。
// 外部資産にも JavaScript にも頼らないこと（§3-4）。
{
  const off = read('offline.html');
  const hasScript = /<script\b/i.test(off.replace(/<!--[\s\S]*?-->/g, ''));
  const hasExternal = /(?:src|href)\s*=\s*["']https?:/i.test(off);
  results.push(
    !hasScript && !hasExternal
      ? { id: 'PWA_OFFLINE_SELF_CONTAINED', level: 'ok', detail: 'offline.html は外部資産にも JS にも頼っていない' }
      : {
          id: 'PWA_OFFLINE_SELF_CONTAINED',
          level: 'error',
          detail: `offline.html が ${hasScript ? 'JavaScript' : ''}${hasScript && hasExternal ? ' と ' : ''}${hasExternal ? '外部資産' : ''}に頼っている（§3-4）`,
        }
  );
}

/* --- 性能（§8） ------------------------------------------------------ */
{
  const b = cfg.budgets;
  const kb = (n) => +(n / 1024).toFixed(1);

  // 初回表示に必要な JS = index.html が読む script（自分側のもの）
  const html = read('index.html');
  const srcs = [...html.matchAll(/<script[^>]*\bsrc=["']\.\/([^"']+)["']/g)].map((m) => m[1]);
  let jsBytes = 0;
  for (const s of srcs) if (existsSync(join(ROOT, s))) jsBytes += statSync(join(ROOT, s)).size;
  results.push(
    kb(jsBytes) <= b.initialJsKB
      ? { id: 'PERF_INITIAL_JS', level: 'ok', detail: `初回 JS ${kb(jsBytes)} KB（上限 ${b.initialJsKB} KB）` }
      : { id: 'PERF_INITIAL_JS', level: 'error', detail: `初回 JS ${kb(jsBytes)} KB が上限 ${b.initialJsKB} KB を超えている` }
  );

  const big = all.filter(
    (f) => !/^node_modules\//.test(f.path) && TEXT_EXT.has(extname(f.path)) && f.size > b.maxFileKB * 1024
  );
  const longFiles = textFiles.filter(
    (f) => !/^node_modules\//.test(f.path) && f.text.split('\n').length > b.maxFileLines
  );
  results.push(
    big.length === 0 && longFiles.length === 0
      ? { id: 'PERF_FILE_SIZE', level: 'ok', detail: `1ファイル ${b.maxFileLines}行 / ${b.maxFileKB}KB 以内` }
      : {
          id: 'PERF_FILE_SIZE',
          level: 'error',
          detail: `大きすぎるファイル：${[...big, ...longFiles].map((f) => f.path).join(', ')}`,
        }
  );

  const imgs = all.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.path) && !/^node_modules\//.test(f.path));
  const overs = imgs.filter((f) => {
    const limit = /favicon/.test(f.path) ? b.maxFaviconKB : /icons?\//.test(f.path) ? b.maxPwaIconKB : b.maxImageKB;
    return kb(f.size) > limit;
  });
  results.push(
    overs.length === 0
      ? { id: 'PERF_IMAGES', level: 'ok', detail: `画像 ${imgs.length} 点すべて上限内（合計 ${kb(imgs.reduce((n, f) => n + f.size, 0))} KB）` }
      : { id: 'PERF_IMAGES', level: 'error', detail: `上限超えの画像：${overs.map((f) => `${f.path} ${kb(f.size)}KB`).join(', ')}` }
  );
}

/* --- 生成物と原本の対応（§6） ---------------------------------------- */
{
  const missing = cfg.generated.filter((g) => !existsSync(join(ROOT, g)));
  results.push(
    missing.length === 0
      ? { id: 'BUILD_ARTIFACTS', level: 'ok', detail: `生成物あり：${cfg.generated.join(', ')}` }
      : { id: 'BUILD_ARTIFACTS', level: 'error', detail: `生成物が無い：${missing.join(', ')}（npm run build）` }
  );
  const noBanner = cfg.generated
    .filter((g) => !g.endsWith('/') && existsSync(join(ROOT, g)))
    .filter((g) => !/自動生成/.test(read(g).slice(0, 400)));
  results.push(
    noBanner.length === 0
      ? { id: 'BUILD_BANNER', level: 'ok', detail: '生成物に「手で編集しない」と書いてある' }
      : { id: 'BUILD_BANNER', level: 'error', detail: `見出しが無い生成物：${noBanner.join(', ')}` }
  );
}

/* --- 出力 ------------------------------------------------------------ */
const errors = results.filter((r) => r.level === 'error');
const warns = results.filter((r) => r.level === 'warn');

console.log(`\n=== 品質ゲート：${cfg.appName}（${cfg.type}型） ===\n`);
for (const r of results) {
  const mark = r.level === 'ok' ? '✅' : r.level === 'warn' ? '⚠️ ' : '❌';
  console.log(`${mark} ${r.id.padEnd(28)} ${r.detail}`);
}
console.log('\n--- 対象外（理由つき） ---');
for (const [k, why] of Object.entries(cfg.notApplicable)) {
  if (k.startsWith('$')) continue;
  console.log(`   ${k.padEnd(20)} … ${why}`);
}
console.log(
  '\n※ コントラスト・タップ領域・CSP 違反・Service Worker の挙動・オフラインは' +
    '\n  ここでは分からない。`npm run measure`（実ブラウザ）で測ること。'
);
console.log(`\n合計 ${results.length} 項目：❌ ${errors.length} 件 / ⚠️ ${warns.length} 件\n`);
process.exit(errors.length === 0 ? 0 : 1);
