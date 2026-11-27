const test = require('node:test');
const assert = require('node:assert');
const P = require('../parser.js');
const now = new Date(2026, 10, 27); // 2026-11-27

test('シンプルな支出', () => {
  assert.deepStrictEqual(P.parseLine('ランチ 850', now), { type: 'expense', amount: 850, category: '食費', memo: 'ランチ', date: '2026-11-27' });
});
test('日付・円表記・カテゴリ推定', () => {
  const r = P.parseLine('昨日 電車 1,200円', now);
  assert.strictEqual(r.date, '2026-11-26'); assert.strictEqual(r.amount, 1200); assert.strictEqual(r.category, '交通');
  assert.strictEqual(P.parseLine('11/20 ドラッグストア 540', now).category, '日用品');
  assert.strictEqual(P.parseLine('12/30 本 500', now).date, '2025-12-30');
});
test('収入と万単位', () => {
  const r = P.parseLine('給料 25万', now);
  assert.strictEqual(r.type, 'income'); assert.strictEqual(r.amount, 250000); assert.strictEqual(r.category, '給料');
});
test('明示カテゴリ', () => {
  assert.strictEqual(P.parseLine('3000 交際 飲み代', now).category, '交際');
});
test('金額なしは null', () => { assert.strictEqual(P.parseLine('ランチ', now), null); });
test('Muse の JSON を取り込める', () => {
  const list = P.parseBulk('[{"date":"2026-11-25","amount":850,"category":"食費","memo":"ランチ"},{"type":"income","amount":"3万","memo":"副業"}]', now);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[1].type, 'income'); assert.strictEqual(list[1].amount, 30000); assert.strictEqual(list[1].category, '副業');
  assert.strictEqual(P.parseBulk('{"entries":[{"amount":-500,"memo":"コンビニ"}]}', now)[0].category, '食費');
});
test('複数行テキスト', () => {
  assert.strictEqual(P.parseBulk('- ランチ 850\n- バス 220\n\nメモだけ', now).length, 2);
});
