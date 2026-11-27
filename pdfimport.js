/* Kakei — PDF明細の読み込み
 * 1) PDFから文字と位置を取り出す(フォントの文字対応表が無い明細でも Adobe-Japan1 の番号から復元)
 * 2) 行に組み立てて「日付・内容・金額」を拾い、支払い/返金/利用に分ける
 * ブラウザでは window.KakeiPdf、Node では module.exports で使えます。
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // コンテンツストリームの字句解析
  // ---------------------------------------------------------------------------
  const WS = new Set([0, 9, 10, 12, 13, 32]);
  const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

  function tokenize(bytes) {
    const out = [];
    let i = 0;
    const n = bytes.length;
    while (i < n) {
      const c = bytes[i];
      if (WS.has(c)) { i++; continue; }
      if (c === 37) { while (i < n && bytes[i] !== 10 && bytes[i] !== 13) i++; continue; } // %コメント
      if (c === 40) { // (文字列)
        const buf = [];
        let depth = 1; i++;
        while (i < n && depth) {
          let b = bytes[i++];
          if (b === 92) {
            const e = bytes[i++];
            if (e === 110) buf.push(10); else if (e === 114) buf.push(13); else if (e === 116) buf.push(9);
            else if (e === 98) buf.push(8); else if (e === 102) buf.push(12);
            else if (e >= 48 && e <= 55) {
              let v = e - 48;
              for (let k = 0; k < 2 && bytes[i] >= 48 && bytes[i] <= 55; k++) v = v * 8 + bytes[i++] - 48;
              buf.push(v & 255);
            } else if (e === 13) { if (bytes[i] === 10) i++; } else if (e === 10) { /* 行継続 */ } else buf.push(e);
            continue;
          }
          if (b === 40) depth++;
          if (b === 41 && --depth === 0) break;
          buf.push(b);
        }
        out.push({ t: 'str', v: buf });
        continue;
      }
      if (c === 60 && bytes[i + 1] === 60) { out.push({ t: 'op', v: '<<' }); i += 2; continue; }
      if (c === 62 && bytes[i + 1] === 62) { out.push({ t: 'op', v: '>>' }); i += 2; continue; }
      if (c === 60) { // <16進文字列>
        let hex = ''; i++;
        while (i < n && bytes[i] !== 62) { const ch = bytes[i++]; if (!WS.has(ch)) hex += String.fromCharCode(ch); }
        i++;
        if (hex.length % 2) hex += '0';
        const buf = [];
        for (let k = 0; k < hex.length; k += 2) buf.push(parseInt(hex.substr(k, 2), 16));
        out.push({ t: 'str', v: buf });
        continue;
      }
      if (c === 91 || c === 93 || c === 123 || c === 125) { out.push({ t: 'op', v: String.fromCharCode(c) }); i++; continue; }
      if (c === 47) { // /名前
        let s = ''; i++;
        while (i < n && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) s += String.fromCharCode(bytes[i++]);
        out.push({ t: 'name', v: s.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) });
        continue;
      }
      let s = '';
      while (i < n && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) s += String.fromCharCode(bytes[i++]);
      if (!s) { i++; continue; }
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) out.push({ t: 'num', v: parseFloat(s) });
      else if (s === 'BI') { // インライン画像は読み飛ばす
        while (i < n - 2 && !(bytes[i] === 69 && bytes[i + 1] === 73 && WS.has(bytes[i + 2]) && WS.has(bytes[i - 1]))) i++;
        i += 2;
      } else out.push({ t: 'op', v: s });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // フォント → 文字の対応
  // ---------------------------------------------------------------------------
  const WIN_ANSI_HIGH = { 128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ' };

  function glyphNameToChar(name, G) {
    if (G.agl[name] !== undefined) return G.agl[name];
    let m = name.match(/^CTIU([0-9A-Fa-f]{4})$/) || name.match(/^cid(\d+)$/i);
    if (m) {
      const cid = name.startsWith('CTIU') ? parseInt(m[1], 16) : parseInt(m[1], 10);
      return cidToChar(cid, G);
    }
    m = name.match(/^uni([0-9A-Fa-f]{4,})$/) || name.match(/^u([0-9A-Fa-f]{4,6})$/);
    if (m) return String.fromCodePoint(parseInt(m[1].slice(0, m[1].length >= 8 ? 4 : m[1].length), 16));
    const base = name.split('.')[0];
    if (base !== name && G.agl[base] !== undefined) return G.agl[base];
    return '';
  }
  function cidToChar(cid, G) {
    if (G.cidExtra[cid]) return G.cidExtra[cid];
    const ch = G.cid[cid];
    return ch && ch !== '\0' ? ch : '';
  }

  /** ToUnicode CMap を {code: 文字} に */
  function parseToUnicode(bytes) {
    const text = new TextDecoder('latin1').decode(bytes);
    const map = {};
    let codeLen = 1;
    const hexToStr = (h) => {
      let s = '';
      for (let k = 0; k + 4 <= h.length; k += 4) s += String.fromCharCode(parseInt(h.substr(k, 4), 16));
      if (h.length === 2) s = String.fromCharCode(parseInt(h, 16));
      return s;
    };
    const cs = text.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/);
    if (cs) codeLen = cs[1].length / 2;
    for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { map[parseInt(m[1], 16)] = hexToStr(m[2]); codeLen = m[1].length / 2; }
    }
    for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
        const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
        codeLen = m[1].length / 2;
        if (m[3][0] === '[') {
          const arr = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexToStr(x[1]));
          for (let c = lo; c <= hi && c - lo < arr.length; c++) map[c] = arr[c - lo];
        } else {
          const h = m[3].slice(1, -1);
          const start = hexToStr(h);
          for (let c = lo; c <= hi && c - lo < 65536; c++) {
            map[c] = start.slice(0, -1) + String.fromCharCode(start.charCodeAt(start.length - 1) + (c - lo));
          }
        }
      }
    }
    return { map, codeLen };
  }

  function makeFontDecoder(fontDict, ctx, G) {
    const PL = ctx.PL;
    const get = (d, k) => (d ? d.lookup(PL.PDFName.of(k)) : undefined);
    const nameOf = (o) => (o && o.asString ? o.asString().replace(/^\//, '') : o && o.encodedName ? o.encodedName.replace(/^\//, '') : String(o || '').replace(/^\//, ''));
    const subtype = nameOf(get(fontDict, 'Subtype'));
    const isType0 = subtype === 'Type0';
    const baseFont = nameOf(get(fontDict, 'BaseFont'));

    let toUni = null;
    const tu = get(fontDict, 'ToUnicode');
    if (tu && tu.contents) { try { toUni = parseToUnicode(ctx.decodeStream(tu)); } catch (_) { toUni = null; } }

    // 単純フォント: Encoding / Differences
    const codeMap = {};
    let base = 'standard';
    const enc = get(fontDict, 'Encoding');
    if (enc) {
      if (enc instanceof PL.PDFName) base = nameOf(enc);
      else if (enc instanceof PL.PDFDict) {
        const be = get(enc, 'BaseEncoding');
        if (be) base = nameOf(be);
        const diff = get(enc, 'Differences');
        if (diff) {
          let code = 0;
          for (let k = 0; k < diff.size(); k++) {
            const it = diff.lookup(k);
            if (it instanceof PL.PDFNumber) code = it.asNumber();
            else { codeMap[code] = glyphNameToChar(nameOf(it), G); code++; }
          }
        }
      }
    }
    // Type0 + Adobe-Japan1(ToUnicodeなし)なら CID → Unicode
    let cidJapan = false;
    if (isType0) {
      const desc = get(fontDict, 'DescendantFonts');
      const d0 = desc && desc.lookup(0);
      const si = d0 && get(d0, 'CIDSystemInfo');
      const ord = si && get(si, 'Ordering');
      cidJapan = !!(ord && /Japan1/.test(ord.decodeText ? ord.decodeText() : String(ord)));
    }

    // 文字幅(位置の推定用)
    const widths = {};
    const fc = get(fontDict, 'FirstChar');
    const ws = get(fontDict, 'Widths');
    if (fc && ws) { const f = fc.asNumber(); for (let k = 0; k < ws.size(); k++) { const w = ws.lookup(k); widths[f + k] = w && w.asNumber ? w.asNumber() : 500; } }

    return {
      name: baseFont,
      twoByte: isType0,
      decode(bytes) {
        let text = '';
        let width = 0;
        const step = isType0 ? 2 : (toUni && toUni.codeLen === 2 ? 2 : 1);
        for (let k = 0; k < bytes.length; k += step) {
          const code = step === 2 ? (bytes[k] << 8) | (bytes[k + 1] || 0) : bytes[k];
          let ch;
          if (toUni && toUni.map[code] !== undefined) ch = toUni.map[code];
          else if (isType0) ch = cidJapan ? cidToChar(code, G) : '';
          else if (codeMap[code] !== undefined) ch = codeMap[code];
          else if (code >= 32 && code < 127) ch = String.fromCharCode(code);
          else if (code >= 160 && /WinAnsi/.test(base)) ch = String.fromCharCode(code);
          else if (WIN_ANSI_HIGH[code] && /WinAnsi/.test(base)) ch = WIN_ANSI_HIGH[code];
          else ch = '';
          text += ch;
          width += widths[code] !== undefined ? widths[code] : isType0 ? 1000 : (ch && ch.charCodeAt(0) > 0x2000 ? 1000 : 556);
        }
        return { text, width };
      },
    };
  }

  // ---------------------------------------------------------------------------
  // ページの文字を位置付きで取り出す
  // ---------------------------------------------------------------------------
  const mul = (a, b) => [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];

  function extractRuns(contentBytes, resources, ctx, G, ctm0, depth) {
    const PL = ctx.PL;
    const runs = [];
    const toks = tokenize(contentBytes);
    const fonts = {};
    const fontRes = resources && resources.lookup(PL.PDFName.of('Font'));
    const xobjRes = resources && resources.lookup(PL.PDFName.of('XObject'));
    const fontFor = (name) => {
      if (fonts[name]) return fonts[name];
      const fd = fontRes && fontRes.lookup(PL.PDFName.of(name));
      fonts[name] = fd instanceof PL.PDFDict ? makeFontDecoder(fd, ctx, G) : { decode: () => ({ text: '', width: 0 }) };
      return fonts[name];
    };

    let ctm = ctm0.slice();
    const stack = [];
    let tm = [1, 0, 0, 1, 0, 0], tlm = tm.slice();
    let font = null, size = 12, leading = 0, tc = 0, tw = 0, th = 1;
    let args = [];

    const show = (bytes) => {
      if (!font) return;
      const { text, width } = font.decode(bytes);
      const m = mul(tm, ctm);
      const fs = size * Math.hypot(m[2], m[3]) || size;
      const charCount = font.twoByte ? bytes.length / 2 : bytes.length;
      const adv = ((width / 1000) * size + tc * charCount) * th;
      if (text.trim()) runs.push({ x: m[4], y: m[5], text, size: fs, w: adv * Math.hypot(m[0], m[1]) });
      tm = mul([1, 0, 0, 1, adv, 0], tm);
    };
    const nextLine = () => { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice(); };

    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.t !== 'op') { args.push(tk); continue; }
      const op = tk.v;
      if (op === '[') { // 配列
        const arr = [];
        let d = 1;
        for (i++; i < toks.length; i++) {
          const x = toks[i];
          if (x.t === 'op' && x.v === '[') d++;
          if (x.t === 'op' && x.v === ']' && --d === 0) break;
          arr.push(x);
        }
        args.push({ t: 'arr', v: arr });
        continue;
      }
      if (op === '<<') { let d = 1; for (i++; i < toks.length && d; i++) { const x = toks[i]; if (x.t === 'op' && x.v === '<<') d++; if (x.t === 'op' && x.v === '>>') d--; } i--; args.push({ t: 'dict' }); continue; }
      const nums = args.filter((a) => a.t === 'num').map((a) => a.v);
      switch (op) {
        case 'q': stack.push(ctm.slice()); break;
        case 'Q': ctm = stack.pop() || ctm0.slice(); break;
        case 'cm': if (nums.length >= 6) ctm = mul(nums.slice(-6), ctm); break;
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
        case 'Tf': { const nm = args.find((a) => a.t === 'name'); if (nm) font = fontFor(nm.v); if (nums.length) size = nums[nums.length - 1]; break; }
        case 'Tc': tc = nums[0] || 0; break;
        case 'Tw': tw = nums[0] || 0; break;
        case 'Tz': th = (nums[0] || 100) / 100; break;
        case 'TL': leading = nums[0] || 0; break;
        case 'Td': tlm = mul([1, 0, 0, 1, nums[0] || 0, nums[1] || 0], tlm); tm = tlm.slice(); break;
        case 'TD': leading = -(nums[1] || 0); tlm = mul([1, 0, 0, 1, nums[0] || 0, nums[1] || 0], tlm); tm = tlm.slice(); break;
        case 'Tm': if (nums.length >= 6) { tlm = nums.slice(-6); tm = tlm.slice(); } break;
        case 'T*': nextLine(); break;
        case 'Tj': { const s = args.find((a) => a.t === 'str'); if (s) show(s.v); break; }
        case "'": { nextLine(); const s = args.find((a) => a.t === 'str'); if (s) show(s.v); break; }
        case '"': { if (nums.length >= 2) { tw = nums[0]; tc = nums[1]; } nextLine(); const s = args.find((a) => a.t === 'str'); if (s) show(s.v); break; }
        case 'TJ': {
          const arr = args.find((a) => a.t === 'arr');
          if (arr) for (const x of arr.v) {
            if (x.t === 'str') show(x.v);
            else if (x.t === 'num') tm = mul([1, 0, 0, 1, (-x.v / 1000) * size * th, 0], tm);
          }
          break;
        }
        case 'Do': {
          const nm = args.find((a) => a.t === 'name');
          if (!nm || !xobjRes || depth > 5) break;
          const xo = xobjRes.lookup(PL.PDFName.of(nm.v));
          if (!xo || !xo.dict) break;
          const st = xo.dict.lookup(PL.PDFName.of('Subtype'));
          if (!st || st.asString() !== '/Form') break;
          const mtx = xo.dict.lookup(PL.PDFName.of('Matrix'));
          const fm = mtx ? [0, 1, 2, 3, 4, 5].map((k) => mtx.lookup(k).asNumber()) : [1, 0, 0, 1, 0, 0];
          const res = xo.dict.lookup(PL.PDFName.of('Resources')) || resources;
          try { runs.push(...extractRuns(ctx.decodeStream(xo), res, ctx, G, mul(fm, ctm), depth + 1)); } catch (_) { /* 読めない部品は無視 */ }
          break;
        }
        default: break;
      }
      args = [];
    }
    return runs;
  }

  /** PDF(ArrayBuffer/Uint8Array) → ページごとの行 [{page, lines:[{y, text, cells:[{x,text}]}]}] */
  async function extractLines(data, deps) {
    const PL = deps.PDFLib;
    const G = deps.glyphs;
    const doc = await PL.PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
    const ctx = {
      PL,
      decodeStream: (s) => (s instanceof PL.PDFRawStream ? PL.decodePDFRawStream(s).decode() : s.getContents ? s.getContents() : s.contents),
    };
    const pages = [];
    doc.getPages().forEach((page, pi) => {
      const node = page.node;
      const contents = node.Contents();
      const parts = [];
      if (contents instanceof PL.PDFArray) for (let k = 0; k < contents.size(); k++) parts.push(contents.lookup(k));
      else if (contents) parts.push(contents);
      const chunks = parts.map((s) => ctx.decodeStream(s));
      const total = chunks.reduce((t, c) => t + c.length + 1, 0);
      const bytes = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { bytes.set(c, off); off += c.length; bytes[off++] = 10; }
      const runs = extractRuns(bytes, node.Resources(), ctx, G, [1, 0, 0, 1, 0, 0], 0);
      pages.push({ page: pi + 1, lines: groupLines(runs) });
    });
    return pages;
  }

  /** 位置の近い文字列を1行にまとめる */
  function groupLines(runs) {
    const sorted = runs.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const r of sorted) {
      const tol = Math.max(2, r.size * 0.35);
      let line = lines.find((l) => Math.abs(l.y - r.y) <= tol);
      if (!line) { line = { y: r.y, runs: [] }; lines.push(line); }
      line.runs.push(r);
    }
    lines.sort((a, b) => b.y - a.y);
    return lines.map((l) => {
      l.runs.sort((a, b) => a.x - b.x);
      const cells = [];
      for (const r of l.runs) {
        const last = cells[cells.length - 1];
        // 近い文字は同じセルに(1文字ずつ置かれるPDF対策)
        if (last && r.x - last.end < r.size * 0.8) { last.text += (r.x - last.end > r.size * 0.25 ? ' ' : '') + r.text; last.end = r.x + r.w; }
        else cells.push({ x: r.x, end: r.x + r.w, text: r.text });
      }
      return { y: l.y, cells: cells.map((c) => ({ x: Math.round(c.x), text: c.text.trim() })), text: cells.map((c) => c.text.trim()).join(' ') };
    });
  }

  // ---------------------------------------------------------------------------
  // 明細として解釈する
  // ---------------------------------------------------------------------------
  const nfkc = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const DATE_RE = /^(?:(\d{4})\s*[年/.-]\s*)?(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?(?:\s|$)/;
  const AMOUNT_RE = /^[-−▲△]?\s*¥?\s*\d{1,3}(?:,\d{3})+(?:\s*円)?$|^[-−▲△]?\s*¥?\s*\d{1,7}(?:\s*円)?$/;

  function toAmount(s) {
    const t = nfkc(s);
    const neg = /^[-−▲△]/.test(t);
    const v = parseInt(t.replace(/[^\d]/g, ''), 10);
    return isNaN(v) ? null : neg ? -v : v;
  }

  /**
   * ページの行 → 明細
   * @returns {{period:{from,to}|null, issuer:string, items:[{date, desc, sub, amount, kind}], totals:{}}}
   *   kind: 'purchase'(利用) / 'refund'(返金・調整) / 'payment'(口座からの支払い)
   */
  function parseStatement(pages, now = new Date()) {
    const all = pages.flatMap((p) => p.lines.map((l) => ({ ...l, page: p.page, text: nfkc(l.text), cells: l.cells.map((c) => ({ x: c.x, text: nfkc(c.text) })) })));
    const joined = all.map((l) => l.text).join('\n');

    let period = null;
    const pm = joined.replace(/\s/g, '').match(/(\d{4})年(\d{1,2})月(\d{1,2})日から(\d{4})年(\d{1,2})月(\d{1,2})日まで/);
    if (pm) period = { from: `${pm[1]}-${pad(pm[2])}-${pad(pm[3])}`, to: `${pm[4]}-${pad(pm[5])}-${pad(pm[6])}` };
    const issuer = /AMERICAN EXPRESS|American Express|アメリカン・エキスプレス/i.test(joined) ? 'AMEX'
      : /楽天カード/.test(joined) ? '楽天カード' : /三井住友/.test(joined) ? '三井住友カード' : /JCB/.test(joined) ? 'JCB' : /セゾン/.test(joined) ? 'セゾン' : 'カード';

    const endDate = period ? new Date(period.to + 'T00:00:00') : now;
    const yearFor = (m, d, y) => {
      if (y) return +y;
      let yr = endDate.getFullYear();
      if (new Date(yr, m - 1, d) > new Date(endDate.getTime() + 7 * 864e5)) yr--;
      return yr;
    };

    const items = [];
    let section = 'purchase';
    let cur = null;
    let lastY = null, lastPage = null;
    let holder = '';
    for (const l of all) {
      const t = l.text.replace(/\s/g, '');
      // セクションの切り替え(行頭にある短い見出しだけを見る。注意書きの文中の語句には反応しない)
      const isHead = !DATE_RE.test(l.text) && t.length <= 45 && !/合計|小計/.test(t);
      if (isHead && /^(お支払い?金額内容|お支払い?内容|口座振替|ご入金額)/.test(t)) { section = 'payment'; cur = null; continue; }
      if (isHead && /^(ご入金・?調整|調整金額|返品|ご返金|取消)/.test(t)) { section = 'refund'; cur = null; continue; }
      if (isHead && /^(今月ご利用|今回ご利用|ご利用分|ショッピング|その他のご請求|ご家族|家族カード|本人)/.test(t)) {
        section = 'purchase'; cur = null;
        const hm = l.text.match(/ご利用額\s*(.+?)\s*様/);
        holder = hm ? hm[1].replace(/\s+/g, ' ') : holder;
        continue;
      }
      if (/合計|小計|ページ$|^前回|^今回/.test(t)) { cur = null; continue; }

      const dm = l.text.match(DATE_RE);
      if (dm) {
        const cells = l.cells.slice();
        // 金額 = 右端の数値セル
        let amount = null;
        for (let k = cells.length - 1; k > 0; k--) {
          if (AMOUNT_RE.test(cells[k].text.replace(/\s/g, ''))) { amount = toAmount(cells[k].text); cells.splice(k, 1); break; }
        }
        if (amount === null) {
          const am = l.text.match(/([-−▲]?\s*\d{1,3}(?:,\d{3})+|[-−▲]?\s*\d+)\s*円?$/);
          if (am) amount = toAmount(am[1]);
        }
        if (amount === null || amount === 0) { cur = null; continue; }
        const m = +dm[2], d = +dm[3];
        if (m < 1 || m > 12 || d < 1 || d > 31) { cur = null; continue; }
        const y = yearFor(m, d, dm[1]);
        let desc = cells.map((c) => c.text).join(' ').replace(DATE_RE, '').trim();
        // 外貨列(例: 12.00 USD)は内容から外す
        desc = desc.replace(/\s[\d,.]+\s?(USD|EUR|GBP|KRW|TWD|HKD|CNY|SGD|THB|AUD|CAD)\b.*/i, '').replace(/\s\d[\d,]*\.\d{2}$/, '').trim();
        let kind = section;
        if (/お支払いありがとうございました|口座振替|お振込/.test(desc)) kind = 'payment';
        else if (section === 'purchase' && amount < 0) kind = 'refund';
        cur = { date: `${y}-${pad(m)}-${pad(d)}`, desc, sub: '', amount: kind === 'refund' || kind === 'payment' ? -Math.abs(amount) : amount, kind, holder, page: l.page };
        items.push(cur);
        lastY = l.y; lastPage = l.page;
        continue;
      }
      // 日付の次の行 = 業種などの補足
      if (cur && l.page === lastPage && lastY - l.y < 22 && !AMOUNT_RE.test(t) && t.length <= 40) {
        cur.sub = cur.sub ? cur.sub + ' ' + l.text : l.text;
        lastY = l.y;
        continue;
      }
      cur = null;
    }

    // 明細の合計額(検算用)
    const totals = {};
    const num = (re) => { const m = joined.match(re); return m ? toAmount(m[1]) : null; };
    totals.newCharges = null;
    const hdr = all.findIndex((l) => /新規ご利用金額|今回ご利用金額/.test(l.text.replace(/\s/g, '')));
    if (hdr >= 0) {
      // 見出しの数行下に「前回 - 支払 + 新規 = 今回」の数字が並ぶ形式
      for (let k = hdr; k < Math.min(all.length, hdr + 8); k++) {
        const nums = all[k].text.match(/\d{1,3}(?:,\d{3})+|\b\d+\b/g) || [];
        if (nums.length >= 4 && /[-+=]/.test(all[k].text)) { totals.newCharges = toAmount(nums[2]); totals.billed = toAmount(nums[nums.length - 1]); break; }
      }
    }
    if (totals.newCharges === null) totals.newCharges = num(/今回ご利用・?ご請求金額合計\s*([\d,]+)/) ?? num(/今回ご利用金額[^\d]*([\d,]+)/);
    totals.purchases = items.filter((i) => i.kind === 'purchase').reduce((s, i) => s + i.amount, 0);
    totals.refunds = items.filter((i) => i.kind === 'refund').reduce((s, i) => s + i.amount, 0);
    totals.payments = items.filter((i) => i.kind === 'payment').reduce((s, i) => s + i.amount, 0);
    return { period, issuer, items, totals };
  }

  const api = { tokenize, extractLines, groupLines, parseStatement, parseToUnicode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KakeiPdf = api;
})(typeof window !== 'undefined' ? window : globalThis);
