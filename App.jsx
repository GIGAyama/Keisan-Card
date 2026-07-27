/* =====================================================================
 *  けいさんカード（デジタル計算カード）  App.jsx
 *  ---------------------------------------------------------------------
 *  小学1年生の「計算カード」をブラウザだけで再現したアプリです。
 *  ・あかカード（たしざん／くりあがりなし）足される数1〜9・足す数1〜9・和1〜10。
 *                                          1+0〜9+0 もふくむ。
 *  ・あおカード（ひきざん／くりさがりなし）引かれる数1〜10・引く数1〜9・差0〜9。
 *                                          1-1〜9-9 もふくむ。
 *  ・きいろカード（たしざん／くりあがり・和が11〜18）
 *  ・みどりカード（ひきざん／くりさがり）
 *
 *  操作（3つの方法に対応）：
 *   1) カードをタップ → こたえが出る → 左スワイプ＝わかった／右スワイプ＝もういちど
 *   2) こたえを みる／わかった／もういちど のボタン
 *   3) キーボード：スペース／Enter ＝ めくる→わかったで つぎへ（連打で進む）
 *                 ← わかった ／ → もういちど
 *
 *  まちがえたカードは最後にもう一度出題され、ぜんぶ正解するまでの
 *  タイムを自動で計測します。ベストタイム・取り組んだ回数・タイム履歴
 *  に加え、「まいにち つづけたくなる」れんぞく記録・がんばりカレンダー・
 *  スタンプ（成長のきろく）はブラウザに保存されます。
 *
 *  ※ このファイル1つに、すべての画面・ロジック・スタイルが入っています。
 * ===================================================================== */

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// このアプリのバージョン。学習ログ（study.v1）の `appVersion` に入ります。
// ※ 中身を直したら ここと sw.js の VERSION を そろえて 上げてください。
const APP_VERSION = '1.1.0';

// 学習ログでの このアプリの名前（仕様書 §3.1 の予約値。変えないこと）
const STUDY_APP_ID = 'keisan-card';

/* =====================================================================
 *  1. データ：4種類のカードを「計算で」作ります
 * ===================================================================== */

// あか：たしざん（くりあがりなし）。
//   足される数(a)が1〜9・足す数(b)が0〜9で、和が1〜10まで（1+0〜9+0 もふくむ）。
function makeRedCards() {
  const cards = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      if (a + b <= 10) cards.push({ a, b, op: '+', ans: a + b });
    }
  }
  return cards;
}

// あお：ひきざん（くりさがりなし）。
//   引かれる数(a)が1〜10・引く数(b)が1〜9で、差が0〜9まで（1-1〜9-9 もふくむ）。
function makeBlueCards() {
  const cards = [];
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 9; b++) {
      const d = a - b;
      if (d >= 0 && d <= 9) cards.push({ a, b, op: '-', ans: d });
    }
  }
  return cards;
}

// きいろ：たしざん（くりあがり）。足す数・足される数が1〜9で、和が11〜18。
function makeYellowCards() {
  const cards = [];
  for (let a = 1; a <= 9; a++) {
    for (let b = 1; b <= 9; b++) {
      const s = a + b;
      if (s >= 11 && s <= 18) cards.push({ a, b, op: '+', ans: s });
    }
  }
  return cards;
}

// みどり：ひきざん（くりさがり）。引かれる数が11〜18・引く数が2〜9で、差が2〜9。
function makeGreenCards() {
  const cards = [];
  for (let a = 11; a <= 18; a++) {
    for (let b = 2; b <= 9; b++) {
      const d = a - b;
      if (d >= 2 && d <= 9) cards.push({ a, b, op: '-', ans: d });
    }
  }
  return cards;
}

// 4種類のカードの設定。色は実物の計算カードに合わせています。
const DECKS = {
  red: {
    id: 'red',
    name: 'あかカード',
    sub: 'たしざん（くりあがり なし）',
    symbol: '＋',
    make: makeRedCards,
    bg: 'bg-rose-500',
    frontText: 'text-white',
    text: 'text-rose-600',
    border: 'border-rose-200',
    ring: 'ring-rose-400',
    bar: 'bg-rose-500',
    hex: '#f43f5e',
  },
  blue: {
    id: 'blue',
    name: 'あおカード',
    sub: 'ひきざん（くりさがり なし）',
    symbol: '－',
    make: makeBlueCards,
    bg: 'bg-sky-500',
    frontText: 'text-white',
    text: 'text-sky-600',
    border: 'border-sky-200',
    ring: 'ring-sky-400',
    bar: 'bg-sky-500',
    hex: '#0ea5e9',
  },
  yellow: {
    id: 'yellow',
    name: 'きいろカード',
    sub: 'たしざん（くりあがり あり）',
    symbol: '＋',
    make: makeYellowCards,
    bg: 'bg-amber-400',
    frontText: 'text-slate-800', // 黄色は文字を濃くして読みやすく
    text: 'text-amber-600',
    border: 'border-amber-200',
    ring: 'ring-amber-400',
    bar: 'bg-amber-400',
    hex: '#f59e0b',
  },
  green: {
    id: 'green',
    name: 'みどりカード',
    sub: 'ひきざん（くりさがり あり）',
    symbol: '－',
    make: makeGreenCards,
    bg: 'bg-emerald-500',
    frontText: 'text-white',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
    ring: 'ring-emerald-400',
    bar: 'bg-emerald-500',
    hex: '#10b981',
  },
};

const DECK_ORDER = ['red', 'blue', 'yellow', 'green'];

// 各カードの枚数を最初に1回だけ計算（表示用）。
const DECK_COUNTS = DECK_ORDER.reduce((acc, id) => {
  acc[id] = DECKS[id].make().length;
  return acc;
}, {});

/* =====================================================================
 *  2. 小さな便利関数
 * ===================================================================== */

// 配列をシャッフル（バラバラモード用）。Fisher–Yates。
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleIfNeeded(cards, mode) {
  return mode === 'shuffle' ? shuffle(cards) : cards;
}

// 学習ログ用の「設問ID」。式そのものが ID になります（例：8+5／13-9）。
//   ・画面には ＋ － の全角を出しますが、IDは 半角にそろえます
//   ・カードを ならべかえても 変わらない値であることが 大事です
//     （番号や 配列の位置を使うと、過去のデータと つながらなくなります）
function factKey(card) {
  return `${card.a}${card.op}${card.b}`;
}

// ミリ秒を「m:ss.t」の形に整えます（タイム表示用）。
function formatTime(ms) {
  if (ms == null) return '--:--';
  const totalCs = Math.floor(ms / 100); // 1/10秒
  const m = Math.floor(totalCs / 600);
  const s = Math.floor((totalCs % 600) / 10);
  const t = totalCs % 10;
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

/* ---- 日付まわり（れんぞく記録・カレンダー用） ---------------------- */
const pad2 = (n) => String(n).padStart(2, '0');

// ローカル時間での「YYYY-MM-DD」文字列
function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 日付文字列を delta 日ずらした文字列（うるう年・月またぎも自動で正しくなる）
function shiftDateKey(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dateKey(dt);
}

// いま「有効な」れんぞく日数。最後に取り組んだのが今日か昨日なら継続中。
function effectiveStreak(daily) {
  if (!daily || !daily.lastDate) return 0;
  const today = dateKey();
  if (daily.lastDate === today || daily.lastDate === shiftDateKey(today, -1)) {
    return daily.streak || 0;
  }
  return 0; // 1日 あいてしまうと リセット
}

// 1回クリアしたときの「まいにち記録」の進めかた。
//   結果画面の表示・学習ログの `ext.streak` でも 同じ数字を使いたいので、
//   状態を書きかえる処理から 計算だけを 切り出しています。
function advanceDaily(prevDaily) {
  const pd = prevDaily || { streak: 0, bestStreak: 0, lastDate: null, days: {} };
  const today = dateKey();
  const days = { ...(pd.days || {}) };
  const already = !!days[today];
  days[today] = (days[today] || 0) + 1;

  let streak = pd.streak || 0;
  if (!already) {
    if (pd.lastDate === shiftDateKey(today, -1)) streak = streak + 1; // 昨日 → 継続
    else streak = 1; // 初日、または あいてしまった → やり直し
  }
  const bestStreak = Math.max(pd.bestStreak || 0, streak);
  return { streak, bestStreak, lastDate: today, days };
}

/* ---- 学習ログ（study.v1）------------------------------------------- *
 *  共通スキーマのレコードを組み立てて studyLog.js に わたします。
 *  ・保存だけで、外から見えるところへは 送りません（仕様 §0-1）
 *  ・氏名・出席番号など 児童を見わけられる情報は 入れません（仕様 §0-2）
 *  ・主指標は `summary.firstTryCorrect`（1回目で正解した枚数）。
 *    このアプリは 全部 正解するまで 終わらないため `correct` は
 *    いつも `count` と同じになり、指標になりません（仕様 §3.4）。
 * -------------------------------------------------------------------- */
function saveStudySession({ deckId, mode, res, isBest, bestMs, streak }) {
  const save = window.StudyLog && window.StudyLog.saveStudyRecord;
  if (typeof save !== 'function') return null; // studyLog.js が無くても アプリは動く
  const deck = DECKS[deckId];
  if (!deck || !mode || !res) return null;

  const count = res.count || 0;
  const attempted = res.attempted || 0;

  return save({
    appId: STUDY_APP_ID,
    appVersion: APP_VERSION,
    kind: 'session',
    mode, // 'order'（じゅんばん）／'shuffle'（バラバラ）
    unit: { id: deckId, title: deck.name, grade: 1, preset: true },
    source: 'course', // このアプリは 組み込みのカードだけ
    multiplayer: false,
    grading: 'objective',
    startedAt: res.startedAt,
    endedAt: res.endedAt,
    elapsedMs: res.time,
    activeMs: res.activeMs,
    timeBasis: 'app',
    status: res.status || 'completed',
    summary: {
      count,
      attempted,
      firstTryCorrect: res.firstTryCorrect || 0,
      correct: res.correct || 0,
    },
    items: res.items,
    ext: {
      mistakes: res.mistakes || 0,
      bestTimeMs: bestMs == null ? null : bestMs,
      isBest: !!isBest,
      msPerCard: attempted ? Math.round(res.time / attempted) : null,
      wrongCards: res.wrongCards || [],
      streak: streak || 0,
    },
  });
}

/* =====================================================================
 *  3. 効果音（ファイル不要。Web Audio でその場で鳴らす）
 * ===================================================================== */
const Sound = (() => {
  let ctx = null;
  function ac() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(freq, start, dur, type = 'sine', gain = 0.14) {
    const c = ac();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t0 = c.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  return {
    correct() {
      tone(880, 0, 0.12, 'triangle', 0.16);
      tone(1320, 0.07, 0.14, 'triangle', 0.14);
    },
    wrong() {
      tone(320, 0, 0.18, 'sine', 0.14);
    },
    clear() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.22, 'triangle', 0.15));
    },
  };
})();

