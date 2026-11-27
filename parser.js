/* Kakei — カテゴリ定義とテキスト解析(Muse連携の中核)。ブラウザとNodeの両方で動きます。 */
(function (root) {
  'use strict';

  const CATEGORIES = {
    expense: [
      { name: '食費', icon: '🍙', words: ['食', 'ランチ', '昼', '夕飯', '晩', '朝食', 'ごはん', 'ご飯', 'カフェ', 'コーヒー', 'スーパー', 'コンビニ', '弁当', '外食', 'パン', '飲み', '居酒屋', 'マック', 'スタバ'] },
      { name: '日用品', icon: '🧻', words: ['日用', '洗剤', 'ティッシュ', 'ドラッグ', '100均', '雑貨', 'シャンプー'] },
      { name: '交通', icon: '🚃', words: ['交通', '電車', 'バス', 'タクシー', 'ガソリン', '駐車', 'suica', 'pasmo', '新幹線', '高速'] },
      { name: '住居', icon: '🏠', words: ['家賃', '住居', '管理費', 'ローン', '更新料'] },
      { name: '光熱・通信', icon: '💡', words: ['電気', 'ガス', '水道', '光熱', 'スマホ', '携帯', '通信', 'ネット', 'wifi', 'wi-fi'] },
      { name: '娯楽', icon: '🎮', words: ['娯楽', '映画', 'ゲーム', '本', '漫画', 'サブスク', 'netflix', '旅行', 'カラオケ', 'ライブ', '趣味'] },
      { name: '医療', icon: '💊', words: ['医療', '病院', '薬', '歯医者', 'クリニック', '整体'] },
      { name: '衣服・美容', icon: '👕', words: ['服', '衣', '靴', '美容', '美容院', 'カット', 'ユニクロ', '化粧'] },
      { name: '交際', icon: '🎁', words: ['交際', 'プレゼント', '飲み会', 'お祝い', 'ご祝儀', '香典'] },
      { name: 'その他', icon: '📦', words: [] },
    ],
    income: [
      { name: '給料', icon: '💴', words: ['給料', '給与', '月給', 'ボーナス', '賞与'] },
      { name: '副業', icon: '💼', words: ['副業', '報酬', '売上', '謝礼'] },
      { name: 'その他収入', icon: '➕', words: ['収入', '入金', '返金', 'お小遣い', 'ポイント'] },
    ],
  };
  const INCOME_HINTS = ['収入', '入金', '給料', '給与', 'ボーナス', '賞与', '副業', '報酬', '売上', '返金', '+'];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function findCategory(type, name) {
    return CATEGORIES[type].find((c) => c.name === name);
  }

  function guessCategory(type, text) {
    const t = (text || '').toLowerCase();
    for (const c of CATEGORIES[type]) if (c.words.some((w) => t.includes(w.toLowerCase()))) return c.name;
    return type === 'income' ? 'その他収入' : 'その他';
  }

  /** "1,200" "1200円" "¥1200" "1.2万" "3千" → 数値 */
  function parseAmount(token) {
    const s = token.replace(/[,，¥￥円\s]/g, '').replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    const m = s.match(/^[+＋-]?(\d+(?:\.\d+)?)(万|千)?$/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    if (m[2] === '万') v *= 10000;
    if (m[2] === '千') v *= 1000;
    return Math.round(v);
  }

  /** "今日" "昨日" "一昨日" "11/20" "2026-11-20" → YYYY-MM-DD */
  function parseDate(token, now) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rel = { '今日': 0, 'きょう': 0, '昨日': -1, 'きのう': -1, '一昨日': -2, 'おととい': -2 };
    if (token in rel) { base.setDate(base.getDate() + rel[token]); return ymd(base); }
    let m = token.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    m = token.match(/^(\d{1,2})[/月](\d{1,2})日?$/);
    if (m) {
      const d = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
      if (d > now) d.setFullYear(d.getFullYear() - 1); // 未来日付なら前年とみなす
      return ymd(d);
    }
    return null;
  }

  /**
   * 1行のテキストを記録に変換します。
   * 例: "ランチ 850" / "昨日 電車 220" / "給料 25万" / "11/20 コンビニ 540円 日用品"
   * @returns {{type,amount,category,memo,date}|null}
   */
  function parseLine(line, now = new Date()) {
    const raw = String(line || '').trim();
    if (!raw) return null;
    const tokens = raw.replace(/　/g, ' ').split(/\s+/);
    let amount = null, date = null, type = null, category = null;
    const rest = [];
    for (const tk of tokens) {
      if (tk === '収入') { type = 'income'; continue; }
      if (tk === '支出') { type = 'expense'; continue; }
      const d = date ? null : parseDate(tk, now);
      if (d) { date = d; continue; }
      const a = amount === null ? parseAmount(tk) : null;
      if (a !== null && a > 0) { amount = a; if (/^[+＋]/.test(tk)) type = 'income'; continue; }
      const cat = findCategory('expense', tk) ? ['expense', tk] : findCategory('income', tk) ? ['income', tk] : null;
      if (cat && !category) { type = type || cat[0]; category = cat[1]; continue; }
      rest.push(tk);
    }
    if (!amount) return null;
    const memo = rest.join(' ');
    if (!type) type = INCOME_HINTS.some((w) => raw.includes(w)) ? 'income' : 'expense';
    if (!category || !findCategory(type, category)) category = guessCategory(type, memo || raw);
    return { type, amount, category, memo, date: date || ymd(now) };
  }

  /** Museからの JSON(オブジェクト/配列/{entries:[]})を正規化します。 */
  function normalizeEntry(obj, now = new Date()) {
    if (!obj || typeof obj !== 'object') return null;
    const amountRaw = obj.amount ?? obj.金額 ?? obj.price;
    let amount = typeof amountRaw === 'number' ? amountRaw : parseAmount(String(amountRaw ?? ''));
    if (!amount || !isFinite(amount)) return null;
    let type = obj.type === 'income' || obj.type === '収入' ? 'income' : obj.type === 'expense' || obj.type === '支出' ? 'expense' : null;
    if (amount < 0) { amount = -amount; type = type || 'expense'; }
    const memo = String(obj.memo ?? obj.メモ ?? obj.note ?? obj.description ?? '').slice(0, 60);
    let category = String(obj.category ?? obj.カテゴリ ?? '');
    if (!type) type = findCategory('income', category) ? 'income' : 'expense';
    if (!findCategory(type, category)) category = guessCategory(type, `${category} ${memo}`);
    const dateStr = obj.date ?? obj.日付;
    const date = (dateStr && parseDate(String(dateStr).slice(0, 10), now)) || ymd(now);
    return { type, amount: Math.round(amount), category, memo, date };
  }

  /** JSON でもテキスト(1行1件)でも受け付けます。 */
  function parseBulk(text, now = new Date()) {
    const s = String(text || '').trim();
    if (!s) return [];
    if (/^[[{]/.test(s)) {
      try {
        let data = JSON.parse(s);
        if (data && !Array.isArray(data)) data = data.entries || data.transactions || [data];
        return data.map((o) => normalizeEntry(o, now)).filter(Boolean);
      } catch (_) { /* テキストとして扱う */ }
    }
    return s.split(/\r?\n/).map((l) => l.replace(/^[-*・]\s*/, '')).map((l) => parseLine(l, now)).filter(Boolean);
  }

  const api = { CATEGORIES, parseLine, parseBulk, parseAmount, parseDate, normalizeEntry, guessCategory, findCategory, ymd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KakeiParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
