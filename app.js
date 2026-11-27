/* Kakei 家計簿 — 画面ロジック */
(() => {
  'use strict';
  const P = window.KakeiParser;
  const KEY = 'kakei.v1';
  const $ = (s) => document.querySelector(s);
  const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (t) => (P.findCategory(t.type, t.category) || { icon: '📦' }).icon;

  // ---------- 保存 ----------
  let state = { entries: [], budget: 0 };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { toast('保存できませんでした(ブラウザの設定を確認)'); } };

  let month = P.ymd(new Date()).slice(0, 7); // "YYYY-MM"
  let view = 'home';
  let historyFilter = 'all';

  // ---------- 記録の操作 ----------
  function addEntries(list, { silent } = {}) {
    const now = Date.now();
    const added = list.map((e) => ({ id: uid(), createdAt: now, ...e }));
    state.entries.push(...added);
    save(); render();
    if (!silent && added.length) {
      const ids = new Set(added.map((a) => a.id));
      const msg = added.length === 1
        ? `${added[0].category} ${yen(added[0].amount)} を記録しました`
        : `${added.length}件を記録しました`;
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

  function summary(m) {
    const list = inMonth(m);
    const expense = list.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const income = list.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const byCat = {};
    list.filter((e) => e.type === 'expense').forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    return { list, expense, income, balance: income - expense, byCat };
  }

  // ---------- 描画 ----------
  function txItem(e) {
    const sign = e.type === 'income' ? '+' : '−';
    const [, mm, dd] = e.date.split('-');
    return `<li><button class="tx" data-id="${e.id}" aria-label="${esc(e.category)} ${e.amount}円 ${esc(e.memo)} を編集">
      <span class="tx-icon" aria-hidden="true">${icon(e)}</span>
      <span class="tx-main"><p>${esc(e.memo || e.category)}</p><p class="small muted">${esc(e.category)} · ${+mm}/${+dd}</p></span>
      <span class="tx-amount ${e.type}">${sign}${yen(e.amount)}</span></button></li>`;
  }

  function renderHome(s) {
    const budget = state.budget || 0;
    const bar = $('#budgetBar');
    if (budget > 0) {
      const remain = budget - s.expense;
      const pct = Math.min(100, (s.expense / budget) * 100);
      $('#remaining').textContent = (remain < 0 ? '−' : '') + yen(Math.abs(remain));
      $('#remaining').classList.toggle('over', remain < 0);
      bar.hidden = false;
      bar.firstElementChild.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', Math.round(pct));
      bar.classList.toggle('warn', pct >= 80 && pct < 100);
      bar.classList.toggle('over', s.expense > budget);
      const isThisMonth = month === P.ymd(new Date()).slice(0, 7);
      let note = `予算 ${yen(budget)} のうち ${Math.round((s.expense / budget) * 100)}% 使用`;
      if (isThisMonth && remain > 0) {
        const now = new Date();
        const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
        note += ` · 1日あたり ${yen(remain / daysLeft)} 使えます`;
      }
      $('#budgetNote').textContent = remain < 0 ? `予算を ${yen(-remain)} 超えています` : note;
      $('#remaining').previousElementSibling.textContent = '残り予算';
    } else {
      $('#remaining').previousElementSibling.textContent = '今月の支出';
      $('#remaining').textContent = yen(s.expense);
      $('#remaining').classList.remove('over');
      bar.hidden = true;
      $('#budgetNote').innerHTML = '<button class="link" data-go="settings">予算を設定する</button>と残りが分かります';
    }
    $('#sumExpense').textContent = yen(s.expense);
    $('#sumIncome').textContent = yen(s.income);
    $('#sumBalance').textContent = (s.balance < 0 ? '−' : '') + yen(Math.abs(s.balance));
    $('#sumBalance').className = 'num ' + (s.balance < 0 ? 'expense' : s.balance > 0 ? 'income' : '');

    const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
    const max = cats[0]?.[1] || 1;
    $('#breakdown').innerHTML = cats.length
      ? cats.map(([name, v]) => `<div class="bar-row"><span>${(P.findCategory('expense', name) || {}).icon || ''} ${esc(name)}</span>
          <span class="num">${yen(v)} <span class="small muted">${Math.round((v / s.expense) * 100)}%</span></span>
          <div class="bar"><span style="width:${(v / max) * 100}%"></span></div></div>`).join('')
      : '<p class="empty">まだ支出がありません</p>';

    const recent = [...s.list].sort(sortDesc).slice(0, 5);
    $('#recentList').innerHTML = recent.length ? recent.map(txItem).join('') : '<li class="empty">右下の ＋ から記録しましょう</li>';
  }

  function renderHistory(s) {
    const q = $('#search').value.trim().toLowerCase();
    const list = s.list
      .filter((e) => historyFilter === 'all' || e.type === historyFilter)
      .filter((e) => !q || `${e.memo} ${e.category}`.toLowerCase().includes(q))
      .sort(sortDesc);
    if (!list.length) { $('#historyGroups').innerHTML = '<div class="card empty">該当する記録はありません</div>'; return; }
    const groups = {};
    list.forEach((e) => (groups[e.date] ||= []).push(e));
    const wd = '日月火水木金土';
    $('#historyGroups').innerHTML = Object.entries(groups).map(([d, items]) => {
      const dt = new Date(d + 'T00:00:00');
      const total = items.reduce((t, e) => t + (e.type === 'expense' ? -e.amount : e.amount), 0);
      return `<div class="card day-group"><div class="day-head"><span>${dt.getMonth() + 1}月${dt.getDate()}日(${wd[dt.getDay()]})</span>
        <span class="num">${total < 0 ? '−' : '+'}${yen(Math.abs(total))}</span></div>
        <ul class="tx-list">${items.map(txItem).join('')}</ul></div>`;
    }).join('');
  }

  function render() {
    const [y, m] = month.split('-');
    $('#monthLabel').textContent = `${y}年${+m}月`;
    const s = summary(month);
    if (view === 'home') renderHome(s);
    if (view === 'history') renderHistory(s);
    if (view === 'settings') $('#budgetInput').value = state.budget || '';
  }

  function go(v) {
    view = ['home', 'history', 'settings'].includes(v) ? v : 'home';
    document.querySelectorAll('.view').forEach((el) => { el.hidden = el.id !== 'view-' + view; });
    document.querySelectorAll('.tabbar button').forEach((b) => {
      if (b.dataset.go === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (location.hash.slice(1) !== view) history.replaceState(null, '', location.pathname + location.search + '#' + view);
    render();
    window.scrollTo(0, 0);
  }

  // ---------- 追加・編集シート ----------
  const sheet = $('#sheet');
  let editing = null; // 編集中のid
  let sheetType = 'expense';
  let sheetCat = '食費';

  function renderChips() {
    $('#catChips').innerHTML = P.CATEGORIES[sheetType].map((c) =>
      `<button type="button" class="chip" role="radio" aria-checked="${c.name === sheetCat}" data-cat="${esc(c.name)}"><span aria-hidden="true">${c.icon}</span>${esc(c.name)}</button>`).join('');
    document.querySelectorAll('#typeSeg button').forEach((b) => b.setAttribute('aria-checked', b.dataset.type === sheetType));
  }
  function openSheet(entry) {
    editing = entry ? entry.id : null;
    sheetType = entry ? entry.type : 'expense';
    sheetCat = entry ? entry.category : P.CATEGORIES.expense[0].name;
    $('#sheetTitle').textContent = entry ? '記録を編集' : '記録を追加';
    $('#amount').value = entry ? entry.amount : '';
    $('#memo').value = entry ? entry.memo : '';
    const today = P.ymd(new Date());
    $('#date').value = entry ? entry.date : (today.startsWith(month) ? today : month + '-01');
    $('#deleteTx').hidden = !entry;
    renderChips();
    sheet.showModal();
    if (!entry) setTimeout(() => $('#amount').focus(), 50);
  }

  $('#typeSeg').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    sheetType = b.dataset.type;
    sheetCat = P.CATEGORIES[sheetType][0].name;
    renderChips();
  });
  $('#catChips').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    sheetCat = b.dataset.cat; renderChips();
  });
  $('#txForm').addEventListener('submit', (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    const amount = Math.round(+$('#amount').value);
    if (!amount || amount <= 0) { ev.preventDefault(); $('#amount').focus(); return; }
    const data = { type: sheetType, amount, category: sheetCat, memo: $('#memo').value.trim(), date: $('#date').value || P.ymd(new Date()) };
    if (editing) {
      const e = state.entries.find((x) => x.id === editing);
      Object.assign(e, data); save(); render(); toast('更新しました');
    } else {
      addEntries([data]);
    }
    if (!data.date.startsWith(month)) { month = data.date.slice(0, 7); render(); }
  });
  $('#deleteTx').addEventListener('click', () => { sheet.close(); removeEntry(editing); });
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet) sheet.close(); }); // 背景タップで閉じる

  // ---------- トースト ----------
  let toastTimer;
  function toast(msg, undo) {
    $('#toastMsg').textContent = msg;
    const u = $('#toastUndo');
    u.hidden = !undo;
    u.onclick = () => { undo(); hide(); };
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    const hide = () => { $('#toast').hidden = true; };
    toastTimer = setTimeout(hide, undo ? 5000 : 2500);
  }

  // ---------- Muse 連携 ----------
  const appUrl = () => location.origin + location.pathname;

  function museSummaryText() {
    const s = summary(month);
    const [y, m] = month.split('-');
    const lines = [`【${y}年${+m}月の家計まとめ(Kakei)】`, `支出: ${yen(s.expense)} / 収入: ${yen(s.income)} / 収支: ${yen(s.balance)}`];
    if (state.budget) lines.push(`予算: ${yen(state.budget)}(残り ${yen(state.budget - s.expense)})`);
    lines.push('', 'カテゴリ別支出:');
    Object.entries(s.byCat).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => lines.push(`- ${k}: ${yen(v)}`));
    lines.push('', '明細(JSON):', JSON.stringify(s.list.sort(sortDesc).map(({ date, type, amount, category, memo }) => ({ date, type, amount, category, memo }))));
    lines.push('', 'この内容をもとに、使いすぎの傾向と来月の節約アドバイスを短く教えてください。');
    return lines.join('\n');
  }
  function museGuideText() {
    const cats = P.CATEGORIES.expense.map((c) => c.name).join('、');
    const inc = P.CATEGORIES.income.map((c) => c.name).join('、');
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
      `支出カテゴリ: ${cats}`,
      `収入カテゴリ: ${inc}(type は "income")`,
      '日付が分からない場合は今日にしてください。金額は円の整数です。',
    ].join('\n');
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (_) { $('#museInput').value = text; $('#museInput').closest('details').open = true; toast('コピーできないため下の欄に表示しました'); }
  }
  $('#copySummary').addEventListener('click', () => copy(museSummaryText(), 'まとめをコピーしました。Muse に貼り付けてください'));
  $('#copyGuide').addEventListener('click', () => copy(museGuideText(), '指示文をコピーしました。Muse に貼り付けてください'));
  $('#museImport').addEventListener('click', () => {
    const list = P.parseBulk($('#museInput').value);
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
    params.getAll('add').forEach((t) => batches.push(...P.parseBulk(t)));
    params.getAll('entries').forEach((t) => batches.push(...P.parseBulk(t)));
    if (params.has('add') || params.has('entries')) {
      history.replaceState(null, '', location.pathname + (location.hash || '#home'));
      if (batches.length) { addEntries(batches); month = batches[batches.length - 1].date.slice(0, 7); }
      else toast('URLの内容を読み取れませんでした');
    }
  }

  // エージェントがページ内スクリプトで操作する場合の小さなAPI
  window.kakei = {
    add: (input) => addEntries(typeof input === 'string' ? P.parseBulk(input) : [].concat(input).map((o) => P.normalizeEntry(o)).filter(Boolean)),
    list: (m = month) => inMonth(m).map((e) => ({ ...e })),
    summary: (m = month) => { const s = summary(m); return { month: m, expense: s.expense, income: s.income, balance: s.balance, budget: state.budget, byCategory: s.byCat }; },
  };

  // ---------- その他のイベント ----------
  document.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const t = ev.target.closest('.tx'); if (t) openSheet(state.entries.find((e) => e.id === t.dataset.id));
  });
  $('#fab').addEventListener('click', () => openSheet(null));
  $('#prevMonth').addEventListener('click', () => shiftMonth(-1));
  $('#nextMonth').addEventListener('click', () => shiftMonth(1));
  function shiftMonth(d) {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    month = P.ymd(dt).slice(0, 7); render();
  }

  $('#quickInput').addEventListener('input', () => {
    const r = P.parseLine($('#quickInput').value);
    $('#quickHint').textContent = r ? `${r.type === 'income' ? '収入' : '支出'} · ${r.category} · ${yen(r.amount)} · ${r.date.slice(5).replace('-', '/')}` : '';
  });
  $('#quickForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const r = P.parseLine($('#quickInput').value);
    if (!r) { toast('金額が見つかりません(例: ランチ 850)'); return; }
    addEntries([r]);
    $('#quickInput').value = ''; $('#quickHint').textContent = '';
    if (!r.date.startsWith(month)) { month = r.date.slice(0, 7); render(); }
  });

  $('#search').addEventListener('input', render);
  $('#historyFilter').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    historyFilter = b.dataset.f;
    document.querySelectorAll('#historyFilter button').forEach((x) => x.setAttribute('aria-selected', x === b));
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
  const stamp = () => P.ymd(new Date()).replace(/-/g, '');
  $('#exportJson').addEventListener('click', () => download(`kakei-${stamp()}.json`, JSON.stringify(state, null, 2), 'application/json'));
  $('#exportCsv').addEventListener('click', () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['日付', '種類', 'カテゴリ', '金額', 'メモ'], ...[...state.entries].sort(sortDesc).map((e) => [e.date, e.type === 'income' ? '収入' : '支出', e.category, e.amount, e.memo])];
    download(`kakei-${stamp()}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv');
  });
  $('#importFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (Array.isArray(data.entries) && 'budget' in data) {
        if (!confirm(`${data.entries.length}件のバックアップで今のデータを置き換えますか?`)) return;
        state = { entries: data.entries, budget: data.budget || 0 }; save(); render(); toast('読み込みました');
      } else {
        const list = P.parseBulk(JSON.stringify(data));
        if (!list.length) throw new Error();
        addEntries(list);
      }
    } catch (_) { toast('読み込めないファイルです'); }
    ev.target.value = '';
  });
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('すべての記録と予算を削除します。元に戻せません。よろしいですか?')) return;
    state = { entries: [], budget: 0 }; save(); render(); toast('削除しました');
  });

  $('#urlExample').textContent = `${appUrl()}?add=${encodeURIComponent('ランチ 850')}`;
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  window.addEventListener('storage', (ev) => { if (ev.key === KEY) { try { state = JSON.parse(ev.newValue); render(); } catch (_) {} } });

  go(location.hash.slice(1) || 'home');
  handleUrl();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
