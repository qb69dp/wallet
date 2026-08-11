(() => {
  const STORAGE_KEY = 'my-wallet-v1';

  const defaultData = {
    cash: 0,
    cashHistory: [],
    debts: [],      // {id, type: 'owed'|'owe', person, amount, reason, date, paid}
    expected: [],   // {id, title, amount, date, received}
    transactions: [] // {id, type: 'income'|'expense', amount, description, date, category}
  };

  let data = load();
  let currentModal = null; // {mode, type, id?}

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultData);
      return { ...structuredClone(defaultData), ...JSON.parse(raw) };
    } catch {
      return structuredClone(defaultData);
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    renderAll();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatMoney(n) {
    const sign = n < 0 ? '−' : '';
    return sign + Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  }

  function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ---------- Navigation ----------
  function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const sec = document.getElementById(id);
    if (sec) sec.classList.add('active');
    const btn = document.querySelector(`.nav-btn[data-section="${id}"]`);
    if (btn) btn.classList.add('active');
    if (id === 'settings') document.getElementById('settings').classList.add('active');
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.goto));
  });

  document.getElementById('btn-settings').addEventListener('click', () => showSection('settings'));

  // Debts tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('debts-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ---------- Render ----------
  function renderAll() {
    renderDashboard();
    renderDebts();
    renderCash();
    renderExpected();
    renderTransactions();
  }

  function renderDashboard() {
    const cash = data.cash || 0;
    const owed = data.debts.filter(d => d.type === 'owed' && !d.paid).reduce((s, d) => s + d.amount, 0);
    const owe = data.debts.filter(d => d.type === 'owe' && !d.paid).reduce((s, d) => s + d.amount, 0);
    const expected = data.expected.filter(e => !e.received).reduce((s, e) => s + e.amount, 0);
    const net = cash + owed - owe;

    document.getElementById('dash-cash').textContent = formatMoney(cash);
    document.getElementById('dash-owed').textContent = formatMoney(owed);
    document.getElementById('dash-owe').textContent = formatMoney(owe);
    document.getElementById('dash-expected').textContent = formatMoney(expected);
    document.getElementById('dash-net').textContent = formatMoney(net);

    // Upcoming
    const upcoming = [];
    data.expected.filter(e => !e.received).forEach(e => {
      upcoming.push({ date: e.date, text: e.title, amount: e.amount, type: 'expected' });
    });
    data.debts.filter(d => !d.paid).forEach(d => {
      upcoming.push({
        date: d.date,
        text: (d.type === 'owed' ? 'Вернёт: ' : 'Отдать: ') + d.person,
        amount: d.type === 'owed' ? d.amount : -d.amount,
        type: 'debt'
      });
    });
    upcoming.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const list = document.getElementById('upcoming-list');
    if (upcoming.length === 0) {
      list.innerHTML = '<div class="empty">Нет ближайших событий</div>';
    } else {
      list.innerHTML = upcoming.slice(0, 8).map(u => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(u.text)}</div>
            <div class="list-item-sub">${formatDate(u.date)}</div>
          </div>
          <div class="list-item-amount ${u.amount >= 0 ? 'positive' : 'negative'}">${formatMoney(u.amount)}</div>
        </div>
      `).join('');
    }
  }

  function renderDebts() {
    const renderList = (type, containerId) => {
      const items = data.debts.filter(d => d.type === type && !d.paid).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const el = document.getElementById(containerId);
      if (items.length === 0) {
        el.innerHTML = '<div class="empty">Пока пусто</div>';
        return;
      }
      el.innerHTML = items.map(d => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(d.person)}</div>
            <div class="list-item-sub">${escapeHtml(d.reason || '')} · ${formatDate(d.date)}</div>
            <div class="list-item-actions">
              <button data-action="edit-debt" data-id="${d.id}">Изменить</button>
              <button data-action="paid-debt" data-id="${d.id}">Погашено</button>
              <button data-action="del-debt" data-id="${d.id}">Удалить</button>
            </div>
          </div>
          <div class="list-item-amount ${type === 'owed' ? 'positive' : 'negative'}">${formatMoney(d.amount)}</div>
        </div>
      `).join('');
    };
    renderList('owed', 'list-owed');
    renderList('owe', 'list-owe');
  }

  function renderCash() {
    document.getElementById('cash-amount').textContent = formatMoney(data.cash || 0);
    const hist = (data.cashHistory || []).slice().reverse().slice(0, 20);
    const el = document.getElementById('cash-history');
    if (hist.length === 0) {
      el.innerHTML = '<div class="empty">История пуста</div>';
      return;
    }
    el.innerHTML = hist.map(h => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(h.note || 'Изменение')}</div>
          <div class="list-item-sub">${formatDate(h.date)}</div>
        </div>
        <div class="list-item-amount ${h.delta >= 0 ? 'positive' : 'negative'}">${formatMoney(h.delta)}</div>
      </div>
    `).join('');
  }

  function renderExpected() {
    const items = data.expected.filter(e => !e.received).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const el = document.getElementById('list-expected');
    if (items.length === 0) {
      el.innerHTML = '<div class="empty">Нет ожидаемых поступлений</div>';
      return;
    }
    el.innerHTML = items.map(e => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(e.title)}</div>
          <div class="list-item-sub">${formatDate(e.date)}</div>
          <div class="list-item-actions">
            <button data-action="edit-expected" data-id="${e.id}">Изменить</button>
            <button data-action="received-expected" data-id="${e.id}">Получено</button>
            <button data-action="del-expected" data-id="${e.id}">Удалить</button>
          </div>
        </div>
        <div class="list-item-amount positive">${formatMoney(e.amount)}</div>
      </div>
    `).join('');
  }

  function renderTransactions() {
    const filter = document.getElementById('tx-filter').value;
    let items = data.transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (filter !== 'all') items = items.filter(t => t.type === filter);
    const el = document.getElementById('list-tx');
    if (items.length === 0) {
      el.innerHTML = '<div class="empty">Нет транзакций</div>';
      return;
    }
    el.innerHTML = items.slice(0, 50).map(t => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${escapeHtml(t.description || (t.type === 'income' ? 'Доход' : 'Расход'))}</div>
          <div class="list-item-sub">${formatDate(t.date)} · ${t.category || ''}</div>
          <div class="list-item-actions">
            <button data-action="del-tx" data-id="${t.id}">Удалить</button>
          </div>
        </div>
        <div class="list-item-amount ${t.type === 'income' ? 'positive' : 'negative'}">${formatMoney(t.type === 'income' ? t.amount : -t.amount)}</div>
      </div>
    `).join('');
  }

  document.getElementById('tx-filter').addEventListener('change', renderTransactions);

  // ---------- Actions (delegation) ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'edit-debt') openDebtModal(data.debts.find(d => d.id === id));
    if (action === 'paid-debt') {
      const d = data.debts.find(x => x.id === id);
      if (d) { d.paid = true; save(); }
    }
    if (action === 'del-debt') {
      if (confirm('Удалить этот долг?')) {
        data.debts = data.debts.filter(x => x.id !== id);
        save();
      }
    }
    if (action === 'edit-expected') openExpectedModal(data.expected.find(e => e.id === id));
    if (action === 'received-expected') {
      const e = data.expected.find(x => x.id === id);
      if (e) {
        e.received = true;
        // Optionally add to cash or transactions
        data.transactions.push({
          id: uid(),
          type: 'income',
          amount: e.amount,
          description: e.title + ' (получено)',
          date: new Date().toISOString().slice(0, 10),
          category: 'Поступление'
        });
        save();
      }
    }
    if (action === 'del-expected') {
      if (confirm('Удалить?')) {
        data.expected = data.expected.filter(x => x.id !== id);
        save();
      }
    }
    if (action === 'del-tx') {
      if (confirm('Удалить транзакцию?')) {
        data.transactions = data.transactions.filter(x => x.id !== id);
        save();
      }
    }
  });

  // ---------- Modal ----------
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

  function openDebtModal(existing = null) {
    const isEdit = !!existing;
    const type = existing ? existing.type : (document.querySelector('.tab.active')?.dataset.tab || 'owed');
    currentModal = { mode: isEdit ? 'edit' : 'add', kind: 'debt', id: existing?.id, type };
    openModal(isEdit ? 'Изменить долг' : (type === 'owed' ? 'Кто мне должен' : 'Кому я должен'), `
      <div class="form-group">
        <label>Человек</label>
        <input id="m-person" value="${escapeAttr(existing?.person || '')}" placeholder="Имя" />
      </div>
      <div class="form-group">
        <label>Сумма (€)</label>
        <input id="m-amount" type="number" step="0.01" inputmode="decimal" value="${existing?.amount || ''}" placeholder="0" />
      </div>
      <div class="form-group">
        <label>За что</label>
        <input id="m-reason" value="${escapeAttr(existing?.reason || '')}" placeholder="Причина" />
      </div>
      <div class="form-group">
        <label>Дата</label>
        <input id="m-date" type="date" value="${existing?.date || new Date().toISOString().slice(0,10)}" />
      </div>
    `);
  }

  function openExpectedModal(existing = null) {
    currentModal = { mode: existing ? 'edit' : 'add', kind: 'expected', id: existing?.id };
    openModal(existing ? 'Изменить поступление' : 'Ожидаемое поступление', `
      <div class="form-group">
        <label>Название</label>
        <input id="m-title" value="${escapeAttr(existing?.title || '')}" placeholder="Зарплата, возврат и т.д." />
      </div>
      <div class="form-group">
        <label>Сумма (€)</label>
        <input id="m-amount" type="number" step="0.01" inputmode="decimal" value="${existing?.amount || ''}" placeholder="0" />
      </div>
      <div class="form-group">
        <label>Ожидаемая дата</label>
        <input id="m-date" type="date" value="${existing?.date || new Date().toISOString().slice(0,10)}" />
      </div>
    `);
  }

  function openTxModal() {
    currentModal = { mode: 'add', kind: 'tx' };
    openModal('Новая транзакция', `
      <div class="form-group">
        <label>Тип</label>
        <select id="m-type">
          <option value="expense">Расход</option>
          <option value="income">Доход</option>
        </select>
      </div>
      <div class="form-group">
        <label>Сумма (€)</label>
        <input id="m-amount" type="number" step="0.01" inputmode="decimal" placeholder="0" />
      </div>
      <div class="form-group">
        <label>Описание</label>
        <input id="m-desc" placeholder="На что" />
      </div>
      <div class="form-group">
        <label>Категория (необязательно)</label>
        <input id="m-cat" placeholder="Еда, транспорт..." />
      </div>
      <div class="form-group">
        <label>Дата</label>
        <input id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}" />
      </div>
    `);
  }

  document.getElementById('modal-save').addEventListener('click', () => {
    if (!currentModal) return;
    const { kind, mode, id, type } = currentModal;

    if (kind === 'debt') {
      const person = document.getElementById('m-person').value.trim();
      const amount = parseFloat(document.getElementById('m-amount').value) || 0;
      const reason = document.getElementById('m-reason').value.trim();
      const date = document.getElementById('m-date').value;
      if (!person || amount <= 0) return alert('Укажи человека и сумму');
      if (mode === 'edit') {
        const d = data.debts.find(x => x.id === id);
        if (d) { d.person = person; d.amount = amount; d.reason = reason; d.date = date; }
      } else {
        data.debts.push({ id: uid(), type, person, amount, reason, date, paid: false });
      }
    }

    if (kind === 'expected') {
      const title = document.getElementById('m-title').value.trim();
      const amount = parseFloat(document.getElementById('m-amount').value) || 0;
      const date = document.getElementById('m-date').value;
      if (!title || amount <= 0) return alert('Укажи название и сумму');
      if (mode === 'edit') {
        const e = data.expected.find(x => x.id === id);
        if (e) { e.title = title; e.amount = amount; e.date = date; }
      } else {
        data.expected.push({ id: uid(), title, amount, date, received: false });
      }
    }

    if (kind === 'tx') {
      const ttype = document.getElementById('m-type').value;
      const amount = parseFloat(document.getElementById('m-amount').value) || 0;
      const description = document.getElementById('m-desc').value.trim();
      const category = document.getElementById('m-cat').value.trim();
      const date = document.getElementById('m-date').value;
      if (amount <= 0) return alert('Укажи сумму');
      data.transactions.push({
        id: uid(),
        type: ttype,
        amount,
        description,
        category,
        date
      });
    }

    save();
    closeModal();
  });

  // Buttons
  document.getElementById('btn-add-owed').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="owed"]').click();
    openDebtModal(null);
    currentModal.type = 'owed';
  });
  document.getElementById('btn-add-owe').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="owe"]').click();
    openDebtModal(null);
    currentModal.type = 'owe';
  });
  document.getElementById('btn-add-expected').addEventListener('click', () => openExpectedModal());
  document.getElementById('btn-add-tx').addEventListener('click', openTxModal);

  // Cash + / -
  let cashMode = null; // 'plus' | 'minus'

  function openCashModal(mode) {
    cashMode = mode;
    document.getElementById('cash-modal-title').textContent = mode === 'plus' ? 'Положить наличку' : 'Снять наличку';
    document.getElementById('cash-modal-amount').value = '';
    document.getElementById('cash-modal-note').value = '';
    document.getElementById('cash-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('cash-modal-amount').focus(), 100);
  }

  document.getElementById('btn-cash-plus').addEventListener('click', () => openCashModal('plus'));
  document.getElementById('btn-cash-minus').addEventListener('click', () => openCashModal('minus'));
  document.getElementById('cash-modal-close').addEventListener('click', () => {
    document.getElementById('cash-modal').classList.add('hidden');
  });
  document.getElementById('cash-modal-cancel').addEventListener('click', () => {
    document.getElementById('cash-modal').classList.add('hidden');
  });
  document.getElementById('cash-modal-save').addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('cash-modal-amount').value);
    if (isNaN(amount) || amount <= 0) return alert('Укажи сумму');
    const note = document.getElementById('cash-modal-note').value.trim() || (cashMode === 'plus' ? 'Пополнение' : 'Снятие');
    const delta = cashMode === 'plus' ? amount : -amount;
    data.cash = (data.cash || 0) + delta;
    data.cashHistory = data.cashHistory || [];
    data.cashHistory.push({ date: new Date().toISOString().slice(0,10), delta, note });
    document.getElementById('cash-modal').classList.add('hidden');
    save();
  });

  document.getElementById('btn-cash-set').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('cash-set').value);
    if (isNaN(val)) return;
    const old = data.cash || 0;
    const delta = val - old;
    data.cash = val;
    data.cashHistory = data.cashHistory || [];
    data.cashHistory.push({ date: new Date().toISOString().slice(0,10), delta, note: 'Установка значения' });
    document.getElementById('cash-set').value = '';
    save();
  });

  // Import / Export
  document.getElementById('csv-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        let imported = 0;
        lines.forEach((line, idx) => {
          // skip header-ish
          if (idx === 0 && /дата|date|описание|amount/i.test(line)) return;
          const parts = line.split(/[;,]/).map(p => p.trim().replace(/^"|"$/g, ''));
          if (parts.length < 3) return;
          let date = parts[0];
          let desc = parts[1];
          let amount = parseFloat(parts[2].replace(',', '.').replace(/\s/g, ''));
          if (isNaN(amount)) return;
          // try normalize date
          if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(date)) {
            const [d, m, y] = date.split(/[./]/);
            date = `${y.length === 2 ? '20'+y : y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
          }
          data.transactions.push({
            id: uid(),
            type: amount >= 0 ? 'income' : 'expense',
            amount: Math.abs(amount),
            description: desc || 'Импорт',
            category: 'Импорт CSV',
            date
          });
          imported++;
        });
        save();
        alert(`Импортировано: ${imported} транзакций`);
      } catch (err) {
        alert('Ошибка чтения файла');
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Точно удалить ВСЕ данные? Это нельзя отменить.')) {
      data = structuredClone(defaultData);
      save();
    }
  });

  // Helpers
  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  // Init
  renderAll();
})();
