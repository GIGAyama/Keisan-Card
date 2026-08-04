#!/usr/bin/env node
/* =====================================================================
 *  ビルド（GIGA Standard v5 §6「全部 先に作っておく」）
 *  ---------------------------------------------------------------------
 *  以前は ブラウザに @babel/standalone（約3MB）と cdn.tailwindcss.com と
 *  unpkg の React を送り、ひらくたびに JSX を翻訳させていた。
 *  学校のネットワークが CDN をふさいでいると、そのどれか1本が届かない
 *  だけで画面が真っ白になり、しかも原因はアプリの外にあるので
 *  先生が調べても分からない。
 *
 *  そこで、ブラウザに送るものを全部「先に作って」自分側に置く。
 *
 *    原本（ここを直す）              生成物（手で編集しない）
 *    ----------------------------    ---------------------------------
 *    src/App.jsx                 →   js/app.js
 *    src/styles.css              →   css/style.css
 *    tailwind.config.js          →   （css/style.css に反映）
 *    node_modules/react …        →   vendor/react.production.min.js
 *                                    vendor/react-dom.production.min.js
 *
 *  使い方
 *    node tools/build.mjs           … 生成する
 *    node tools/build.mjs --check   … 生成物が原本と食いちがっていないか調べる
 *                                     （CI で使う。原本を直して build を
 *                                       忘れたまま push すると ここで落ちる）
 * ===================================================================== */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CHECK_ONLY = process.argv.includes('--check');

const BANNER = (src) =>
  `/* 自動生成ファイル（GIGA Standard v5 §6）。手で編集しないこと。\n` +
  ` * 原本: ${src}\n` +
  ` * 直したら \`npm run build\` を実行してから push すること。 */\n`;

/* --- react の umd/ は package.json の exports で公開されていないため、
       require.resolve は ERR_PACKAGE_PATH_NOT_EXPORTED になる。
       パッケージの場所だけ解決して、あとはパスで直に指す（§6）。 --- */
function umdPath(pkg, file) {
  const pkgJson = require.resolve(`${pkg}/package.json`);
  return join(dirname(pkgJson), 'umd', file);
}

const VENDOR = [
  { from: umdPath('react', 'react.production.min.js'), to: 'vendor/react.production.min.js' },
  {
    from: umdPath('react-dom', 'react-dom.production.min.js'),
    to: 'vendor/react-dom.production.min.js',
  },
];

/** 生成した中身を書く（--check のときは食いちがいを数えるだけ） */
const stale = [];
async function emit(relPath, content) {
  const abs = join(ROOT, relPath);
  const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (current === content) {
    console.log(`  = ${relPath}（変わりなし）`);
    return;
  }
  if (CHECK_ONLY) {
    stale.push(relPath);
    console.log(`  ✗ ${relPath} が原本と食いちがっています`);
    return;
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content);
  const kb = (Buffer.byteLength(content) / 1024).toFixed(1);
  console.log(`  → ${relPath}  ${kb} KB`);
}

/* --- 1. JSX を先に翻訳しておく（ブラウザではコンパイルしない） --------- */
async function buildApp() {
  const { transformAsync } = await import('@babel/core');
  const srcPath = 'src/App.jsx';
  const code = await readFile(join(ROOT, srcPath), 'utf8');
  const out = await transformAsync(code, {
    filename: srcPath,
    babelrc: false,
    configFile: false,
    // classic runtime に固定する。自動ランタイムだと出力の先頭に import 文が
    // 生成され、module でない <script> では
    // 「Cannot use import statement outside a module」になる。
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
    sourceMaps: false,
    compact: false,
  });
  const { minify } = await import('terser');
  const min = await minify(out.code, {
    ecma: 2020,
    compress: { passes: 2 },
    // React は関数名でコンポーネント名を出すので、名前は残す
    // （開発者ツールが読めなくなると、先生からの報告を追えなくなる）
    mangle: { keep_fnames: true },
    format: { comments: false },
  });
  await emit('js/app.js', BANNER(srcPath) + min.code + '\n');
}

/* --- 2. 使うクラスだけの CSS を作る（ブラウザ内で生成しない） ---------- */
async function buildCss() {
  const postcss = (await import('postcss')).default;
  const tailwind = (await import('tailwindcss')).default;
  const srcPath = 'src/styles.css';
  const css = await readFile(join(ROOT, srcPath), 'utf8');
  const config = (await import(join(ROOT, 'tailwind.config.js'))).default;
  const result = await postcss([tailwind({ ...config, content: config.content.map((c) => join(ROOT, c)) })]).process(
    css,
    { from: join(ROOT, srcPath), to: join(ROOT, 'css/style.css') }
  );
  await emit('css/style.css', BANNER(srcPath) + result.css);
}

/* --- 3. 実行コードは自分側に置く（CDN から取らない） ------------------ */
async function copyVendor() {
  for (const v of VENDOR) {
    const code = await readFile(v.from, 'utf8');
    await emit(v.to, code);
  }
}

console.log(CHECK_ONLY ? '生成物を照合します…' : 'ビルドします…');
await buildApp();
await buildCss();
await copyVendor();

if (CHECK_ONLY && stale.length) {
  console.error(
    `\n✗ ${stale.length} 件の生成物が原本と食いちがっています。\n` +
      `  原本（src/ tailwind.config.js）を直したら \`npm run build\` を実行してから push してください。`
  );
  process.exit(1);
}
console.log(CHECK_ONLY ? '✓ 生成物は原本と一致しています' : '✓ ビルド完了');
