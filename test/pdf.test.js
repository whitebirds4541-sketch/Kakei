// PDF明細の読み取りテスト。
// 実際のカード明細と同じく「ToUnicodeなし・Differencesに CTIUxxxx(Adobe-Japan1のCID)」の
// フォントを使ったダミーPDFをその場で作り、読み取り結果を確かめます(個人の明細はリポジトリに含めません)。
const test = require('node:test');
const assert = require('node:assert');
global.window = global.window || {};
require('../vendor/glyphs.js');
const PDFLib = require('../vendor/pdf-lib.min.js');
const K = require('../pdfimport.js');
const P = require('../parser.js');
const G = window.KakeiGlyphs;

// 文字 → CID の逆引き
const cidOf = {};
for (let i = 0; i < G.cid.length; i++) if (G.cid[i] !== '\0' && cidOf[G.cid[i]] === undefined) cidOf[G.cid[i]] = i;

async function makePdf(lines) {
  const { PDFDocument, PDFName } = PDFLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const ctx = doc.context;
  const codes = {};
  const diffs = [];
  let next = 128;
  const enc = (s) => {
    let out = '';
    for (const ch of s) {
      if (ch.charCodeAt(0) < 127 && ch !== '(' && ch !== ')' && ch !== '\\') { out += ch; continue; }
      if (!codes[ch]) {
        const cid = cidOf[ch];
        if (cid === undefined) throw new Error('no cid for ' + ch);
        codes[ch] = next++;
        diffs.push(codes[ch], 'CTIU' + cid.toString(16).toUpperCase().padStart(4, '0'));
      }
      out += '\\' + codes[ch].toString(8);
    }
    return out;
  };
  let content = '';
  for (const [x, y, text] of lines) content += `BT /F1 9 Tf 1 0 0 1 ${x} ${y} Tm (${enc(text)}) Tj ET\n`;
  const font = ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'HeiseiMinchoW3-Regular', Encoding: ctx.obj({ Type: 'Encoding', Differences: diffs }) });
  page.node.set(PDFName.of('Resources'), ctx.obj({ Font: ctx.obj({ F1: ctx.register(font) }) }));
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(content)));
  return doc.save();
}

const LINES = [
  [9, 800, 'ご利用代金明細書'],
  [195, 760, '新規ご利用金額'],
  [36, 740, '1,000 -'], [126, 740, '1,500 +'], [223, 740, '3,000'], [267, 740, '='], [313, 740, '2,500'],
  [9, 720, '明細書作成対象期間'], [183, 720, '2026年10月21日から2026年11月20日まで'],
  [9, 700, 'お支払い金額内容'],
  [9, 680, '10月22日'], [69, 680, 'お支払いありがとうございました（銀行よりご送金分）'], [511, 680, '- 1,000'],
  [9, 660, 'ご入金・調整金額内容（＊印は対象です）'],
  [9, 640, '11月4日'], [69, 640, 'アパホテル 東京都 港区'], [516, 640, '- 500'],
  [69, 631, '旅行代理店'],
  [9, 600, '今月ご利用額　山田　花子　様'],
  [9, 580, '10月14日'], [69, 580, 'セブンイレブン'], [534, 580, '1,000'],
  [69, 571, '専門店（食料品）'],
  [9, 550, '11月20日'], [69, 550, 'スマートＥＸ〔ＪＲ東海〕 東京都 港区'], [527, 550, '2,000'],
  [69, 541, '旅行代理店'],
  [9, 500, '「お支払い/ご入金・調整金額」前回締め日の翌日からの金額。'],
  [9, 480, '12月30日'], [69, 480, '楽天証券 投信積立'], [527, 480, '0'],
];

test('文字対応表のないPDFから漢字を復元して行にできる', async () => {
  const pages = await K.extractLines(await makePdf(LINES), { PDFLib, glyphs: G });
  const texts = pages[0].lines.map((l) => l.text);
  assert.ok(texts.includes('ご利用代金明細書'));
  assert.ok(texts.some((t) => t.startsWith('10月14日') && t.includes('セブンイレブン') && t.endsWith('1,000')));
});

test('支払い・返金・利用を分けて、明細の合計と照合できる', async () => {
  const pages = await K.extractLines(await makePdf(LINES), { PDFLib, glyphs: G });
  const st = K.parseStatement(pages);
  assert.deepStrictEqual(st.period, { from: '2026-10-21', to: '2026-11-20' });
  const kinds = st.items.map((i) => [i.kind, i.date, i.amount]);
  assert.deepStrictEqual(kinds, [
    ['payment', '2026-10-22', -1000],
    ['refund', '2026-11-04', -500],
    ['purchase', '2026-10-14', 1000],
    ['purchase', '2026-11-20', 2000],
  ]);
  assert.strictEqual(st.totals.newCharges, 3000);
  assert.strictEqual(st.totals.purchases, 3000);
  assert.strictEqual(st.items[2].sub, '専門店(食料品)');
  assert.strictEqual(st.items[2].holder, '山田 花子');
});

test('取り込んだ明細を部類に仕分けられる', async () => {
  const pages = await K.extractLines(await makePdf(LINES), { PDFLib, glyphs: G });
  const st = K.parseStatement(pages);
  const cat = (i) => P.guessCategory('expense', P.cleanMerchant(i.desc), { sub: i.sub });
  assert.deepStrictEqual(st.items.filter((i) => i.kind !== 'payment').map(cat), ['旅行・宿泊', '食費', '交通']);
  assert.strictEqual(P.cleanMerchant(st.items[3].desc), 'スマートEX〔JR東海〕');
});

test('ToUnicode CMap も読める', () => {
  const cmap = new TextEncoder().encode('begincodespacerange <0000> <FFFF> endcodespacerange\n2 beginbfchar <0001> <6708> <0002> <65E5> endbfchar\n1 beginbfrange <0010> <0012> <3042> endbfrange');
  const { map, codeLen } = K.parseToUnicode(cmap);
  assert.strictEqual(codeLen, 2);
  assert.strictEqual(map[1] + map[2], '月日');
  assert.strictEqual(map[0x10] + map[0x12], 'あい');
});
