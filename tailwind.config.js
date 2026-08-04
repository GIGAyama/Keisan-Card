/* =====================================================================
 *  Tailwind の設定（原本）
 *  ---------------------------------------------------------------------
 *  以前は index.html の中で `cdn.tailwindcss.com` を読みこみ、
 *  ブラウザの中で CSS を作らせていた。学校のネットワークが CDN を
 *  ふさいでいると、その時点で画面が真っ白になる（GIGA Standard v5 §6）。
 *  いまは このファイルを使って ビルド時に css/style.css を作る。
 *
 *  ※ ここを直したら かならず `npm run build` を実行してから push すること。
 * ===================================================================== */
export default {
  // 使っているクラスだけを CSS にする。原本（src/）と index.html を見る。
  content: ['./src/**/*.{js,jsx}', './index.html', './offline.html'],
  theme: {
    extend: {
      fontFamily: {
        // ふだんのUI・見出し。
        // 学校のフィルタリングで Google Fonts が届かなくても字が崩れないよう、
        // 端末側の日本語フォントを必ず後ろに並べる（§2-7）。
        sans: [
          '"Zen Kaku Gothic New"',
          '"Hiragino Kaku Gothic ProN"',
          '"Noto Sans JP"',
          'system-ui',
          'sans-serif',
        ],
        // 計算式・数字（児童が字形を学ぶ場面なので教科書体を最優先）
        textbook: [
          '"UD デジタル 教科書体 NK-R"',
          '"UD Digi Kyokasho NK-R"',
          '"UD Digi Kyokasho N-R"',
          '"Zen Maru Gothic"',
          '"Kosugi Maru"',
          'sans-serif',
        ],
      },
      keyframes: {
        rise: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseOnce: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.14)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        rise: 'rise 0.35s ease-out both',
        pop: 'pop 0.25s ease-out both',
        'pulse-once': 'pulseOnce 0.5s ease-out',
      },
    },
  },
  plugins: [],
};
