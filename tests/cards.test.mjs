/* =====================================================================
 *  中核ロジックのテスト
 *  ---------------------------------------------------------------------
 *  src/App.jsx（原本）を その場で翻訳して、画面を持たない箱の中で走らせ、
 *  計算の部分だけを 取り出して確かめる。
 *
 *  ファイルを分割せずに テストするための書き方。
 *  （巨大ファイルの分割は 勝手にやらない ＝ Part III P3。
 *    分割案は AUDIT.md に書き、合意を得てから 1機能ずつ行う）
 * ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** src/App.jsx を翻訳して、画面のない箱の中で走らせ、その箱を返す */
async function loadApp() {
  const { transformAsync } = await import('@babel/core');
  const src = await readFile(join(ROOT, 'src/App.jsx'), 'utf8');
  const { code } = await transformAsync(src, {
    filename: 'src/App.jsx',
    babelrc: false,
    configFile: false,
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
  });

  const noop = () => {};
  const hook = () => [undefined, noop];
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Set,
    Map,
    Boolean,
    isNaN,
    parseInt,
    parseFloat,
    // React / ReactDOM のふりをする最小限の箱。
    // 画面は作らないので、部品が呼ばれても何も起きなくてよい。
    React: {
      createElement: () => null,
      Fragment: 'Fragment',
      useState: hook,
      useEffect: noop,
      useRef: () => ({ current: null }),
      useCallback: (f) => f,
      useMemo: (f) => f(),
    },
    ReactDOM: { createRoot: () => ({ render: noop }) },
    document: { getElementById: () => ({}), addEventListener: noop, removeEventListener: noop },
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  // function 宣言は箱の外から見えるが、const / let は見えない（スクリプトの決まり）。
  // 確かめたい値だけ、うしろに1行足して 外へ出す。
  runInContext(code + '\n;globalThis.__const = { DECKS, DECK_ORDER, APP_VERSION, STUDY_APP_ID };\n', sandbox, {
    filename: 'App.jsx',
  });
  return { ...sandbox, ...sandbox.__const };
}

const app = await loadApp();

/* --- 4種類のカードは「実物の計算カード」と同じ枚数・同じ範囲か ------- */

test('あかカード：たしざん（くりあがり なし）', () => {
  const cards = app.makeRedCards();
  assert.ok(cards.length > 0);
  for (const c of cards) {
    assert.equal(c.op, '+');
    assert.equal(c.ans, c.a + c.b);
    assert.ok(c.a >= 1 && c.a <= 9, `足される数 ${c.a} が 1〜9 の外`);
    assert.ok(c.b >= 0 && c.b <= 9, `足す数 ${c.b} が 0〜9 の外`);
    assert.ok(c.ans <= 10, `和 ${c.ans} が 10 をこえている（くりあがりなし のはず）`);
  }
  // 1+0 も 9+0 もふくむ
  assert.ok(cards.some((c) => c.a === 1 && c.b === 0));
  assert.ok(cards.some((c) => c.a === 9 && c.b === 0));
});

test('あおカード：ひきざん（くりさがり なし）', () => {
  const cards = app.makeBlueCards();
  for (const c of cards) {
    assert.equal(c.op, '-');
    assert.equal(c.ans, c.a - c.b);
    assert.ok(c.ans >= 0 && c.ans <= 9, `差 ${c.ans} が 0〜9 の外`);
    assert.ok(c.a >= 1 && c.a <= 10, `引かれる数 ${c.a} が 1〜10 の外`);
  }
  assert.ok(cards.some((c) => c.a === 9 && c.b === 9 && c.ans === 0));
});

test('きいろカード：たしざん（くりあがり あり）は和が 11〜18', () => {
  for (const c of app.makeYellowCards()) {
    assert.ok(c.ans >= 11 && c.ans <= 18, `和 ${c.ans} が 11〜18 の外`);
    assert.ok(c.a >= 1 && c.a <= 9 && c.b >= 1 && c.b <= 9);
  }
});

test('みどりカード：ひきざん（くりさがり あり）は差が 2〜9', () => {
  for (const c of app.makeGreenCards()) {
    assert.ok(c.a >= 11 && c.a <= 18, `引かれる数 ${c.a} が 11〜18 の外`);
    assert.ok(c.ans >= 2 && c.ans <= 9, `差 ${c.ans} が 2〜9 の外`);
  }
});

