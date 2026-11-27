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

test('部類: 最も長く一致したキーワード → 業種 → その他', () => {
  assert.strictEqual(P.guessCategory('expense', 'ローソンチケット'), '娯楽');
  assert.strictEqual(P.guessCategory('expense', 'ローソン 赤坂'), '食費');
  assert.strictEqual(P.guessCategory('expense', '謎のお店', { sub: 'スーパーマーケット' }), '食費');
  assert.strictEqual(P.guessCategory('expense', '謎のお店'), 'その他');
  assert.strictEqual(P.guessCategory('expense', 'SBI証券 クレカ積立'), 'カード投資');
});
test('部類: 覚えた仕分けと追加した部類が優先される', () => {
  const cats = P.defaultCategories();
  cats.expense.push({ name: '接待', icon: '🍷', words: ['接待', '会食'] });
  const opt = { cats, rules: { 'スマートEX': '出張費' } };
  assert.strictEqual(P.guessCategory('expense', 'スマートEX〔JR東海〕', opt), '出張費');
  assert.strictEqual(P.parseLine('取引先 会食 8000', now, opt).category, '接待');
});
test('店名の整形', () => {
  assert.strictEqual(P.cleanMerchant('ダイソー 広島県 東広島市'), 'ダイソー');
  assert.strictEqual(P.cleanMerchant('キッチンオリジン鶴川店 −東京都 町田市'), 'キッチンオリジン鶴川店');
  assert.strictEqual(P.cleanMerchant('ＦＡＳＴＧＹＭ２４ 東京都 千代田区'), 'FASTGYM24');
  assert.strictEqual(P.merchantKey('小田急OX 鶴川店'), '小田急OX');
});
