/**
 * واجهة الكابتن — طاولات ثم منيو، كمية (+/−)، ملاحظات، إزالة، تأكيد الطلب
 */
(function () {
  const captainView = document.getElementById('captainView');
  const tablesGrid = document.getElementById('tablesGrid');
  const menuTitle = document.getElementById('menuTitle');
  const btnBackToTables = document.getElementById('btnBackToTables');
  const menuList = document.getElementById('menuList');
  const emptyMenu = document.getElementById('emptyMenu');
  const orderBar = document.getElementById('orderBar');
  const orderSummary = document.getElementById('orderSummary');
  const currentOrderPanel = document.getElementById('currentOrderPanel');
  const currentItems = document.getElementById('currentItems');
  const btnConfirmOrder = document.getElementById('btnConfirmOrder');

  let tables = [];
  let menu = [];
  let selectedTableId = null;
  /** الطلب الحالي: [{ menuId, name, quantity, note }] */
  let currentOrder = [];

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : s;
    return div.innerHTML;
  }

  function renderTables() {
    tablesGrid.innerHTML = tables
      .map(
        (t) => `
        <div class="table-card" data-table="${escapeHtml(t.id)}" role="button" tabindex="0">
          <span class="num">${escapeHtml(t.label || t.id)}</span>
        </div>
      `
      )
      .join('');

    tablesGrid.querySelectorAll('.table-card').forEach((el) => {
      el.addEventListener('click', () => selectTable(el.dataset.table));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTable(el.dataset.table);
        }
      });
    });
  }

  function selectTable(tableId) {
    selectedTableId = tableId;
    captainView.classList.add('view-menu-active');
    tablesGrid.querySelectorAll('.table-card').forEach((el) => {
      el.classList.toggle('selected', el.dataset.table === tableId);
    });
    menuTitle.textContent = `المنيو — طاولة ${tableId}`;
    renderMenu();
    updateOrderUI();
  }

  function goBackToTables() {
    selectedTableId = null;
    currentOrder = [];
    captainView.classList.remove('view-menu-active');
    tablesGrid.querySelectorAll('.table-card').forEach((el) => el.classList.remove('selected'));
    updateOrderUI();
  }

  function renderMenu() {
    if (!selectedTableId) return;
    if (!menu.length) {
      menuList.innerHTML = '';
      emptyMenu.style.display = 'block';
      return;
    }
    emptyMenu.style.display = 'none';
    menuList.innerHTML = menu
      .map(
        (item) => `
        <div class="captain-menu-item" data-menu-id="${escapeHtml(item.id)}" role="button" tabindex="0">
          <span class="name">${escapeHtml(item.name)}</span>
        </div>
      `
      )
      .join('');

    menuList.querySelectorAll('.captain-menu-item').forEach((el) => {
      el.addEventListener('click', () => addToOrder(el.dataset.menuId));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          addToOrder(el.dataset.menuId);
        }
      });
    });
  }

  function addToOrder(menuId) {
    const item = menu.find((m) => m.id === menuId);
    if (!item) return;
    const existing = currentOrder.find((x) => x.menuId === menuId && (x.note || '') === '');
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      currentOrder.push({
        menuId: item.id,
        name: item.name,
        quantity: 1,
        note: '',
      });
    }
    updateOrderUI();
  }

  function setQuantity(index, delta) {
    const row = currentOrder[index];
    if (!row) return;
    const next = (row.quantity || 1) + delta;
    if (next < 1) {
      currentOrder.splice(index, 1);
    } else {
      row.quantity = next;
    }
    updateOrderUI();
  }

  function removeFromOrder(index) {
    currentOrder.splice(index, 1);
    updateOrderUI();
  }

  function renderOrderItem(row, idx) {
    const qty = row.quantity || 1;
    return `
      <li data-index="${idx}">
        <div class="row-main">
          <div class="qty-controls">
            <button type="button" class="btn-qty-minus" data-index="${idx}" aria-label="تقليل">−</button>
            <span class="qty-num">${qty}</span>
            <button type="button" class="btn-qty-plus" data-index="${idx}" aria-label="زيادة">+</button>
          </div>
          <span class="item-name">${escapeHtml(row.name)}</span>
          <button type="button" class="btn btn-danger btn-sm btn-remove" data-index="${idx}">إزالة</button>
        </div>
        <input type="text" class="note-input" placeholder="ملاحظة (سكر قليل، بدون ثلج...)" data-index="${idx}" value="${escapeHtml(row.note || '')}">
      </li>
    `;
  }

  function updateOrderUI() {
    const count = currentOrder.reduce((s, i) => s + (i.quantity || 1), 0);
    if (count === 0) {
      orderBar.style.display = 'none';
      currentOrderPanel.style.display = 'none';
      document.body.classList.remove('has-order-bar');
    } else {
      document.body.classList.add('has-order-bar');
      orderBar.style.display = 'flex';
      currentOrderPanel.style.display = 'block';
      orderSummary.textContent = count === 1 ? '1 عنصر' : count + ' عناصر';
    }

    currentItems.innerHTML = currentOrder.map((row, idx) => renderOrderItem(row, idx)).join('');

    currentItems.querySelectorAll('.note-input').forEach((input) => {
      const idx = parseInt(input.dataset.index, 10);
      const sync = () => {
        const row = currentOrder[idx];
        if (row) row.note = input.value.trim();
      };
      input.addEventListener('change', sync);
      input.addEventListener('input', sync);
    });
    currentItems.querySelectorAll('.btn-qty-minus').forEach((btn) => {
      btn.addEventListener('click', () => setQuantity(parseInt(btn.dataset.index, 10), -1));
    });
    currentItems.querySelectorAll('.btn-qty-plus').forEach((btn) => {
      btn.addEventListener('click', () => setQuantity(parseInt(btn.dataset.index, 10), 1));
    });
    currentItems.querySelectorAll('.btn-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeFromOrder(parseInt(btn.dataset.index, 10)));
    });
  }

  btnConfirmOrder.addEventListener('click', async () => {
    if (!selectedTableId) {
      alert('اختر طاولة أولاً');
      return;
    }
    if (!currentOrder.length) {
      alert('أضف عناصر للطلب');
      return;
    }
    const items = currentOrder.map((row) => ({
      menuId: row.menuId,
      quantity: row.quantity || 1,
      note: row.note || '',
    }));
    try {
      await api.orders.create(selectedTableId, items);
      currentOrder = [];
      updateOrderUI();
      alert('تم إرسال الطلب إلى الكاشير بنجاح.');
    } catch (err) {
      alert(err.json?.error || err.message || 'فشل إرسال الطلب');
    }
  });

  if (btnBackToTables) btnBackToTables.addEventListener('click', goBackToTables);

  async function init() {
    try {
      [tables, menu] = await Promise.all([api.orders.tables(), api.menu.list()]);
      renderTables();
    } catch (err) {
      tablesGrid.innerHTML = '<p class="alert alert-error">فشل التحميل. تأكد من تشغيل الخادم.</p>';
      menuList.innerHTML = '';
      emptyMenu.textContent = 'فشل تحميل المنيو.';
      emptyMenu.style.display = 'block';
    }
  }

  init();
})();
