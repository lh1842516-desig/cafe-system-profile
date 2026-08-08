'use strict';

/**
 * superadmin.js
 * Platform Super Admin Dashboard controller logic.
 */

(function() {
  // Check if SaasAuth exists
  if (typeof SaasAuth === 'undefined') {
    console.error('[superadmin] SaasAuth helper is not loaded.');
    return;
  }

  // State
  let cafes = [];
  let users = [];
  let auditLogs = [
    { text: 'تم بدء جلسة مراقبة المنصة بنجاح', time: new Date().toISOString() }
  ];

  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabTitle = document.getElementById('tabTitle');
  const tabSubtitle = document.getElementById('tabSubtitle');
  const headerActionBtn = document.getElementById('headerActionBtn');
  const headerActionLabel = document.getElementById('headerActionLabel');

  // KPI elements
  const kpiTotalCafes = document.getElementById('kpiTotalCafes');
  const kpiTotalUsers = document.getElementById('kpiTotalUsers');
  const kpiActiveSubs = document.getElementById('kpiActiveSubs');
  const auditLogList = document.getElementById('auditLogList');

  // Role summary elements
  const roleCountAdmin = document.getElementById('roleCountAdmin');
  const roleCountCashier = document.getElementById('roleCountCashier');
  const roleCountKitchen = document.getElementById('roleCountKitchen');
  const roleBarAdmin = document.getElementById('roleBarAdmin');
  const roleBarCashier = document.getElementById('roleBarCashier');
  const roleBarKitchen = document.getElementById('roleBarKitchen');

  // Sidebar profile
  const avatarLetter = document.getElementById('avatarLetter');
  const userNameLabel = document.getElementById('userNameLabel');
  const logoutBtn = document.getElementById('logoutBtn');

  // Tables
  const cafesTableBody = document.getElementById('cafesTableBody');
  const usersTableBody = document.getElementById('usersTableBody');
  const userCafeSelect = document.getElementById('userCafeSelect');

  // Modals
  const cafeModal = document.getElementById('cafeModal');
  const userModal = document.getElementById('userModal');
  const resetPasswordModal = document.getElementById('resetPasswordModal');

  // Forms
  const cafeForm = document.getElementById('cafeForm');
  const userForm = document.getElementById('userForm');
  const resetPasswordForm = document.getElementById('resetPasswordForm');

  // Close buttons
  const closeCafeModalBtn = document.getElementById('closeCafeModalBtn');
  const closeUserModalBtn = document.getElementById('closeUserModalBtn');
  const closeResetPasswordModalBtn = document.getElementById('closeResetPasswordModalBtn');
  const cancelCafeBtn = document.getElementById('cancelCafeBtn');
  const cancelUserBtn = document.getElementById('cancelUserBtn');
  const cancelResetPasswordBtn = document.getElementById('cancelResetPasswordBtn');

  // Search
  const cafeSearchInput = document.getElementById('cafeSearchInput');
  const userSearchInput = document.getElementById('userSearchInput');

  // Set logged-in user profile info
  const currentUser = SaasAuth.getUser();
  if (currentUser) {
    userNameLabel.textContent = currentUser.fullName || 'مسؤول المنصة';
    avatarLetter.textContent = String(currentUser.fullName || 'M').charAt(0).toUpperCase();
  }

  async function handleLogout() {
    if (window.SaasAuth && typeof SaasAuth.confirmLogout === 'function') {
      const loggedOut = await SaasAuth.confirmLogout('هل أنت تأكد من الخروج من الصفحة؟', {
        title: 'تأكيد الخروج',
        okText: 'نعم',
        cancelText: 'لا'
      });
      if (loggedOut) {
        addAuditLog('تم تسجيل الخروج من حساب مسؤول المنصة');
      }
    } else {
      if (confirm('هل أنت تأكد من الخروج من الصفحة؟')) {
        addAuditLog('تم تسجيل الخروج من حساب مسؤول المنصة');
        setTimeout(() => SaasAuth.logout(), 200);
      }
    }
  }

  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', handleLogout);

  // Tab Navigation Switching
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTabId = item.getAttribute('data-tab');
      if (!targetTabId) return;

      // Update sidebar nav items active state
      navItems.forEach(nav => {
        if (nav.getAttribute('data-tab')) nav.classList.remove('active');
      });
      item.classList.add('active');

      // Update visible tab content
      tabContents.forEach(content => content.classList.remove('active'));
      const targetContent = document.getElementById(targetTabId);
      if (targetContent) targetContent.classList.add('active');

      // Update headers
      updateTabHeader(targetTabId);
    });
  });

  function updateTabHeader(tabId) {
    if (tabId === 'overviewTab') {
      tabTitle.textContent = 'لوحة التحكم العامة';
      tabSubtitle.textContent = 'مراقبة وتجهيز الكافيهات المشتركة في المنصة';
      headerActionBtn.style.display = 'none';
    } else if (tabId === 'cafesTab') {
      tabTitle.textContent = 'إدارة الكافيهات';
      tabSubtitle.textContent = 'إنشاء الكافيهات الجديدة وإلغاء تنشيط الاشتراكات';
      headerActionLabel.textContent = 'إضافة كافيه';
      headerActionBtn.style.display = 'flex';
      headerActionBtn.onclick = () => openCafeModal();
    } else if (tabId === 'usersTab') {
      tabTitle.textContent = 'إدارة المستخدمين';
      tabSubtitle.textContent = 'إدارة حسابات الملاك، الكاشيرات، المطبخ، والكابتن';
      headerActionLabel.textContent = 'إضافة مستخدم';
      headerActionBtn.style.display = 'flex';
      headerActionBtn.onclick = () => openUserModal();
    } else if (tabId === 'monitoringTab') {
      tabTitle.textContent = 'مراقبة المنصة';
      tabSubtitle.textContent = 'مراقبة حالة قاعدة البيانات والتوافق السحابي';
      headerActionBtn.style.display = 'none';
    }
  }

  // Fetch helpers
  async function fetchWithAuth(url, options = {}) {
    const token = SaasAuth.getToken();
    const headers = Object.assign({}, options.headers || {}, {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
    
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (res.status === 401 || res.status === 403) {
      alert('جلسة العمل منتهية أو غير مصرح لك بالوصول.');
      SaasAuth.logout();
      throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'حدث خطأ أثناء تنفيذ العملية.');
    }
    return data;
  }

  // Load Data
  async function loadData() {
    try {
      cafes = await fetchWithAuth('/api/superadmin/cafes');
      users = await fetchWithAuth('/api/superadmin/users');
      
      updateOverviewMetrics();
      renderCafesTable();
      renderUsersTable();
      populateCafeSelect();
      renderAuditLogs();
    } catch (err) {
      console.error('[superadmin] Error loading data:', err);
    }
  }

  function addAuditLog(text) {
    auditLogs.unshift({ text, time: new Date().toISOString() });
    if (auditLogs.length > 50) auditLogs.pop();
    renderAuditLogs();
  }

  function renderAuditLogs() {
    if (!auditLogList) return;
    auditLogList.innerHTML = '';
    auditLogs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'log-item';
      
      const meta = document.createElement('div');
      meta.className = 'log-meta';
      
      const txt = document.createElement('span');
      txt.className = 'log-text';
      txt.textContent = log.text;
      
      const time = document.createElement('span');
      time.className = 'log-time';
      time.textContent = new Date(log.time).toLocaleTimeString('ar-EG') + ' - ' + new Date(log.time).toLocaleDateString('ar-EG');
      
      meta.appendChild(txt);
      meta.appendChild(time);
      item.appendChild(meta);
      auditLogList.appendChild(item);
    });
  }

  function updateOverviewMetrics() {
    kpiTotalCafes.textContent = cafes.length;
    kpiTotalUsers.textContent = users.length;
    
    const activeSubs = cafes.filter(c => c.subscriptionStatus === 'active' || c.subscriptionStatus === 'trial').length;
    kpiActiveSubs.textContent = activeSubs;

    // Role distribution metrics
    const adminsCount = users.filter(u => u.role === 'OWNER' || u.role === 'ADMIN').length;
    const cashiersCount = users.filter(u => u.role === 'CASHIER').length;
    const kitchenCount = users.filter(u => u.role === 'KITCHEN').length;
    const totalStaff = users.length || 1;

    roleCountAdmin.textContent = adminsCount;
    roleCountCashier.textContent = cashiersCount;
    roleCountKitchen.textContent = kitchenCount;

    roleBarAdmin.style.width = `${(adminsCount / totalStaff) * 100}%`;
    roleBarCashier.style.width = `${(cashiersCount / totalStaff) * 100}%`;
    roleBarKitchen.style.width = `${(kitchenCount / totalStaff) * 100}%`;
  }

  // --- CAFES TAB CONTROL ---
  function renderCafesTable() {
    cafesTableBody.innerHTML = '';
    const query = cafeSearchInput.value.toLowerCase().trim();
    
    const filtered = cafes.filter(c => {
      return c.name.toLowerCase().includes(query) || 
             c.address.toLowerCase().includes(query) || 
             c.phone.includes(query) ||
             c.slug.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
      cafesTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">لا توجد نتائج مطابقة للبحث</td></tr>`;
      return;
    }

    filtered.forEach(c => {
      const tr = document.createElement('tr');
      
      let badgeClass = 'badge-success';
      let statusText = 'نشط (Active)';
      if (c.subscriptionStatus === 'suspended') {
        badgeClass = 'badge-danger';
        statusText = 'معطل (Suspended)';
      } else if (c.subscriptionStatus === 'trial') {
        badgeClass = 'badge-warning';
        statusText = 'تجريبي (Trial)';
      }

      tr.innerHTML = `
        <td style="font-weight:700;">${c.name}</td>
        <td style="font-family:'Outfit';">${c.slug}</td>
        <td>${c.address || '—'}</td>
        <td style="font-family:'Outfit';">${c.phone || '—'}</td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
        <td style="font-family:'Outfit';">${c.createdAt ? new Date(c.createdAt).toLocaleDateString('ar-EG') : '—'}</td>
        <td>
          <button class="btn btn-edit-cafe" style="padding:6px 12px; display:inline-block; font-size:12px; margin-left:6px;">تعديل</button>
          <button class="btn btn-delete-cafe" style="padding:6px 12px; display:inline-block; font-size:12px; color:var(--danger); border-color:rgba(239, 68, 68, 0.2);">حذف</button>
        </td>
      `;

      tr.querySelector('.btn-edit-cafe').onclick = () => openCafeModal(c);
      tr.querySelector('.btn-delete-cafe').onclick = () => handleDeleteCafe(c);

      cafesTableBody.appendChild(tr);
    });
  }

  cafeSearchInput.addEventListener('input', renderCafesTable);

  function openCafeModal(cafe = null) {
    if (cafe) {
      document.getElementById('cafeModalTitle').textContent = 'تعديل بيانات الكافيه';
      document.getElementById('cafeIdInput').value = cafe.id;
      document.getElementById('cafeNameInput').value = cafe.name;
      document.getElementById('cafeSlugInput').value = cafe.slug;
      document.getElementById('cafeAddressInput').value = cafe.address;
      document.getElementById('cafePhoneInput').value = cafe.phone;
      document.getElementById('cafeSubStatusSelect').value = cafe.subscriptionStatus;
    } else {
      document.getElementById('cafeModalTitle').textContent = 'إضافة كافيه جديد';
      cafeForm.reset();
      document.getElementById('cafeIdInput').value = '';
    }
    cafeModal.classList.add('active');
  }

  function closeCafeModal() {
    cafeModal.classList.remove('active');
  }

  closeCafeModalBtn.onclick = closeCafeModal;
  cancelCafeBtn.onclick = closeCafeModal;

  cafeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cafeIdInput').value;
    const name = document.getElementById('cafeNameInput').value.trim();
    const slug = document.getElementById('cafeSlugInput').value.trim();
    const address = document.getElementById('cafeAddressInput').value.trim();
    const phone = document.getElementById('cafePhoneInput').value.trim();
    const subscriptionStatus = document.getElementById('cafeSubStatusSelect').value;

    const payload = { name, slug, address, phone, subscriptionStatus };

    try {
      if (id) {
        // Edit
        await fetchWithAuth(`/api/superadmin/cafes/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        addAuditLog(`تم تحديث بيانات الكافيه: "${name}"`);
      } else {
        // Create
        await fetchWithAuth('/api/superadmin/cafes', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        addAuditLog(`تم إنشاء كافيه جديد باسم: "${name}"`);
      }
      closeCafeModal();
      loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  async function handleDeleteCafe(cafe) {
    if (!confirm(`هل أنت متأكد من حذف الكافيه "${cafe.name}" بشكل نهائي؟ هذا سيحذف جميع الطاولات والمبيعات والطلبات التابعة له!`)) return;
    try {
      await fetchWithAuth(`/api/superadmin/cafes/${cafe.id}`, { method: 'DELETE' });
      addAuditLog(`تم حذف الكافيه: "${cafe.name}"`);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  // --- USERS TAB CONTROL ---
  const userRoleSelect = document.getElementById('userRoleSelect');

  function handleRoleChange() {
    const role = userRoleSelect.value;
    if (role === 'SUPER_ADMIN') {
      userCafeSelect.value = '';
      userCafeSelect.disabled = true;
    } else {
      userCafeSelect.disabled = false;
    }
  }

  userRoleSelect.addEventListener('change', handleRoleChange);

  function populateCafeSelect() {
    userCafeSelect.innerHTML = '<option value="">مسؤول المنصة (بلا كافيه)</option>';
    cafes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      userCafeSelect.appendChild(opt);
    });
  }

  // --- USERS TAB CONTROL ---
  const openCafeIds = new Set();

  function renderUsersTable() {
    usersTableBody.innerHTML = '';
    const query = userSearchInput.value.toLowerCase().trim();

    // Filter users based on search query
    const filteredUsers = users.filter(u => {
      const cafe = cafes.find(c => String(c.id) === String(u.cafeId));
      const cafeName = cafe ? cafe.name.toLowerCase() : 'مسؤول النظام (منصة)';
      return u.fullName.toLowerCase().includes(query) ||
             u.email.toLowerCase().includes(query) ||
             u.role.toLowerCase().includes(query) ||
             cafeName.includes(query);
    });

    if (filteredUsers.length === 0) {
      usersTableBody.innerHTML = `
        <div style="text-align:center; padding: 45px 20px; color:var(--text-muted); background:var(--bg-card); border: 1px solid var(--border-color); border-radius:14px;">
          لا توجد نتائج مطابقة للبحث
        </div>
      `;
      return;
    }

    // Group users by Cafe
    const cafeGroups = [];

    // 1. Regular Cafes
    cafes.forEach(cafe => {
      const cafeUsers = filteredUsers.filter(u => String(u.cafeId) === String(cafe.id));
      if (query !== '' ? cafeUsers.length > 0 : true) {
        cafeGroups.push({
          id: String(cafe.id),
          name: cafe.name,
          status: cafe.subscriptionStatus,
          isSystem: false,
          users: cafeUsers
        });
      }
    });

    // 2. System / Platform Users (without a cafe or SUPER_ADMIN)
    const systemUsers = filteredUsers.filter(u => !u.cafeId || u.role === 'SUPER_ADMIN');
    if (systemUsers.length > 0) {
      cafeGroups.unshift({
        id: 'system',
        name: 'مسؤول النظام (المنصة)',
        status: 'active',
        isSystem: true,
        users: systemUsers
      });
    }

    if (cafeGroups.length === 0) {
      usersTableBody.innerHTML = `
        <div style="text-align:center; padding: 45px 20px; color:var(--text-muted); background:var(--bg-card); border: 1px solid var(--border-color); border-radius:14px;">
          لا توجد نتائج مطابقة للبحث
        </div>
      `;
      return;
    }

    // Render an Accordion Card for each group
    cafeGroups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'cafe-accordion-card';

      // Auto expand if search active or if previously expanded by user
      const isExpanded = query !== '' || openCafeIds.has(group.id);
      if (isExpanded) {
        card.classList.add('expanded');
      }

      // Status badge calculation
      let badgeClass = 'badge-success';
      let statusText = 'نشط';
      if (group.isSystem) {
        badgeClass = 'badge-success';
        statusText = 'المنصة الرئيسية';
      } else if (group.status === 'suspended') {
        badgeClass = 'badge-danger';
        statusText = 'معطل';
      } else if (group.status === 'trial') {
        badgeClass = 'badge-warning';
        statusText = 'تجريبي';
      }

      const iconEmoji = group.isSystem ? '🛡️' : '☕';
      const userCountText = group.users.length === 1 ? 'مستخدم واحد' : `${group.users.length} مستخدمين`;

      // Card Header
      const header = document.createElement('div');
      header.className = 'cafe-accordion-header';
      header.innerHTML = `
        <div class="cafe-info-main">
          <div class="cafe-name-title">
            <span style="font-size:18px;">${iconEmoji}</span>
            <span>${group.name}</span>
          </div>
          <span class="user-count-pill">${userCountText}</span>
        </div>
        <div class="cafe-header-meta">
          <span class="badge ${badgeClass}">${statusText}</span>
          <span class="accordion-chevron">▼</span>
        </div>
      `;

      // Header toggle handler
      header.onclick = () => {
        const nowExpanded = card.classList.toggle('expanded');
        if (nowExpanded) {
          openCafeIds.add(group.id);
        } else {
          openCafeIds.delete(group.id);
        }
      };

      // Card Body
      const body = document.createElement('div');
      body.className = 'cafe-accordion-body';

      if (group.users.length === 0) {
        body.innerHTML = `
          <div style="text-align:center; padding: 25px; color: var(--text-muted); font-size: 14px;">
            لا يوجد مستخدمين مضافين لهذا الكافيه حتى الآن.
          </div>
          ${!group.isSystem ? `
          <div class="accordion-footer-action">
            <button class="btn-add-cafe-user">+ إضافة مستخدم</button>
          </div>` : ''}
        `;
        if (!group.isSystem) {
          const addBtn = body.querySelector('.btn-add-cafe-user');
          if (addBtn) {
            addBtn.onclick = (e) => {
              e.stopPropagation();
              openUserModal(null, group.id);
            };
          }
        }
      } else {
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        
        const table = document.createElement('table');
        table.innerHTML = `
          <thead>
            <tr>
              <th>اسم الموظف</th>
              <th>البريد الإلكتروني</th>
              <th>الدور الوظيفي</th>
              <th>الحالة</th>
              <th>تاريخ الإنشاء</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        group.users.forEach(u => {
          const tr = document.createElement('tr');
          const uBadgeClass = u.status === 'active' ? 'badge-success' : 'badge-danger';
          const uStatusText = u.status === 'active' ? 'نشط' : 'معطل';

          tr.innerHTML = `
            <td style="font-weight:700;">${u.fullName}</td>
            <td style="font-family:'Outfit';">${u.email}</td>
            <td><span class="badge" style="background:#f1f5f9; border: 1px solid var(--border-color); color:var(--text-main); font-family:'Outfit', sans-serif;">${u.role}</span></td>
            <td><span class="badge ${uBadgeClass}">${uStatusText}</span></td>
            <td style="font-family:'Outfit';">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ar-EG') : '—'}</td>
            <td>
              <button class="btn btn-edit-user" style="padding:6px 12px; display:inline-block; font-size:12px; margin-left:4px;">تعديل</button>
              <button class="btn btn-pass-user" style="padding:6px 12px; display:inline-block; font-size:12px; margin-left:4px;">كلمة المرور</button>
              <button class="btn btn-delete-user" style="padding:6px 12px; display:inline-block; font-size:12px; color:var(--danger); border-color:rgba(239, 68, 68, 0.2);">حذف</button>
            </td>
          `;

          tr.querySelector('.btn-edit-user').onclick = (e) => { e.stopPropagation(); openUserModal(u); };
          tr.querySelector('.btn-pass-user').onclick = (e) => { e.stopPropagation(); openResetPasswordModal(u); };
          tr.querySelector('.btn-delete-user').onclick = (e) => { e.stopPropagation(); handleDeleteUser(u); };

          tbody.appendChild(tr);
        });

        tableContainer.appendChild(table);
        body.appendChild(tableContainer);

        // Add user button per cafe inside expanded card
        if (!group.isSystem) {
          const footer = document.createElement('div');
          footer.className = 'accordion-footer-action';
          footer.innerHTML = `<button class="btn-add-cafe-user">+ إضافة مستخدم</button>`;
          footer.querySelector('.btn-add-cafe-user').onclick = (e) => {
            e.stopPropagation();
            openUserModal(null, group.id);
          };
          body.appendChild(footer);
        }
      }

      card.appendChild(header);
      card.appendChild(body);
      usersTableBody.appendChild(card);
    });
  }

  userSearchInput.addEventListener('input', renderUsersTable);

  // --- PASSWORD VISIBILITY TOGGLE HELPERS ---
  const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  function setupPasswordToggle(inputEl, toggleBtnEl) {
    if (!inputEl || !toggleBtnEl) return;
    toggleBtnEl.addEventListener('click', (e) => {
      e.preventDefault();
      const isVisible = inputEl.type === 'text';
      inputEl.type = isVisible ? 'password' : 'text';
      toggleBtnEl.innerHTML = isVisible ? eyeIconSvg : eyeOffIconSvg;
      toggleBtnEl.setAttribute('aria-label', isVisible ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور');
    });
  }

  function resetPasswordToggleState(inputEl, toggleBtnEl) {
    if (!inputEl || !toggleBtnEl) return;
    inputEl.type = 'password';
    toggleBtnEl.innerHTML = eyeIconSvg;
    toggleBtnEl.setAttribute('aria-label', 'إظهار كلمة المرور');
  }

  const userPasswordInput = document.getElementById('userPasswordInput');
  const toggleUserPasswordBtn = document.getElementById('toggleUserPasswordBtn');
  const newPasswordInput = document.getElementById('newPasswordInput');
  const toggleNewPasswordBtn = document.getElementById('toggleNewPasswordBtn');

  setupPasswordToggle(userPasswordInput, toggleUserPasswordBtn);
  setupPasswordToggle(newPasswordInput, toggleNewPasswordBtn);

  function openUserModal(user = null, defaultCafeId = null) {
    resetPasswordToggleState(userPasswordInput, toggleUserPasswordBtn);
    if (user) {
      document.getElementById('userModalTitle').textContent = 'تعديل حساب المستخدم';
      document.getElementById('userIdInput').value = user.id;
      document.getElementById('userFullNameInput').value = user.fullName;
      document.getElementById('userEmailInput').value = user.email;
      document.getElementById('userRoleSelect').value = user.role;
      document.getElementById('userCafeSelect').value = user.cafeId || '';
      document.getElementById('userStatusSelect').value = user.status;
      
      // Hide password field for edits
      document.getElementById('passwordGroup').style.display = 'none';
      document.getElementById('userPasswordInput').removeAttribute('required');
    } else {
      document.getElementById('userModalTitle').textContent = 'إضافة مستخدم جديد';
      userForm.reset();
      document.getElementById('userIdInput').value = '';
      document.getElementById('userRoleSelect').value = 'OWNER'; // default to OWNER for new users to avoid empty cafe validation issue on SUPER_ADMIN default
      if (defaultCafeId) {
        document.getElementById('userCafeSelect').value = defaultCafeId;
      }
      
      // Show password field for creations
      document.getElementById('passwordGroup').style.display = 'flex';
      document.getElementById('userPasswordInput').setAttribute('required', 'required');
    }
    handleRoleChange();
    userModal.classList.add('active');
  }

  function closeUserModal() {
    userModal.classList.remove('active');
  }

  closeUserModalBtn.onclick = closeUserModal;
  cancelUserBtn.onclick = closeUserModal;

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('userIdInput').value;
    const fullName = document.getElementById('userFullNameInput').value.trim();
    const email = document.getElementById('userEmailInput').value.trim();
    const role = document.getElementById('userRoleSelect').value;
    const status = document.getElementById('userStatusSelect').value;
    const cafeId = document.getElementById('userCafeSelect').value || null;

    if (role !== 'SUPER_ADMIN' && !cafeId) {
      alert('مطلوب تحديد الكافيه لهذا الدور الوظيفي');
      return;
    }

    const payload = { fullName, email, role, status, cafeId: role === 'SUPER_ADMIN' ? null : cafeId };

    if (!id) {
      // Add password only on create
      payload.password = document.getElementById('userPasswordInput').value;
    }

    try {
      if (id) {
        await fetchWithAuth(`/api/superadmin/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        addAuditLog(`تم تحديث حساب المستخدم: "${fullName}"`);
      } else {
        await fetchWithAuth('/api/superadmin/users', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        addAuditLog(`تم إنشاء مستخدم جديد: "${fullName}" (${role})`);
      }
      closeUserModal();
      loadData();
    } catch (err) {
      alert(err.message);
    }
  });

  async function handleDeleteUser(user) {
    if (!confirm(`هل أنت متأكد من حذف حساب الموظف "${user.fullName}" بشكل نهائي؟`)) return;
    try {
      await fetchWithAuth(`/api/superadmin/users/${user.id}`, { method: 'DELETE' });
      addAuditLog(`تم حذف حساب الموظف: "${user.fullName}"`);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  // --- PASSWORD RESET MODAL ---
  function openResetPasswordModal(user) {
    document.getElementById('resetPasswordUserIdInput').value = user.id;
    document.getElementById('newPasswordInput').value = '';
    resetPasswordToggleState(newPasswordInput, toggleNewPasswordBtn);
    resetPasswordModal.classList.add('active');
  }

  function closeResetPasswordModal() {
    resetPasswordModal.classList.remove('active');
  }

  closeResetPasswordModalBtn.onclick = closeResetPasswordModal;
  cancelResetPasswordBtn.onclick = closeResetPasswordModal;

  resetPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('resetPasswordUserIdInput').value;
    const password = document.getElementById('newPasswordInput').value;

    try {
      await fetchWithAuth(`/api/superadmin/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      const userObj = users.find(u => String(u.id) === id);
      addAuditLog(`تمت إعادة تعيين كلمة مرور المستخدم: "${userObj ? userObj.fullName : id}"`);
      closeResetPasswordModal();
      alert('تم إعادة تعيين كلمة المرور بنجاح.');
    } catch (err) {
      alert(err.message);
    }
  });

  // Initial load
  loadData();
})();