function vibrate(pattern) {
  try {
    navigator.vibrate && navigator.vibrate(pattern);
  } catch (e) {
    /* 未対応でもOK */
  }
}

/* --- PWA（アプリとしてインストール）まわりの こまごました判定 --- */

// すでに「アプリ」として ひらいているか（インストール ずみ）
function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  try {
    const mm = window.matchMedia;
    if (
      mm &&
      (mm('(display-mode: standalone)').matches ||
        mm('(display-mode: fullscreen)').matches ||
        mm('(display-mode: minimal-ui)').matches)
    ) {
      return true;
    }
  } catch (e) {
    /* 未対応でもOK */
  }
  return !!navigator.standalone; // iOS（Safari）用
}

// 端末の種類（インストール手順の 案内を出しわけるため）
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  // iPad は「Macintosh」を名のるので、タッチの有無でも見わけます
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/CrOS/.test(ua)) return 'chromebook'; // Chromebook（ChromeOS）
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/* =====================================================================
 *  4. アイコン（絵文字のかわりに、シンプルな線画SVGを使います）
 * ===================================================================== */
function Icon({ path, size = 22, className = '', fill = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
const ICON = {
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  arrowLeft: (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>
  ),
  arrowRight: (
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </>
  ),
  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  shuffle: (
    <>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </>
  ),
  home: (
    <>
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  replay: (
    <>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </>
  ),
  play: <polygon points="6 4 20 12 6 20 6 4" />,
  chart: (
    <>
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="5" y="11" width="3.4" height="8" rx="0.8" />
      <rect x="10.3" y="7" width="3.4" height="12" rx="0.8" />
      <rect x="15.6" y="13" width="3.4" height="6" rx="0.8" />
    </>
  ),
  star: <polygon points="12 2.5 15 9 22 9.7 16.8 14.4 18.4 21.3 12 17.6 5.6 21.3 7.2 14.4 2 9.7 9 9" />,
  trophy: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="5" y1="21" x2="19" y2="21" />
    </>
  ),
  volume: (
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  volumeOff: (
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </>
  ),
};

/* =====================================================================
 *  5. カスタムフック（ロジックを部品にして、UIと切り離します）
 * ===================================================================== */

// 5-1. LocalStorage に値を保存・復元するフック
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initialValue;
    } catch (e) {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* 保存できなくてもアプリは動き続けます */
    }
  }, [key, value]);

  return [value, setValue];
}

// 5-2. カードの山（デッキ）を管理するフック
function useCardDeck(deckId, mode) {
  const buildQueue = useCallback(() => {
    const base = DECKS[deckId].make();
    const ordered = mode === 'shuffle' ? shuffle(base) : base;
    return ordered.map((c, i) => ({ ...c, key: `${deckId}-${i}` }));
  }, [deckId, mode]);

  const [queue, setQueue] = useState(buildQueue);      // これから出すカード
  const [retry, setRetry] = useState([]);              // まちがえて後回しにしたカード
  const [done, setDone] = useState(0);                 // 正解した枚数
  const [mistakes, setMistakes] = useState(0);         // まちがえた回数（合計）
  const totalRef = useRef(queue.length);               // もとの枚数

  /* ---- 学習ログ用の記録 -------------------------------------------- *
   *  画面には出さない（描きなおしに関係しない）ので ref に ためます。
   *  ・cardsRef     … カードごとの { 設問ID・こたえた回数・かかった時間・正解したか }
   *  ・wrongOnceRef … 一度でも まちがえたカードの key
   *      ※ 主指標 firstTryCorrect は「ミス回数の合計」から引いてはいけません。
   *        同じカードを 2回 まちがえると 二重に引かれてしまうためです（仕様 §2.7）。
   *        まちがえた「カード」を Set に入れ、その個数を使います。
   *  ・shownAtRef   … いま出ているカードを 出した時刻（1枚あたりの時間を計る）
   * ------------------------------------------------------------------ */
  const cardsRef = useRef(new Map());
  const wrongOnceRef = useRef(new Set());
  const shownAtRef = useRef(Date.now());
  const mistakesRef = useRef(0);

  const current = queue[0] || null;
  // まちがえた山（retry）が残っているうちは「終わり」ではありません。
  const isFinished = queue.length === 0 && retry.length === 0;

  // いま出ているカードを ref にも持っておく（setState を入れ子にしないため）
  const currentRef = useRef(current);
  currentRef.current = current;

  // こたえたカードの記録をつける（○×どちらでも通る）
  const stamp = useCallback((card) => {
    const now = Date.now();
    let e = cardsRef.current.get(card.key);
    if (!e) {
      e = { q: factKey(card), tries: 0, ms: 0, ok: false };
      cardsRef.current.set(card.key, e);
    }
    e.tries += 1;
    e.ms += Math.max(0, now - shownAtRef.current);
    shownAtRef.current = now;
    return e;
  }, []);

  // 「わかった」：次のカードへ
  const markCorrect = useCallback(() => {
    const c = currentRef.current;
    if (!c) return;
    stamp(c).ok = true;
    setQueue((q) => q.slice(1));
    setDone((d) => d + 1);
  }, [stamp]);

  // 「まちがい」：このカードを山の最後（retry）へ回す
  const markWrong = useCallback(() => {
    const c = currentRef.current;
    if (!c) return;
    stamp(c).ok = false;
    wrongOnceRef.current.add(c.key);
    mistakesRef.current += 1;
    setQueue((q) => q.slice(1));
    setRetry((r) => [...r, c]);
    setMistakes((m) => m + 1);
  }, [stamp]);

  // 学習ログ用の集計。完走のときも 中断のときも これを使います。
  //   まだ1回も出していないカードは items に入れません
  //   （中断したときに「解いていない問題」を 正解あつかいしないため）。
  const collect = useCallback(() => {
    const items = [];
    const wrongCards = [];
    let firstTryCorrect = 0;
    let correct = 0;
    cardsRef.current.forEach((e, key) => {
      const firstTry = !wrongOnceRef.current.has(key);
      if (firstTry) firstTryCorrect += 1;
      if (e.ok) correct += 1;
      if (!firstTry) wrongCards.push(e.q);
      items.push({
        q: e.q,
        ok: e.ok,
        firstTry,
        tries: e.tries,
        ms: Math.round(e.ms),
      });
    });
    return {
      count: totalRef.current,
      attempted: cardsRef.current.size,
      firstTryCorrect,
      correct,
      mistakes: mistakesRef.current,
      items,
      wrongCards,
    };
  }, []);

  // いまの山が空になったら、まちがえた山を合流（＝もう一度出題）
  useEffect(() => {
    if (queue.length === 0 && retry.length > 0) {
      setQueue(shuffleIfNeeded(retry, mode));
      setRetry([]);
    }
  }, [queue.length, retry, mode]);

  return {
    current,
    isFinished,
    total: totalRef.current,
    done,
    mistakes,
    remaining: queue.length + retry.length,
    markCorrect,
    markWrong,
    collect,
  };
}

