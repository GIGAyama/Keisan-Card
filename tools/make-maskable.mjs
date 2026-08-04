#!/usr/bin/env node
/* =====================================================================
 *  maskable アイコンの下地を 端まで のばす（GIGA Standard v5 §3-7）
 *  ---------------------------------------------------------------------
 *  purpose:"maskable" と書いてあっても、中身が maskable とは限らない。
 *  実際にあるのは次の2パターンで、このアプリは 後者だった。
 *
 *    余白なし … 円で切り抜かれて 絵が欠ける          → 絵を小さくする
 *    余白あり … 欠けないが、切り抜きの内側が余白色で
 *               埋まり「縮んで見える」               → 下地を端まで のばす
 *
 *  やり方
 *    1. 角丸四角のタイル（下地＋絵）の位置と 角の丸みを 画素から 割り出す
 *    2. タイルの ふちの帯（絵が写っていない部分）だけを使って
 *       下地のグラデーションを 1次式で あてはめる
 *       ※ 単色のグラデーションを敷くと、角丸四角の輪郭が
 *         薄い影として残る（元の下地は左上が明るく右下が暗いため）
 *    3. その式で 512×512 いっぱいの下地を 作る
 *    4. その上に、元のタイルを 角丸で切り抜いて そのまま 置く
 *       → 境目で 色が 連続するので 継ぎ目が出ない
 *
 *  使い方：  node tools/make-maskable.mjs
 *  必要なもの：  npm i（optionalDependencies の sharp）
 * ===================================================================== */
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'icons/icon-maskable-512.png');
const OUT_512 = join(ROOT, 'icons/icon-maskable-512.png');
const OUT_192 = join(ROOT, 'icons/icon-maskable-192.png');

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const at = (x, y) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};

/* --- 1. タイルの はこ と 角の丸み ------------------------------------ */
const outside = at(1, 1); // 四隅＝タイルの外の色
const isOutside = (c) =>
  Math.abs(c[0] - outside[0]) + Math.abs(c[1] - outside[1]) + Math.abs(c[2] - outside[2]) < 6;

let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (isOutside(at(x, y))) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
}
// 上辺の行で 塗られている いちばん左の x が、角の丸みの目安
let leftMost = W;
for (let x = 0; x < W; x++) if (!isOutside(at(x, y0))) { leftMost = x; break; }
const R = Math.max(0, leftMost - x0);
console.log(`タイル：(${x0},${y0})-(${x1},${y1})  角の丸み r≈${R}`);

// 角丸四角の中かどうか
const inTile = (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + R ? x0 + R : x > x1 - R ? x1 - R : x;
  const cy = y < y0 + R ? y0 + R : y > y1 - R ? y1 - R : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= R * R;
};

/* --- 2. 下地のグラデーションを あてはめる ---------------------------- *
 *  タイルの ふちから 14px までの帯だけを使う。ここには 絵が来ていない。
 *  各色について  値 = a + b*x + c*y  を 最小二乗で あてはめる。
 * ------------------------------------------------------------------- */
const BAND = 14;
const samples = [];
for (let y = y0; y <= y1; y++) {
  for (let x = x0; x <= x1; x++) {
    if (!inTile(x, y)) continue;
    const near =
      x - x0 < BAND || x1 - x < BAND || y - y0 < BAND || y1 - y < BAND ||
      !inTile(x - BAND, y) || !inTile(x + BAND, y) || !inTile(x, y - BAND) || !inTile(x, y + BAND);
    if (near) samples.push([x, y, at(x, y)]);
  }
}

function fit(ch) {
  // 3×3 の正規方程式を ガウスの消去法で解く
  let s = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const [x, y, c] of samples) {
    const v = [1, x, y];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) s[i][j] += v[i] * v[j];
      s[i][3] += v[i] * c[ch];
    }
  }
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(s[k][i]) > Math.abs(s[p][i])) p = k;
    [s[i], s[p]] = [s[p], s[i]];
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const f = s[k][i] / s[i][i];
      for (let j = i; j < 4; j++) s[k][j] -= f * s[i][j];
    }
  }
  return [s[0][3] / s[0][0], s[1][3] / s[1][1], s[2][3] / s[2][2]];
}
const coef = [fit(0), fit(1), fit(2)];

// あてはまり具合を出す。ここが大きいと 継ぎ目が見える。
let maxErr = 0;
for (const [x, y, c] of samples) {
  for (let ch = 0; ch < 3; ch++) {
    const [a, b, cc] = coef[ch];
    maxErr = Math.max(maxErr, Math.abs(a + b * x + cc * y - c[ch]));
  }
}
console.log(`下地のあてはめ：標本 ${samples.length} 点、いちばん外れて ${maxErr.toFixed(1)}／255`);

/* --- 3〜4. 下地を端まで のばし、その上に 元のタイルを 置く ----------- */
const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const src = (y * W + x) * 4;
    if (inTile(x, y)) {
      // 元のタイルは そのまま（絵も 下地も 触らない）
      out[i] = data[src];
      out[i + 1] = data[src + 1];
      out[i + 2] = data[src + 2];
    } else {
      for (let ch = 0; ch < 3; ch++) {
        const [a, b, c] = coef[ch];
        out[i + ch] = Math.max(0, Math.min(255, Math.round(a + b * x + c * y)));
      }
    }
    out[i + 3] = 255; // maskable に透明を残さない
  }
}

const buf512 = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .removeAlpha()
  .png({ palette: true, colours: 128, effort: 10, compressionLevel: 9 })
  .toBuffer();
// ⚠️ sharp を通して書き直すと パレットが落ちる。作ったバッファを そのまま 書く。
await sharp(buf512).toFile(OUT_512).catch(() => {});
const { writeFileSync } = await import('node:fs');
writeFileSync(OUT_512, buf512);

const buf192 = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .resize(192, 192)
  .removeAlpha()
  .png({ palette: true, colours: 128, effort: 10, compressionLevel: 9 })
  .toBuffer();
writeFileSync(OUT_192, buf192);
console.log(`icons/icon-maskable-512.png  ${(buf512.length / 1024).toFixed(1)} KB`);
console.log(`icons/icon-maskable-192.png  ${(buf192.length / 1024).toFixed(1)} KB`);

/* --- 確かめ：セーフゾーン（中央80%の円）の外に「中身」が何％あるか ---
 *  ⚠️ アイコン自身の下地と、欠けては困る中身を 色で区別すること。
 *    下地は 切り抜かれてよいので、一緒に数えると 実態より深刻に見える。
 *    実際、下地の式からの ずれで数えると 0.26%（＝グラデーションが
 *    完全な1次式ではないぶん）になるが、中身は 1画素も 出ていない。
 *    ここでは「色がついている、または 目に見えて暗い」画素だけを 中身とする。
 * ------------------------------------------------------------------- */
for (const [name, buf] of [['512', buf512], ['192', buf192]]) {
  const { data: d, info: inf } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = inf.width, h = inf.height;
  const r = w * 0.4;
  let content = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - w / 2 + 0.5, dy = y - h / 2 + 0.5;
      if (dx * dx + dy * dy <= r * r) continue;
      const i = (y * w + x) * 4;
      const c = [d[i], d[i + 1], d[i + 2]];
      const mx = Math.max(...c), mn = Math.min(...c);
      if (mx - mn > 18 || mx < 215) content++; // 色がついている／暗い＝中身
    }
  }
  const pct = (content / (w * h)) * 100;
  console.log(`  ${name}：セーフゾーン外の中身 ${pct.toFixed(2)}%（目標 0.2% 以下）${pct <= 0.2 ? ' ✓' : ' ✗'}`);
}
