(() => {
  const STORAGE_KEY = 'karmashek-v3';
  const CURRENCIES = [
    { code: '€', name: 'Евро' },
    { code: '₴', name: 'Гривна' },
    { code: '₽', name: 'Рубль' },
    { code: 'Kč', name: 'Крона' },
    { code: '$', name: 'Доллар' }
  ];
  const DEFAULT_CATEGORIES = ['Еда', 'Транспорт', 'Жильё', 'Развлечения', 'Здоровье', 'Одежда', 'Связь', 'Прочее'];

  const defaultData = () => ({
    ownerName: '',
    theme: 'dark',
    pockets: [
      { id: 'p1', name: 'Кошелёк', type: 'cash', balance: 0, currency: '€' },
      { id: 'p2', name: 'Отложка', type: 'savings', balance: 0, currency: '€' }
    ],
    debts: [],
    transactions: [],
    categories: [...DEFAULT_CATEGORIES],
    goals: [],
    expected: []
  });

  let data = load();
  let currentModal = null;
  let statsPeriod = 'month';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultData(), ...JSON.parse(raw) };
      // migrate older keys
      for (const k of ['my-wallet-v2', 'my-wallet-v1']) {
        const old = localStorage.getItem(k);
        if (old) {
          const o = JSON.parse(old);
          const d = defaultData();
          if (o.pockets) d.pockets = o.pockets.map(p => ({ ...p, currency: p.currency || o.currency || '€' }));
          else if (o.cash != null) d.pockets[0].balance = o.cash;
          d.debts = (o.debts || []).map(x => ({ ...x, paidAmount: x.paidAmount ?? (x.paid ? x.amount : 0), currency: x.currency || '€' }));
          d.transactions = (o.transactions || []).map(t => ({ ...t, currency: t.currency || '€' }));
          d.categories = o.categories || d.categories;
          d.goals = o.goals || [];
          d.theme = o.theme || 'dark';
          d.ownerName = o.ownerName || '';
          return d;
        }
      }
      return defaultData();
    } catch { return defaultData(); }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderAll();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function parseAmount(str) {
    if (typeof str === 'number') return str;
    if (!str) return NaN;
    const s = String(str).trim().replace(/\s/g, '').replace(',', '.');
    return parseFloat(s);
  }

  function money(n, cur) {
    const c = cur || '€';
    const sign = n < 0 ? '−' : '';
    return sign + Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + c;
  }

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

  function currencyOptions(selected) {
    return CURRENCIES.map(c =>
      `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.code} ${c.name}</option>`
    ).join('');
  }

  // Theme
  function applyTheme() {
    let t = data.theme || 'dark';
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#f5f5f7' : '#050505';
  }

  // Nav
  function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn[data-section]').forEach(b => b.classList.remove('active'));
    const sec = document.getElementById(id);
    if (sec) sec.classList.add('active');
    const btn = document.querySelector(`.nav-btn[data-section="${id}"]`);
    if (btn) btn.classList.add('active');
  }

  document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  // Debt tabs
  document.querySelectorAll('#debts .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#debts .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#debts .tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('debts-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Stats tabs
  document.querySelectorAll('[data-stat-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-stat-tab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#stat-history, #stat-charts').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('stat-' + tab.dataset.statTab).classList.add('active');
    });
  });

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statsPeriod = btn.dataset.period;
      renderCharts();
    });
  });

  // Theme btn
  document.getElementById('btn-theme').addEventListener('click', () => {
    data.theme = (data.theme === 'dark' || !data.theme) ? 'light' : 'dark';
    applyTheme();
    save();
  });

  // FAB center
  const fabSheet = document.getElementById('fab-sheet');
  document.getElementById('nav-fab').addEventListener('click', () => fabSheet.classList.remove('hidden'));
  document.getElementById('fab-backdrop').addEventListener('click', () => fabSheet.classList.add('hidden'));
  document.getElementById('fab-cancel').addEventListener('click', () => fabSheet.classList.add('hidden'));
  document.querySelectorAll('.sheet-item[data-action]').forEach(item => {
    item.addEventListener('click', () => {
      fabSheet.classList.add('hidden');
      const a = item.dataset.action;
      if (a === 'tx') openTxModal();
      if (a === 'debt-owed') openDebtModal(null, 'owed');
      if (a === 'debt-owe') openDebtModal(null, 'owe');
      if (a === 'pocket') openPocketModal();
    });
  });

  // ---------- helpers ----------
  function debtRemaining(d) {
    return Math.max(0, (d.amount || 0) - (d.paidAmount || 0));
  }
  function sumOwedByCurrency() {
    const m = {};
    data.debts.filter(d => d.type === 'owed' && debtRemaining(d) > 0).forEach(d => {
      const c = d.currency || '€';
      m[c] = (m[c] || 0) + debtRemaining(d);
    });
    return m;
  }
  function sumOweByCurrency() {
    const m = {};
    data.debts.filter(d => d.type === 'owe' && debtRemaining(d) > 0).forEach(d => {
      const c = d.currency || '€';
      m[c] = (m[c] || 0) + debtRemaining(d);
    });
    return m;
  }
  function pocketsByCurrency() {
    const m = {};
    data.pockets.forEach(p => {
      const c = p.currency || '€';
      m[c] = (m[c] || 0) + (p.balance || 0);
    });
    return m;
  }
  function formatMulti(map) {
    const entries = Object.entries(map).filter(([, v]) => Math.abs(v) > 0.001);
    if (!entries.length) return '0';
    return entries.map(([c, v]) => money(v, c)).join(' · ');
  }

  // ---------- Render ----------
  function renderAll() {
    applyTheme();
    updateHeader();
    renderDashboard();
    renderDebts();
    renderTransactions();
    renderCharts();
    renderMore();
    fillPocketSelects();
  }

  function updateHeader() {
    const name = (data.ownerName || '').trim();
    document.getElementById('header-title').textContent = name ? 'Кармашек ' + name : 'Кармашек';
  }

  function renderDashboard() {
    const byCur = pocketsByCurrency();
    const totalsEl = document.getElementById('dash-totals');
    const entries = Object.entries(byCur);
    if (!entries.length) totalsEl.innerHTML = '<div class="balance-chip">0</div>';
    else totalsEl.innerHTML = entries.map(([c, v]) =>
      `<div class="balance-chip">${money(v, c)}</div>`
    ).join('');

    document.getElementById('dash-owed').textContent = formatMulti(sumOwedByCurrency()) || '0';
    document.getElementById('dash-owe').textContent = formatMulti(sumOweByCurrency()) || '0';

    // goals
    const goalsHome = document.getElementById('goals-home');
    const activeGoals = (data.goals || []).filter(g => (g.current || 0) < (g.target || 0));
    if (!activeGoals.length) {
      goalsHome.classList.add('hidden');
      goalsHome.innerHTML = '';
    } else {
      goalsHome.classList.remove('hidden');
      goalsHome.innerHTML = activeGoals.map(g => {
        const pct = g.target ? Math.min(100, Math.round((g.current || 0) / g.target * 100)) : 0;
        return `<div class="goal-home-item">
          <div class="goal-home-title">${escapeHtml(g.title)}</div>
          <div class="goal-home-sub">${money(g.current || 0, g.currency || '€')} / ${money(g.target, g.currency || '€')}</div>
          <div class="progress-bar"><div style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
    }

    // pockets preview
    const grid = document.getElementById('pockets-preview');
    if (!data.pockets.length) grid.innerHTML = '<div class="empty">Нет кармашков</div>';
    else grid.innerHTML = data.pockets.map(p => `
      <div class="pocket-chip" data-goto-more>
        <div class="pocket-chip-name">${escapeHtml(p.name)}</div>
        <div class="pocket-chip-amount">${money(p.balance, p.currency)}</div>
      </div>
    `).join('');

    // upcoming
    const upcoming = [];
    data.debts.filter(d => debtRemaining(d) > 0).forEach(d => {
      upcoming.push({
        date: d.date || '',
        text: (d.type === 'owed' ? 'Вернёт: ' : 'Отдать: ') + d.person,
        amount: d.type === 'owed' ? debtRemaining(d) : -debtRemaining(d),
        currency: d.currency || '€'
      });
    });
    upcoming.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const ul = document.getElementById('upcoming-list');
    if (!upcoming.length) ul.innerHTML = '<div class="empty">Нет ближайших событий</div>';
    else ul.innerHTML = upcoming.slice(0, 6).map(u => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(u.text)}</div>
          <div class="list-item-sub">${formatDate(u.date)}</div>
        </div>
        <div class="list-item-amount ${u.amount >= 0 ? 'positive' : 'negative'}">${money(u.amount, u.currency)}</div>
      </div>
    `).join('');
  }

  function renderDebts() {
    document.getElementById('debt-sum-owed').textContent = formatMulti(sumOwedByCurrency()) || '0';
    document.getElementById('debt-sum-owe').textContent = formatMulti(sumOweByCurrency()) || '0';

    const renderList = (type, containerId) => {
      const items = data.debts.filter(d => d.type === type && debtRemaining(d) > 0)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const el = document.getElementById(containerId);
      if (!items.length) { el.innerHTML = '<div class="empty">Пока пусто</div>'; return; }
      el.innerHTML = items.map(d => {
        const rem = debtRemaining(d);
        const pct = d.amount ? Math.round((d.paidAmount || 0) / d.amount * 100) : 0;
        return `<div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(d.person)}</div>
            <div class="list-item-sub">${escapeHtml(d.reason || '')} · ${formatDate(d.date)}${(d.paidAmount || 0) > 0 ? ' · погашено ' + money(d.paidAmount, d.currency) : ''}</div>
            ${(d.paidAmount || 0) > 0 ? `<div class="progress-bar"><div style="width:${pct}%"></div></div>` : ''}
            <div class="list-item-actions">
              <button class="pill" data-action="partial-debt" data-id="${d.id}">Частично</button>
              <button class="pill" data-action="edit-paid" data-id="${d.id}">Погашено</button>
              <button class="pill pill-ok" data-action="full-paid" data-id="${d.id}">Закрыть</button>
              <button class="pill" data-action="undo-paid" data-id="${d.id}">Отменить</button>
              <button class="pill" data-action="edit-debt" data-id="${d.id}">Изменить</button>
              <button class="pill pill-danger" data-action="del-debt" data-id="${d.id}">Удалить</button>
            </div>
          </div>
          <div class="list-item-amount ${type === 'owed' ? 'positive' : 'negative'}">${money(rem, d.currency)}</div>
        </div>`;
      }).join('');
    };
    renderList('owed', 'list-owed');
    renderList('owe', 'list-owe');
  }

  function renderTransactions() {
    let items = data.transactions.slice().sort((a, b) => {
      const dd = (b.date || '').localeCompare(a.date || '');
      if (dd !== 0) return dd;
      return (b.id || '').localeCompare(a.id || '');
    });
    const typeF = document.getElementById('tx-filter-type').value;
    const pocketF = document.getElementById('tx-filter-pocket').value;
    if (typeF !== 'all') items = items.filter(t => t.type === typeF);
    if (pocketF !== 'all') items = items.filter(t => t.pocketId === pocketF);

    const el = document.getElementById('list-tx');
    if (!items.length) { el.innerHTML = '<div class="empty">Нет транзакций</div>'; return; }
    el.innerHTML = items.slice(0, 100).map(t => {
      const pocket = data.pockets.find(p => p.id === t.pocketId);
      const cur = t.currency || pocket?.currency || '€';
      return `<div class="list-item">
        <button class="tx-del" data-action="del-tx" data-id="${t.id}" title="Удалить">×</button>
        <div class="list-item-main" style="padding-right:24px">
          <div class="list-item-title">${escapeHtml(t.description || (t.type === 'income' ? 'Доход' : 'Расход'))}</div>
          <div class="list-item-sub">${formatDate(t.date)} · ${escapeHtml(t.category || '')}${pocket ? ' · ' + escapeHtml(pocket.name) : ''}</div>
        </div>
        <div class="list-item-amount ${t.type === 'income' ? 'positive' : 'negative'}">${money(t.type === 'income' ? t.amount : -t.amount, cur)}</div>
      </div>`;
    }).join('');
  }

  function periodStart(period) {
    const now = new Date();
    const d = new Date(now);
    if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  function renderCharts() {
    const start = periodStart(statsPeriod);
    const txs = data.transactions.filter(t => (t.date || '') >= start);

    // summary by currency: income - expense (pockets only)
    const byCur = {};
    txs.forEach(t => {
      const c = t.currency || '€';
      if (!byCur[c]) byCur[c] = { inc: 0, exp: 0 };
      if (t.type === 'income') byCur[c].inc += t.amount;
      else byCur[c].exp += t.amount;
    });
    const sumEl = document.getElementById('chart-summary');
    const parts = Object.entries(byCur).map(([c, v]) => {
      const net = v.inc - v.exp;
      return `<div style="margin:4px 0"><strong>${money(net, c)}</strong>
        <span style="color:var(--text-muted);font-size:0.8rem"> (доход ${money(v.inc, c)} · расход ${money(v.exp, c)})</span></div>`;
    });
    sumEl.innerHTML = parts.length ? parts.join('') : '<div style="color:var(--text-muted)">Нет данных за период</div>';

    // categories pie (expenses only, primary currency or all mixed as numbers without convert)
    const byCat = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.category || 'Прочее';
      byCat[cat] = (byCat[cat] || 0) + t.amount;
    });
    const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const total = catEntries.reduce((s, [, v]) => s + v, 0) || 1;
    drawPie(document.getElementById('pie-categories'), catEntries, total);

    const catEl = document.getElementById('stats-categories');
    catEl.innerHTML = catEntries.length ? catEntries.map(([name, val]) => `
      <div class="stat-row">
        <span>${escapeHtml(name)}</span>
        <div class="stat-bar-wrap"><div class="stat-bar"><div style="width:${Math.round(val/total*100)}%"></div></div></div>
        <span>${val.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}</span>
      </div>
    `).join('') : '<div class="empty">Нет расходов</div>';

    const pEl = document.getElementById('stats-pockets');
    const maxP = Math.max(...data.pockets.map(p => Math.abs(p.balance || 0)), 1);
    pEl.innerHTML = data.pockets.length ? data.pockets.map(p => `
      <div class="stat-row">
        <span>${escapeHtml(p.name)}</span>
        <div class="stat-bar-wrap"><div class="stat-bar"><div style="width:${Math.round(Math.abs(p.balance)/maxP*100)}%"></div></div></div>
        <span>${money(p.balance, p.currency)}</span>
      </div>
    `).join('') : '<div class="empty">Нет кармашков</div>';
  }

  function drawPie(container, entries, total) {
    if (!entries.length) { container.innerHTML = ''; return; }
    const colors = ['#a855f7', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
    let angle = -90;
    const paths = entries.map(([name, val], i) => {
      const slice = (val / total) * 360;
      const a1 = angle * Math.PI / 180;
      const a2 = (angle + slice) * Math.PI / 180;
      const x1 = 50 + 40 * Math.cos(a1), y1 = 50 + 40 * Math.sin(a1);
      const x2 = 50 + 40 * Math.cos(a2), y2 = 50 + 40 * Math.sin(a2);
      const large = slice > 180 ? 1 : 0;
      angle += slice;
      return `<path d="M50,50 L${x1},${y1} A40,40 0 ${large} 1 ${x2},${y2} Z" fill="${colors[i % colors.length]}"/>`;
    }).join('');
    container.innerHTML = `<svg viewBox="0 0 100 100">${paths}<circle cx="50" cy="50" r="22" fill="var(--bg-card)"/></svg>`;
  }

  function renderMore() {
    const name = (data.ownerName || '').trim();
    document.getElementById('profile-name').textContent = name || 'Без имени';
    document.getElementById('profile-avatar').textContent = name ? name[0].toUpperCase() : 'К';

    document.getElementById('setting-theme').value = data.theme || 'dark';

    // pockets with order
    const pEl = document.getElementById('list-pockets');
    pEl.innerHTML = data.pockets.map((p, i) => `
      <div class="list-item">
        <div class="order-btns">
          <button data-action="pocket-up" data-id="${p.id}" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button data-action="pocket-down" data-id="${p.id}" ${i === data.pockets.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(p.name)}</div>
          <div class="list-item-sub">${p.type === 'cash' ? 'Наличка' : p.type === 'card' ? 'Карта' : p.type === 'savings' ? 'Накопления' : 'Другое'} · ${p.currency}</div>
          <div class="list-item-actions">
            <button class="pill" data-action="edit-pocket" data-id="${p.id}">Изменить</button>
            <button class="pill" data-action="adjust-pocket" data-id="${p.id}">+/−</button>
            <button class="pill pill-danger" data-action="del-pocket" data-id="${p.id}">Удалить</button>
          </div>
        </div>
        <div class="list-item-amount">${money(p.balance, p.currency)}</div>
      </div>
    `).join('') || '<div class="empty">Нет кармашков</div>';

    // categories with order
    const cEl = document.getElementById('list-categories');
    cEl.innerHTML = (data.categories || []).map((c, i) => `
      <div class="list-item">
        <div class="order-btns">
          <button data-action="cat-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button data-action="cat-down" data-idx="${i}" ${i === data.categories.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <div class="list-item-main"><div class="list-item-title">${escapeHtml(c)}</div></div>
        <button class="pill pill-danger" data-action="del-category" data-name="${escapeAttr(c)}">✕</button>
      </div>
    `).join('') || '<div class="empty">Нет категорий</div>';

    // goals
    const gEl = document.getElementById('list-goals');
    gEl.innerHTML = (data.goals || []).map(g => {
      const pct = g.target ? Math.min(100, Math.round((g.current || 0) / g.target * 100)) : 0;
      return `<div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(g.title)}</div>
          <div class="list-item-sub">${money(g.current || 0, g.currency || '€')} / ${money(g.target, g.currency || '€')}</div>
          <div class="progress-bar"><div style="width:${pct}%"></div></div>
          <div class="list-item-actions">
            <button class="pill" data-action="edit-goal" data-id="${g.id}">Изменить</button>
            <button class="pill pill-danger" data-action="del-goal" data-id="${g.id}">Удалить</button>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="empty">Целей пока нет</div>';
  }

  function fillPocketSelects() {
    const sel = document.getElementById('tx-filter-pocket');
    const cur = sel.value;
    sel.innerHTML = '<option value="all">Все кармашки</option>' +
      data.pockets.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  }

  document.getElementById('tx-filter-type').addEventListener('change', renderTransactions);
  document.getElementById('tx-filter-pocket').addEventListener('change', renderTransactions);
  document.getElementById('setting-theme').addEventListener('change', (e) => {
    data.theme = e.target.value; applyTheme(); save();
  });

  // click pockets on home -> more
  document.getElementById('pockets-preview').addEventListener('click', (e) => {
    if (e.target.closest('[data-goto-more]')) showSection('more');
  });

  // ---------- Actions ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'pocket-up' || action === 'pocket-down') {
      const i = data.pockets.findIndex(p => p.id === id);
      if (i < 0) return;
      const j = action === 'pocket-up' ? i - 1 : i + 1;
      if (j < 0 || j >= data.pockets.length) return;
      [data.pockets[i], data.pockets[j]] = [data.pockets[j], data.pockets[i]];
      save();
    }
    if (action === 'cat-up' || action === 'cat-down') {
      const i = parseInt(btn.dataset.idx, 10);
      const j = action === 'cat-up' ? i - 1 : i + 1;
      if (j < 0 || j >= data.categories.length) return;
      [data.categories[i], data.categories[j]] = [data.categories[j], data.categories[i]];
      save();
    }
    if (action === 'edit-pocket') openPocketModal(data.pockets.find(p => p.id === id));
    if (action === 'adjust-pocket') openAdjustPocketModal(id);
    if (action === 'del-pocket') {
      if (data.pockets.length <= 1) return alert('Нужен хотя бы один кармашек');
      if (confirm('Удалить кармашек?')) {
        data.pockets = data.pockets.filter(p => p.id !== id);
        save();
      }
    }
    if (action === 'edit-debt') openDebtModal(data.debts.find(d => d.id === id));
    if (action === 'partial-debt') openPartialDebtModal(id);
    if (action === 'edit-paid') openEditPaidModal(id);
    if (action === 'full-paid') {
      const d = data.debts.find(x => x.id === id);
      if (d) { d.paidAmount = d.amount; d.paid = true; save(); }
    }
    if (action === 'undo-paid') {
      const d = data.debts.find(x => x.id === id);
      if (d && (d.paidAmount || 0) > 0) {
        // undo last: set paidAmount to 0 for simplicity, or reduce - we store lastPartial optionally
        if (d.lastPartial) {
          d.paidAmount = Math.max(0, (d.paidAmount || 0) - d.lastPartial);
          d.lastPartial = 0;
          d.paid = false;
        } else {
          d.paidAmount = 0;
          d.paid = false;
        }
        save();
      }
    }
    if (action === 'del-debt') {
      if (confirm('Удалить долг?')) {
        data.debts = data.debts.filter(x => x.id !== id);
        save();
      }
    }
    if (action === 'del-tx') {
      if (confirm('Удалить транзакцию? Баланс кармашка не изменится автоматически.')) {
        data.transactions = data.transactions.filter(x => x.id !== id);
        save();
      }
    }
    if (action === 'del-category') {
      data.categories = data.categories.filter(c => c !== btn.dataset.name);
      save();
    }
    if (action === 'del-goal') {
      data.goals = data.goals.filter(g => g.id !== id);
      save();
    }
    if (action === 'edit-goal') openGoalModal(data.goals.find(g => g.id === id));
  });

  // ---------- Modals ----------
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const modalTitle = document.getElementById('modal-title');

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.remove('hidden');
  }
  function closeModal() { modal.classList.add('hidden'); currentModal = null; }
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  function pocketOptions(selected) {
    return data.pockets.map(p =>
      `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${escapeHtml(p.name)} (${p.currency})</option>`
    ).join('');
  }
  function categoryOptions(selected) {
    return (data.categories || []).map(c =>
      `<option value="${escapeAttr(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`
    ).join('');
  }

  function openPocketModal(existing = null) {
    currentModal = { kind: 'pocket', id: existing?.id };
    openModal(existing ? 'Изменить кармашек' : 'Новый кармашек', `
      <div class="form-group"><label>Название</label>
        <input id="m-name" value="${escapeAttr(existing?.name || '')}" placeholder="Кошелёк, Карта, Отложка..." /></div>
      <div class="row-2">
        <div class="form-group"><label>Тип</label>
          <select id="m-type">
            <option value="cash" ${existing?.type==='cash'?'selected':''}>Наличка</option>
            <option value="card" ${existing?.type==='card'?'selected':''}>Карта</option>
            <option value="savings" ${existing?.type==='savings'?'selected':''}>Накопления</option>
            <option value="other" ${existing?.type==='other'?'selected':''}>Другое</option>
          </select></div>
        <div class="form-group"><label>Валюта</label>
          <select id="m-currency">${currencyOptions(existing?.currency || '€')}</select></div>
      </div>
      <div class="form-group"><label>Баланс</label>
        <input id="m-balance" type="text" inputmode="decimal" value="${existing?.balance ?? 0}" placeholder="0" /></div>
    `);
  }

  function openAdjustPocketModal(id) {
    const p = data.pockets.find(x => x.id === id);
    if (!p) return;
    currentModal = { kind: 'adjust', id };
    openModal('+/− : ' + p.name, `
      <div class="form-group"><label>Сумма (+ положить / − снять), ${p.currency}</label>
        <input id="m-delta" type="text" inputmode="decimal" placeholder="0" /></div>
      <div class="form-group"><label>Комментарий</label>
        <input id="m-note" placeholder="Необязательно" /></div>
    `);
  }

  function openDebtModal(existing = null, forceType = null) {
    const type = existing?.type || forceType || 'owed';
    currentModal = { kind: 'debt', id: existing?.id, type };
    openModal(existing ? 'Изменить долг' : (type === 'owed' ? 'Кто мне должен' : 'Кому я должен'), `
      <div class="form-group"><label>Человек</label>
        <input id="m-person" value="${escapeAttr(existing?.person || '')}" /></div>
      <div class="row-2">
        <div class="form-group"><label>Сумма</label>
          <input id="m-amount" type="text" inputmode="decimal" value="${existing?.amount ?? ''}" /></div>
        <div class="form-group"><label>Валюта</label>
          <select id="m-currency">${currencyOptions(existing?.currency || '€')}</select></div>
      </div>
      <div class="form-group"><label>За что</label>
        <input id="m-reason" value="${escapeAttr(existing?.reason || '')}" /></div>
      <div class="form-group"><label>Дата</label>
        <input id="m-date" type="date" value="${existing?.date || new Date().toISOString().slice(0,10)}" /></div>
    `);
  }

  function openPartialDebtModal(id) {
    const d = data.debts.find(x => x.id === id);
    if (!d) return;
    currentModal = { kind: 'partial', id };
    openModal('Частично: ' + d.person, `
      <p class="hint" style="margin-bottom:12px">Осталось: ${money(debtRemaining(d), d.currency)}</p>
      <div class="form-group"><label>Сколько погасить</label>
        <input id="m-partial" type="text" inputmode="decimal" placeholder="0" /></div>
    `);
  }

  function openEditPaidModal(id) {
    const d = data.debts.find(x => x.id === id);
    if (!d) return;
    currentModal = { kind: 'edit-paid', id };
    openModal('Редактировать погашено: ' + d.person, `
      <p class="hint" style="margin-bottom:12px">Всего долг: ${money(d.amount, d.currency)}</p>
      <div class="form-group"><label>Уже погашено</label>
        <input id="m-paid" type="text" inputmode="decimal" value="${d.paidAmount || 0}" /></div>
    `);
  }

  function openTxModal() {
    currentModal = { kind: 'tx' };
    const first = data.pockets[0];
    openModal('Доход / Расход', `
      <div class="form-group"><label>Тип</label>
        <select id="m-type"><option value="expense">Расход</option><option value="income">Доход</option></select></div>
      <div class="form-group"><label>Кармашек</label>
        <select id="m-pocket">${pocketOptions(first?.id)}</select></div>
      <div class="row-2">
        <div class="form-group"><label>Сумма</label>
          <input id="m-amount" type="text" inputmode="decimal" placeholder="0" /></div>
        <div class="form-group"><label>Валюта</label>
          <select id="m-currency">${currencyOptions(first?.currency || '€')}</select></div>
      </div>
      <div class="form-group"><label>Категория</label>
        <select id="m-cat">${categoryOptions()}</select></div>
      <div class="form-group"><label>Описание</label>
        <input id="m-desc" placeholder="На что / откуда" /></div>
      <div class="form-group"><label>Дата</label>
        <input id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
    `);
    // sync currency when pocket changes
    setTimeout(() => {
      const pocketSel = document.getElementById('m-pocket');
      if (pocketSel) pocketSel.addEventListener('change', () => {
        const p = data.pockets.find(x => x.id === pocketSel.value);
        const curSel = document.getElementById('m-currency');
        if (p && curSel) curSel.value = p.currency || '€';
      });
    }, 50);
  }

  function openGoalModal(existing = null) {
    currentModal = { kind: 'goal', id: existing?.id };
    openModal(existing ? 'Изменить цель' : 'Новая цель', `
      <div class="form-group"><label>Название</label>
        <input id="m-title" value="${escapeAttr(existing?.title || '')}" /></div>
      <div class="row-2">
        <div class="form-group"><label>Цель</label>
          <input id="m-target" type="text" inputmode="decimal" value="${existing?.target ?? ''}" /></div>
        <div class="form-group"><label>Валюта</label>
          <select id="m-currency">${currencyOptions(existing?.currency || '€')}</select></div>
      </div>
      <div class="form-group"><label>Уже накоплено</label>
        <input id="m-current" type="text" inputmode="decimal" value="${existing?.current ?? 0}" /></div>
    `);
  }

  document.getElementById('modal-save').addEventListener('click', () => {
    if (!currentModal) return;
    const { kind, id, type } = currentModal;

    if (kind === 'pocket') {
      const name = document.getElementById('m-name').value.trim();
      const ptype = document.getElementById('m-type').value;
      const currency = document.getElementById('m-currency').value;
      const balance = parseAmount(document.getElementById('m-balance').value) || 0;
      if (!name) return alert('Укажи название');
      if (id) {
        const p = data.pockets.find(x => x.id === id);
        if (p) { p.name = name; p.type = ptype; p.currency = currency; p.balance = balance; }
      } else {
        data.pockets.push({ id: uid(), name, type: ptype, balance, currency });
      }
    }
    if (kind === 'adjust') {
      const delta = parseAmount(document.getElementById('m-delta').value);
      if (isNaN(delta) || delta === 0) return alert('Укажи сумму');
      const note = document.getElementById('m-note').value.trim();
      const p = data.pockets.find(x => x.id === id);
      if (p) {
        p.balance = (p.balance || 0) + delta;
        data.transactions.push({
          id: uid(), type: delta >= 0 ? 'income' : 'expense',
          amount: Math.abs(delta), description: note || (delta >= 0 ? 'Пополнение' : 'Снятие'),
          category: 'Перевод', pocketId: id, currency: p.currency,
          date: new Date().toISOString().slice(0, 10)
        });
      }
    }
    if (kind === 'debt') {
      const person = document.getElementById('m-person').value.trim();
      const amount = parseAmount(document.getElementById('m-amount').value);
      const currency = document.getElementById('m-currency').value;
      const reason = document.getElementById('m-reason').value.trim();
      const date = document.getElementById('m-date').value;
      if (!person || isNaN(amount) || amount <= 0) return alert('Укажи человека и сумму');
      if (id) {
        const d = data.debts.find(x => x.id === id);
        if (d) { d.person = person; d.amount = amount; d.currency = currency; d.reason = reason; d.date = date; }
      } else {
        data.debts.push({ id: uid(), type, person, amount, currency, reason, date, paidAmount: 0, paid: false, lastPartial: 0 });
      }
    }
    if (kind === 'partial') {
      const val = parseAmount(document.getElementById('m-partial').value);
      if (isNaN(val) || val <= 0) return alert('Укажи сумму');
      const d = data.debts.find(x => x.id === id);
      if (d) {
        d.paidAmount = Math.min(d.amount, (d.paidAmount || 0) + val);
        d.lastPartial = val;
        if (d.paidAmount >= d.amount) d.paid = true;
      }
    }
    if (kind === 'edit-paid') {
      const val = parseAmount(document.getElementById('m-paid').value);
      if (isNaN(val) || val < 0) return alert('Укажи сумму');
      const d = data.debts.find(x => x.id === id);
      if (d) {
        d.paidAmount = Math.min(d.amount, val);
        d.paid = d.paidAmount >= d.amount;
        d.lastPartial = 0;
      }
    }
    if (kind === 'tx') {
      const ttype = document.getElementById('m-type').value;
      const pocketId = document.getElementById('m-pocket').value;
      const amount = parseAmount(document.getElementById('m-amount').value);
      const currency = document.getElementById('m-currency').value;
      const category = document.getElementById('m-cat').value;
      const description = document.getElementById('m-desc').value.trim();
      const date = document.getElementById('m-date').value;
      if (isNaN(amount) || amount <= 0) return alert('Укажи сумму');
      data.transactions.push({ id: uid(), type: ttype, amount, category, description, pocketId, currency, date });
      const p = data.pockets.find(x => x.id === pocketId);
      if (p && (p.currency || '€') === currency) {
        p.balance = (p.balance || 0) + (ttype === 'income' ? amount : -amount);
      }
    }
    if (kind === 'category') {
      const name = document.getElementById('m-name').value.trim();
      if (!name) return alert('Укажи название');
      if (!data.categories.includes(name)) data.categories.push(name);
    }
    if (kind === 'goal') {
      const title = document.getElementById('m-title').value.trim();
      const target = parseAmount(document.getElementById('m-target').value);
      const current = parseAmount(document.getElementById('m-current').value) || 0;
      const currency = document.getElementById('m-currency').value;
      if (!title || isNaN(target) || target <= 0) return alert('Укажи название и сумму');
      if (id) {
        const g = data.goals.find(x => x.id === id);
        if (g) { g.title = title; g.target = target; g.current = current; g.currency = currency; }
      } else {
        data.goals.push({ id: uid(), title, target, current, currency });
      }
    }
    if (kind === 'profile') {
      data.ownerName = document.getElementById('m-name').value.trim();
    }

    save();
    closeModal();
  });

  // buttons
  document.getElementById('btn-add-pocket').addEventListener('click', () => openPocketModal());
  document.getElementById('btn-add-pocket-dash').addEventListener('click', () => openPocketModal());
  document.getElementById('btn-add-owed').addEventListener('click', () => openDebtModal(null, 'owed'));
  document.getElementById('btn-add-owe').addEventListener('click', () => openDebtModal(null, 'owe'));
  document.getElementById('btn-add-category').addEventListener('click', () => {
    currentModal = { kind: 'category' };
    openModal('Новая категория', `<div class="form-group"><label>Название</label><input id="m-name" /></div>`);
  });
  document.getElementById('btn-add-goal').addEventListener('click', () => openGoalModal());
  document.getElementById('btn-edit-profile').addEventListener('click', () => {
    currentModal = { kind: 'profile' };
    openModal('Имя владельца', `<div class="form-group"><label>Имя</label>
      <input id="m-name" value="${escapeAttr(data.ownerName || '')}" placeholder="Как тебя зовут" /></div>`);
  });

  // import export
  document.getElementById('csv-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim());
        let n = 0;
        const defaultPocket = data.pockets[0];
        lines.forEach((line, idx) => {
          if (idx === 0 && /дата|date|описание|amount/i.test(line)) return;
          const parts = line.split(/[;,]/).map(p => p.trim().replace(/^"|"$/g, ''));
          if (parts.length < 3) return;
          let date = parts[0], desc = parts[1];
          let amount = parseAmount(parts[2]);
          if (isNaN(amount)) return;
          if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(date)) {
            const [d, m, y] = date.split(/[./]/);
            date = `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          data.transactions.push({
            id: uid(), type: amount >= 0 ? 'income' : 'expense',
            amount: Math.abs(amount), description: desc || 'Импорт',
            category: 'Импорт', pocketId: defaultPocket?.id, currency: defaultPocket?.currency || '€', date
          });
          if (defaultPocket) defaultPocket.balance = (defaultPocket.balance || 0) + amount;
          n++;
        });
        save();
        alert('Импортировано: ' + n);
      } catch { alert('Ошибка файла'); }
      e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `karmashek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Удалить ВСЕ данные?')) { data = defaultData(); save(); }
  });

  applyTheme();
  renderAll();
})();