// 5-2b. じっさいに 操作していた時間（activeMs）を計るフック（仕様 §2.8）
//   ・タブが 見えていない あいだは 数えません
//   ・60秒 なにも 操作がないと 止まり、つぎに さわったら また 数えはじめます
//   elapsedMs（はじめから おわりまで）との 差が大きい児童は、
//   集中が とぎれている かもしれない、という指導の手がかりになります。
function useActiveTime() {
  const ref = useRef(null);
  if (!ref.current) {
    const s = { ms: 0, mark: Date.now(), last: Date.now() };
    // いまの瞬間までを 足しこむ。数えるのは
    // 「タブが見えていて、かつ 60秒いないに 操作があった」あいだだけ。
    s.tick = () => {
      const now = Date.now();
      if (!document.hidden && now - s.last <= 60000) s.ms += now - s.mark;
      s.mark = now;
    };
    ref.current = s;
  }

  useEffect(() => {
    const s = ref.current;
    const wake = () => {
      s.tick();
      s.last = Date.now();
    };
    const EVENTS = ['click', 'keydown', 'touchstart', 'pointerdown'];
    const timer = window.setInterval(s.tick, 1000);
    document.addEventListener('visibilitychange', s.tick);
    EVENTS.forEach((ev) => document.addEventListener(ev, wake, true));
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', s.tick);
      EVENTS.forEach((ev) => document.removeEventListener(ev, wake, true));
    };
  }, []);

  // いままでの activeMs（ミリ秒）を返します
  return useCallback(() => {
    const s = ref.current;
    s.tick();
    return Math.round(s.ms);
  }, []);
}

// 5-3. スワイプ操作のフック（指でもマウスでも動きます）
//   左へ → onLeft（わかった）／右へ → onRight（もういちど）
function useSwipe({ enabled, onLeft, onRight }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const active = useRef(false);
  const THRESHOLD = 96;

  const onPointerDown = (e) => {
    if (!enabled) return;
    active.current = true;
    setDragging(true);
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!active.current) return;
    setDx(e.clientX - startX.current);
  };
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    setDragging(false);
    setDx((cur) => {
      if (cur <= -THRESHOLD) onLeft?.();
      else if (cur >= THRESHOLD) onRight?.();
      return 0;
    });
  };

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    onPointerLeave: finish,
  };
  return { dx, dragging, handlers, threshold: THRESHOLD };
}

// 5-4. 端末の「もどる」操作を アプリの「1つ前の階層へ」にむすびつけるフック
//   （スマホ・タブレット）
//     ・画面下の ナビゲーションバーの「もどる」ボタン
//     ・画面の左右のふちから 中央へ スワイプ（ジェスチャー操作）
//   （パソコン）
//     ・ブラウザの「戻る」ボタン／Alt＋←  も 同じように はたらきます
//
//   しくみ：
//     ブラウザの履歴に「見張り」を いくつか 積んでおきます。
//     端末の「もどる」は、この見張りを 1つ 取りのぞくだけなので、
//     ・前のサイトへ 移動してしまう（ブラウザの戻る）
//     ・アプリが 終了してしまう
//     ということが おきません。
//     見張りが取りのぞかれたら（popstate）、アプリの中で 1つ前の画面へ もどし、
//     すぐに 見張りを 積みなおして、つぎの「もどる」にも そなえます。
//     （見張りを 何枚か かさねておくのは、「もどる」を 何回も 続けて
//       すばやく 操作されたときにも、切れ目なく うけとめるためです）
//
//   いちばん上（タイトル画面）で「もどる」をしたときは すぐには閉じず、
//   「もう1かいで とじます」と おしらせします。つづけて もう1かい 操作した
//   ときだけ、ふつうの「戻る」（前のページへ）を おこないます。
//
//   引数 onBack … アプリの中で 1つ前へ もどす関数。
//                 もどれたら true／いちばん上で もどれなければ false を返します。
//   戻り値      … 「もう1かいで とじます」を 表示するかどうか（true/false）
const BACK_GUARDS = 3; // 積んでおく見張りの枚数

function useSystemBack(onBack) {
  const [askExit, setAskExit] = useState(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history || !window.history.pushState) return;

    let askExitNow = false; // タイトル画面で 1回目の「もどる」を うけたか
    let timer = 0;

    // いま 何枚の見張りの上にいるか（0＝見張りなし＝アプリを開いたときの位置）
    const guardLevel = () => {
      const st = window.history.state;
      return st && st.kcBackGuard ? st.kcBackGuard : 0;
    };

    // 見張りを 決めた枚数まで 積みたす
    const fillGuards = () => {
      try {
        let level = guardLevel();
        while (level < BACK_GUARDS) {
          level += 1;
          window.history.pushState({ kcBackGuard: level }, '');
        }
      } catch (e) {
        /* 使えない環境でも アプリは ふつうに動きます */
      }
    };

    const clearAsk = () => {
      askExitNow = false;
      setAskExit(false);
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
    };

    // さいしょの見張りは「画面に さわってから」積みます。
    //   さわる前に積むと、ブラウザに「かってな履歴」とみなされて
    //   とばされる（無視される）ことがあるためです。
    const armOnce = () => {
      window.removeEventListener('pointerdown', armOnce, true);
      window.removeEventListener('keydown', armOnce, true);
      fillGuards();
    };
    window.addEventListener('pointerdown', armOnce, true);
    window.addEventListener('keydown', armOnce, true);

    const onPop = () => {
      // 1) アプリの中で もどれるとき … 1つ前の階層へ
      if (onBackRef.current()) {
        clearAsk();
        fillGuards();
        return;
      }
      // 2) いちばん上の画面 … 1回目は 閉じずに おしらせ
      if (!askExitNow) {
        askExitNow = true;
        setAskExit(true);
        timer = window.setTimeout(clearAsk, 2500);
        fillGuards();
        return;
      }
      // 3) つづけて もう1かい … ふつうの「戻る」（前のページへ／アプリを とじる）
      //    のこっている見張りの ぶんだけ まとめて もどります。
      clearAsk();
      try {
        window.history.go(-(guardLevel() + 1));
      } catch (e) {
        /* もどれなくても つづけて つかえます */
      }
      // 前のページが 無くて もどれなかったときのために、見張りを積みなおす
      window.setTimeout(fillGuards, 600);
    };

    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pointerdown', armOnce, true);
      window.removeEventListener('keydown', armOnce, true);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return askExit;
}

/* =====================================================================
 *  6. 画面の部品（コンポーネント）
 * ===================================================================== */

// アプリのロゴマーク（4色のカードを表す 2×2 のタイル）
function Logo({ size = 28 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" rx="2.6" fill="#f43f5e" />
      <rect x="13" y="2" width="9" height="9" rx="2.6" fill="#0ea5e9" />
      <rect x="2" y="13" width="9" height="9" rx="2.6" fill="#f59e0b" />
      <rect x="13" y="13" width="9" height="9" rx="2.6" fill="#10b981" />
    </svg>
  );
}

// 6-1. ヘッダー
function Header({ onHome, onOpenSettings }) {
  return (
    <nav className="safe-top bg-white border-b-4 border-amber-500 px-4 sm:px-6 py-2.5 flex justify-between items-center shadow-sm z-10 shrink-0">
      <button
        onClick={onHome}
        className="flex items-center gap-2.5 transition-all active:scale-95"
        title="さいしょの がめんに もどる"
      >
        <Logo size={26} />
        <span className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">
          けいさんカード
        </span>
      </button>
      <button
        onClick={onOpenSettings}
        className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all active:scale-95"
        title="せってい"
        aria-label="せってい"
      >
        <Icon path={ICON.gear} size={22} />
      </button>
    </nav>
  );
}

// 6-2. フッター
function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="safe-bottom w-full bg-white border-t border-slate-200 pt-3 pb-2 text-center text-sm text-slate-500 font-bold shadow-sm shrink-0">
      © {year} けいさんカード{' '}
      <a
        href="https://note.com/cute_borage86"
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-600 hover:text-amber-700 underline underline-offset-2 transition-all active:scale-95 inline-block"
      >
        GIGA山
      </a>
    </footer>
  );
}

