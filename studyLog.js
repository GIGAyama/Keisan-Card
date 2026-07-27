/* =====================================================================
 *  study.v1 共通学習ログ  studyLog.js
 *  ---------------------------------------------------------------------
 *  学習ログ共通スキーマ仕様書 `study.v1`（GIGA山 学習アプリ群）の §5.1。
 *  **保存のみを行い、外部への送信は一切しません。**
 *  送信は、同じオリジンに置かれた別ページ（送信ページ）が担当します。
 *
 *  ロジック版：**1.1**（仕様書 §5.1.2 の参照実装に対応）
 *  配布形態　：**グローバル**（仕様書 §5.1.1）
 *
 *  ロジック本体は 5つのアプリ（Qalc／漢字タウン／けいさんカード／
 *  さんすうブロック／100マス計算）で **同一** にします。
 *  改訂したら 1本だけでなく 5本すべてに 配り直し、仕様書 §5.1.3 の
 *  追跡表を 更新してください。コメントや形式（ESM／グローバル）の
 *  ちがいは かまいませんが、ロジックの版ずれは いけません。
 *
 *  仕様書は ESM（`export function saveStudyRecord`）と グローバル
 *  （IIFE で `globalThis.StudyLog.saveStudyRecord`）の 2形態を 認めています。
 *  けいさんカードは ビルドをせず <script> で読みこむ構成のため、
 *  **グローバル形態**です。呼び出し側は、モジュールが 読みこまれていなくても
 *  アプリが動くよう、存在を たしかめてから 呼びます。
 *
 *  【保存先】
 *    localStorage の `study.records.v1`（レコード配列の JSON）
 *    ※ アプリ固有のキー（`keisan-card-…`）ではなく、アプリ間で共有する
 *      意図的な例外です。リセット処理・クリーンアップの対象に
 *      **入れないでください**（未送信のログが消えます）。
 * ===================================================================== */
(function (global) {
  'use strict';

  var STUDY_LOG_KEY = 'study.records.v1';
  var STUDY_LOG_MAX = 500; // これを超えたら 古いものから 捨てる（§1.3）
  var STUDY_ITEMS_MAX = 200; // 1レコードあたりの 設問数の上限（§2.10）

  // レコードの重複排除に使う ID。crypto.randomUUID が無い環境でも動くように。
  var uuid = function () {
    return global.crypto && global.crypto.randomUUID
      ? global.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  };

  // 誤答内容のサニタイズ（§2.10）。自由入力の値を そのまま 残さない。
  var sanitizeWrong = function (v) {
    return typeof v === 'string' && v.length <= 12 && !/[<>{}\\]/.test(v) ? v : null;
  };

  /**
   * 学習ログを1件 保存します。
   * @param {object} rec レコード（appId / unit / elapsedMs / summary は必須）
   * @returns {string|null} 保存できたレコードの id。できなければ null
   */
  function saveStudyRecord(rec) {
    try {
      // 必須項目の検証（ここで 一度だけ 行う）
      if (!rec || !rec.appId || !rec.unit || !rec.unit.id) return null;
      if (typeof rec.elapsedMs !== 'number' || rec.elapsedMs < 0) return null;
      if (!rec.summary || typeof rec.summary.count !== 'number') return null;

      var items = Array.isArray(rec.items)
        ? rec.items.slice(0, STUDY_ITEMS_MAX).map(function (it) {
            var out = Object.assign({}, it);
            out.wrong = Array.isArray(it.wrong)
              ? it.wrong.map(sanitizeWrong).filter(Boolean)
              : undefined;
            return out;
          })
        : undefined;

      var entry = Object.assign(
        {
          schema: 'study.v1',
          id: uuid(),
          kind: 'session',
          source: 'course',
          multiplayer: false,
          grading: 'objective',
          status: 'completed',
          timeBasis: 'app',
        },
        rec,
        {
          items: items,
          elapsedMs: Math.round(rec.elapsedMs),
        }
      );

      // これまでの保存を読む。
      //   中身が こわれていた（JSON として読めない／配列でない）ときは、
      //   新しい配列から やりなおします。外がわの catch に ながすと、
      //   一度こわれた端末は それ以降 ずっと 1件も 保存できなくなり、
      //   しかも 保存失敗を 握りつぶす設計のため だれも 気づけません。
      var raw = global.localStorage.getItem(STUDY_LOG_KEY);
      var log = [];
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) log = parsed;
        } catch (e) {
          /* こわれていた → 空からやりなおす */
        }
      }
      log.push(entry);
      if (log.length > STUDY_LOG_MAX) log.splice(0, log.length - STUDY_LOG_MAX);
      global.localStorage.setItem(STUDY_LOG_KEY, JSON.stringify(log));
      return entry.id;
    } catch (e) {
      // 保存に失敗しても アプリの動作は 止めない（学習ログの都合で
      // ゲームが止まってはいけない）。
      console.warn('[studyLog] save failed', e);
      return null;
    }
  }

  global.StudyLog = {
    KEY: STUDY_LOG_KEY,
    MAX: STUDY_LOG_MAX,
    ITEMS_MAX: STUDY_ITEMS_MAX,
    saveStudyRecord: saveStudyRecord,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
