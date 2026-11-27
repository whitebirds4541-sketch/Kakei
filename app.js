/* Kakei 家計簿 — 画面ロジック */
(() => {
  'use strict';
  const P = window.KakeiParser;
  const KEY = 'kakei.v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const yen = (n) => '¥' + Math.round(Math.abs(n)).toLocaleString('ja-JP');
  const signedYen = (n) => (n < 0 ? '−' : '') + yen(n);
  const man = (n) => (Math.abs(n) >= 10000 ? (n / 10000).toFixed(Math.abs(n) >= 100000 ? 0 : 1).replace(/\.0$/, '') + '万' : Math.round(n).toLocaleString('ja-JP'));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => P.ymd(new Date());

  // ---------- 保存 ----------
  let state = { entries: [], budget: 0, categories: null, rules: {} };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) {}
  if (!state.categories || !state.categories.expense) state.categories = P.defaultCategories();
  if (!state.rules) state.rules = {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { toast('保存できませんでした(ブラウザの設定を確認)'); } };

  const cats = () => state.categories;
  const opt = () => ({ cats: state.categories, rules: state.rules });
  const catOf = (e) => P.findCategory(e.type, e.category, cats());
  const iconOf = (type, name) => (P.findCategory(type, name, cats()) || { icon: '📦' }).icon;
  const isInvest = (e) => e.type === 'expense' && !!(catOf(e) || {}).invest;

  let month = today().slice(0, 7); // "YYYY-MM"
  let view = 'home';
  let historyFilter = 'all';
  let catType = 'expense';

  const shift = (m, d) => { const [y, mo] = m.split('-').map(Number); return P.ymd(new Date(y, mo - 1 + d, 1)).slice(0, 7); };
  const monthName = (m) => `${+m.slice(5)}月`;

  // ---------- 記録の操作 ----------
  function addEntries(list, { silent } = {}) {
    const now = Date.now();
    const added = list.map((e) => ({ id: uid(), createdAt: now, ...e }));
    state.entries.push(...added);
    save(); render();
    if (!silent && added.length) {
      const ids = new Set(added.map((a) => a.id));
      const msg = added.length === 1 ? `${added[0].category} ${yen(added[0].amount)} を記録しました` : `${added.length}件を記録しました`;
      toast(msg, () => { state.entries = state.entries.filter((e) => !ids.has(e.id)); save(); render(); });
    }
    return added;
  }
  function removeEntry(id) {
    const i = state.entries.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [old] = state.entries.splice(i, 1);
    save(); render();
    toast('削除しました', () => { state.entries.push(old); save(); render(); });
  }
  const inMonth = (m) => state.entries.filter((e) => e.date.startsWith(m));
  const sortDesc = (a, b) => (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt);

  /** 集計: 支出(投資を除く・返金は差し引き)/収入/投資 */
  function summary(m) {
    const list = inMonth(m);
    let expense = 0, income = 0, invest = 0;
    const byCat = {}, byInvest = {};
    for (const e of list) {
      if (e.type === 'income') { income += e.amount; continue; }
      if (isInvest(e)) { invest += e.amount; byInvest[e.category] = (byInvest[e.category] || 0) + e.amount; continue; }
      expense += e.amount;
      byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    }
    return { list, expense, income, invest, balance: income - expense - invest, byCat, byInvest };
  }

  // ---------- 描画 ----------
  function txItem(e) {
    const [, mm, dd] = e.date.split('-');
    let cls = e.type, sign = e.type === 'income' ? '+' : '−', note = '';
    if (e.type === 'expense' && e.amount < 0) { cls = 'refund'; sign = '+'; note = '<small>返金</small>'; }
    else if (isInvest(e)) { cls = 'investamt'; note = '<small>投資</small>'; }
    const sub = [e.category, `${+mm}/${+dd}`, e.src && (e.src + (e.holder ? '・' + e.holder.split(' ').pop() : ''))].filter(Boolean).join(' · ');
    return `<li><button class="tx" data-id="${e.id}" aria-label="${esc(e.category)} ${e.amount}円 ${esc(e.memo)} を編集">
      <span class="tx-icon" aria-hidden="true">${iconOf(e.type, e.category)}</span>
      <span class="tx-main"><p>${esc(e.memo || e.category)}</p><p class="small muted">${esc(sub)}</p></span>
      <span class="tx-amount ${cls}">${sign}${yen(e.amount)}${note}</span></button></li>`;
  }

  function diffHtml(cur, prev, { label = true } = {}) {
    const d = cur - prev;
    if (!prev && !cur) return '';
    if (d === 0) return label ? '先月と同じ' : '±0';
    const cls = d > 0 ? 'up' : 'down';
    return `<span class="${cls}">${d > 0 ? '▲' : '▼'} ${yen(d)}${label ? (d > 0 ? ' 多い' : ' 少ない') : ''}</span>`;
  }

  function renderHome(s) {
    const prevM = shift(month, -1);
    const p = summary(prevM);
    const budget = state.budget || 0;
    const bar = $('#budgetBar');
    const isThisMonth = month === today().slice(0, 7);

    if (budget > 0) {
      const remain = budget - s.expense;
      const pct = Math.max(0, Math.min(100, (s.expense / budget) * 100));
      $('#heroLabel').textContent = '残り予算';
      $('#heroValue').textContent = signedYen(remain);
      $('#heroValue').classList.toggle('over', remain < 0);
      bar.hidden = false;
      bar.firstElementChild.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', Math.round(pct));
      bar.classList.toggle('warn', pct >= 80 && pct < 100);
      bar.classList.toggle('over', s.expense > budget);
      let note = `予算 ${yen(budget)} のうち ${Math.round((s.expense / budget) * 100)}% 使用`;
      if (isThisMonth && remain > 0) {
        const now = new Date();
        const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
        note += ` · 1日 ${yen(remain / daysLeft)} まで`;
      }
      $('#budgetNote').textContent = remain < 0 ? `予算を ${yen(-remain)} 超えています` : note;
    } else {
      $('#heroLabel').textContent = `${monthName(month)}の支出`;
      $('#heroValue').textContent = signedYen(s.expense);
      $('#heroValue').classList.remove('over');
      bar.hidden = true;
      $('#budgetNote').innerHTML = '<button class="link" data-go="settings">予算を設定する</button>と残りが分かります';
    }
    $('#compare').innerHTML = p.list.length || s.list.length
      ? `<span class="muted">先月(${monthName(prevM)})より支出が</span> ${diffHtml(s.expense, p.expense)}` : '';
    $('#sumExpense').textContent = signedYen(s.expense);
    $('#sumIncome').textContent = yen(s.income);
    $('#sumInvest').textContent = yen(s.invest);
    $('#sumBalance').textContent = signedYen(s.balance);
    $('#sumBalance').className = 'num ' + (s.balance < 0 ? 'expense' : s.balance > 0 ? 'income' : '');

    // 6か月の推移
    const months = [-5, -4, -3, -2, -1, 0].map((d) => shift(month, d));
    const vals = months.map((m) => summary(m).expense);
    const max = Math.max(1, ...vals);
    $('#trend').innerHTML = months.map((m, i) => `<button role="listitem" data-month="${m}" aria-current="${m === month}" class="${m === prevM ? 'prev' : ''}"
        aria-label="${m.slice(0, 4)}年${monthName(m)} 支出 ${vals[i]}円">
        <span class="val">${vals[i] ? man(vals[i]) : '−'}</span>
        <span class="col" style="height:${Math.max(0, (vals[i] / max) * 100)}px"></span>
        <span>${monthName(m)}</span></button>`).join('');

    // 部類別(先月比つき)
    $('#breakdownPrev').textContent = `${monthName(prevM)}との比較`;
    const row = (name, v, pv, total, mx, invest) => `<button class="bar-row ${invest ? 'invest-row' : ''}" data-cat="${esc(name)}">
        <span>${iconOf('expense', name)} ${esc(name)}</span>
        <span class="num">${signedYen(v)} ${total > 0 && v > 0 ? `<span class="small muted">${Math.round((v / total) * 100)}%</span>` : ''}</span>
        <span class="bar"><span style="width:${Math.max(0, (v / mx) * 100)}%"></span></span>
        <span class="prevline">${monthName(prevM)} ${signedYen(pv)} ${pv || v ? '· ' + diffHtml(v, pv, { label: false }) : ''}</span></button>`;
    const names = [...new Set([...Object.keys(s.byCat), ...Object.keys(p.byCat)])].filter((n) => s.byCat[n] || p.byCat[n])
      .sort((a, b) => (s.byCat[b] || 0) - (s.byCat[a] || 0) || (p.byCat[b] || 0) - (p.byCat[a] || 0));
    const mx = Math.max(1, ...names.map((n) => s.byCat[n] || 0));
    let html = names.map((n) => row(n, s.byCat[n] || 0, p.byCat[n] || 0, s.expense, mx, false)).join('');
    const inv = [...new Set([...Object.keys(s.byInvest), ...Object.keys(p.byInvest)])];
    if (inv.length) {
      const imx = Math.max(1, ...inv.map((n) => s.byInvest[n] || 0));
      html += '<p class="sep-label">投資(支出には含みません)</p>' + inv.map((n) => row(n, s.byInvest[n] || 0, p.byInvest[n] || 0, 0, imx, true)).join('');
    }
    $('#breakdown').innerHTML = html || '<p class="empty">まだ支出がありません。PDFを読み込むか ＋ から記録しましょう</p>';

    const recent = [...s.list].sort(sortDesc).slice(0, 5);
    $('#recentList').innerHTML = recent.length ? recent.map(txItem).join('') : '<li class="empty">右下の ＋ から記録しましょう</li>';
  }

  function renderHistory(s) {
    const q = P.cleanMerchant($('#search').value).toLowerCase();
    const list = s.list
      .filter((e) => historyFilter === 'all' || e.type === historyFilter)
      .filter((e) => !q || `${e.memo} ${e.category} ${e.src || ''}`.normalize('NFKC').toLowerCase().includes(q))
      .sort(sortDesc);
    if (!list.length) { $('#historyGroups').innerHTML = '<div class="card empty">該当する記録はありません</div>'; return; }
    const groups = {};
    list.forEach((e) => (groups[e.date] ||= []).push(e));
    const wd = '日月火水木金土';
    const total = list.reduce((t, e) => t + (e.type === 'expense' ? -e.amount : e.amount), 0);
    $('#historyGroups').innerHTML = (q ? `<div class="card row-between"><span>${list.length}件</span><span class="num">${total < 0 ? '−' : '+'}${yen(total)}</span></div>` : '') +
      Object.entries(groups).map(([d, items]) => {
        const dt = new Date(d + 'T00:00:00');
        const t = items.reduce((a, e) => a + (e.type === 'expense' ? -e.amount : e.amount), 0);
        return `<div class="card day-group"><div class="day-head"><span>${dt.getMonth() + 1}月${dt.getDate()}日(${wd[dt.getDay()]})</span>
          <span class="num">${t < 0 ? '−' : '+'}${yen(t)}</span></div>
          <ul class="tx-list">${items.map(txItem).join('')}</ul></div>`;
      }).join('');
  }

  function renderSettings() {
    $('#budgetInput').value = state.budget || '';
    $$('#catTypeSeg button').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === catType));
    const counts = {};
    state.entries.forEach((e) => { if (e.type === catType) counts[e.category] = (counts[e.category] || 0) + 1; });
    $('#catList').innerHTML = cats()[catType].map((c, i) => `<li><button class="cat-item" data-idx="${i}">
        <span class="tx-icon" aria-hidden="true">${esc(c.icon)}</span>
        <span class="grow"><p>${esc(c.name)} ${c.invest ? '<span class="badge">投資</span>' : ''}</p>
        <p class="small muted">${(c.words || []).length ? 'キーワード ' + (c.words || []).length + '個' : 'キーワードなし'} · ${counts[c.name] || 0}件</p></span>
        <span class="muted" aria-hidden="true">›</span></button></li>`).join('');
    const rules = Object.entries(state.rules);
    $('#rulesCount').textContent = `(${rules.length})`;
    $('#ruleList').innerHTML = rules.length ? rules.map(([k, v]) => `<li><span>${esc(k)}</span><span class="muted">→ ${esc(v)}</span>
        <button class="icon-btn" data-rule="${esc(k)}" aria-label="${esc(k)} の仕分けを忘れる">✕</button></li>`).join('') : '<li class="muted small">まだありません</li>';
  }

  function render() {
    const [y, m] = month.split('-');
    $('#monthLabel').textContent = `${y}年${+m}月`;
    const s = summary(month);
    if (view === 'home') renderHome(s);
    if (view === 'history') renderHistory(s);
    if (view === 'settings') renderSettings();
  }

  function go(v) {
    view = ['home', 'history', 'settings'].includes(v) ? v : 'home';
    $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + view; });
    $$('.tabbar button').forEach((b) => { if (b.dataset.go === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#fab').hidden = view === 'settings';
    if (location.hash.slice(1) !== view) history.replaceState(null, '', location.pathname + location.search + '#' + view);
    render();
    window.scrollTo(0, 0);
  }

  // ---------- 追加・編集シート ----------
  const sheet = $('#sheet');
  let editing = null;
  let sheetType = 'expense';
  let sheetCat = '食費';

  function renderChips() {
    $('#catChips').innerHTML = cats()[sheetType].map((c) =>
      `<button type="button" class="chip" role="radio" aria-checked="${c.name === sheetCat}" data-cat="${esc(c.name)}"><span aria-hidden="true">${esc(c.icon)}</span>${esc(c.name)}</button>`).join('');
    $$('#typeSeg button').forEach((b) => b.setAttribute('aria-checked', b.dataset.type === sheetType));
    $('#amountHint').hidden = sheetType !== 'expense';
  }
  function openSheet(entry) {
    editing = entry ? entry.id : null;
    sheetType = entry ? entry.type : 'expense';
    sheetCat = entry ? entry.category : cats().expense[0].name;
    $('#sheetTitle').textContent = entry ? '記録を編集' : '記録を追加';
    $('#amount').value = entry ? entry.amount : '';
    $('#memo').value = entry ? entry.memo : '';
    $('#date').value = entry ? entry.date : (today().startsWith(month) ? today() : month + '-01');
    $('#deleteTx').hidden = !entry;
    renderChips();
    sheet.showModal();
    if (!entry) setTimeout(() => $('#amount').focus(), 50);
  }

  $('#typeSeg').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    sheetType = b.dataset.type;
    sheetCat = cats()[sheetType][0].name;
    renderChips();
  });
  $('#catChips').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    sheetCat = b.dataset.cat; renderChips();
  });
  $('#txForm').addEventListener('submit', (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    let amount = Math.round(+$('#amount').value);
    if (sheetType === 'income') amount = Math.abs(amount);
    if (!amount) { ev.preventDefault(); $('#amount').focus(); return; }
    const data = { type: sheetType, amount, category: sheetCat, memo: $('#memo').value.trim(), date: $('#date').value || today() };
    if (editing) {
      const e = state.entries.find((x) => x.id === editing);
      const catChanged = e.category !== data.category && e.type === data.type;
      Object.assign(e, data);
      let msg = '更新しました';
      if (catChanged && e.src && e.memo) { // 明細から取り込んだお店は仕分けを覚える
        const k = P.merchantKey(e.memo);
        state.rules[k] = data.category;
        msg = `次回から「${k}」は ${data.category} に仕分けます`;
      }
      save(); render(); toast(msg);
    } else {
      addEntries([data]);
    }
    if (!data.date.startsWith(month)) { month = data.date.slice(0, 7); render(); }
  });
  $('#deleteTx').addEventListener('click', () => { sheet.close(); removeEntry(editing); });
  $$('dialog').forEach((d) => d.addEventListener('click', (ev) => { if (ev.target === d && !d.classList.contains('full')) d.close(); }));

  // ---------- 部類の管理 ----------
  const catSheet = $('#catSheet');
  let catEditing = null; // index or null
  const EMOJIS = ['📈', '💳', '🧳', '✈️', '🏨', '🚗', '🐶', '👶', '📚', '🎓', '💻', '📱', '🍺', '☕', '🎁', '💐', '🏋️', '💄', '🏥', '🏛', '🔁', '🛒', '🎮', '🎬', '💰', '🏦', '🧾', '📦'];
  $('#emojiPick').innerHTML = EMOJIS.map((e) => `<button type="button" aria-label="${e}">${e}</button>`).join('');
  $('#emojiPick').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) $('#catIcon').value = b.textContent; });

  function openCat(idx) {
    catEditing = idx;
    const c = idx === null ? { name: '', icon: '', words: [], invest: false } : cats()[catType][idx];
    $('#catTitle').textContent = idx === null ? `${catType === 'income' ? '収入' : '支出'}の部類を追加` : '部類を編集';
    $('#catName').value = c.name;
    $('#catIcon').value = c.icon;
    $('#catWords').value = (c.words || []).join('、');
    $('#catInvest').checked = !!c.invest;
    $('#catInvestRow').hidden = catType !== 'expense';
    $('#catDelete').hidden = idx === null || cats()[catType].length <= 1;
    catSheet.showModal();
    if (idx === null) setTimeout(() => $('#catName').focus(), 50);
  }
  $('#addCat').addEventListener('click', () => openCat(null));
  $('#catList').addEventListener('click', (ev) => { const b = ev.target.closest('.cat-item'); if (b) openCat(+b.dataset.idx); });
  $('#catTypeSeg').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { catType = b.dataset.t; renderSettings(); } });
  $('#catForm').addEventListener('submit', (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    const name = $('#catName').value.trim();
    const list = cats()[catType];
    const dup = list.findIndex((c) => c.name === name);
    if (!name || (dup >= 0 && dup !== catEditing)) { ev.preventDefault(); toast(name ? '同じ名前の部類があります' : '名前を入力してください'); $('#catName').focus(); return; }
    const data = {
      name, icon: $('#catIcon').value.trim() || '📦',
      words: $('#catWords').value.split(/[、,，\n]+/).map((w) => w.trim()).filter(Boolean),
      invest: catType === 'expense' && $('#catInvest').checked,
    };
    if (catEditing === null) { list.push(data); toast(`「${name}」を追加しました`); }
    else {
      const old = list[catEditing].name;
      list[catEditing] = { ...list[catEditing], ...data };
      if (old !== name) { // 名前変更を記録とルールにも反映
        state.entries.forEach((e) => { if (e.type === catType && e.category === old) e.category = name; });
        Object.keys(state.rules).forEach((k) => { if (state.rules[k] === old) state.rules[k] = name; });
      }
      toast('保存しました');
    }
    save(); render();
  });
  $('#catDelete').addEventListener('click', () => {
    const list = cats()[catType];
    const c = list[catEditing];
    const n = state.entries.filter((e) => e.type === catType && e.category === c.name).length;
    const rest = list.filter((_, i) => i !== catEditing);
    const fallback = P.fallbackCategory(catType, { [catType]: rest });
    if (!confirm(`「${c.name}」を削除しますか?${n ? `\n${n}件の記録は「${fallback}」に移ります。` : ''}`)) return;
    state.entries.forEach((e) => { if (e.type === catType && e.category === c.name) e.category = fallback; });
    Object.keys(state.rules).forEach((k) => { if (state.rules[k] === c.name) delete state.rules[k]; });
    list.splice(catEditing, 1);
    catSheet.close(); save(); render(); toast('削除しました');
  });
  $('#ruleList').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-rule]'); if (!b) return;
    delete state.rules[b.dataset.rule]; save(); renderSettings();
  });

  // ---------- PDF明細の取り込み ----------
  const loaded = {};
  const loadScript = (src) => loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
    document.head.appendChild(s);
  });
  function loading(msg) { $('#loadingMsg').textContent = msg || ''; $('#loading').hidden = !msg; }

  let imp = null; // { statement, rows }
  const dupKey = (e) => `${e.date}|${e.amount}|${P.cleanMerchant(e.memo).replace(/\s/g, '')}`;

  async function importPdf(file) {
    if (!file) return;
    loading('明細を読み取っています…');
    try {
      await Promise.all([loadScript('vendor/pdf-lib.min.js'), loadScript('vendor/glyphs.js'), loadScript('pdfimport.js')]);
      const data = new Uint8Array(await file.arrayBuffer());
      const pages = await window.KakeiPdf.extractLines(data, { PDFLib: window.PDFLib, glyphs: window.KakeiGlyphs });
      const st = window.KakeiPdf.parseStatement(pages);
      if (!st.items.length) { toast('明細の行が見つかりませんでした(画像だけのPDFは読めません)'); return; }
      const existing = new Set(state.entries.map(dupKey));
      const rows = st.items.filter((i) => i.kind !== 'payment').map((i, n) => {
        const memo = P.cleanMerchant(i.desc).slice(0, 60);
        const r = { n, date: i.date, amount: i.amount, memo, sub: i.sub, kind: i.kind, holder: i.holder || '', src: st.issuer };
        r.category = P.guessCategory('expense', memo, { ...opt(), sub: i.sub });
        r.dup = existing.has(dupKey(r));
        r.on = !r.dup;
        return r;
      });
      imp = { st, rows, payments: st.items.filter((i) => i.kind === 'payment'), open: new Set() };
      renderImport();
      $('#importSheet').showModal();
    } catch (err) {
      console.error(err);
      toast(/encrypt|password/i.test(String(err)) ? 'パスワード付きPDFは読み込めません' : 'PDFを読み込めませんでした');
    } finally { loading(''); }
  }

  function renderImport() {
    const { st, rows, payments } = imp;
    const withRefunds = $('#importRefunds').checked;
    const active = (r) => r.on && (withRefunds || r.kind !== 'refund');
    const per = st.period ? `${st.period.from.replace(/-/g, '/')} 〜 ${st.period.to.replace(/-/g, '/')}` : '';
    const holders = [...new Set(rows.map((r) => r.holder).filter(Boolean))];
    $('#importMeta').textContent = [st.issuer, per, `${rows.length}件`, holders.length > 1 ? `カード ${holders.length}枚分` : ''].filter(Boolean).join(' · ') +
      (payments.length ? ` (口座からの支払い ${payments.length}件は家計の支出ではないため除外)` : '');
    const purchases = rows.filter((r) => r.kind === 'purchase').reduce((t, r) => t + r.amount, 0);
    const v = $('#importVerify');
    if (st.totals.newCharges) {
      const ok = st.totals.newCharges === purchases;
      v.className = 'verify ' + (ok ? 'ok' : 'ng');
      v.textContent = ok ? `✓ 明細の新規ご利用額 ${yen(purchases)} と一致しました` : `! 明細の新規ご利用額 ${yen(st.totals.newCharges)} と読み取り合計 ${yen(purchases)} が違います。内容を確認してください`;
    } else { v.className = 'verify'; v.textContent = `利用合計 ${yen(purchases)}`; }

    const groups = {};
    rows.forEach((r) => (groups[r.category] ||= []).push(r));
    const other = P.fallbackCategory('expense', cats());
    const order = [other, ...cats().expense.map((c) => c.name).filter((n) => n !== other)].filter((n) => groups[n]);
    const options = (sel) => cats().expense.map((c) => `<option ${c.name === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('#importBody').innerHTML = order.map((name) => {
      const list = groups[name].sort((a, b) => a.date.localeCompare(b.date));
      const total = list.filter(active).reduce((t, r) => t + r.amount, 0);
      const open = name === other || order.length <= 3 || imp.open.has(name);
      return `<details class="imp-group" data-cat="${esc(name)}" ${open ? 'open' : ''}><summary><span aria-hidden="true">${iconOf('expense', name)}</span><span class="grow">${esc(name)} <span class="muted small">${list.length}件</span></span>
        <span class="num">${signedYen(total)}</span></summary>
        ${list.map((r) => `<div class="imp-row ${active(r) ? '' : 'off'}">
          <input type="checkbox" data-n="${r.n}" ${r.on ? 'checked' : ''} aria-label="${esc(r.memo)} を取り込む">
          <div class="m"><p>${esc(r.memo)}${r.dup ? '<span class="tag">取込済</span>' : ''}${r.kind === 'refund' ? '<span class="tag">返金</span>' : ''}</p>
            <p class="small muted">${+r.date.slice(5, 7)}/${+r.date.slice(8)}${r.sub ? ' · ' + esc(r.sub.slice(0, 24)) : ''}${holders.length > 1 && r.holder ? ' · ' + esc(r.holder) : ''}</p></div>
          <span class="r"><span class="amt ${r.amount < 0 ? 'neg' : ''}">${r.amount < 0 ? '+' : ''}${yen(r.amount)}</span>
          <select data-n="${r.n}" aria-label="${esc(r.memo)} の部類">${options(r.category)}</select></span>
        </div>`).join('')}</details>`;
    }).join('');
    $('#importBody').insertAdjacentHTML('afterbegin', `<p class="imp-hint">部類はお店ごとに自動で仕分けました。違うものは右の欄で変えると、同じお店もまとめて変わり、次回から覚えます。${groups[other] ? `「${esc(other)}」は自動で決まらなかったものです。` : ''}</p>`);
    const sel = rows.filter(active);
    $('#importDo').textContent = sel.length ? `${sel.length}件を取り込む` : '取り込む記録がありません';
    $('#importDo').disabled = !sel.length;
  }

  $('#importBody').addEventListener('change', (ev) => {
    const n = ev.target.dataset.n; if (n === undefined) return;
    const r = imp.rows[+n];
    if (ev.target.type === 'checkbox') { r.on = ev.target.checked; renderImport(); return; }
    // 部類の変更: 同じお店をまとめて変更し、次回のために覚える
    const key = P.merchantKey(r.memo);
    const same = imp.rows.filter((x) => P.merchantKey(x.memo) === key);
    same.forEach((x) => { x.category = ev.target.value; });
    state.rules[key] = ev.target.value; save();
    const y = $('#importBody').scrollTop;
    renderImport();
    $('#importBody').scrollTop = y;
    toast(same.length > 1 ? `「${key}」${same.length}件を ${ev.target.value} にしました(次回も同じに仕分け)` : `次回から「${key}」は ${ev.target.value} に仕分けます`);
  });
  $('#importBody').addEventListener('toggle', (ev) => {
    const d = ev.target; if (!d.dataset || !d.dataset.cat) return;
    if (d.open) imp.open.add(d.dataset.cat); else imp.open.delete(d.dataset.cat);
  }, true);
  $('#importRefunds').addEventListener('change', renderImport);
  $('#importClose').addEventListener('click', () => $('#importSheet').close());
  $('#importDo').addEventListener('click', () => {
    const withRefunds = $('#importRefunds').checked;
    const list = imp.rows.filter((r) => r.on && (withRefunds || r.kind !== 'refund')).map((r) => ({
      type: 'expense', amount: r.amount, category: r.category, memo: r.memo, date: r.date, src: r.src, holder: r.holder || undefined,
    }));
    $('#importSheet').close();
    addEntries(list);
    // いちばん件数の多い月を表示
    const cnt = {};
    list.forEach((e) => { const m = e.date.slice(0, 7); cnt[m] = (cnt[m] || 0) + 1; });
    month = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    go('home');
  });
  $$('.pdfFile').forEach((inp) => inp.addEventListener('change', (ev) => { importPdf(ev.target.files[0]); ev.target.value = ''; }));
  // ドラッグ&ドロップでも読み込み
  window.addEventListener('dragover', (ev) => { if ([...(ev.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { ev.preventDefault(); document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', (ev) => { if (!ev.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', (ev) => {
    document.body.classList.remove('dragging');
    const f = [...(ev.dataTransfer?.files || [])].find((x) => /pdf$/i.test(x.name) || x.type === 'application/pdf');
    if (f) { ev.preventDefault(); importPdf(f); }
  });

  // ---------- トースト ----------
  let toastTimer;
  function toast(msg, undo) {
    $('#toastMsg').textContent = msg;
    const u = $('#toastUndo');
    const hide = () => { $('#toast').hidden = true; };
    u.hidden = !undo;
    u.onclick = () => { undo(); hide(); };
    $('#toast').hidden = false;
    // ダイアログ表示中はその上に出す
    const top = [...$$('dialog[open]')].pop();
    (top || document.body).appendChild($('#toast'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, undo ? 5000 : 3000);
  }

  // ---------- Muse 連携 ----------
  const appUrl = () => location.origin + location.pathname;

  function museSummaryText() {
    const s = summary(month);
    const prevM = shift(month, -1);
    const p = summary(prevM);
    const [y, m] = month.split('-');
    const lines = [`【${y}年${+m}月の家計まとめ(Kakei)】`,
      `支出: ${yen(s.expense)}(先月 ${yen(p.expense)})/ 収入: ${yen(s.income)} / 投資: ${yen(s.invest)} / 収支: ${signedYen(s.balance)}`];
    if (state.budget) lines.push(`予算: ${yen(state.budget)}(残り ${signedYen(state.budget - s.expense)})`);
    lines.push('', '部類別支出(今月 / 先月):');
    const names = [...new Set([...Object.keys(s.byCat), ...Object.keys(p.byCat)])].sort((a, b) => (s.byCat[b] || 0) - (s.byCat[a] || 0));
    names.forEach((k) => lines.push(`- ${k}: ${signedYen(s.byCat[k] || 0)} / ${signedYen(p.byCat[k] || 0)}`));
    Object.entries(s.byInvest).forEach(([k, v]) => lines.push(`- (投資)${k}: ${yen(v)}`));
    lines.push('', '明細(JSON):', JSON.stringify(s.list.sort(sortDesc).map(({ date, type, amount, category, memo }) => ({ date, type, amount, category, memo }))));
    lines.push('', 'この内容をもとに、先月と比べて増えた支出、使いすぎの傾向、来月の節約アドバイスを短く教えてください。');
    return lines.join('\n');
  }
  function museGuideText() {
    const ex = cats().expense.map((c) => c.name).join('、');
    const inc = cats().income.map((c) => c.name).join('、');
    return [
      'あなたは私の家計簿「Kakei」への記帳係です。',
      '私が支出や収入を話したら、次のどちらかで記帳してください。',
      '',
      `1) URLを開く: ${appUrl()}?add=<URLエンコードしたテキスト>`,
      `   例: ${appUrl()}?add=${encodeURIComponent('ランチ 850')}`,
      '   複数件は改行(%0A)で区切ります。',
      '2) 次の形式のJSONを出力する(私がKakeiに貼り付けます):',
      '   [{"date":"YYYY-MM-DD","type":"expense","amount":850,"category":"食費","memo":"ランチ"}]',
      '',
      `支出の部類: ${ex}`,
      `収入の部類: ${inc}(type は "income")`,
      '返金は amount をマイナスにしてください。日付が分からない場合は今日、金額は円の整数です。',
    ].join('\n');
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (_) { $('#museInput').value = text; $('#museInput').closest('details').open = true; toast('コピーできないため下の欄に表示しました'); }
  }
  $('#copySummary').addEventListener('click', () => copy(museSummaryText(), 'まとめをコピーしました。Muse に貼り付けてください'));
  $('#copyGuide').addEventListener('click', () => copy(museGuideText(), '指示文をコピーしました。Muse に貼り付けてください'));
  $('#museImport').addEventListener('click', () => {
    const list = P.parseBulk($('#museInput').value, new Date(), opt());
    if (!list.length) { toast('読み取れる記録がありませんでした'); return; }
    addEntries(list);
    $('#museInput').value = '';
    month = list[list.length - 1].date.slice(0, 7);
    go('home');
  });

  /** URL経由の記帳: ?add=テキスト(改行区切り可) / ?entries=JSON */
  function handleUrl() {
    const params = new URLSearchParams(location.search);
    const batches = [];
    params.getAll('add').forEach((t) => batches.push(...P.parseBulk(t, new Date(), opt())));
    params.getAll('entries').forEach((t) => batches.push(...P.parseBulk(t, new Date(), opt())));
    if (params.has('add') || params.has('entries')) {
      history.replaceState(null, '', location.pathname + (location.hash || '#home'));
      if (batches.length) { addEntries(batches); month = batches[batches.length - 1].date.slice(0, 7); render(); }
      else toast('URLの内容を読み取れませんでした');
    }
  }

  // エージェントがページ内スクリプトで操作する場合の小さなAPI
  window.kakei = {
    add: (input) => addEntries(typeof input === 'string' ? P.parseBulk(input, new Date(), opt()) : [].concat(input).map((o) => P.normalizeEntry(o, new Date(), opt())).filter(Boolean)),
    list: (m = month) => inMonth(m).map((e) => ({ ...e })),
    summary: (m = month) => {
      const s = summary(m); const p = summary(shift(m, -1));
      return { month: m, expense: s.expense, income: s.income, invest: s.invest, balance: s.balance, budget: state.budget, byCategory: s.byCat, byInvest: s.byInvest, previousMonth: { expense: p.expense, byCategory: p.byCat } };
    },
    categories: () => JSON.parse(JSON.stringify(state.categories)),
  };

  // ---------- その他のイベント ----------
  document.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const t = ev.target.closest('.tx'); if (t) { openSheet(state.entries.find((e) => e.id === t.dataset.id)); return; }
    const mb = ev.target.closest('[data-month]'); if (mb) { month = mb.dataset.month; render(); return; }
    const cb = ev.target.closest('.bar-row[data-cat]'); if (cb) { go('history'); $('#search').value = cb.dataset.cat; render(); }
  });
  $('#fab').addEventListener('click', () => openSheet(null));
  $('#prevMonth').addEventListener('click', () => { month = shift(month, -1); render(); });
  $('#nextMonth').addEventListener('click', () => { month = shift(month, 1); render(); });

  $('#quickInput').addEventListener('input', () => {
    const r = P.parseLine($('#quickInput').value, new Date(), opt());
    $('#quickHint').textContent = r ? `${r.type === 'income' ? '収入' : '支出'} · ${r.category} · ${yen(r.amount)} · ${r.date.slice(5).replace('-', '/')}` : '';
  });
  $('#quickForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const r = P.parseLine($('#quickInput').value, new Date(), opt());
    if (!r) { toast('金額が見つかりません(例: ランチ 850)'); return; }
    addEntries([r]);
    $('#quickInput').value = ''; $('#quickHint').textContent = '';
    if (!r.date.startsWith(month)) { month = r.date.slice(0, 7); render(); }
  });

  $('#search').addEventListener('input', render);
  $('#historyFilter').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    historyFilter = b.dataset.f;
    $$('#historyFilter button').forEach((x) => x.setAttribute('aria-selected', x === b));
    render();
  });

  $('#budgetForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    state.budget = Math.max(0, Math.round(+$('#budgetInput').value || 0));
    save(); toast(state.budget ? `予算を ${yen(state.budget)} にしました` : '予算をなしにしました');
  });

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => today().replace(/-/g, '');
  $('#exportJson').addEventListener('click', () => download(`kakei-${stamp()}.json`, JSON.stringify(state, null, 2), 'application/json'));
  $('#exportCsv').addEventListener('click', () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['日付', '種類', '部類', '金額', 'メモ・店名', '明細'], ...[...state.entries].sort(sortDesc).map((e) => [e.date, e.type === 'income' ? '収入' : isInvest(e) ? '投資' : e.amount < 0 ? '返金' : '支出', e.category, e.amount, e.memo, e.src || ''])];
    download(`kakei-${stamp()}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv');
  });
  $('#importFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (Array.isArray(data.entries) && 'budget' in data) {
        if (!confirm(`${data.entries.length}件のバックアップで今のデータを置き換えますか?`)) return;
        state = { entries: data.entries, budget: data.budget || 0, categories: data.categories || P.defaultCategories(), rules: data.rules || {} };
        save(); render(); toast('読み込みました');
      } else {
        const list = P.parseBulk(JSON.stringify(data), new Date(), opt());
        if (!list.length) throw new Error();
        addEntries(list);
      }
    } catch (_) { toast('読み込めないファイルです'); }
    ev.target.value = '';
  });
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('すべての記録・予算・部類の設定を削除します。元に戻せません。よろしいですか?')) return;
    state = { entries: [], budget: 0, categories: P.defaultCategories(), rules: {} }; save(); render(); toast('削除しました');
  });

  $('#urlExample').textContent = `${appUrl()}?add=${encodeURIComponent('ランチ 850')}`;
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  window.addEventListener('storage', (ev) => { if (ev.key === KEY) { try { state = { ...state, ...JSON.parse(ev.newValue) }; render(); } catch (_) {} } });

  go(location.hash.slice(1) || 'home');
  handleUrl();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
