/* =====================================================================
 *  けいさんカード（デジタル計算カード）  App.jsx
 *  ---------------------------------------------------------------------
 *  小学1年生の「計算カード」をブラウザだけで再現したアプリです。
 *  ・あかカード（たしざん／くりあがりなし・和が10まで）
 *  ・あおカード（ひきざん／くりさがりなし）
 *  ・きいろカード（たしざん／くりあがり・和が11〜18）
 *  ・みどりカード（ひきざん／くりさがり）
 *
 *  操作：カードをタップ → こたえが出る → 左にスワイプで「せいかい」/
 *        右にスワイプで「まちがい（さいごにもう一度）」。
 *  ぜんぶ正解するまでのタイムを自動で計測します。
 *
 *  ※ このファイル1つに、すべての画面・ロジック・スタイルが入っています。
 *    ライブラリの読み込みは index.html がやっています。
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

// 4種類のカードの設定をまとめておきます。
const DECKS = {
  red: {
    id: 'red',
    name: 'あかカード',
    sub: 'たしざん（くりあがり なし）',
    emoji: '🍎',
    make: makeRedCards,
    // 配色（Tailwindのクラスを直接書いて、色ごとに見た目を変えます）
    bg: 'bg-red-500',
    bgSoft: 'bg-red-50',
    text: 'text-red-600',
    ring: 'ring-red-400',
    border: 'border-red-400',
    grad: 'from-red-400 to-rose-500',
  },
  blue: {
    id: 'blue',
    name: 'あおカード',
    sub: 'ひきざん（くりさがり なし）',
    emoji: '🐬',
    make: makeBlueCards,
    bg: 'bg-sky-500',
    bgSoft: 'bg-sky-50',
    text: 'text-sky-600',
    ring: 'ring-sky-400',
    border: 'border-sky-400',
    grad: 'from-sky-400 to-blue-500',
  },
  yellow: {
    id: 'yellow',
    name: 'きいろカード',
    sub: 'たしざん（くりあがり あり）',
    emoji: '🌟',
    make: makeYellowCards,
    bg: 'bg-amber-400',
    bgSoft: 'bg-amber-50',
    text: 'text-amber-600',
    ring: 'ring-amber-400',
    border: 'border-amber-400',
    grad: 'from-amber-300 to-yellow-500',
  },
  green: {
    id: 'green',
    name: 'みどりカード',
    sub: 'ひきざん（くりさがり あり）',
    emoji: '🍀',
    make: makeGreenCards,
    bg: 'bg-emerald-500',
    bgSoft: 'bg-emerald-50',
    text: 'text-emerald-600',
    ring: 'ring-emerald-400',
    border: 'border-emerald-400',
    grad: 'from-emerald-400 to-green-500',
  },
};

const DECK_ORDER = ['red', 'blue', 'yellow', 'green'];

// 各カードの枚数を最初に1回だけ計算しておきます（表示用）。
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
 *  3. カスタムフック（ロジックを部品にして、UIと切り離します）
 * ===================================================================== */

// 3-1. LocalStorage に値を保存・復元するフック（ベストタイムの記録に使用）
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

// 3-2. ストップウォッチのフック
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

