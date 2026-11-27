/* Kakei — 部類(カテゴリ)と仕分け、テキスト解析(Muse連携の中核)。ブラウザとNodeの両方で動きます。 */
(function (root) {
  'use strict';

  /**
   * 初期の部類。words は店名・メモに含まれていたらその部類にするキーワード。
   * invest: true の部類は「支出」ではなく「投資」として別に集計します。
   * 設定画面から追加・名前変更・キーワード編集・削除ができます。
   */
  const DEFAULT_CATEGORIES = {
    expense: [
      { name: '食費', icon: '🍙', words: ['食費', 'ランチ', '昼食', '夕飯', '晩ご飯', '朝食', 'ごはん', 'ご飯', 'カフェ', 'コーヒー', 'スーパー', 'コンビニ', '弁当', '外食', 'パン', '居酒屋', 'マクドナルド', 'スターバックス', 'スタバ', 'ドトール', 'ベローチェ', 'タリーズ', 'セブンイレブン', 'セブン-イレブン', 'ファミリーマート', 'ローソン', 'ミニストップ', 'デイリーヤマザキ', 'ニューデイズ', '成城石井', 'マルエツ', 'イオン', '西友', 'ライフ', 'オーケー', '業務スーパー', '小田急OX', 'オリジン', 'ほっともっと', '吉野家', 'すき家', '松屋', 'サイゼリヤ', 'スシロー', 'くら寿司', '焼肉', 'そば', 'うどん', 'ラーメン', '食堂', 'ビアードパパ', 'まちおか', 'メグリア', 'ウーバーイーツ', 'uber eats', '出前館'] },
      { name: '日用品', icon: '🧻', words: ['日用品', '洗剤', 'ティッシュ', 'ドラッグ', 'マツモトキヨシ', 'クスリ', 'ウエルシア', 'ツルハ', 'スギ薬局', 'ダイソー', 'キャンドゥ', 'セリア', '100均', 'ホームセンター', 'カインズ', 'ニトリ', '無印良品', 'ドン・キホーテ', 'アマゾン', 'amazon'] },
      { name: '交通', icon: '🚃', words: ['交通', '電車', 'バス', 'タクシー', 'ガソリン', '駐車', 'suica', 'pasmo', 'icoca', '新幹線', '高速', 'etc', '乗車券', 'スマートex', 'えきねっと', 'jr東海', 'jr東日本', 'jr西日本', '運賃', 'go タクシー', 'エネオス', 'eneos'] },
      { name: '住居', icon: '🏠', words: ['家賃', '住居', '管理費', '住宅ローン', '更新料'] },
      { name: '光熱・通信', icon: '💡', words: ['電気料金', '電気代', 'ガス代', '東京ガス', '水道', '光熱', 'スマホ代', '携帯', 'docomo', 'ドコモ', 'ソフトバンク', '楽天モバイル', 'ahamo', 'povo', 'uq', 'ワイモバイル', 'ネット回線', 'wifi', 'wi-fi', 'nuro', '九電', '東京電力', '関西電力'] },
      { name: 'サブスク', icon: '🔁', words: ['サブスク', 'netflix', 'spotify', 'prime video', 'プライム会費', 'amazon プライム', 'アマゾンプライム', 'youtube', 'apple.com', 'itunes', 'icloud', 'disney', 'hulu', 'u-next', 'dazn', 'claude', 'anthropic', 'openai', 'chatgpt', 'adobe', 'microsoft', '会員費', '月額'] },
      { name: '娯楽', icon: '🎮', words: ['娯楽', '映画', 'ゲーム', '漫画', 'カラオケ', 'ライブ', '趣味', 'チケット', 'tsutaya', 'カードショップ', 'ポケモン', 'gym', 'ジム', '書店', '本屋', 'ブックオフ', 'アニメイト', 'ローソンチケット', 'チケットぴあ', 'イープラス'] },
      { name: '医療', icon: '💊', words: ['医療', '病院', '歯科', '歯医者', 'クリニック', '医院', '調剤', '整体', '整骨'] },
      { name: '衣服・美容', icon: '👕', words: ['服', '靴', '美容', '美容院', 'ヘアサロン', 'カット', 'ユニクロ', 'gu ', 'zara', 'h&m', 'shein', '化粧', 'コスメ', 'エステ', 'ネイル'] },
      { name: '交際', icon: '🎁', words: ['交際', 'プレゼント', '飲み会', 'お祝い', 'ご祝儀', '香典', 'ギフト'] },
      { name: '旅行・宿泊', icon: '🏨', words: ['旅行', 'ホテル', '宿泊', '旅館', 'じゃらん', '楽天トラベル', '一休', 'booking.com', 'agoda', 'airbnb', 'リッツ', 'アパホテル', '東横イン'] },
      { name: '出張費', icon: '🧳', words: ['出張'] },
      { name: '税金・手数料', icon: '🏛', words: ['税', 'eltax', '国民年金', '国民健康保険', '保険料', '手数料', '年会費', '参加費', '遅延損害金', '利息', 'ふるさと納税'] },
      { name: '投資', icon: '📈', invest: true, words: ['投資', 'ideco', 'イデコ'] },
      { name: 'カード投資', icon: '💳', invest: true, words: ['カード投資', 'カード積立', '投信積立', '積立', '証券', 'nisa', 'つみたて'] },
      { name: 'その他', icon: '📦', words: [] },
    ],
    income: [
      { name: '給料', icon: '💴', words: ['給料', '給与', '月給', 'ボーナス', '賞与'] },
      { name: '副業', icon: '💼', words: ['副業', '報酬', '売上', '謝礼'] },
      { name: '投資収益', icon: '📊', words: ['配当', '分配金', '利金', '売却益'] },
      { name: 'その他収入', icon: '➕', words: ['収入', '入金', '返金', 'お小遣い', 'ポイント', 'キャッシュバック'] },
    ],
  };

  /** カード会社の「業種」欄 → 部類(店名で決まらなかったときに使う) */
  const SUB_MAP = [
    ['スーパーマーケット', '食費'], ['ジハンキ', '食費'], ['自販機', '食費'], ['ケンバイキ', '食費'], ['コンビニエンス', '食費'], ['食料品', '食費'], ['飲食店', '食費'], ['レストラン', '食費'],
    ['薬局', '日用品'], ['ドラッグ', '日用品'], ['ホームセンター', '日用品'], ['ディスカウント', '日用品'],
    ['宿泊', '旅行・宿泊'], ['旅行代理店', '旅行・宿泊'], ['運賃', '交通'], ['交通', '交通'], ['ガソリン', '交通'],
    ['税/公的', '税金・手数料'], ['公的費用', '税金・手数料'], ['カード・サービス', '税金・手数料'], ['保険', '税金・手数料'],
    ['美容院', '衣服・美容'], ['エステ', '衣服・美容'], ['洋品店', '衣服・美容'], ['衣料', '衣服・美容'],
    ['趣味', '娯楽'], ['玩具', '娯楽'], ['レコード', '娯楽'], ['ビデオ', '娯楽'], ['入場料', '娯楽'], ['書籍', '娯楽'],
    ['設備利用費', '光熱・通信'], ['電気', '光熱・通信'], ['医療', '医療'], ['病院', '医療'],
  ];

  const INCOME_HINTS = ['収入', '入金', '給料', '給与', 'ボーナス', '賞与', '副業', '報酬', '売上', '配当', '+'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase();
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function findCategory(type, name, cats = DEFAULT_CATEGORIES) {
    return (cats[type] || []).find((c) => c.name === name);
  }
  function fallbackCategory(type, cats = DEFAULT_CATEGORIES) {
    const list = cats[type] || [];
    const other = list.find((c) => /その他/.test(c.name));
    return (other || list[list.length - 1] || { name: type === 'income' ? 'その他収入' : 'その他' }).name;
  }

  /**
   * 仕分け: (1) 学習した店名ルール (2) 部類のキーワード(最も長く一致したもの) (3) カード会社の業種 (4) その他
   * @param {string} type 'expense' | 'income'
   * @param {string} text 店名やメモ
   * @param {object} [opt] { cats, rules: {店名: 部類}, sub: 業種 }
   */
  function guessCategory(type, text, opt = {}) {
    const cats = opt.cats || DEFAULT_CATEGORIES;
    const t = norm(text);
    if (opt.rules) {
      let best = null;
      for (const [key, cat] of Object.entries(opt.rules)) {
        const k = norm(key);
        if (k && t.includes(k) && findCategory(type, cat, cats) && (!best || k.length > best[0].length)) best = [k, cat];
      }
      if (best) return best[1];
    }
    let best = null;
    for (const c of cats[type] || []) {
      for (const w of c.words || []) {
        const k = norm(w).trim();
        if (k && t.includes(k) && (!best || k.length > best[0])) best = [k.length, c.name];
      }
    }
    if (best) return best[1];
    if (opt.sub && type === 'expense') {
      const s = norm(opt.sub);
      for (const [w, cat] of SUB_MAP) if (s.includes(norm(w)) && findCategory(type, cat, cats)) return cat;
    }
    return fallbackCategory(type, cats);
  }

  /** 明細の店名を読みやすく(全角英数→半角、末尾の「東京都 港区」などを除く) */
  function cleanMerchant(s) {
    return String(s || '').normalize('NFKC')
      .replace(/\s+[-−‐]?\s*(北海道|東京都|(京都|大阪)府|[^\s]{2,3}県)(\s.*)?$/, '')
      .replace(/\s+/g, ' ').trim();
  }
  /** 学習ルールのキー: 支店名などを除いた店名の先頭部分 */
  function merchantKey(s) {
    const m = cleanMerchant(s);
    const first = m.split(' ')[0];
    return first.length >= 3 ? first : m;
  }

  /** "1,200" "1200円" "¥1200" "1.2万" "3千" → 数値 */
  function parseAmount(token) {
    const s = String(token).replace(/[,，¥￥円\s]/g, '').replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
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
  function parseLine(line, now = new Date(), opt = {}) {
    const cats = opt.cats || DEFAULT_CATEGORIES;
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
      const cat = findCategory('expense', tk, cats) ? ['expense', tk] : findCategory('income', tk, cats) ? ['income', tk] : null;
      if (cat && !category) { type = type || cat[0]; category = cat[1]; continue; }
      rest.push(tk);
    }
    if (!amount) return null;
    const memo = rest.join(' ');
    if (!type) type = INCOME_HINTS.some((w) => raw.includes(w)) ? 'income' : 'expense';
    if (!category || !findCategory(type, category, cats)) category = guessCategory(type, memo || raw, opt);
    return { type, amount, category, memo, date: date || ymd(now) };
  }

  /** Museからの JSON(オブジェクト/配列/{entries:[]})を正規化します。 */
  function normalizeEntry(obj, now = new Date(), opt = {}) {
    const cats = opt.cats || DEFAULT_CATEGORIES;
    if (!obj || typeof obj !== 'object') return null;
    const amountRaw = obj.amount ?? obj.金額 ?? obj.price;
    let amount = typeof amountRaw === 'number' ? amountRaw : parseAmount(String(amountRaw ?? ''));
    if (!amount || !isFinite(amount)) return null;
    let type = obj.type === 'income' || obj.type === '収入' ? 'income' : obj.type === 'expense' || obj.type === '支出' ? 'expense' : null;
    if (amount < 0) { amount = -amount; type = type || 'expense'; }
    const memo = String(obj.memo ?? obj.メモ ?? obj.note ?? obj.description ?? '').slice(0, 60);
    let category = String(obj.category ?? obj.カテゴリ ?? obj.部類 ?? '');
    if (!type) type = findCategory('income', category, cats) ? 'income' : 'expense';
    if (!findCategory(type, category, cats)) category = guessCategory(type, `${category} ${memo}`, opt);
    const dateStr = obj.date ?? obj.日付;
    const date = (dateStr && parseDate(String(dateStr).slice(0, 10), now)) || ymd(now);
    return { type, amount: Math.round(amount), category, memo, date };
  }

  /** JSON でもテキスト(1行1件)でも受け付けます。 */
  function parseBulk(text, now = new Date(), opt = {}) {
    const s = String(text || '').trim();
    if (!s) return [];
    if (/^[[{]/.test(s)) {
      try {
        let data = JSON.parse(s);
        if (data && !Array.isArray(data)) data = data.entries || data.transactions || [data];
        return data.map((o) => normalizeEntry(o, now, opt)).filter(Boolean);
      } catch (_) { /* テキストとして扱う */ }
    }
    return s.split(/\r?\n/).map((l) => l.replace(/^[-*・]\s*/, '')).map((l) => parseLine(l, now, opt)).filter(Boolean);
  }

  const api = {
    DEFAULT_CATEGORIES, CATEGORIES: DEFAULT_CATEGORIES, SUB_MAP,
    defaultCategories: () => clone(DEFAULT_CATEGORIES),
    parseLine, parseBulk, parseAmount, parseDate, normalizeEntry, guessCategory, findCategory, fallbackCategory,
    cleanMerchant, merchantKey, ymd,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KakeiParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