// 共通：白いカードのプライマリボタン
function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-bold text-white px-7 py-3.5 rounded-xl shadow-sm hover:shadow transition-all active:scale-95 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// れんぞく日数の チップ（🔥 ○にち れんぞく）
function StreakChip({ streak, className = '' }) {
  if (!streak || streak < 2) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-3 py-1 ${className}`}
    >
      <Icon path={ICON.flame} size={16} fill />
      {streak}にち れんぞく
    </span>
  );
}

// 6-3. タイトル画面
function TitleScreen({ onStart, onRecords, daily, totalStamps, showInstall, onInstall }) {
  const streak = effectiveStreak(daily);
  const doneToday = !!(daily && daily.days && daily.days[dateKey()]);
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center overflow-auto py-6">
      <div className="animate-rise">
        <Logo size={72} />
      </div>
      <h1 className="mt-6 text-4xl sm:text-5xl font-black text-slate-800 tracking-tight animate-rise">
        けいさんカード
      </h1>

      {/* 今日のようす（まいにち つづけたくなる ひとこと） */}
      <div className="mt-4 min-h-[2rem] flex flex-wrap items-center justify-center gap-2 animate-rise">
        {streak >= 2 && <StreakChip streak={streak} />}
        {totalStamps > 0 && (
          <span className="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            <Icon path={ICON.star} size={16} fill />
            スタンプ {totalStamps}こ
          </span>
        )}
      </div>

      <p className="mt-3 text-slate-500 text-base sm:text-lg leading-relaxed animate-rise">
        {doneToday ? (
          <>
            きょうも できたね！ えらい！<br />
            もう1かい やってみる？
          </>
        ) : (
          <>
            けいさんカードを めくって、すらすら こたえよう。<br />
            まいにち つづけると、タイムが どんどん はやくなるよ。
          </>
        )}
      </p>

      <PrimaryButton
        onClick={onStart}
        className="mt-8 bg-amber-500 hover:bg-amber-600 text-lg sm:text-xl px-10 py-4 animate-pop"
      >
        <Icon path={ICON.play} size={20} fill />
        はじめる
      </PrimaryButton>

      <button
        onClick={onRecords}
        className="mt-4 inline-flex items-center gap-2 font-bold text-slate-600 bg-white border border-slate-200 px-6 py-3 rounded-xl shadow-sm hover:shadow transition-all active:scale-95 animate-pop"
      >
        <Icon path={ICON.chart} size={18} />
        せいちょうの きろく
      </button>

      {/* すでにアプリとして ひらいているとき以外は いつでも出します。
          Chrome から すぐインストールできないときは、やり方の案内を出します。 */}
      {showInstall && (
        <button
          onClick={onInstall}
          className="mt-3 inline-flex items-center gap-2 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-5 py-2.5 rounded-xl shadow-sm hover:shadow transition-all active:scale-95 animate-pop"
        >
          <Icon path={ICON.download} size={18} />
          アプリとして インストール
        </button>
      )}
    </div>
  );
}

// カードの色チップ（＋／− の記号入り）
function DeckSwatch({ deck, size = 'w-14 h-14 text-3xl' }) {
  return (
    <div
      className={`${size} ${deck.bg} ${deck.frontText} rounded-xl flex items-center justify-center font-textbook font-bold shrink-0 shadow-sm`}
    >
      {deck.symbol}
    </div>
  );
}

// 6-4. カードの色をえらぶ画面
function SelectScreen({ onPick, bestTimes }) {
  return (
    <div className="flex-1 flex flex-col items-center px-4 py-8 overflow-auto">
      <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">カードを えらぶ</h2>
      <p className="text-slate-500 mt-2 mb-7 text-sm sm:text-base">
        れんしゅうしたい いろの カードを えらんでください。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl">
        {DECK_ORDER.map((id) => {
          const d = DECKS[id];
          const best = minBest(bestTimes[id]);
          return (
            <button
              key={id}
              onClick={() => onPick(id)}
              className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 p-4 sm:p-5 flex items-center gap-4 text-left transition-all active:scale-95"
            >
              <DeckSwatch deck={d} />
              <div className="min-w-0">
                <div className="text-lg font-bold text-slate-800">{d.name}</div>
                <div className="text-sm text-slate-500 truncate">{d.sub}</div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                  <span>{DECK_COUNTS[id]}もん</span>
                  {best != null && (
                    <span className={`inline-flex items-center gap-1 font-bold ${d.text}`}>
                      <Icon path={ICON.trophy} size={13} />
                      {formatTime(best)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ベスト記録の中から一番速いものを取り出します。
function minBest(best) {
  const vals = Object.values(best || {}).filter((v) => typeof v === 'number');
  return vals.length ? Math.min(...vals) : null;
}

// 6-5. モードをえらぶ画面（順番／バラバラ）
function ModeScreen({ deckId, onPick, onBack, bestTimes }) {
  const d = DECKS[deckId];
  const best = bestTimes[deckId] || {};
  const modes = [
    {
      id: 'order',
      title: 'じゅんばん',
      icon: ICON.list,
      desc: 'ちいさい じゅんに でます。\nまずは これで れんしゅう。',
      best: best.order,
    },
    {
      id: 'shuffle',
      title: 'バラバラ',
      icon: ICON.shuffle,
      desc: 'じゅんばんが バラバラに でます。\nすらすら いえるかな。',
      best: best.shuffle,
    },
  ];
  return (
    <div className="flex-1 flex flex-col items-center px-4 py-8 overflow-auto">
      <div className="flex items-center gap-3">
        <DeckSwatch deck={d} size="w-11 h-11 text-2xl" />
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">{d.name}</h2>
      </div>
      <p className="text-slate-500 mt-2 mb-7 text-sm sm:text-base">モードを えらんでください。</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 p-6 flex flex-col items-center text-center transition-all active:scale-95"
          >
            <div className={`w-12 h-12 rounded-xl ${d.bg} ${d.frontText} flex items-center justify-center mb-3`}>
              <Icon path={m.icon} size={24} />
            </div>
            <div className="text-xl font-bold text-slate-800 mb-1">{m.title}</div>
            <div className="text-sm text-slate-500 whitespace-pre-line leading-relaxed">{m.desc}</div>
            {m.best != null && (
              <div className={`mt-3 inline-flex items-center gap-1 text-sm font-bold ${d.text}`}>
                <Icon path={ICON.trophy} size={14} />
                ベスト {formatTime(m.best)}
              </div>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        className="mt-8 inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-5 py-2.5 rounded-xl shadow-sm transition-all active:scale-95"
      >
        <Icon path={ICON.arrowLeft} size={18} />
        カードを えらびなおす
      </button>
    </div>
  );
}

// 6-6. うごく タイマー表示（この部品だけが 毎フレーム 更新されます）
//   ※ 画面ぜんたいの 再描画を さけて、なめらか・省エネにするための工夫。
function LiveTimer({ startRef, className = '' }) {
  const [, forceRender] = useState(0);
  useEffect(() => {
    let id = 0;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      forceRender((n) => (n + 1) % 1000000);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, []);
  return <span className={className}>{formatTime(Date.now() - startRef.current)}</span>;
}

// 6-7. 1枚のフラッシュカード（おもて＝式だけ／うら＝答えだけ）
//   画面いっぱいに大きく表示。文字は clamp() で端末サイズに合わせて自動調整。
function FlashCard({ card, deck, revealed, onReveal, onLeft, onRight }) {
  const swipe = useSwipe({ enabled: revealed, onLeft, onRight });

  // どちらに仕分けようとしているかを ラベルで見せます（九九マスターと同じしくみ）。
  //   左＝✓わかった／右＝✕もういちど
  //   40px より動かしたら表示（ただのタップやわずかな指のブレでは出さない）
  const SHOW_AT = 40;
  const showLeft = swipe.dx <= -SHOW_AT;
  const showRight = swipe.dx >= SHOW_AT;

  const rotate = swipe.dx / 22;
  const style = {
    transform: `translateX(${swipe.dx}px) rotate(${rotate}deg)`,
    transition: swipe.dragging ? 'none' : 'transform 0.3s cubic-bezier(.2,.8,.2,1)',
  };

  const expr = `${card.a} ${card.op === '+' ? '＋' : '－'} ${card.b}`;

  return (
    <div className="relative w-full h-full max-w-3xl flex items-center justify-center no-select">
      {/* スワイプ方向のラベル（カードとは別に、りょうわきへ置いておきます）
          左へ動かしている＝✓わかった／右へ動かしている＝✕もういちど */}
      <div
        className={`swipe-label swipe-label-left bg-emerald-500 ${showLeft ? 'is-shown' : ''}`}
        aria-hidden="true"
      >
        <Icon path={ICON.check} size={22} />
        わかった
      </div>
      <div
        className={`swipe-label swipe-label-right bg-rose-500 ${showRight ? 'is-shown' : ''}`}
        aria-hidden="true"
      >
        <Icon path={ICON.close} size={22} />
        もういちど
      </div>

      {/* カード本体（利用できる高さ・幅いっぱいに大きく） */}
      <div
        className="relative flip-perspective w-full h-full max-w-2xl z-10"
        style={style}
        {...swipe.handlers}
        onClick={() => {
          if (Math.abs(swipe.dx) < 6 && !revealed) onReveal();
        }}
      >
        <div className={`flip-inner relative w-full h-full ${revealed ? 'is-flipped' : ''}`}>
          {/* おもて：しき だけ */}
          <div
            className={`flip-face absolute inset-0 rounded-3xl shadow-lg ${deck.bg} flex items-center justify-center cursor-pointer p-4`}
          >
            <div
              className={`font-textbook ${deck.frontText} font-bold tracking-wide leading-none`}
              style={{ fontSize: 'clamp(2.75rem, 13vmin, 8rem)' }}
            >
              {expr}
            </div>
          </div>
          {/* うら：こたえ だけ */}
          <div
            className={`flip-face flip-back absolute inset-0 rounded-3xl shadow-lg bg-white border ${deck.border} flex items-center justify-center p-4`}
          >
            <div
              className={`font-textbook ${deck.text} font-bold leading-none`}
              style={{ fontSize: 'clamp(3.5rem, 18vmin, 11rem)' }}
            >
              {card.ans}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 6-8. あそんでいる画面（カード＋タイマー＋すすみ具合）
function PlayScreen({ deckId, mode, effectsOn, reportRef, onFinish, onBack }) {
  const game = useCardDeck(deckId, mode);
  const getActiveMs = useActiveTime();
  const [revealed, setRevealed] = useState(false);
  const d = DECKS[deckId];

  // このプレイの開始時刻（マウント時に確定。もう一度のときは key で作り直される）
  const startRef = useRef(Date.now());
  // 学習ログ用の開始時刻。タイムの計測（上の startRef）とは別に、
  // ISO 8601（タイムゾーンつき）の文字列で 持っておきます（仕様 §2.2）。
  const startedAtRef = useRef(new Date().toISOString());
  const finishedRef = useRef(false);

  // カードが変わったら、おもて向きに戻す
  useEffect(() => {
    setRevealed(false);
  }, [game.current && game.current.key, game.remaining]);

  // 学習ログ用の「このプレイの記録」をつくります。
  //   status … 'completed'（ぜんぶ終わった）／'aborted'（とちゅうで やめた）
  const buildReport = useCallback(
    (status) => {
      const endedAt = Date.now();
      const elapsedMs = Math.max(0, endedAt - startRef.current);
      return {
        status,
        time: elapsedMs,
        startedAt: startedAtRef.current,
        endedAt: new Date(endedAt).toISOString(),
        // activeMs は「はじめから おわりまで」を こえません。
        //   計りはじめの ずれで 1ミリ秒ほど 上まわることがあるので そろえます。
        activeMs: Math.min(getActiveMs(), elapsedMs),
        total: game.total, // 結果画面で つかう名前（= summary.count）
        ...game.collect(),
      };
    },
    [game.total, game.collect, getActiveMs]
  );

  // とちゅうで やめたときも 記録できるよう、司令塔（MainBoard）から
  // 呼べるところに 置いておきます（仕様 §5.4）。
  useEffect(() => {
    if (!reportRef) return undefined;
    reportRef.current = buildReport;
    return () => {
      if (reportRef.current === buildReport) reportRef.current = null;
    };
  }, [reportRef, buildReport]);

  // ぜんぶ終わったら結果へ（1回だけ）
  useEffect(() => {
    if (game.isFinished && !finishedRef.current) {
      finishedRef.current = true;
      // 完走したので、このあと「中断」として 記録されないようにします
      if (reportRef) reportRef.current = null;
      if (effectsOn) {
        Sound.clear();
        vibrate([14, 30, 14, 30, 26]);
      }
      onFinish(buildReport('completed'));
    }
    // eslint-disable-next-line
  }, [game.isFinished]);

  const handleCorrect = useCallback(() => {
    if (!revealed) return;
    if (effectsOn) {
      Sound.correct();
      vibrate(12);
    }
    setRevealed(false);
    game.markCorrect();
  }, [revealed, game, effectsOn]);

  const handleWrong = useCallback(() => {
    if (!revealed) return;
    if (effectsOn) {
      Sound.wrong();
      vibrate([10, 40, 10]);
    }
    setRevealed(false);
    game.markWrong();
  }, [revealed, game, effectsOn]);

  // キーボード操作：
  //   スペース／Enter … おもて＝めくる、うら＝わかったで つぎへ（連打で進む）
  //   ← わかった ／ → もういちど（うら向きのとき）
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return; // 押しっぱなしでは進めない（連打のみ）
      const isAdvance = e.code === 'Space' || e.key === 'Enter';
      if (!revealed) {
        if (isAdvance || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          setRevealed(true);
        }
      } else {
        if (e.key === 'ArrowLeft' || isAdvance) {
          e.preventDefault();
          handleCorrect();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleWrong();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, handleCorrect, handleWrong]);

  const progress = game.total ? Math.round((game.done / game.total) * 100) : 0;

  if (game.isFinished) {
    return <div className="flex-1" />;
  }

  return (
    <div className="flex-1 flex flex-col px-3 sm:px-4 pt-3 pb-2 min-h-0">
      {/* じょうほうバー */}
      <div className="w-full max-w-2xl mx-auto shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm transition-all active:scale-95"
          >
            <Icon path={ICON.arrowLeft} size={16} />
            やめる
          </button>

          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-1.5 rounded-xl shadow-sm">
            <span className="text-slate-400">
              <Icon path={ICON.clock} size={18} />
            </span>
            <LiveTimer
              startRef={startRef}
              className="play-timer text-2xl sm:text-3xl font-bold text-slate-800 tabular-nums"
            />
          </div>

          <div className="text-sm text-slate-500 bg-white border border-slate-200 px-3 py-2 rounded-lg shadow-sm">
            のこり <span className="font-bold text-slate-800">{game.remaining}</span>
          </div>
        </div>

        {/* すすみ具合バー */}
        <div className="mt-3 w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${d.bar} transition-all duration-300 rounded-full`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="play-cap mt-1.5 text-center text-xs text-slate-400">
          {game.done} / {game.total} もん せいかい
          {game.mistakes > 0 && <span className="ml-2 text-rose-400">まちがい {game.mistakes}</span>}
        </div>
      </div>

      {/* カード（残りの高さいっぱいに広げる） */}
      <div className="play-cardarea flex-1 flex items-center justify-center py-3 min-h-0">
        {game.current && (
          <FlashCard
            key={game.current.key + '-' + game.remaining}
            card={game.current}
            deck={d}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onLeft={handleCorrect}
            onRight={handleWrong}
          />
        )}
      </div>

      {/* 操作ボタン＋キーボードの案内 */}
      <div className="w-full max-w-2xl mx-auto shrink-0">
        <div className="flex items-center justify-center gap-3">
          {!revealed ? (
            <PrimaryButton
              onClick={() => setRevealed(true)}
              className={`${d.bg} text-lg px-10`}
            >
              こたえを みる
            </PrimaryButton>
          ) : (
            <>
              <PrimaryButton onClick={handleCorrect} className="bg-emerald-500 hover:bg-emerald-600 px-8">
                <Icon path={ICON.check} size={20} />
                わかった
              </PrimaryButton>
              <PrimaryButton onClick={handleWrong} className="bg-rose-500 hover:bg-rose-600 px-8">
                <Icon path={ICON.close} size={20} />
                もういちど
              </PrimaryButton>
            </>
          )}
        </div>
        <p className="play-hint mt-2.5 text-center text-xs text-slate-400">
          {revealed
            ? 'スペース／Enterで わかった → つぎへ（← わかった ／ もういちど →）'
            : 'カードを タップ／スペース・Enterで こたえ（れんだでどんどんすすむ）'}
        </p>
      </div>
    </div>
  );
}