// 3-3. カードの山（デッキ）を管理するフック
//   ・順番／バラバラでカードを並べる
//   ・まちがえたカードは山の最後にもう一度ならべる
function useCardDeck(deckId, mode) {
  // 初期キューを作る関数
  const buildQueue = useCallback(() => {
    const base = DECKS[deckId].make();
    const ordered = mode === 'shuffle' ? shuffle(base) : base;
    // 各カードに通し番号を付けて、再出題しても区別できるようにします。
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
  //   いまの山を出し切ったあとに合流させます（＝もう一度出題）。
  const markWrong = useCallback(() => {
    if (!current) return;
    setQueue((q) => q.slice(1));
    setRetry((r) => [...r, current]);
    setMistakes((m) => m + 1);
  }, [current]);

  // いまの山が空になったら、まちがえた山を新しい山として合流（もう一度出題）
  useEffect(() => {
    if (queue.length === 0 && retry.length > 0) {
      setQueue(shuffleIfNeeded(retry, mode));
      setRetry([]);
    }
  }, [queue.length, retry, mode]);

  const restart = useCallback(() => {
    const q = buildQueue();
    totalRef.current = q.length;
    setQueue(q);
    setRetry([]);
    setDone(0);
    setMistakes(0);
  }, [buildQueue]);

  return {
    current,
    isFinished,
    total: totalRef.current,
    done,
    mistakes,
    remaining: queue.length + retry.length,
    markCorrect,
    markWrong,
    restart,
  };
}

// retry の山は、バラバラモードのときだけまたシャッフルします。
function shuffleIfNeeded(cards, mode) {
  return mode === 'shuffle' ? shuffle(cards) : cards;
}

// 3-4. スワイプ操作のフック（指でもマウスでも動きます）
//   左へ → onLeft（せいかい）／右へ → onRight（まちがい）
function useSwipe({ enabled, onLeft, onRight }) {
  const [dx, setDx] = useState(0);     // 横の移動量（見た目用）
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const active = useRef(false);

  const THRESHOLD = 90; // この距離より動かしたら判定

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
      return 0; // 位置を元に戻す
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
 *  4. 画面の部品（コンポーネント）
 * ===================================================================== */

// 4-1. ヘッダー（指定のTailwindクラスをベースに作成）
function Header({ onHome, onOpenSettings, title }) {
  return (
    <nav className="bg-white border-b-4 border-amber-500 px-6 py-2.5 flex justify-between items-center shadow-sm z-10">
      <button
        onClick={onHome}
        className="flex items-center gap-2 transition-all active:scale-95"
        title="さいしょの がめんに もどる"
      >
        <span className="text-2xl sm:text-3xl">🧮</span>
        <span className="font-pop text-lg sm:text-2xl text-amber-600 tracking-wide">
          {title}
        </span>
      </button>
      <button
        onClick={onOpenSettings}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 text-xl transition-all active:scale-95"
        title="せってい"
        aria-label="せってい"
      >
        ⚙️
      </button>
    </nav>
  );
}

// 4-2. フッター（指定のTailwindクラスをベースに作成）
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

// 4-3. タイトル画面
function TitleScreen({ onStart }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="animate-floaty">
        <div className="text-7xl sm:text-8xl mb-4 drop-shadow">🧮</div>
      </div>
      <h1 className="font-pop text-4xl sm:text-6xl text-amber-600 drop-shadow-sm mb-3">
        けいさんカード
      </h1>
      <p className="font-textbook text-slate-600 text-base sm:text-lg mb-10 leading-relaxed">
        カードを めくって、けいさんに ちょうせん！<br />
        ぜんぶ こたえると タイムが でるよ。
      </p>
      <button
        onClick={onStart}
        className="font-pop text-2xl sm:text-3xl text-white bg-gradient-to-r from-amber-400 to-orange-500 px-12 py-5 rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-95 animate-pop"
      >
        ▶ はじめる
      </button>
    </div>
  );
}

// 4-4. カードの色をえらぶ画面
function SelectScreen({ onPick, bestTimes }) {
  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6 overflow-auto">
      <h2 className="font-pop text-2xl sm:text-3xl text-slate-700 mb-1">
        カードを えらんでね
      </h2>
      <p className="font-textbook text-slate-500 mb-6 text-sm sm:text-base">
        やってみたい いろの カードを タップ！
      </p>
      <div className="grid grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl">
        {DECK_ORDER.map((id) => {
          const d = DECKS[id];
          const count = DECK_COUNTS[id];
          const best = bestTimes[id];
          return (
            <button
              key={id}
              onClick={() => onPick(id)}
              className={`group bg-white rounded-2xl shadow-sm hover:shadow-lg p-5 sm:p-6 flex flex-col items-center border-2 border-transparent hover:${d.border} transition-all active:scale-95`}
            >
              <div
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br ${d.grad} flex items-center justify-center text-3xl sm:text-4xl shadow-inner mb-3 group-hover:animate-wiggle`}
              >
                {d.emoji}
              </div>
              <div className="font-pop text-lg sm:text-xl text-slate-700">{d.name}</div>
              <div className="font-textbook text-xs sm:text-sm text-slate-500 mt-0.5 text-center leading-tight">
                {d.sub}
              </div>
              <div className="font-textbook text-xs text-slate-400 mt-2">
                ぜんぶで {count}まい
              </div>
              {best && minBest(best) != null && (
                <div className={`font-textbook text-xs ${d.text} mt-1 font-bold`}>
                  🏆 ベスト {formatTime(minBest(best))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ベストタイム表示用：記録の中から一番速いものを取り出します。
function minBest(best) {
  const vals = Object.values(best || {}).filter((v) => typeof v === 'number');
  return vals.length ? Math.min(...vals) : null;
}

// 4-5. モードをえらぶ画面（順番／バラバラ）
function ModeScreen({ deckId, onPick, onBack, bestTimes }) {
  const d = DECKS[deckId];
  const best = bestTimes[deckId] || {};
  const modes = [
    {
      id: 'order',
      title: 'じゅんばん',
      emoji: '🔢',
      desc: '小さい じゅんに 出るよ。\nまずは これで れんしゅう！',
      best: best.order,
    },
    {
      id: 'shuffle',
      title: 'バラバラ',
      emoji: '🎲',
      desc: 'じゅんばんが ぐちゃぐちゃ。\nすらすら 言えるかな？',
      best: best.shuffle,
    },
  ];
  return (
    <div className="flex-1 flex flex-col items-center px-4 py-6">
      <div className="flex items-center gap-3 mb-1">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${d.grad} flex items-center justify-center text-2xl shadow-inner`}>
          {d.emoji}
        </div>
        <h2 className="font-pop text-2xl sm:text-3xl text-slate-700">{d.name}</h2>
      </div>
      <p className="font-textbook text-slate-500 mb-8 text-sm sm:text-base">
        どっちの モードで やる？
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-xl">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m.id)}
            className="bg-white rounded-2xl shadow-sm hover:shadow-lg p-6 flex flex-col items-center transition-all active:scale-95 border-2 border-transparent hover:border-amber-400"
          >
            <div className="text-5xl mb-3">{m.emoji}</div>
            <div className="font-pop text-xl text-slate-700 mb-1">{m.title}</div>
            <div className="font-textbook text-sm text-slate-500 text-center whitespace-pre-line leading-relaxed">
              {m.desc}
            </div>
            {m.best != null && (
              <div className={`font-textbook text-sm ${d.text} mt-3 font-bold`}>
                🏆 ベスト {formatTime(m.best)}
              </div>
            )}
          </button>
        ))}
      </div>
      <button
        onClick={onBack}
        className="font-textbook text-slate-500 hover:text-slate-700 mt-8 px-5 py-2 rounded-xl bg-white shadow-sm transition-all active:scale-95"
      >
        ← カードを えらびなおす
      </button>
    </div>
  );
}

// 4-6. 1枚のフラッシュカード（タップでめくる＋スワイプ判定）
function FlashCard({ card, deck, revealed, onReveal, onLeft, onRight }) {
  const swipe = useSwipe({ enabled: revealed, onLeft, onRight });

  // スワイプの向きで、背景にうっすらヒントを出します。
  const intent =
    swipe.dx <= -swipe.threshold ? 'left' : swipe.dx >= swipe.threshold ? 'right' : null;

  const rotate = swipe.dx / 18; // 少しかたむける
  const style = {
    transform: `translateX(${swipe.dx}px) rotate(${rotate}deg)`,
    transition: swipe.dragging ? 'none' : 'transform 0.3s cubic-bezier(.2,.8,.2,1)',
  };

  const expr = `${card.a} ${card.op === '+' ? '＋' : '－'} ${card.b}`;

  return (
    <div className="relative w-full flex flex-col items-center no-select">
      {/* スワイプ方向のヒント（左：せいかい／右：もういちど） */}
      <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
        <div
          className={`font-pop text-2xl sm:text-3xl text-emerald-500 transition-opacity duration-150 ${
            intent === 'left' ? 'opacity-100 scale-110' : 'opacity-20'
          }`}
        >
          ⭕<br />せいかい
        </div>
        <div
          className={`font-pop text-2xl sm:text-3xl text-rose-500 text-right transition-opacity duration-150 ${
            intent === 'right' ? 'opacity-100 scale-110' : 'opacity-20'
          }`}
        >
          ❌<br />もういちど
        </div>
      </div>

      {/* カード本体 */}
      <div
        className="flip-perspective w-72 h-48 sm:w-96 sm:h-60 z-10"
        style={style}
        {...swipe.handlers}
        onClick={() => {
          // スワイプ中でなければタップでめくる
          if (Math.abs(swipe.dx) < 6 && !revealed) onReveal();
        }}
      >
        <div className={`flip-inner relative w-full h-full ${revealed ? 'is-flipped' : ''}`}>
          {/* おもて：もんだい */}
          <div
            className={`flip-face absolute inset-0 rounded-2xl shadow-lg ${deck.bg} flex flex-col items-center justify-center cursor-pointer`}
          >
            <div className="font-textbook text-white text-5xl sm:text-7xl font-bold drop-shadow-sm">
              {expr} ＝ ?
            </div>
            <div className="font-textbook text-white/80 text-sm mt-4">タップで こたえ</div>
          </div>
          {/* うら：こたえ */}
          <div
            className={`flip-face flip-back absolute inset-0 rounded-2xl shadow-lg bg-white border-4 ${deck.border} flex flex-col items-center justify-center`}
          >
            <div className={`font-textbook text-5xl sm:text-7xl font-bold ${deck.text}`}>
              {expr} ＝ {card.ans}
            </div>
            <div className="font-textbook text-slate-400 text-sm mt-4">
              ← せいかい ／ まちがい →
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 4-7. あそんでいる画面（カード＋タイマー＋すすみ具合）
function PlayScreen({ deckId, mode, timer, deck, onFinish, onBack }) {
  const game = useCardDeck(deckId, mode);
  const [revealed, setRevealed] = useState(false);
  const d = DECKS[deckId];

  // 最初の1枚を出すときにタイマーを開始
  useEffect(() => {
    timer.start();
    // このコンポーネントが消えるときに止める
    return () => timer.reset();
    // eslint-disable-next-line
  }, []);

  // めくり直し（カードが変わったら、おもて向きに戻す）
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
    setRevealed(false); // 次のカードは「おもて」から始めます（一瞬の見えてしまいを防止）
    game.markCorrect();
  }, [revealed, game]);

  const handleWrong = useCallback(() => {
    if (!revealed) return;
    setRevealed(false);
    game.markWrong();
  }, [revealed, game]);

  const progress = game.total ? Math.round((game.done / game.total) * 100) : 0;

  if (game.isFinished) {
    // 結果画面に切り替わる直前の一瞬。から表示。
    return <div className="flex-1" />;
  }

  return (
    <div className="flex-1 flex flex-col px-4 py-4">
      {/* じょうほうバー */}
      <div className="w-full max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onBack}
            className="font-textbook text-sm text-slate-500 hover:text-slate-700 bg-white px-3 py-1.5 rounded-lg shadow-sm transition-all active:scale-95"
          >
            ← やめる
          </button>
          <div className="font-textbook text-2xl sm:text-3xl font-bold text-slate-700 tabular-nums bg-white px-4 py-1 rounded-xl shadow-sm">
            ⏱ {formatTime(timer.elapsed)}
          </div>
          <div className="font-textbook text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg shadow-sm">
            のこり <span className="font-bold text-slate-700">{game.remaining}</span>
          </div>
        </div>
        {/* すすみ具合バー */}
        <div className="w-full h-3 bg-white rounded-full shadow-inner overflow-hidden mb-1">
          <div
            className={`h-full ${d.bg} transition-all duration-300 rounded-full`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-center font-textbook text-xs text-slate-400 mb-2">
          {game.done} / {game.total} まい せいかい
          {game.mistakes > 0 && <span className="ml-2 text-rose-400">まちがい {game.mistakes}</span>}
        </div>
      </div>

      {/* カード */}
      <div className="flex-1 flex items-center justify-center">
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

      {/* スワイプが むずかしい子むけの ボタン（こたえを出してから おせます） */}
      <div className="w-full max-w-xl mx-auto flex items-center justify-center gap-4 pb-2">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className={`font-pop text-xl text-white ${d.bg} px-10 py-3 rounded-2xl shadow-md transition-all active:scale-95`}
          >
            こたえを みる
          </button>
        ) : (
          <>
            <button
              onClick={handleCorrect}
              className="font-pop text-lg sm:text-xl text-white bg-emerald-500 px-8 py-3 rounded-2xl shadow-md transition-all active:scale-95"
            >
              ⭕ せいかい
            </button>
            <button
              onClick={handleWrong}
              className="font-pop text-lg sm:text-xl text-white bg-rose-500 px-8 py-3 rounded-2xl shadow-md transition-all active:scale-95"
            >
              ❌ もういちど
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// 4-8. 結果画面
function ResultScreen({ deckId, mode, result, isBest, best, onRetry, onChangeMode, onHome }) {
  const d = DECKS[deckId];
  const modeName = mode === 'shuffle' ? 'バラバラ' : 'じゅんばん';
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-7xl mb-4 animate-pop">{isBest ? '🏆' : '🎉'}</div>
      <h2 className="font-pop text-3xl sm:text-4xl text-slate-700 mb-2">
        {isBest ? 'しんきろく！' : 'よくできました！'}
      </h2>
      <div className="font-textbook text-slate-500 mb-6">
        {d.name}・{modeName}モード
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 w-full max-w-sm mb-8">
        <div className="font-textbook text-slate-500 text-sm mb-1">クリアタイム</div>
        <div className={`font-pop text-5xl ${d.text} mb-4 tabular-nums`}>
          {formatTime(result.time)}
        </div>
        <div className="flex justify-around font-textbook text-slate-600">
          <div>
            <div className="text-xs text-slate-400">まいすう</div>
            <div className="text-xl font-bold">{result.total}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">まちがい</div>
            <div className="text-xl font-bold">{result.mistakes}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">ベスト</div>
            <div className="text-xl font-bold">{formatTime(best)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onRetry}
          className={`font-pop text-xl text-white ${d.bg} px-8 py-3 rounded-2xl shadow-md transition-all active:scale-95`}
        >
          🔁 もういちど
        </button>
        <button
          onClick={onChangeMode}
          className="font-pop text-xl text-slate-600 bg-white px-8 py-3 rounded-2xl shadow-md transition-all active:scale-95"
        >
          モードへ
        </button>
        <button
          onClick={onHome}
          className="font-pop text-xl text-slate-600 bg-white px-8 py-3 rounded-2xl shadow-md transition-all active:scale-95"
        >
          🏠 さいしょへ
        </button>
      </div>
    </div>
  );
}

// 4-9. せってい（記録を消す）モーダル
function SettingsModal({ open, onClose, onResetRecords }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-pop text-xl text-slate-700 mb-4">⚙️ せってい</h3>
        <p className="font-textbook text-sm text-slate-500 mb-4 leading-relaxed">
          ベストタイムの きろくを ぜんぶ けすことが できます。
        </p>
        <button
          onClick={onResetRecords}
          className="w-full font-pop text-white bg-rose-500 px-4 py-3 rounded-xl shadow-md transition-all active:scale-95 mb-3"
        >
          きろくを ぜんぶ けす
        </button>
        <button
          onClick={onClose}
          className="w-full font-pop text-slate-600 bg-slate-100 px-4 py-3 rounded-xl transition-all active:scale-95"
        >
          とじる
        </button>
      </div>
    </div>
  );
}

/* =====================================================================
 *  5. メインボード（画面の切り替えをまとめる司令塔）
 * ===================================================================== */
function MainBoard() {
  // screen: 'title' | 'select' | 'mode' | 'play' | 'result'
  const [screen, setScreen] = useState('title');
  const [deckId, setDeckId] = useState(null);
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState(null);
  const [isBest, setIsBest] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // あそぶたびに +1。PlayScreen を新しく作り直す（=ゲームをリセットする）ための番号。
  const [playToken, setPlayToken] = useState(0);

  const timer = useTimer();

  // ベストタイムを LocalStorage に保存。形： { red: { order: ms, shuffle: ms }, ... }
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
      // ベスト更新の判定
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
    (bestTimes[deckId] && bestTimes[deckId][mode]) ??
    (result ? result.time : null);

  return (
    <div className="h-full flex flex-col">
      <Header
        title="けいさんカード"
        onHome={goHome}
        onOpenSettings={() => setSettingsOpen(true)}
      />

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
            deck={DECKS[deckId]}
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
 *  6. アプリを画面に表示
 * ===================================================================== */
function App() {
  return <MainBoard />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