test('カードに重複が無い', () => {
  for (const make of [app.makeRedCards, app.makeBlueCards, app.makeYellowCards, app.makeGreenCards]) {
    const keys = make().map((c) => `${c.a}${c.op}${c.b}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});

/* --- 学習ログの「設問ID」は ならべかえても 変わらないこと ----------- */
test('factKey は式そのもの（番号や位置に依存しない）', () => {
  assert.equal(app.factKey({ a: 8, op: '+', b: 5 }), '8+5');
  assert.equal(app.factKey({ a: 13, op: '-', b: 9 }), '13-9');
});

/* --- タイム表示 ------------------------------------------------------ */
test('formatTime は m:ss.t の形', () => {
  assert.equal(app.formatTime(0), '0:00.0');
  assert.equal(app.formatTime(1234), '0:01.2');
  assert.equal(app.formatTime(65432), '1:05.4');
  assert.equal(app.formatTime(null), '--:--');
});

/* --- まいにち記録（れんぞく日数）------------------------------------ */
test('advanceDaily：はじめての日は 1日め', () => {
  const d = app.advanceDaily(null);
  assert.equal(d.streak, 1);
  assert.equal(d.bestStreak, 1);
  assert.equal(d.lastDate, app.dateKey());
});

test('advanceDaily：昨日やっていれば つづく', () => {
  const today = app.dateKey();
  const yesterday = app.shiftDateKey(today, -1);
  const d = app.advanceDaily({ streak: 4, bestStreak: 9, lastDate: yesterday, days: {} });
  assert.equal(d.streak, 5);
  assert.equal(d.bestStreak, 9, 'さいこう記録は 上書きしない');
});

test('advanceDaily：1日あくと 1日めに もどる', () => {
  const twoDaysAgo = app.shiftDateKey(app.dateKey(), -2);
  const d = app.advanceDaily({ streak: 7, bestStreak: 7, lastDate: twoDaysAgo, days: {} });
  assert.equal(d.streak, 1);
  assert.equal(d.bestStreak, 7);
});

test('advanceDaily：同じ日に 2回やっても れんぞく日数は増えない', () => {
  const today = app.dateKey();
  const d = app.advanceDaily({ streak: 3, bestStreak: 3, lastDate: today, days: { [today]: 1 } });
  assert.equal(d.streak, 3);
  assert.equal(d.days[today], 2, '回数は増える');
});

test('effectiveStreak：2日 あいたら 0 になる', () => {
  const today = app.dateKey();
  assert.equal(app.effectiveStreak({ streak: 5, lastDate: today }), 5);
  assert.equal(app.effectiveStreak({ streak: 5, lastDate: app.shiftDateKey(today, -1) }), 5);
  assert.equal(app.effectiveStreak({ streak: 5, lastDate: app.shiftDateKey(today, -2) }), 0);
  assert.equal(app.effectiveStreak(null), 0);
});

test('shiftDateKey：月またぎ・年またぎでも 正しい', () => {
  assert.equal(app.shiftDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(app.shiftDateKey('2024-03-01', -1), '2024-02-29', 'うるう年');
  assert.equal(app.shiftDateKey('2026-01-01', -1), '2025-12-31');
});

/* --- 配色（§2-8。ここが崩れると 教室のうしろの席で読めなくなる）----- */
test('カードの面と文字の組み合わせが コントラスト 4.5 以上', () => {
  // Tailwind の実際の値
  const HEX = {
    'bg-rose-600': '#e11d48',
    'bg-sky-700': '#0369a1',
    'bg-amber-400': '#fbbf24',
    'bg-emerald-700': '#047857',
    'text-white': '#ffffff',
    'text-slate-800': '#1e293b',
  };
  const lum = (h) => {
    const c = h
      .slice(1)
      .match(/../g)
      .map((x) => {
        const v = parseInt(x, 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const id of app.DECK_ORDER) {
    const d = app.DECKS[id];
    const bg = HEX[d.bg];
    const fg = HEX[d.frontText];
    assert.ok(bg && fg, `${id}：色の対応表に ${d.bg} / ${d.frontText} が無い（色を変えたら ここも直す）`);
    const r = ratio(bg, fg);
    assert.ok(r >= 4.5, `${id}カード：${d.bg} の上の ${d.frontText} が 比 ${r.toFixed(2)}（4.5 未満）`);
  }
});
