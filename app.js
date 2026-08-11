(() => {
  const STORAGE_KEY = 'my-wallet-v2';
  const DEFAULT_CATEGORIES = ['Еда', 'Транспорт', 'Жильё', 'Развлечения', 'Здоровье', 'Одежда', 'Связь', 'Прочее'];

  const defaultData = () => ({
    currency: '€',
    theme: 'dark',
    pockets: [
      { id: 'p1', name: 'Кошелёк', type: 'cash', balance: 0, color: '#67e8f9' },
      { id: 'p2', name: 'Отложка', type: 'savings', balance: 0, color: '#a855f7' }
    ],
    debts: [],
    transactions: [],
    categories: [...DEFAULT_CATEGORIES],
    goals: [],
    expected: []
  });

  let data = load();
  let currentModal = null;
  let searchQuery = '';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // migrate v1 if exists
        const v1 = localStorage.getItem('my-wallet-v1');
        if (v1) {
          const old = JSON.parse(v1);
          const d = defaultData();
          if (old.cash) d.pockets[0].balance = old.cash;
          d.debts = (old.debts || []).map(x => ({ ...x, paidAmount: x.paid ? x.amount : 0, paid: !!x.paid }));
          d.transactions = old.transactions || [];
          d.expected = old.expected || [];
          return d;
        }
        return defaultData();
      }
      return { ...defaultData(), ...JSON.parse(raw) };
    } catch {
      return defaultData();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderAll();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function money(n) {
    const cur = data.currency || '€';
    const sign = n < 0 ? '−' : '';
    return sign + Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + cur;
  }

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

  // Theme
  function applyTheme() {
    let t = data.theme || 'dark';
    if (t === 'system') {
      t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#f5f5f7' : '#050505';
  }

  // Navigation
  function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const sec = document.getElementById(id);
    if (sec) sec.classList.add('active');
    const btn = document.querySelector(`.nav-btn[data-section="${id}"]`);
    if (btn) btn.classList.add('active');
    if (id === 'settings') document.getElementById('settings').classList.add('active');
    document.getElementById('search-bar').classList.add('hidden');
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });
  document.getElementById('btn-settings').addEventListener('click', () => showSection('settings'));

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('debts-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Search
  document.getElementById('btn-search').addEventListener('click', () => {
    document.getElementById('search-bar').classList.toggle('hidden');
    document.getElementById('search-input').focus();
  });
  document.getElementById('search-close').addEventListener('click', () => {
    document.getElementById('search-bar').classList.add('hidden');
    searchQuery = '';
    document.getElementById('search-input').value = '';
    renderAll();
  });
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderDebts();
    renderTransactions();
  });

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', () => {
    data.theme = (data.theme === 'dark' || !data.theme) ? 'light' : 'dark';
    applyTheme();
    save();
  });

  // FAB
  const fab = document.getElementById('fab');
  const fabSheet = document.getElementById('fab-sheet');
  fab.addEventListener('click', () => fabSheet.classList.remove('hidden'));
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

  // ---------- Render ----------
  function renderAll() {
    applyTheme();
    renderDashboard();
    renderPockets();
    renderDebts();
    renderTransactions();
    renderStats();
    renderSettings();
    fillPocketSelects();
  }

  function pocketBalance(id) {
    const p = data.pockets.find(x => x.id === id);
    return p ? p.balance : 0;
  }

  function totalPockets() {
    return data.pockets.reduce((s, p) => s + (p.balance || 0), 0);
  }

  function debtRemaining(d) {
    return Math.max(0, (d.amount || 0) - (d.paidAmount || 0));
  }

  function sumOwed() {
    return data.debts.filter(d => d.type === 'owed' && debtRemaining(d) > 0).reduce((s, d) => s + debtRemaining(d), 0);
  }
  function sumOwe() {
    return data.debts.filter(d => d.type === 'owe' && debtRemaining(d) > 0).reduce((s, d) => s + debtRemaining(d), 0);
  }

  function renderDashboard() {
    const pockets = totalPockets();
    const owed = sumOwed();
    const owe = sumOwe();
    const total = pockets + owed - owe;

    document.getElementById('dash-total').textContent = money(total);
    document.getElementById('dash-pockets').textContent = money(pockets);
    document.getElementById('dash-owed').textContent = money(owed);
    document.getElementById('dash-owe').textContent = money(owe);
    document.getElementById('dash-currency-label').textContent =
      (data.currency || '€') + ' · кармашки − я должен + мне должны';

    // simple forecast: current + expected next 30d - rough average expenses
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const expectedIn = (data.expected || []).filter(e => !e.received && e.date && new Date(e.date) <= in30)
      .reduce((s, e) => s + e.amount, 0);
    const recentExp = data.transactions.filter(t => t.type === 'expense').slice(-30);
    const avgExp = recentExp.length ? recentExp.reduce((s, t) => s + t.amount, 0) / Math.max(1, recentExp.length) * 10 : 0;
    const forecast = total + expectedIn - avgExp;
    document.getElementById('dash-forecast').textContent = money(forecast);

    // pockets preview
    const grid = document.getElementById('pockets-preview');
    if (!data.pockets.length) {
      grid.innerHTML = '<div class="empty">Нет кармашков</div>';
    } else {
      grid.innerHTML = data.pockets.map(p => `
        <div class="pocket-chip" data-pocket-id="${p.id}">
          <div class="pocket-chip-name">${escapeHtml(p.name)}</div>
          <div class="pocket-chip-amount">${money(p.balance)}</div>
        </div>
      `).join('');
    }

    // upcoming
    const upcoming = [];
    data.debts.filter(d => debtRemaining(d) > 0).forEach(d => {
      upcoming.push({
        date: d.date || '',
        text: (d.type === 'owed' ? 'Вернёт: ' : 'Отдать: ') + d.person,
        amount: d.type === 'owed' ? debtRemaining(d) : -debtRemaining(d)
      });
    });
    (data.expected || []).filter(e => !e.received).forEach(e => {
      upcoming.push({ date: e.date || '', text: e.title, amount: e.amount });
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
        <div class="list-item-amount ${u.amount >= 0 ? 'positive' : 'negative'}">${money(u.amount)}</div>
      </div>
    `).join('');
  }

  function renderPockets() {
    const el = document.getElementById('list-pockets');
    if (!data.pockets.length) {
      el.innerHTML = '<div class="empty">Создай первый кармашек</div>';
      return;
    }
    el.innerHTML = data.pockets.map(p => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(p.name)}</div>
          <div class="list-item-sub">${p.type === 'cash' ? 'Наличка' : p.type === 'card' ? 'Карта' : p.type === 'savings' ? 'Накопления' : 'Другое'}</div>
          <div class="list-item-actions">
            <button data-action="edit-pocket" data-id="${p.id}">Изменить</button>
            <button data-action="adjust-pocket" data-id="${p.id}">+/−</button>
            <button data-action="del-pocket" data-id="${p.id}">Удалить</button>
          </div>
        </div>
        <div class="list-item-amount">${money(p.balance)}</div>
      </div>
    `).join('');
  }

  function renderDebts() {
    document.getElementById('debt-sum-owed').textContent = money(sumOwed());
    document.getElementById('debt-sum-owe').textContent = money(sumOwe());

    const renderList = (type, containerId) => {
      let items = data.debts.filter(d => d.type === type && debtRemaining(d) > 0);
      if (searchQuery) {
        items = items.filter(d =>
          (d.person || '').toLowerCase().includes(searchQuery) ||
          (d.reason || '').toLowerCase().includes(searchQuery)
        );
      }
      items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const el = document.getElementById(containerId);
      if (!items.length) {
        el.innerHTML = '<div class="empty">Пока пусто</div>';
        return;
      }
      el.innerHTML = items.map(d => {
        const rem = debtRemaining(d);
        const pct = d.amount ? Math.round((d.paidAmount || 0) / d.amount * 100) : 0;
        return `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(d.person)}</div>
            <div class="list-item-sub">${escapeHtml(d.reason || '')} · ${formatDate(d.date)}${(d.paidAmount || 0) > 0 ? ' · погашено ' + money(d.paidAmount) : ''}</div>
            ${(d.paidAmount || 0) > 0 ? `<div class="progress-bar"><div style="width:${pct}%"></div></div>` : ''}
            <div class="list-item-actions">
              <button data-action="partial-debt" data-id="${d.id}">Частично</button>
              <button data-action="paid-debt" data-id="${d.id}">Погашено</button>
              <button data-action="edit-debt" data-id="${d.id}">Изменить</button>
              <button data-action="del-debt" data-id="${d.id}">Удалить</button>
            </div>
          </div>
          <div class="list-item-amount ${type === 'owed' ? 'positive' : 'negative'}">${money(rem)}</div>
        </div>`;
      }).join('');
    };
    renderList('owed', 'list-owed');
    renderList('owe', 'list-owe');
  }

  function renderTransactions() {
    let items = data.transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const typeF = document.getElementById('tx-filter-type').value;
    const pocketF = document.getElementById('tx-filter-pocket').value;
    if (typeF !== 'all') items = items.filter(t => t.type === typeF);
    if (pocketF !== 'all') items = items.filter(t => t.pocketId === pocketF);
    if (searchQuery) {
      items = items.filter(t =>
        (t.description || '').toLowerCase().includes(searchQuery) ||
        (t.category || '').toLowerCase().includes(searchQuery)
      );
    }
    const el = document.getElementById('list-tx');
    if (!items.length) {
      el.innerHTML = '<div class="empty">Нет транзакций</div>';
      return;
    }
    el.innerHTML = items.slice(0, 80).map(t => {
      const pocket = data.pockets.find(p => p.id === t.pocketId);
      return `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(t.description || (t.type === 'income' ? 'Доход' : 'Расход'))}</div>
          <div class="list-item-sub">${formatDate(t.date)} · ${escapeHtml(t.category || '')}${pocket ? ' · ' + escapeHtml(pocket.name) : ''}</div>
          <div class="list-item-actions">
            <button data-action="del-tx" data-id="${t.id}">Удалить</button>
          </div>
        </div>
        <div class="list-item-amount ${t.type === 'income' ? 'positive' : 'negative'}">${money(t.type === 'income' ? t.amount : -t.amount)}</div>
      </div>`;
    }).join('');
  }

  function renderStats() {
    const expenses = data.transactions.filter(t => t.type === 'expense');
    const byCat = {};
    expenses.forEach(t => {
      const c = t.category || 'Прочее';
      byCat[c] = (byCat[c] || 0) + t.amount;
    });
    const catTotal = Object.values(byCat).reduce((s, v) => s + v, 0) || 1;
    const catEl = document.getElementById('stats-categories');
    const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    catEl.innerHTML = catEntries.length ? catEntries.map(([name, val]) => `
      <div class="stat-row">
        <span>${escapeHtml(name)}</span>
        <div class="stat-bar-wrap"><div class="stat-bar"><div style="width:${Math.round(val/catTotal*100)}%"></div></div></div>
        <span>${money(val)}</span>
      </div>
    `).join('') : '<div class="empty">Пока нет расходов</div>';

    const byPocket = {};
    data.pockets.forEach(p => { byPocket[p.name] = p.balance; });
    const pEl = document.getElementById('stats-pockets');
    const maxP = Math.max(...Object.values(byPocket), 1);
    pEl.innerHTML = data.pockets.length ? data.pockets.map(p => `
      <div class="stat-row">
        <span>${escapeHtml(p.name)}</span>
        <div class="stat-bar-wrap"><div class="stat-bar"><div style="width:${Math.round(Math.abs(p.balance)/maxP*100)}%"></div></div></div>
        <span>${money(p.balance)}</span>
      </div>
    `).join('') : '<div class="empty">Нет кармашков</div>';
  }

  function renderSettings() {
    document.getElementById('setting-currency').value = data.currency || '€';
    document.getElementById('setting-theme').value = data.theme || 'dark';

    const catEl = document.getElementById('list-categories');
    catEl.innerHTML = (data.categories || []).map(c => `
      <div class="list-item">
        <div class="list-item-main"><div class="list-item-title">${escapeHtml(c)}</div></div>
        <button data-action="del-category" data-name="${escapeAttr(c)}" style="background:none;border:none;color:var(--text-muted);font-size:0.8rem">✕</button>
      </div>
    `).join('') || '<div class="empty">Нет категорий</div>';

    const gEl = document.getElementById('list-goals');
    gEl.innerHTML = (data.goals || []).map(g => {
      const pct = g.target ? Math.min(100, Math.round((g.current || 0) / g.target * 100)) : 0;
      return `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(g.title)}</div>
          <div class="list-item-sub">${money(g.current || 0)} / ${money(g.target)}</div>
          <div class="progress-bar"><div style="width:${pct}%"></div></div>
          <div class="list-item-actions">
            <button data-action="del-goal" data-id="${g.id}">Удалить</button>
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
    sel.value = cur || 'all';
  }

  // Filters
  document.getElementById('tx-filter-type').addEventListener('change', renderTransactions);
  document.getElementById('tx-filter-pocket').addEventListener('change', renderTransactions);

  // Settings change
  document.getElementById('setting-currency').addEventListener('change', (e) => {
    data.currency = e.target.value;
    save();
  });
  document.getElementById('setting-theme').addEventListener('change', (e) => {
    data.theme = e.target.value;
    applyTheme();
    save();
  });

  // ---------- Actions ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

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
    if (action === 'paid-debt') {
      const d = data.debts.find(x => x.id === id);
      if (d) { d.paidAmount = d.amount; d.paid = true; save(); }
    }
    if (action === 'del-debt') {
      if (confirm('Удалить долг?')) {
        data.debts = data.debts.filter(x => x.id !== id);
        save();
      }
    }
    if (action === 'del-tx') {
      if (confirm('Удалить транзакцию?')) {
        data.transactions = data.transactions.filter(x => x.id !== id);
        save();
      }
    }
    if (action === 'del-category') {
      const name = btn.dataset.name;
      data.categories = data.categories.filter(c => c !== name);
      save();
    }
    if (action === 'del-goal') {
      data.goals = data.goals.filter(g => g.id !== id);
      save();
    }
  });

  document.getElementById('pockets-preview').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-pocket-id]');
    if (chip) {
      showSection('pockets');
    }
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
  function closeModal() {
    modal.classList.add('hidden');
    currentModal = null;
  }
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  function pocketOptions(selected) {
    return data.pockets.map(p =>
      `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
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
      <div class="form-group"><label>Тип</label>
        <select id="m-type">
          <option value="cash" ${existing?.type==='cash'?'selected':''}>Наличка</option>
          <option value="card" ${existing?.type==='card'?'selected':''}>Карта</option>
          <option value="savings" ${existing?.type==='savings'?'selected':''}>Накопления</option>
          <option value="other" ${existing?.type==='other'?'selected':''}>Другое</option>
        </select></div>
      <div class="form-group"><label>Начальный баланс</label>
        <input id="m-balance" type="number" step="0.01" inputmode="decimal" value="${existing?.balance ?? 0}" /></div>
    `);
  }

  function openAdjustPocketModal(id) {
    const p = data.pockets.find(x => x.id === id);
    if (!p) return;
    currentModal = { kind: 'adjust', id };
    openModal('Изменить баланс: ' + p.name, `
      <div class="form-group"><label>Сумма (+ положить / − снять)</label>
        <input id="m-delta" type="number" step="0.01" inputmode="decimal" placeholder="0" /></div>
      <div class="form-group"><label>Комментарий</label>
        <input id="m-note" placeholder="Необязательно" /></div>
    `);
  }

  function openDebtModal(existing = null, forceType = null) {
    const type = existing?.type || forceType || 'owed';
    currentModal = { kind: 'debt', id: existing?.id, type };
    openModal(existing ? 'Изменить долг' : (type === 'owed' ? 'Кто мне должен' : 'Кому я должен'), `
      <div class="form-group"><label>Человек</label>
        <input id="m-person" value="${escapeAttr(existing?.person || '')}" placeholder="Имя" /></div>
      <div class="form-group"><label>Сумма</label>
        <input id="m-amount" type="number" step="0.01" inputmode="decimal" value="${existing?.amount || ''}" /></div>
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
    openModal('Частичное погашение: ' + d.person, `
      <p class="hint" style="margin-bottom:12px">Осталось: ${money(debtRemaining(d))}</p>
      <div class="form-group"><label>Сколько погасить</label>
        <input id="m-partial" type="number" step="0.01" inputmode="decimal" placeholder="0" /></div>
    `);
  }

  function openTxModal() {
    currentModal = { kind: 'tx' };
    openModal('Доход / Расход', `
      <div class="form-group"><label>Тип</label>
        <select id="m-type"><option value="expense">Расход</option><option value="income">Доход</option></select></div>
      <div class="form-group"><label>Кармашек</label>
        <select id="m-pocket">${pocketOptions(data.pockets[0]?.id)}</select></div>
      <div class="form-group"><label>Сумма</label>
        <input id="m-amount" type="number" step="0.01" inputmode="decimal" placeholder="0" /></div>
      <div class="form-group"><label>Категория</label>
        <select id="m-cat">${categoryOptions()}</select></div>
      <div class="form-group"><label>Описание</label>
        <input id="m-desc" placeholder="На что / откуда" /></div>
      <div class="form-group"><label>Дата</label>
        <input id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
    `);
  }

  document.getElementById('modal-save').addEventListener('click', () => {
    if (!currentModal) return;
    const { kind, id, type } = currentModal;

    if (kind === 'pocket') {
      const name = document.getElementById('m-name').value.trim();
      const ptype = document.getElementById('m-type').value;
      const balance = parseFloat(document.getElementById('m-balance').value) || 0;
      if (!name) return alert('Укажи название');
      if (id) {
        const p = data.pockets.find(x => x.id === id);
        if (p) { p.name = name; p.type = ptype; p.balance = balance; }
      } else {
        data.pockets.push({ id: uid(), name, type: ptype, balance, color: '#a855f7' });
      }
    }

    if (kind === 'adjust') {
      const delta = parseFloat(document.getElementById('m-delta').value);
      if (isNaN(delta) || delta === 0) return alert('Укажи сумму');
      const note = document.getElementById('m-note').value.trim();
      const p = data.pockets.find(x => x.id === id);
      if (p) {
        p.balance = (p.balance || 0) + delta;
        data.transactions.push({
          id: uid(),
          type: delta >= 0 ? 'income' : 'expense',
          amount: Math.abs(delta),
          description: note || (delta >= 0 ? 'Пополнение' : 'Снятие'),
          category: 'Перевод',
          pocketId: id,
          date: new Date().toISOString().slice(0, 10)
        });
      }
    }

    if (kind === 'debt') {
      const person = document.getElementById('m-person').value.trim();
      const amount = parseFloat(document.getElementById('m-amount').value) || 0;
      const reason = document.getElementById('m-reason').value.trim();
      const date = document.getElementById('m-date').value;
      if (!person || amount <= 0) return alert('Укажи человека и сумму');
      if (id) {
        const d = data.debts.find(x => x.id === id);
        if (d) { d.person = person; d.amount = amount; d.reason = reason; d.date = date; }
      } else {
        data.debts.push({ id: uid(), type, person, amount, reason, date, paidAmount: 0, paid: false });
      }
    }

    if (kind === 'partial') {
      const val = parseFloat(document.getElementById('m-partial').value);
      if (isNaN(val) || val <= 0) return alert('Укажи сумму');
      const d = data.debts.find(x => x.id === id);
      if (d) {
        d.paidAmount = Math.min(d.amount, (d.paidAmount || 0) + val);
        if (d.paidAmount >= d.amount) d.paid = true;
      }
    }

    if (kind === 'tx') {
      const ttype = document.getElementById('m-type').value;
      const pocketId = document.getElementById('m-pocket').value;
      const amount = parseFloat(document.getElementById('m-amount').value) || 0;
      const category = document.getElementById('m-cat').value;
      const description = document.getElementById('m-desc').value.trim();
      const date = document.getElementById('m-date').value;
      if (amount <= 0) return alert('Укажи сумму');
      data.transactions.push({ id: uid(), type: ttype, amount, category, description, pocketId, date });
      const p = data.pockets.find(x => x.id === pocketId);
      if (p) p.balance = (p.balance || 0) + (ttype === 'income' ? amount : -amount);
    }

    if (kind === 'category') {
      const name = document.getElementById('m-name').value.trim();
      if (!name) return alert('Укажи название');
      if (!data.categories.includes(name)) data.categories.push(name);
    }

    if (kind === 'goal') {
      const title = document.getElementById('m-title').value.trim();
      const target = parseFloat(document.getElementById('m-target').value) || 0;
      if (!title || target <= 0) return alert('Укажи название и сумму');
      data.goals = data.goals || [];
      data.goals.push({ id: uid(), title, target, current: 0 });
    }

    save();
    closeModal();
  });

  // Buttons
  document.getElementById('btn-add-pocket').addEventListener('click', () => openPocketModal());
  document.getElementById('btn-add-pocket-dash').addEventListener('click', () => openPocketModal());
  document.getElementById('btn-add-owed').addEventListener('click', () => openDebtModal(null, 'owed'));
  document.getElementById('btn-add-owe').addEventListener('click', () => openDebtModal(null, 'owe'));
  document.getElementById('btn-add-tx').addEventListener('click', openTxModal);

  document.getElementById('btn-add-category').addEventListener('click', () => {
    currentModal = { kind: 'category' };
    openModal('Новая категория', `
      <div class="form-group"><label>Название</label>
        <input id="m-name" placeholder="Например: Подписки" /></div>
    `);
  });

  document.getElementById('btn-add-goal').addEventListener('click', () => {
    currentModal = { kind: 'goal' };
    openModal('Новая цель', `
      <div class="form-group"><label>Название</label>
        <input id="m-title" placeholder="Отпуск, ноутбук..." /></div>
      <div class="form-group"><label>Сумма цели</label>
        <input id="m-target" type="number" step="0.01" inputmode="decimal" /></div>
    `);
  });

  // Import / Export
  document.getElementById('csv-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim());
        let n = 0;
        const defaultPocket = data.pockets[0]?.id;
        lines.forEach((line, idx) => {
          if (idx === 0 && /дата|date|описание|amount/i.test(line)) return;
          const parts = line.split(/[;,]/).map(p => p.trim().replace(/^"|"$/g, ''));
          if (parts.length < 3) return;
          let date = parts[0], desc = parts[1];
          let amount = parseFloat(parts[2].replace(',', '.').replace(/\s/g, ''));
          if (isNaN(amount)) return;
          if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(date)) {
            const [d, m, y] = date.split(/[./]/);
            date = `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          data.transactions.push({
            id: uid(), type: amount >= 0 ? 'income' : 'expense',
            amount: Math.abs(amount), description: desc || 'Импорт',
            category: 'Импорт', pocketId: defaultPocket, date
          });
          if (defaultPocket) {
            const p = data.pockets.find(x => x.id === defaultPocket);
            if (p) p.balance = (p.balance || 0) + amount;
          }
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
    a.download = `wallet-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Удалить ВСЕ данные?')) {
      data = defaultData();
      save();
    }
  });

  applyTheme();
  renderAll();
})();
