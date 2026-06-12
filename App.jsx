/* =====================================================================
 *  けいさんカード（デジタル計算カード）  App.jsx
 *  ---------------------------------------------------------------------
 *  小学1年生の「計算カード」をブラウザだけで再現したアプリです。
 *  ・あかカード（たしざん／くりあがりなし・和が10まで）
 *  ・あおカード（ひきざん／くりさがりなし）
 *  ・きいろカード（たしざん／くりあがり・和が11〜18）
 *  ・みどりカード（ひきざん／くりさがり）
 *
 *  操作（3つの方法に対応）：
 *   1) カードをタップ → こたえが出る → 左スワイプ＝せいかい／右スワイプ＝もう一度
 *   2) こたえを みる／○／× のボタン
 *   3) キーボード：スペース（またはEnter）＝めくる／← せいかい／→ もう一度
 *
 *  まちがえたカードは最後にもう一度出題され、ぜんぶ正解するまでの
 *  タイムを自動で計測します。ベストタイムはブラウザに保存されます。
 *
 *  ※ このファイル1つに、すべての画面・ロジック・スタイルが入っています。
 * ===================================================================== */

const { useState, useEffect, useRef, useCallback } = React;

/* =====================================================================
 *  1. データ：4種類のカードを「計算で」作ります
 * ===================================================================== */

// あか：たしざん（くりあがりなし）。足す数・足される数が0〜9で、和が10まで。
function makeRedCards() {
  const cards = [];
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      if (a + b <= 10) cards.push({ a, b, op: '+', ans: a + b });
    }
  }
  return cards;
}