// 6-9. 紙ふぶき（クリアの お祝い）
function Confetti({ count = 40 }) {
  const colors = ['#f43f5e', '#0ea5e9', '#f59e0b', '#10b981', '#a855f7'];
  const pieces = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 2.2 + Math.random() * 1.6,
      color: colors[i % colors.length],
      size: 7 + Math.random() * 7,
      round: Math.random() > 0.5,
    }));
    // eslint-disable-next-line
  }, [count]);
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-40" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 1.3}px`,
            background: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

// 6-10. 結果画面
const PRAISE = [
  'すごい！',
  'よくできました！',
  'てんさい！',
  'やったね！',
  'その ちょうし！',
  'かんぺき！',
  'ぐんぐん せいちょうちゅう！',
];

function ResultScreen({ deckId, mode, result, isBest, best, streak, totalStamps, onRetry, onChangeMode, onHome }) {
  const d = DECKS[deckId];
  const modeName = mode === 'shuffle' ? 'バラバラ' : 'じゅんばん';
  // ほめ言葉は1回のクリアにつき ひとつ固定（再描画で変わらないように）
  const praise = useMemo(
    () => (isBest ? 'しんきろく！ すごい！' : PRAISE[Math.floor(Math.random() * PRAISE.length)]),
    [result, isBest]
  );
  const perfect = result.mistakes === 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center overflow-auto">
      <Confetti count={isBest ? 56 : 36} />

      {isBest && (
        <div className={`inline-flex items-center gap-1.5 ${d.text} font-bold mb-3 animate-rise`}>
          <Icon path={ICON.trophy} size={18} />
          しんきろく
        </div>
      )}
      <h2 className="text-3xl sm:text-4xl font-black text-slate-800 animate-rise">{praise}</h2>
      <div className="text-slate-500 mt-2 mb-4">
        {d.name}・{modeName}モード
      </div>

      {/* もらえた ごほうび（スタンプ・れんぞく） */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2 animate-pop">
        <span className="inline-flex items-center gap-1 font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
          <Icon path={ICON.star} size={16} fill />
          スタンプ +1（ぜんぶで {totalStamps}こ）
        </span>
        {streak >= 2 && <StreakChip streak={streak} />}
        {perfect && (
          <span className="inline-flex items-center gap-1 font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
            <Icon path={ICON.check} size={16} />
            ぜんもん せいかい
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 w-full max-w-sm animate-pop">
        <div className="text-slate-400 text-sm">クリアタイム</div>
        <div className={`mt-1 text-6xl font-black ${d.text} tabular-nums`}>
          {formatTime(result.time)}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-slate-700 border-t border-slate-100 pt-5">
          <div>
            <div className="text-xs text-slate-400">もんだい</div>
            <div className="text-xl font-bold tabular-nums">{result.total}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">まちがい</div>
            <div className="text-xl font-bold tabular-nums">{result.mistakes}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">ベスト</div>
            <div className="text-xl font-bold tabular-nums">{formatTime(best)}</div>
          </div>
        </div>

        {/* 1かいめで せいかいした まいすう。
            このアプリは ぜんぶ 正解するまで 終わらないので、
            「何回で 正解したか」ではなく「一発で 何枚 いけたか」が
            じつりょくの めやすになります。 */}
        {Number.isFinite(result.firstTryCorrect) && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-2">
            <span className="text-xs text-slate-400">1かいめで せいかい</span>
            <span className="text-xl font-bold text-slate-700 tabular-nums">
              {result.firstTryCorrect}
              <span className="text-sm text-slate-400"> / {result.total}</span>
            </span>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <PrimaryButton onClick={onRetry} className={`${d.bg}`}>
          <Icon path={ICON.replay} size={20} />
          もういちど
        </PrimaryButton>
        <button
          onClick={onChangeMode}
          className="inline-flex items-center justify-center gap-2 font-bold text-slate-700 bg-white border border-slate-200 px-7 py-3.5 rounded-xl shadow-sm hover:shadow transition-all active:scale-95"
        >
          <Icon path={ICON.list} size={20} />
          モードを かえる
        </button>
        <button
          onClick={onHome}
          className="inline-flex items-center justify-center gap-2 font-bold text-slate-700 bg-white border border-slate-200 px-7 py-3.5 rounded-xl shadow-sm hover:shadow transition-all active:scale-95"
        >
          <Icon path={ICON.home} size={20} />
          さいしょへ
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
 *  記録（成長のきろく）まわりの小さな計算関数
 * ------------------------------------------------------------------- */

// あるデッキの「取り組んだ回数」（順番＋バラバラの合計）
function deckPlays(stats, deckId) {
  const s = stats[deckId] || {};
  return ['order', 'shuffle'].reduce((sum, m) => sum + ((s[m] && s[m].plays) || 0), 0);
}

// あるデッキの記録（順番＋バラバラ）を時間順にまとめて返す
function deckHistory(stats, deckId) {
  const s = stats[deckId] || {};
  const all = [];
  ['order', 'shuffle'].forEach((m) => {
    ((s[m] && s[m].history) || []).forEach((h) => all.push({ ...h, mode: m }));
  });
  all.sort((x, y) => x.t - y.t);
  return all;
}

// 全デッキの合計プレイ回数（＝スタンプの数）
function totalPlays(stats) {
  return DECK_ORDER.reduce((sum, id) => sum + deckPlays(stats, id), 0);
}

// 6-11. ミニ棒グラフ（最近のタイムを ならべて 成長を見せる）
function MiniBarChart({ history, deck }) {
  const recent = history.slice(-12);
  if (recent.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-slate-300">
        まだ きろくが ありません
      </div>
    );
  }
  const times = recent.map((h) => h.time);
  const max = Math.max(...times);
  const best = Math.min(...times);
  return (
    <div className="h-20 flex items-end justify-center gap-1.5">
      {recent.map((h, i) => {
        const ratio = max > 0 ? h.time / max : 1;
        const heightPct = 18 + ratio * 82; // 18%〜100%（はやくても見えるように）
        const isBest = h.time === best;
        return (
          <div
            key={i}
            className="flex-1 max-w-[18px] rounded-t-md transition-all"
            style={{ height: `${heightPct}%` }}
            title={`${formatTime(h.time)}（まちがい ${h.mistakes}）`}
          >
            <div className={`w-full h-full rounded-t-md ${isBest ? deck.bg : 'bg-slate-200'}`} />
          </div>
        );
      })}
    </div>
  );
}

// 6-12. がんばりカレンダー（今月・れんしゅうした日に ★）
const WDAY_JP = ['にち', 'げつ', 'か', 'すい', 'もく', 'きん', 'ど'];

function MonthCalendar({ days }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const first = new Date(year, month, 1);
  const startWday = first.getDay(); // 0=日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = dateKey();

  const cells = [];
  for (let i = 0; i < startWday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    cells.push({ d, ds, done: !!(days && days[ds]), isToday: ds === today });
  }

  return (
    <div>
      <div className="text-center text-sm font-bold text-slate-600 mb-2">
        {year}年 {month + 1}月
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WDAY_JP.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-bold ${
              i === 0 ? 'text-rose-400' : i === 6 ? 'text-sky-400' : 'text-slate-400'
            }`}
          >
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} />;
          return (
            <div
              key={c.ds}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] ${
                c.done
                  ? 'bg-amber-50 border border-amber-200'
                  : c.isToday
                  ? 'border-2 border-amber-400'
                  : 'border border-slate-100'
              }`}
            >
              <span className={c.done ? 'text-amber-700 font-bold' : 'text-slate-400'}>{c.d}</span>
              {c.done && (
                <span className="text-amber-500 -mt-0.5">
                  <Icon path={ICON.star} size={11} fill />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 6-13. せいちょうの きろく 画面
function RecordsScreen({ stats, bestTimes, daily, onBack }) {
  const grand = totalPlays(stats);
  const streak = effectiveStreak(daily);
  const bestStreak = (daily && daily.bestStreak) || 0;
  return (
    <div className="flex-1 flex flex-col items-center px-4 py-8 overflow-auto">
      <div className="flex items-center gap-2 text-slate-800">
        <Icon path={ICON.chart} size={26} />
        <h2 className="text-2xl sm:text-3xl font-bold">せいちょうの きろく</h2>
      </div>
      <p className="text-slate-500 mt-2 mb-6 text-sm sm:text-base text-center">
        いままで <span className="font-bold text-slate-700">{grand}</span> かい とりくみました。
        まいにち つづけて、タイムを ちぢめよう！
      </p>

      {/* まいにち つづけよう：れんぞく・スタンプ・カレンダー */}
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4">
        <div className="grid grid-cols-3 gap-2 text-center mb-4">
          <div className="rounded-xl bg-orange-50 border border-orange-100 py-3">
            <div className="flex items-center justify-center gap-1 text-orange-600 mb-1">
              <Icon path={ICON.flame} size={16} fill />
            </div>
            <div className="text-2xl font-black text-orange-600 tabular-nums">{streak}</div>
            <div className="text-[11px] text-slate-500">にち れんぞく</div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 py-3">
            <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
              <Icon path={ICON.trophy} size={16} />
            </div>
            <div className="text-2xl font-black text-slate-700 tabular-nums">{bestStreak}</div>
            <div className="text-[11px] text-slate-500">さいこう れんぞく</div>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 py-3">
            <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
              <Icon path={ICON.star} size={16} fill />
            </div>
            <div className="text-2xl font-black text-amber-600 tabular-nums">{grand}</div>
            <div className="text-[11px] text-slate-500">スタンプ</div>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <MonthCalendar days={daily && daily.days} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl">
        {DECK_ORDER.map((id) => {
          const d = DECKS[id];
          const plays = deckPlays(stats, id);
          const history = deckHistory(stats, id);
          const best = minBest(bestTimes[id]);
          const last = history.length ? history[history.length - 1].time : null;
          return (
            <div key={id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <DeckSwatch deck={d} size="w-11 h-11 text-2xl" />
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-800">{d.name}</div>
                  <div className="text-xs text-slate-500 truncate">{d.sub}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[11px] text-slate-400">かいすう</div>
                  <div className="text-xl font-bold text-slate-800 tabular-nums">{plays}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">ベスト</div>
                  <div className={`text-xl font-bold tabular-nums ${best != null ? d.text : 'text-slate-300'}`}>
                    {best != null ? formatTime(best) : '--:--'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">ぜんかい</div>
                  <div className="text-xl font-bold text-slate-700 tabular-nums">
                    {last != null ? formatTime(last) : '--:--'}
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <MiniBarChart history={history} deck={d} />
                <div className="mt-1 text-center text-[11px] text-slate-400">
                  さいきんの タイム（ひくいほど はやい）
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onBack}
        className="mt-8 inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-5 py-2.5 rounded-xl shadow-sm transition-all active:scale-95"
      >
        <Icon path={ICON.arrowLeft} size={18} />
        もどる
      </button>
    </div>
  );
}

// 6-14. せってい（おと切りかえ・記録を消す）モーダル
function SettingsModal({ open, onClose, effectsOn, onToggleEffects, onResetRecords }) {
  const [confirming, setConfirming] = useState(false);
  // モーダルを閉じるたびに「消す確認」の状態はリセット
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4 text-slate-800">
          <Icon path={ICON.gear} size={20} />
          <h3 className="text-lg font-bold">せってい</h3>
        </div>

        {/* おと・バイブの ON/OFF */}
        <button
          onClick={onToggleEffects}
          className="w-full flex items-center justify-between gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 mb-4 transition-all active:scale-95"
        >
          <span className="flex items-center gap-2 font-bold text-slate-700">
            <Icon path={effectsOn ? ICON.volume : ICON.volumeOff} size={20} />
            おと・バイブ
          </span>
          <span
            className={`relative inline-flex items-center w-12 h-7 rounded-full transition-colors ${
              effectsOn ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                effectsOn ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </span>
        </button>

        {/* 記録を消す */}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="w-full font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 px-4 py-3 rounded-xl transition-all active:scale-95 mb-3"
          >
            きろくを すべて けす
          </button>
        ) : (
          <div className="mb-3">
            <p className="text-sm text-slate-500 mb-3 leading-relaxed">
              ベストタイム・れんぞく記録・カレンダー・スタンプを すべて さくじょします。
              もとに もどせません。ほんとうに けしますか？
            </p>
            <button
              onClick={onResetRecords}
              className="w-full font-bold text-white bg-rose-500 hover:bg-rose-600 px-4 py-3 rounded-xl shadow-sm transition-all active:scale-95 mb-2"
            >
              けす
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="w-full font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-all active:scale-95"
            >
              やめる
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-3 rounded-xl transition-all active:scale-95"
        >
          とじる
        </button>
      </div>
    </div>
  );
}

// 6-15. インストールのやり方 案内モーダル
//   Chrome から すぐインストールできない（＝ボタンを押しても
//   インストールの画面が出ない）ときに、手順を絵で説明します。
//   ・Chromebook / パソコンの Chrome … アドレスバー右のアイコン、または ︙メニュー
//   ・Android … ︙メニュー
//   ・iPhone / iPad … 共有ボタン
const INSTALL_STEPS = {
  chromebook: {
    title: 'Chromebook でインストールするには',
    steps: [
      'がめん上の アドレスバーの 右はしを 見てください。',
      '四角に ↓ がついた アイコン（インストール）を おします。',
      'アイコンが 見あたらないときは、右上の ︙（たてに 点が3つ）→「保存して共有」→「ページをアプリとしてインストール」を えらびます。',
      '「インストール」を おすと、ランチャー（〇のボタン）に けいさんカードが ふえます。',
    ],
    note: 'すでに インストールずみのときは、アイコンもメニューも 出ません。ランチャーで「けいさんカード」を さがしてみてください。',
  },
  desktop: {
    title: 'パソコンの Chrome でインストールするには',
    steps: [
      'アドレスバーの 右はしにある インストールのアイコンを おします。',
      'アイコンが 出ないときは、右上の ︙ →「保存して共有」→「ページをアプリとしてインストール」を えらびます。',
      '「インストール」を おすと、アプリとして ひらけるようになります。',
    ],
    note: 'Edge のときは ︙ →「アプリ」→「このサイトをアプリとしてインストール」です。',
  },
  android: {
    title: 'Android でインストールするには',
    steps: [
      '右上の ︙（たてに 点が3つ）を おします。',
      '「アプリをインストール」または「ホーム画面に追加」を えらびます。',
      '「インストール」を おすと、ホーム画面に アイコンが ふえます。',
    ],
    note: null,
  },
  ios: {
    title: 'iPhone・iPad でインストールするには',
    steps: [
      'Safari の下（iPad は上）にある 共有ボタン（□に ↑）を おします。',
      'メニューを 下に うごかして「ホーム画面に追加」を えらびます。',
      '右上の「追加」を おすと、ホーム画面に アイコンが ふえます。',
    ],
    note: 'Safari 以外（Chrome など）では「ホーム画面に追加」が出ないことがあります。',
  },
};

function InstallGuideModal({ open, platform, onClose }) {
  if (!open) return null;
  const guide = INSTALL_STEPS[platform] || INSTALL_STEPS.desktop;
  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm max-h-[85vh] overflow-auto animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4 text-slate-800">
          <Icon path={ICON.download} size={20} />
          <h3 className="text-lg font-bold">{guide.title}</h3>
        </div>

        <ol className="space-y-3 mb-4">
          {guide.steps.map((s, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-slate-700 leading-relaxed">{s}</span>
            </li>
          ))}
        </ol>

        {guide.note && (
          <p className="text-sm text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
            {guide.note}
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-3 rounded-xl transition-all active:scale-95"
        >
          とじる
        </button>
      </div>
    </div>
  );
}

// 6-16. 「もう1かいで とじます」の おしらせ（画面の下に すこしのあいだ 出ます）
function ExitHintToast() {
  return (
    <div className="back-toast fixed left-0 right-0 flex justify-center z-50 px-6 pointer-events-none">
      <div className="bg-slate-800/90 text-white text-sm font-bold px-5 py-3 rounded-full shadow-lg animate-pop">
        もう1かい「もどる」で とじます
      </div>
    </div>
  );
}

/* =====================================================================
 *  7. メインボード（画面の切り替えをまとめる司令塔）
 * ===================================================================== */

// 画面の「1つ前の階層」。ここに無い画面（タイトル）は いちばん上です。
const BACK_TO = {
  select: 'title',
  records: 'title',
  mode: 'select',
  play: 'mode',
  result: 'mode',
};

function MainBoard() {
  // screen: 'title' | 'select' | 'mode' | 'play' | 'result' | 'records'
  const [screen, setScreen] = useState('title');
  const [deckId, setDeckId] = useState(null);
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState(null);
  const [isBest, setIsBest] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playToken, setPlayToken] = useState(0); // あそぶたびに +1（ゲームをリセット）
  // すでに「アプリ」として ひらいているか（ひらいていれば ボタンは いりません）
  const [installed, setInstalled] = useState(isStandaloneApp);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const platform = useMemo(detectPlatform, []);

  // ベストタイム： { red: { order: ms, shuffle: ms }, ... }
  const [bestTimes, setBestTimes] = useLocalStorage('keisan-card-best-v1', {});

  // 取り組みの記録：
  //   { red: { order: { plays, history: [{ t, time, mistakes }] }, shuffle: {...} }, ... }
  const [stats, setStats] = useLocalStorage('keisan-card-stats-v1', {});

  // まいにち記録： { streak, bestStreak, lastDate, days: { 'YYYY-MM-DD': count } }
  const [daily, setDaily] = useLocalStorage('keisan-card-daily-v1', {
    streak: 0,
    bestStreak: 0,
    lastDate: null,
    days: {},
  });

  // おと・バイブの ON/OFF（はじめは ON）
  const [effectsOn, setEffectsOn] = useLocalStorage('keisan-card-effects-v1', true);

  // PWA：インストールが すんだら ボタンを ひっこめる
  useEffect(() => {
    const onDone = () => {
      setInstalled(true);
      setInstallGuideOpen(false);
    };
    window.addEventListener('pwa-installed', onDone);

    // アプリとして ひらいたか（画面の出しかた）が かわったら つけかえる
    let mq = null;
    const onModeChange = () => setInstalled(isStandaloneApp());
    try {
      mq = window.matchMedia('(display-mode: standalone)');
      if (mq.addEventListener) mq.addEventListener('change', onModeChange);
      else if (mq.addListener) mq.addListener(onModeChange);
    } catch (e) {
      mq = null;
    }

    return () => {
      window.removeEventListener('pwa-installed', onDone);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', onModeChange);
        else if (mq.removeListener) mq.removeListener(onModeChange);
      }
    };
  }, []);

  const openInstallGuide = useCallback(() => {
    navRef.current.installGuideOpen = true;
    setInstallGuideOpen(true);
  }, []);

  const closeInstallGuide = useCallback(() => {
    navRef.current.installGuideOpen = false;
    setInstallGuideOpen(false);
  }, []);

  const doInstall = useCallback(async () => {
    const evt = window.__deferredInstallPrompt;
    // Chrome から すぐインストールできるときは、そのまま きく
    if (!evt) {
      // 合図が とどいていない（すでにインストールずみ／条件がそろっていない など）。
      // だまって なにも おきないと こまるので、やり方を 案内します。
      openInstallGuide();
      return;
    }
    try {
      evt.prompt();
      await evt.userChoice;
      // 一度つかった 合図は もう つかえません。
      // （ことわった場合は、しばらくすると Chrome が また 合図をくれます）
      window.__deferredInstallPrompt = null;
    } catch (e) {
      // 合図が 古くなっていて つかえなかったときは、やり方を 案内します
      window.__deferredInstallPrompt = null;
      openInstallGuide();
    }
  }, [openInstallGuide]);

  // いま どの画面にいるかを「その場で」読み書きするための控え。
  //   画面の切りかえ（useState）は すこし あとに 反映されるため、
  //   「もどる」を つづけて 2回 すばやく 操作したときに
  //   1回ぶんしか もどらない、ということが おきないようにします。
  const navRef = useRef({ screen: 'title', settingsOpen: false, installGuideOpen: false });
  navRef.current.screen = screen;
  navRef.current.settingsOpen = settingsOpen;
  navRef.current.installGuideOpen = installGuideOpen;

  // れんしゅう中の「記録をつくる関数」の置き場。PlayScreen が ここに入れ、
  //   とちゅうで やめたときに 司令塔から よびだします。
  const playReportRef = useRef(null);

  // とちゅうで やめた（中断）を 学習ログに 残します（仕様 §5.4）。
  //   中断は「むずかしすぎる」「量が多すぎる」の合図なので、
  //   完走したときだけ 記録すると、その合図が まるごと 消えてしまいます。
  //   ※ ベストタイム・スタンプ・れんぞく記録は クリアのごほうびなので
  //     中断では 更新しません。学習ログにだけ 残します。
  const flushAbort = useCallback(() => {
    const build = playReportRef.current;
    playReportRef.current = null; // 二重に 記録しない
    if (!build) return;
    const res = build('aborted');
    // 1枚も こたえていない中断は 記録しません（まちがえて 開いただけの
    // 記録で 保存のうわげん（500件）を うめてしまわないように）。
    if (!res.attempted) return;
    saveStudySession({
      deckId,
      mode,
      res,
      isBest: false,
      bestMs: (bestTimes[deckId] && bestTimes[deckId][mode]) ?? null,
      streak: effectiveStreak(daily),
    });
  }, [deckId, mode, bestTimes, daily]);

  // 画面を切りかえる（控えも いっしょに 更新）
  const goTo = useCallback(
    (next) => {
      // れんしゅう画面から ぬけるときは、まず 中断の記録を のこす
      if (navRef.current.screen === 'play' && next !== 'play') flushAbort();
      navRef.current.screen = next;
      setScreen(next);
    },
    [flushAbort]
  );

  const openSettings = useCallback(() => {
    navRef.current.settingsOpen = true;
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    navRef.current.settingsOpen = false;
    setSettingsOpen(false);
  }, []);

  const goHome = useCallback(() => {
    goTo('title');
    setDeckId(null);
    setMode(null);
  }, [goTo]);

  // 「1つ前の階層」へ もどる（端末の もどる操作 から よばれます）
  //   もどれたら true／タイトル画面（いちばん上）で もどれなければ false
  const goBackOneLevel = useCallback(() => {
    // モーダル（せってい・インストール案内）が ひらいているときは、まず それを とじる
    if (navRef.current.installGuideOpen) {
      closeInstallGuide();
      return true;
    }
    if (navRef.current.settingsOpen) {
      closeSettings();
      return true;
    }
    const to = BACK_TO[navRef.current.screen];
    if (!to) return false; // タイトル画面＝いちばん上
    if (to === 'title') goHome();
    else goTo(to);
    return true;
  }, [goTo, goHome, closeSettings, closeInstallGuide]);

  // 端末の「もどる」（ナビゲーションバー／ふちからのスワイプ）に つなぐ
  const askExit = useSystemBack(goBackOneLevel);

  const handleFinish = useCallback(
    (res) => {
      setResult(res);

      // ベストタイム更新
      const prev = (bestTimes[deckId] && bestTimes[deckId][mode]) ?? null;
      const better = prev == null || res.time < prev;
      setIsBest(better);
      if (better) {
        setBestTimes((b) => ({
          ...b,
          [deckId]: { ...(b[deckId] || {}), [mode]: res.time },
        }));
      }

      // 学習ログ（study.v1）に 1件 のこす。
      //   ごほうび（ベスト・れんぞく）の 更新後の値を ext に入れたいので、
      //   さきに 計算だけ すませてから わたします。
      saveStudySession({
        deckId,
        mode,
        res,
        isBest: better,
        bestMs: better ? res.time : prev,
        streak: effectiveStreak(advanceDaily(daily)),
      });

      // 取り組み回数とタイム履歴を記録
      setStats((s) => {
        const deck = s[deckId] || {};
        const cur = deck[mode] || { plays: 0, history: [] };
        const history = [
          ...cur.history,
          { t: Date.now(), time: res.time, mistakes: res.mistakes },
        ].slice(-30); // 直近30回まで保存
        return {
          ...s,
          [deckId]: { ...deck, [mode]: { plays: cur.plays + 1, history } },
        };
      });

      // まいにち記録（れんぞく・カレンダー）を更新
      setDaily(advanceDaily);

      goTo('result');
    },
    [bestTimes, daily, deckId, mode, setBestTimes, setStats, setDaily, goTo]
  );

  const bestForCurrent =
    (bestTimes[deckId] && bestTimes[deckId][mode]) ?? (result ? result.time : null);
  const totalStamps = totalPlays(stats);
  const resultStreak = effectiveStreak(daily);
  const showFooter = screen !== 'play';

  return (
    <div className="h-full flex flex-col">
      <Header onHome={goHome} onOpenSettings={openSettings} />

      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {screen === 'title' && (
          <TitleScreen
            onStart={() => goTo('select')}
            onRecords={() => goTo('records')}
            daily={daily}
            totalStamps={totalStamps}
            showInstall={!installed}
            onInstall={doInstall}
          />
        )}

        {screen === 'records' && (
          <RecordsScreen
            stats={stats}
            bestTimes={bestTimes}
            daily={daily}
            onBack={goHome}
          />
        )}

        {screen === 'select' && (
          <SelectScreen
            bestTimes={bestTimes}
            onPick={(id) => {
              setDeckId(id);
              goTo('mode');
            }}
          />
        )}

        {screen === 'mode' && (
          <ModeScreen
            deckId={deckId}
            bestTimes={bestTimes}
            onBack={() => goTo('select')}
            onPick={(m) => {
              setMode(m);
              setPlayToken((t) => t + 1);
              goTo('play');
            }}
          />
        )}

        {screen === 'play' && (
          <PlayScreen
            key={`${deckId}-${mode}-${playToken}`}
            deckId={deckId}
            mode={mode}
            effectsOn={effectsOn}
            reportRef={playReportRef}
            onFinish={handleFinish}
            onBack={goHome}
          />
        )}

        {screen === 'result' && result && (
          <ResultScreen
            deckId={deckId}
            mode={mode}
            result={result}
            isBest={isBest}
            best={bestForCurrent}
            streak={resultStreak}
            totalStamps={totalStamps}
            onRetry={() => {
              setPlayToken((t) => t + 1);
              goTo('play');
            }}
            onChangeMode={() => goTo('mode')}
            onHome={goHome}
          />
        )}
      </main>

      {showFooter && <Footer />}

      {askExit && <ExitHintToast />}

      <SettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        effectsOn={effectsOn}
        onToggleEffects={() => setEffectsOn((v) => !v)}
        onResetRecords={() => {
          // 消すのは このアプリ固有の記録（ベストタイム・れんぞく・スタンプ）だけ。
          //   ※ 学習ログ `study.records.v1` は 消してはいけません。
          //     ほかのアプリと 共有しているうえ、まだ送っていないログが
          //     消えてしまいます（仕様 §1.2）。
          //     localStorage.clear() も 同じ理由で 使ってはいけません。
          setBestTimes({});
          setStats({});
          setDaily({ streak: 0, bestStreak: 0, lastDate: null, days: {} });
          closeSettings();
        }}
      />

      <InstallGuideModal
        open={installGuideOpen}
        platform={platform}
        onClose={closeInstallGuide}
      />
    </div>
  );
}

/* =====================================================================
 *  8. アプリを画面に表示
 * ===================================================================== */
function App() {
  return <MainBoard />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
