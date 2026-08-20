// 学習ログの受け渡し口の検査。
//
// ここは「誰に渡してよいか」を決めている場所なので、
// 通してはいけない相手を1つでも通すと学習ログがよそへ渡る。
// 正しく通る例より、通ってはいけない例のほうを厚く並べてある。
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, parseRecords } from '../js/records-export.js';

test('giga-school.com とそのサブドメインには渡す', () => {
  for (const o of [
    'https://giga-school.com',
    'https://keisan-card.giga-school.com',
    'https://gamification.giga-school.com',
    'https://online-100square-calculation.giga-school.com',
  ]) assert.equal(isAllowedOrigin(o), true, o);
});

test('よそのサイトには渡さない', () => {
  for (const o of [
    'https://giga-school.com.example.com',
    'https://evil-giga-school.com',
    'https://giga-school.net',
    'https://gigaschool.com',
    'http://giga-school.com',
    'https://giga-school.com:8443',
    'https://gigayama.github.io',
    'null', '', undefined, null,
    { toString: () => 'https://giga-school.com' },
  ]) assert.equal(isAllowedOrigin(o), false, String(o));
});

test('手元で確かめるための localhost は通す', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:8080'), true);
  assert.equal(isAllowedOrigin('http://localhost.evil.com'), false);
});

test('記録が読めないときは空の配列を返し、集計側を落とさない', () => {
  assert.deepEqual(parseRecords(null), []);
  assert.deepEqual(parseRecords('{壊れたJSON'), []);
  assert.deepEqual(parseRecords('{"a":1}'), []);
});

test('読める記録はそのまま返す', () => {
  const records = [{ schema: 'study.v1', appId: 'keisan-card' }];
  assert.deepEqual(parseRecords(JSON.stringify(records)), records);
});