// あお：ひきざん（くりさがりなし）。引かれる数・引く数が0〜10で、差が0〜9。
function makeBlueCards() {
  const cards = [];
  for (let a = 0; a <= 10; a++) {
    for (let b = 0; b <= 10; b++) {
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

// ミリ秒を「m:ss.t」の形に整えます（タイム表示用）。
function formatTime(ms) {
  if (ms == null) return '--:--';
  const totalCs = Math.floor(ms / 100); // 1/10秒
  const m = Math.floor(totalCs / 600);
  const s = Math.floor((totalCs % 600) / 10);
  const t = totalCs % 10;
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

/* =====================================================================
 *  3. アイコン（絵文字のかわりに、シンプルな線画SVGを使います）
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
  trophy: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
};

/* =====================================================================
 *  4. カスタムフック（ロジックを部品にして、UIと切り離します）
 * ===================================================================== */

// 4-1. LocalStorage に値を保存・復元するフック
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

// 4-2. ストップウォッチのフック
function useTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  const tick = useCallback(() => {
    setElapsed(Date.now() - startRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    startRef.current = Date.now();
    setElapsed(0);
    setRunning(true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    const final = Date.now() - startRef.current;
    setElapsed(final);
    return final;
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    setElapsed(0);
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { elapsed, running, start, stop, reset };
}

// 4-3. カードの山（デッキ）を管理するフック
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

  const current = queue[0] || null;
  // まちがえた山（retry）が残っているうちは「終わり」ではありません。
  const isFinished = queue.length === 0 && retry.length === 0;

  // 「せいかい」：次のカードへ
  const markCorrect = useCallback(() => {
    setQueue((q) => q.slice(1));
    setDone((d) => d + 1);
  }, []);

  // 「まちがい」：このカードを山の最後（retry）へ回す
  const markWrong = useCallback(() => {
    if (!current) return;
    setQueue((q) => q.slice(1));
    setRetry((r) => [...r, current]);
    setMistakes((m) => m + 1);
  }, [current]);

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
  };
}

function shuffleIfNeeded(cards, mode) {
  return mode === 'shuffle' ? shuffle(cards) : cards;
}

// 4-4. スワイプ操作のフック（指でもマウスでも動きます）
//   左へ → onLeft（せいかい）／右へ → onRight（もう一度）
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

/* =====================================================================
 *  5. 画面の部品（コンポーネント）
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

// 5-1. ヘッダー（指定のTailwindクラスをベースに作成）
function Header({ onHome, onOpenSettings }) {
  return (
    <nav className="bg-white border-b-4 border-amber-500 px-6 py-2.5 flex justify-between items-center shadow-sm z-10">
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

// 5-2. フッター（指定のTailwindクラスをベースに作成）
function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="w-full bg-white border-t border-slate-200 pt-3 pb-2 text-center text-sm text-slate-500 font-bold shadow-sm">
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

// 5-3. タイトル画面
function TitleScreen({ onStart }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="animate-rise">
        <Logo size={72} />
      </div>
      <h1 className="mt-6 text-4xl sm:text-5xl font-black text-slate-800 tracking-tight animate-rise">
        けいさんカード
      </h1>
      <p className="mt-4 text-slate-500 text-base sm:text-lg leading-relaxed animate-rise">
        計算カードを めくって、すらすら こたえよう。<br />
        ぜんぶ こたえると タイムが でます。
      </p>
      <PrimaryButton
        onClick={onStart}
        className="mt-10 bg-amber-500 hover:bg-amber-600 text-lg sm:text-xl px-10 py-4 animate-pop"
      >
        <Icon path={ICON.play} size={20} fill />
        はじめる
      </PrimaryButton>
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

// 5-4. カードの色をえらぶ画面
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

// 5-5. モードをえらぶ画面（順番／バラバラ）
function ModeScreen({ deckId, onPick, onBack, bestTimes }) {
  const d = DECKS[deckId];
  const best = bestTimes[deckId] || {};
  const modes = [
    {
      id: 'order',
      title: 'じゅんばん',
      icon: ICON.list,
      desc: '小さい じゅんに 出ます。\nまずは これで れんしゅう。',
      best: best.order,
    },
    {
      id: 'shuffle',
      title: 'バラバラ',
      icon: ICON.shuffle,
      desc: 'じゅんばんが バラバラに 出ます。\nすらすら 言えるかな。',
      best: best.shuffle,
    },
  ];
  return (
    <div className="flex-1 flex flex-col items-center px-4 py-8">
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

// 5-6. 1枚のフラッシュカード（おもて＝式だけ／うら＝答えだけ）
function FlashCard({ card, deck, revealed, onReveal, onLeft, onRight }) {
  const swipe = useSwipe({ enabled: revealed, onLeft, onRight });

  const intent =
    swipe.dx <= -swipe.threshold ? 'left' : swipe.dx >= swipe.threshold ? 'right' : null;
  const rotate = swipe.dx / 22;
  const style = {
    transform: `translateX(${swipe.dx}px) rotate(${rotate}deg)`,
    transition: swipe.dragging ? 'none' : 'transform 0.3s cubic-bezier(.2,.8,.2,1)',
  };

  const expr = `${card.a} ${card.op === '+' ? '＋' : '－'} ${card.b}`;

  return (
    <div className="relative w-full max-w-xl flex items-center justify-center no-select">
      {/* スワイプ方向のヒント（左：せいかい／右：もう一度） */}
      <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
        <div
          className={`flex flex-col items-center gap-1 text-emerald-600 transition-all duration-150 ${
            intent === 'left' ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <Icon path={ICON.check} size={40} />
          <span className="text-sm font-bold">せいかい</span>
        </div>
        <div
          className={`flex flex-col items-center gap-1 text-rose-500 transition-all duration-150 ${
            intent === 'right' ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
          }`}
        >
          <Icon path={ICON.close} size={40} />
          <span className="text-sm font-bold">もう一度</span>
        </div>
      </div>

      {/* カード本体（おおきめ） */}
      <div
        className="flip-perspective w-[86vw] max-w-md h-72 sm:h-96 z-10"
        style={style}
        {...swipe.handlers}
        onClick={() => {
          if (Math.abs(swipe.dx) < 6 && !revealed) onReveal();
        }}
      >
        <div className={`flip-inner relative w-full h-full ${revealed ? 'is-flipped' : ''}`}>
          {/* おもて：しき だけ */}
          <div
            className={`flip-face absolute inset-0 rounded-3xl shadow-lg ${deck.bg} flex items-center justify-center cursor-pointer`}
          >
            <div className={`font-textbook ${deck.frontText} text-6xl sm:text-8xl font-bold tracking-wide`}>
              {expr}
            </div>
          </div>
          {/* うら：こたえ だけ */}
          <div
            className={`flip-face flip-back absolute inset-0 rounded-3xl shadow-lg bg-white border ${deck.border} flex items-center justify-center`}
          >
            <div className={`font-textbook ${deck.text} text-8xl sm:text-9xl font-bold`}>
              {card.ans}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 5-7. あそんでいる画面（カード＋タイマー＋すすみ具合）
function PlayScreen({ deckId, mode, timer, onFinish, onBack }) {
  const game = useCardDeck(deckId, mode);
  const [revealed, setRevealed] = useState(false);
  const d = DECKS[deckId];

  // タイマー開始（このコンポーネントが消えるとリセット）
  useEffect(() => {
    timer.start();
    return () => timer.reset();
    // eslint-disable-next-line
  }, []);

  // カードが変わったら、おもて向きに戻す
  useEffect(() => {
    setRevealed(false);
  }, [game.current && game.current.key, game.remaining]);

  // ぜんぶ終わったら結果へ
  useEffect(() => {
    if (game.isFinished) {
      const finalMs = timer.stop();
      onFinish({ time: finalMs, mistakes: game.mistakes, total: game.total });
    }
    // eslint-disable-next-line
  }, [game.isFinished]);

  const handleCorrect = useCallback(() => {
    if (!revealed) return;
    setRevealed(false);
    game.markCorrect();
  }, [revealed, game]);

  const handleWrong = useCallback(() => {
    if (!revealed) return;
    setRevealed(false);
    game.markWrong();
  }, [revealed, game]);

  // キーボード操作：スペース/Enter＝めくる、←せいかい、→もう一度
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return;
      if (!revealed) {
        if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          setRevealed(true);
        }
      } else {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleCorrect();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleWrong();
        } else if (e.code === 'Space') {
          e.preventDefault(); // めくった後のスペースは無効
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
    <div className="flex-1 flex flex-col px-4 py-4">
      {/* じょうほうバー */}
      <div className="w-full max-w-xl mx-auto">
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
            <span className="text-2xl sm:text-3xl font-bold text-slate-800 tabular-nums">
              {formatTime(timer.elapsed)}
            </span>
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
        <div className="mt-1.5 text-center text-xs text-slate-400">
          {game.done} / {game.total} もん せいかい
          {game.mistakes > 0 && <span className="ml-2 text-rose-400">まちがい {game.mistakes}</span>}
        </div>
      </div>

      {/* カード */}
      <div className="flex-1 flex items-center justify-center py-4">
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
      <div className="w-full max-w-xl mx-auto pb-1">
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
                せいかい
              </PrimaryButton>
              <PrimaryButton onClick={handleWrong} className="bg-rose-500 hover:bg-rose-600 px-8">
                <Icon path={ICON.close} size={20} />
                もう一度
              </PrimaryButton>
            </>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          {revealed ? '← せいかい ／ もう一度 →（スワイプ・キーボードでも）' : 'カードを タップ／スペースキーで こたえ'}
        </p>
      </div>
    </div>
  );
}

// 5-8. 結果画面
function ResultScreen({ deckId, mode, result, isBest, best, onRetry, onChangeMode, onHome }) {
  const d = DECKS[deckId];
  const modeName = mode === 'shuffle' ? 'バラバラ' : 'じゅんばん';
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
      {isBest && (
        <div className={`inline-flex items-center gap-1.5 ${d.text} font-bold mb-3 animate-rise`}>
          <Icon path={ICON.trophy} size={18} />
          しんきろく
        </div>
      )}
      <h2 className="text-3xl sm:text-4xl font-black text-slate-800 animate-rise">
        {isBest ? 'しんきろく！' : 'クリア！'}
      </h2>
      <div className="text-slate-500 mt-2 mb-6">
        {d.name}・{modeName}モード
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
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <PrimaryButton onClick={onRetry} className={`${d.bg}`}>
          <Icon path={ICON.replay} size={20} />
          もう一度
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

// 5-9. せってい（記録を消す）モーダル
function SettingsModal({ open, onClose, onResetRecords }) {
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
        <div className="flex items-center gap-2 mb-3 text-slate-800">
          <Icon path={ICON.gear} size={20} />
          <h3 className="text-lg font-bold">せってい</h3>
        </div>
        <p className="text-sm text-slate-500 mb-5 leading-relaxed">
          ベストタイムの きろくを すべて さくじょします。この そうさは もとに もどせません。
        </p>
        <button
          onClick={onResetRecords}
          className="w-full font-bold text-white bg-rose-500 hover:bg-rose-600 px-4 py-3 rounded-xl shadow-sm transition-all active:scale-95 mb-3"
        >
          きろくを すべて けす
        </button>
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

/* =====================================================================
 *  6. メインボード（画面の切り替えをまとめる司令塔）
 * ===================================================================== */
function MainBoard() {
  // screen: 'title' | 'select' | 'mode' | 'play' | 'result'
  const [screen, setScreen] = useState('title');
  const [deckId, setDeckId] = useState(null);
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState(null);
  const [isBest, setIsBest] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playToken, setPlayToken] = useState(0); // あそぶたびに +1（ゲームをリセット）

  const timer = useTimer();

  // ベストタイム： { red: { order: ms, shuffle: ms }, ... }
  const [bestTimes, setBestTimes] = useLocalStorage('keisan-card-best-v1', {});

  const goHome = () => {
    timer.reset();
    setScreen('title');
    setDeckId(null);
    setMode(null);
  };

  const handleFinish = useCallback(
    (res) => {
      setResult(res);
      const prev = (bestTimes[deckId] && bestTimes[deckId][mode]) ?? null;
      const better = prev == null || res.time < prev;
      setIsBest(better);
      if (better) {
        setBestTimes((b) => ({
          ...b,
          [deckId]: { ...(b[deckId] || {}), [mode]: res.time },
        }));
      }
      setScreen('result');
    },
    [bestTimes, deckId, mode, setBestTimes]
  );

  const bestForCurrent =
    (bestTimes[deckId] && bestTimes[deckId][mode]) ?? (result ? result.time : null);

  return (
    <div className="h-full flex flex-col">
      <Header onHome={goHome} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {screen === 'title' && <TitleScreen onStart={() => setScreen('select')} />}

        {screen === 'select' && (
          <SelectScreen
            bestTimes={bestTimes}
            onPick={(id) => {
              setDeckId(id);
              setScreen('mode');
            }}
          />
        )}

        {screen === 'mode' && (
          <ModeScreen
            deckId={deckId}
            bestTimes={bestTimes}
            onBack={() => setScreen('select')}
            onPick={(m) => {
              setMode(m);
              setPlayToken((t) => t + 1);
              setScreen('play');
            }}
          />
        )}

        {screen === 'play' && (
          <PlayScreen
            key={`${deckId}-${mode}-${playToken}`}
            deckId={deckId}
            mode={mode}
            timer={timer}
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
            onRetry={() => {
              setPlayToken((t) => t + 1);
              setScreen('play');
            }}
            onChangeMode={() => setScreen('mode')}
            onHome={goHome}
          />
        )}
      </main>

      <Footer />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onResetRecords={() => {
          setBestTimes({});
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}

/* =====================================================================
 *  7. アプリを画面に表示
 * ===================================================================== */
function App() {
  return <MainBoard />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
