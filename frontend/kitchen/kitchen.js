/**
 * شاشة المطبخ — الطلبات الحالية: جديدة + قيد التجهيز فقط.
 * المكتملة تُعرض في تبويب «صندوق طلبات اليوم» فقط.
 */
(function () {
  var newGrid = document.getElementById('kitchenNewGrid');
  var prepGrid = document.getElementById('kitchenPrepGrid');
  var summaryText = document.getElementById('kitchenSummaryText');
  var summaryBody = document.getElementById('kitchenSummaryBody');
  var viewQueue = document.getElementById('kitchenViewQueue');
  var kitchenHeaderCafeName = document.getElementById('kitchenHeaderCafeName');

  var api = window.api || window.Api;
  if (!api) {
    console.error('API not loaded for kitchen screen');
    return;
  }

  var Notifications = window.NotificationCenter;

  var DELAY_WARN_MIN = 5;
  var lastQueueData = { new: [], preparing: [] };
  var completedTodayCount = 0;
  var prevNewOrderIds = [];
  var kitchenInitDone = false;
  var prevPreparingOrderIds = [];
  var summarySelectedOrderId = null;
  var summarySelectedLabel = '';

  /** تحديث أوقات «منذ X» كل ثوانٍ دون إعادة تحميل الصفحة */
  var ELAPSED_TICK_MS = 15000;
  /** احتياطي: مزامنة الطلبات من السيرفر إذا تأخر التحديث اللحظي */
  var POLL_SYNC_MS = 45000;

  /** تشخيص مؤقت: localStorage.setItem('cafeDebugKitchenSocket','1') ثم إعادة تحميل */
  var KITCHEN_SOCKET_DEBUG =
    typeof localStorage !== 'undefined' && localStorage.getItem('cafeDebugKitchenSocket') === '1';

  /** منع إشعار مكرر لنفس رقم الطلب (دفاع إضافي مع debounce التحديث) */
  var notifiedOrderAt = {};
  var NOTIFY_ID_TTL_MS = 5 * 60 * 1000;

  function pruneNotifiedOrderMap() {
    var now = Date.now();
    Object.keys(notifiedOrderAt).forEach(function (id) {
      if (now - notifiedOrderAt[id] > NOTIFY_ID_TTL_MS) delete notifiedOrderAt[id];
    });
  }

  function filterIdsNotYetNotified(ids) {
    pruneNotifiedOrderMap();
    var now = Date.now();
    return ids.filter(function (id) {
      var last = notifiedOrderAt[id];
      if (last == null) return true;
      return now - last > NOTIFY_ID_TTL_MS;
    });
  }

  function markOrdersNotified(ids) {
    var now = Date.now();
    ids.forEach(function (id) {
      notifiedOrderAt[id] = now;
    });
  }

  /** دمج orders-updated + kitchen-updated في تحديث واحد يقلل render مزدوج وإشعار مكرر */
  var realtimeRefreshTimer = null;
  function scheduleRealtimeRefresh(reason) {
    if (KITCHEN_SOCKET_DEBUG) {
      console.debug('[kitchen] scheduleRealtimeRefresh', reason);
    }
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(function () {
      realtimeRefreshTimer = null;
      refreshAll();
    }, 75);
  }

  function formatTime(dateStr) {
    var d = new Date(dateStr);
    if (!dateStr || isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var day = d.getDate();
    var month = d.getMonth() + 1;
    return day + '/' + month + ' — ' + (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function formatDuration(fromTs, now) {
    var diffMs = now - fromTs;
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin <= 0) {
      return 'أقل من دقيقة';
    }
    if (diffMin < 60) {
      return 'منذ ' + diffMin + ' دقيقة';
    }
    var diffHours = Math.floor(diffMin / 60);
    return 'منذ ' + diffHours + ' ساعة';
  }

  function elapsedForTicket(t) {
    var start = t.kitchenCreatedAt || t.createdAt;
    var ts = Date.parse(start) || Date.now();
    return formatDuration(ts, Date.now());
  }

  function isDelayedNew(t) {
    var start = Date.parse(t.kitchenCreatedAt || t.createdAt) || Date.now();
    return Date.now() - start > DELAY_WARN_MIN * 60 * 1000;
  }

  function formatOptionValueForDisplay(val) {
    if (val == null) return '';
    if (Array.isArray(val)) return val.map(String).join('، ');
    return String(val);
  }

  /** ترتيب مفاتيح للمقارنة — نفس المنطق: سطران متطابقان فقط يُدمجان (اختلاف خيارات أو ملاحظة = سطران) */
  function stableStringifyOptionsForGroup(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '{}';
    var keys = Object.keys(obj).sort();
    var sorted = {};
    keys.forEach(function (k) {
      sorted[k] = obj[k];
    });
    return JSON.stringify(sorted);
  }

  function kitchenStatusRank(st) {
    var s = String(st || 'new').toLowerCase();
    if (s === 'editing') return 4;
    if (s === 'preparing') return 3;
    if (s === 'new') return 2;
    return 1;
  }

  /** دمج تذاكر نفس دفعة الإرسال المنسّق (طاولة واحدة — زبونان+) */
  function mergeKitchenBatchTickets(tickets) {
    if (!Array.isArray(tickets) || !tickets.length) return [];
    var byBatch = Object.create(null);
    var singles = [];
    tickets.forEach(function (t) {
      var bid = t.kitchenBatchId != null ? String(t.kitchenBatchId).trim() : '';
      if (!bid) {
        singles.push(t);
        return;
      }
      if (!byBatch[bid]) byBatch[bid] = [];
      byBatch[bid].push(t);
    });
    var merged = [];
    Object.keys(byBatch).forEach(function (bid) {
      var group = byBatch[bid];
      if (group.length < 2) {
        singles.push(group[0]);
        return;
      }
      var primary = group[0];
      var orderIds = [];
      var names = [];
      var items = [];
      var bestStatus = 'new';
      var bestRank = 0;
      var earliestStart = primary.kitchenCreatedAt || primary.createdAt || '';
      group.forEach(function (t) {
        orderIds.push(t.id);
        if (t.customerName && names.indexOf(t.customerName) === -1) names.push(t.customerName);
        var r = kitchenStatusRank(t.status);
        if (r > bestRank) {
          bestRank = r;
          bestStatus = t.status || 'new';
        }
        var st = Date.parse(t.kitchenCreatedAt || t.createdAt || '') || 0;
        var cur = Date.parse(earliestStart) || 0;
        if (st && (cur === 0 || st < cur)) earliestStart = t.kitchenCreatedAt || t.createdAt;
        (t.items || []).forEach(function (it) {
          items.push(
            Object.assign({}, it, {
              orderedByName:
                it.orderedByName != null && String(it.orderedByName).trim()
                  ? String(it.orderedByName).trim()
                  : t.customerName || '',
            })
          );
        });
      });
      merged.push({
        id: primary.id,
        orderIds: orderIds,
        isKitchenBatch: true,
        kitchenBatchId: bid,
        tableId: primary.tableId,
        tableLabel: primary.tableLabel,
        orderType: primary.orderType,
        orderTypeLabel: primary.orderTypeLabel,
        serviceMeta: primary.serviceMeta,
        bundledCustomerNames: primary.bundledCustomerNames,
        customerName:
          Array.isArray(primary.bundledCustomerNames) && primary.bundledCustomerNames.length > 1
            ? String(primary.bundledCustomerNames[0] || '').trim() || primary.customerName
            : names.length
              ? names.join(' · ')
              : primary.customerName,
        items: items,
        status: bestStatus,
        createdAt: earliestStart || primary.createdAt,
        kitchenCreatedAt: earliestStart || primary.kitchenCreatedAt,
        updatedAt: primary.updatedAt,
      });
    });
    return singles.concat(merged);
  }

  function orderIdsForTicket(t) {
    if (t && t.isKitchenBatch && Array.isArray(t.orderIds) && t.orderIds.length) return t.orderIds.slice();
    return t && t.id ? [t.id] : [];
  }

  /** دمج عناصر متطابقة للعرض في الوصل (مثلاً إسبريسو + إسبريسو → كمية 2) */
  function groupKitchenItemsForDisplay(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    var map = new Map();
    items.forEach(function (it) {
      var note = String(it.note || '').trim();
      var optKey = stableStringifyOptionsForGroup(it.selectedOptions);
      var idKey = it.menuId != null && String(it.menuId).trim() !== '' ? String(it.menuId) : String(it.name || '');
      var who = String(it.orderedByName || '').trim();
      var key = idKey + '|' + optKey + '|' + note + '|' + who;
      var q = Math.max(1, Math.floor(Number(it.quantity) || 1));
      if (map.has(key)) {
        var ex = map.get(key);
        ex.quantity = (Number(ex.quantity) || 0) + q;
      } else {
        map.set(key, {
          name: it.name,
          menuId: it.menuId,
          price: it.price,
          quantity: q,
          note: it.note,
          orderedByName: who || undefined,
          selectedOptions:
            it.selectedOptions && typeof it.selectedOptions === 'object' && !Array.isArray(it.selectedOptions)
              ? it.selectedOptions
              : {},
        });
      }
    });
    return Array.from(map.values());
  }

  function buildItemModifiersHtml(it) {
    var rows = [];
    if (it.selectedOptions && typeof it.selectedOptions === 'object') {
      Object.keys(it.selectedOptions).forEach(function (k) {
        var key = String(k != null ? k : '').trim();
        var val = formatOptionValueForDisplay(it.selectedOptions[k]);
        if (!key && !String(val).trim()) return;
        rows.push(
          '<li class="kitchen-item-modifier kitchen-item-modifier--option">' +
          '<span class="kitchen-item-modifier__key">' +
          escapeHtml(key) +
          ':</span> ' +
          '<span class="kitchen-item-modifier__val">' +
          escapeHtml(val) +
          '</span></li>'
        );
      });
    }
    var note = it.note != null ? String(it.note).trim() : '';
    if (note) {
      rows.push(
        '<li class="kitchen-item-modifier kitchen-item-modifier--note">' +
        '<span class="kitchen-item-modifier__key">ملاحظة:</span> ' +
        '<span class="kitchen-item-modifier__val">' +
        escapeHtml(note) +
        '</span></li>'
      );
    }
    if (!rows.length) return '';
    return '<ul class="kitchen-item-modifiers" dir="rtl">' + rows.join('') + '</ul>';
  }

  function ticketItemsHtml(t) {
    return groupKitchenItemsForDisplay(t.items || [])
      .map(function (it) {
        var modifiers = buildItemModifiersHtml(it);
        return (
          '<li class="kitchen-ticket-item">' +
          '<div class="kitchen-ticket-item__line" dir="rtl">' +
          '<span class="kitchen-ticket-item__qty" aria-label="العدد">' +
          escapeHtml(it.quantity) +
          '</span>' +
          '<span class="kitchen-ticket-item__sep" aria-hidden="true">×</span>' +
          '<span class="kitchen-ticket-item__name">' +
          escapeHtml(it.name) +
          '</span></div>' +
          modifiers +
          '</li>'
        );
      })
      .join('');
  }

  function ticketOwnerName(t) {
    if (!t) return '';
    if (Array.isArray(t.bundledCustomerNames) && t.bundledCustomerNames.length > 1) {
      return String(t.bundledCustomerNames[0] || '').trim();
    }
    if (t.customerName != null && String(t.customerName).trim()) {
      return String(t.customerName).trim();
    }
    if (Array.isArray(t.bundledCustomerNames) && t.bundledCustomerNames.length === 1) {
      return String(t.bundledCustomerNames[0] || '').trim();
    }
    return '';
  }

  /** بناء كارت واحد حسب حالة الطلب */
  function renderTicketCard(t, section) {
    var st = (t.status || 'new').toLowerCase();
    var isEditing = st === 'editing';
    var statusClass =
      'kitchen-ticket--status-' +
      (st === 'preparing'
        ? 'preparing'
        : st === 'completed'
          ? 'completed'
          : st === 'editing'
            ? 'editing'
            : 'new');
    var delayedClass = section === 'new' && isDelayedNew(t) ? ' kitchen-ticket--delayed' : '';
    var flashClass = t._flashIn ? ' kitchen-ticket--flash-in' : '';

    var startIso = t.kitchenCreatedAt || t.createdAt || '';
    var elapsedText = elapsedForTicket(t);
    var timeInner =
      '<span class="kitchen-ticket-elapsed" data-started-at="' +
      escapeHtml(startIso) +
      '">' +
      escapeHtml(elapsedText) +
      '</span>';
    if (st === 'completed' && t.updatedAt) {
      timeInner +=
        '<span class="kitchen-ticket-finish-suffix"> · إنجاز: ' +
        escapeHtml(formatTime(t.updatedAt)) +
        '</span>';
    }

    var footerHtml = '';
    if (section === 'new') {
      var prepBtnClass = 'btn-kitchen btn-kitchen-primary' + (isEditing ? ' btn-kitchen--disabled' : '');
      var prepDisabled = isEditing ? ' disabled aria-disabled="true"' : '';
      var prepLabel = 'بدء التجهيز';
      footerHtml =
        '<footer class="kitchen-ticket-footer">' +
        '<button type="button" class="' +
        prepBtnClass +
        '" data-action="preparing"' +
        prepDisabled +
        ' title="' +
        (isEditing ? 'ممنوع: الزبون يعدّل الطلب حالياً' : '') +
        '">' +
        prepLabel +
        '</button>' +
        '</footer>';
    } else if (section === 'preparing') {
      footerHtml =
        '<footer class="kitchen-ticket-footer">' +
        '<button type="button" class="btn-kitchen btn-kitchen-prep-done" data-action="completed">إنهاء التجهيز</button>' +
        '</footer>';
    }

    var badgeHtml = '';
    if (section === 'preparing') {
      badgeHtml =
        '<div class="kitchen-ticket-badge kitchen-ticket-badge--preparing" aria-hidden="true">قيد التجهيز</div>';
    } else if (section === 'new') {
      if (isEditing) {
        badgeHtml =
          '<div class="kitchen-ticket-badge kitchen-ticket-badge--editing" aria-hidden="true">قيد التعديل</div>';
      } else {
        badgeHtml = '<div class="kitchen-ticket-badge kitchen-ticket-badge--new" aria-hidden="true">جديد</div>';
      }
    }

    var editingBanner = '';
    if (isEditing) {
      editingBanner =
        '<div class="kitchen-ticket-editing-banner" role="status">' +
        '<span class="kitchen-ticket-editing-banner__icon" aria-hidden="true">✎</span>' +
        '<span class="kitchen-ticket-editing-banner__title">تعديل طلب</span>' +
        '</div>';
    }

    var orderIdsAttr =
      t.isKitchenBatch && Array.isArray(t.orderIds) && t.orderIds.length
        ? ' data-order-ids="' + escapeHtml(t.orderIds.join(',')) + '"'
        : '';
    var batchBadge =
      t.isKitchenBatch
        ? '<div class="kitchen-ticket-badge kitchen-ticket-badge--batch" aria-hidden="true">طلب مشترك</div>'
        : '';
    var tableLabel = escapeHtml(t.tableLabel || ('طاولة ' + (t.tableId || '')));
    var isServiceOrder = t.orderType === 'TAKEAWAY' || t.orderType === 'DELIVERY';
    var tableHeaderClass =
      'kitchen-ticket-header__table' + (isServiceOrder ? ' kitchen-ticket-header__table--service' : '');
    var typeHeaderHtml = t.orderTypeLabel
      ? '<div class="kitchen-ticket-header__type">' + escapeHtml(t.orderTypeLabel) + '</div>'
      : '';
    var ownerName = ticketOwnerName(t);
    var ownerHtml = ownerName
      ? '<div class="kitchen-ticket-customer" dir="rtl">' +
        '<span class="kitchen-ticket-customer__text">صاحب الطلب: ' +
        escapeHtml(ownerName) +
        '</span></div>'
      : '';

    return (
      '<article class="kitchen-ticket ' +
      statusClass +
      delayedClass +
      flashClass +
      (t.isKitchenBatch ? ' kitchen-ticket--batch' : '') +
      '" data-order-id="' +
      escapeHtml(t.id) +
      '"' +
      orderIdsAttr +
      ' data-kitchen-phase="' +
      escapeHtml(section) +
      '" data-started-at="' +
      escapeHtml(startIso) +
      '">' +
      batchBadge +
      badgeHtml +
      editingBanner +
      '<header class="kitchen-ticket-header" dir="rtl">' +
      '<div class="kitchen-ticket-header__grid">' +
      '<div class="' +
      tableHeaderClass +
      '">' +
      tableLabel +
      '</div>' +
      typeHeaderHtml +
      '<div class="kitchen-ticket-header__time">' +
      timeInner +
      '</div>' +
      '</div>' +
      '</header>' +
      '<ul class="kitchen-ticket-items" dir="rtl">' +
      ticketItemsHtml(t) +
      '</ul>' +
      ownerHtml +
      footerHtml +
      '</article>'
    );
  }

  function bindTicketInteractions(container, tickets) {
    if (!container) return;
    container.querySelectorAll('.kitchen-ticket .btn-kitchen').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        var card = btn.closest('.kitchen-ticket');
        if (!card || !action) return;
        var idsRaw = card.getAttribute('data-order-ids');
        var orderIds = idsRaw
          ? idsRaw
              .split(',')
              .map(function (s) {
                return String(s || '').trim();
              })
              .filter(Boolean)
          : [];
        if (!orderIds.length) {
          var one = card.getAttribute('data-order-id');
          if (one) orderIds = [one];
        }
        if (!orderIds.length) return;
        var status = action === 'preparing' ? 'preparing' : action === 'completed' ? 'completed' : null;
        if (!status) return;

        var snapshot = JSON.parse(JSON.stringify(lastQueueData));
        var idSet = new Set(orderIds);

        var newT = (lastQueueData.new || []).filter(function (t) { return !idSet.has(String(t.id)); });
        var prep = (lastQueueData.preparing || []).filter(function (t) { return !idSet.has(String(t.id)); });

        if (status === 'preparing') {
          var moved = (lastQueueData.new || []).filter(function (t) { return idSet.has(String(t.id)); });
          moved.forEach(function (t) { t.status = 'preparing'; });
          prep = prep.concat(moved);
        } else if (status === 'completed') {
          completedTodayCount += orderIds.length;
        }

        lastQueueData = { new: newT, preparing: prep };
        renderWorkflow(lastQueueData);
        updateSummary();

        Promise.all(
          orderIds.map(function (oid) {
            return api.kitchen.setStatus(oid, status);
          })
        )
          .catch(function (err) {
            lastQueueData = snapshot;
            if (status === 'completed') completedTodayCount = Math.max(0, completedTodayCount - orderIds.length);
            renderWorkflow(lastQueueData);
            updateSummary();
            alert(err && err.json && err.json.error ? err.json.error : err.message || 'فشل تحديث حالة الطلب');
          });
      });
    });

    container.querySelectorAll('.kitchen-ticket').forEach(function (card) {
      card.addEventListener('mouseenter', function (e) {
        if (e.target.closest('.btn-kitchen')) return;
        var id = card.getAttribute('data-order-id');
        var t = tickets.find(function (x) {
          return x.id === id;
        });
        if (!t) return;
        summarySelectedOrderId = t.id;
        summarySelectedLabel = 'مدة طلب ' + (t.tableLabel || ('طاولة ' + (t.tableId || '')));
        updateSummary();
      });
      card.addEventListener('mouseleave', function (e) {
        if (e.relatedTarget && e.relatedTarget.closest('.btn-kitchen')) return;
        summarySelectedOrderId = null;
        summarySelectedLabel = '';
        updateSummary();
      });
      card.addEventListener('click', function (e) {
        if (e.target.closest('.btn-kitchen')) return;
        var id = card.getAttribute('data-order-id');
        var t = tickets.find(function (x) {
          return x.id === id;
        });
        if (!t) return;
        summarySelectedOrderId = t.id;
        summarySelectedLabel = 'مدة طلب ' + (t.tableLabel || ('طاولة ' + (t.tableId || '')));
        updateSummary();
      });
    });
  }

  /** تحديث نص «منذ / أقل من دقيقة» على كل الكروت المرئية */
  function tickElapsedDisplays() {
    var now = Date.now();
    document.querySelectorAll('.kitchen-ticket-elapsed[data-started-at]').forEach(function (el) {
      var anchor = el.getAttribute('data-started-at');
      var ts = Date.parse(anchor);
      if (isNaN(ts)) return;
      el.textContent = formatDuration(ts, now);
    });
    updateDelayedBadgesOnCards();
    updateSummary();
  }

  /** تحديث تمييز الطلب المتأخر (جديد) حسب الوقت الحالي */
  function updateDelayedBadgesOnCards() {
    if (!newGrid) return;
    var threshold = DELAY_WARN_MIN * 60 * 1000;
    newGrid.querySelectorAll('.kitchen-ticket[data-started-at]').forEach(function (card) {
      var anchor = card.getAttribute('data-started-at');
      var ts = Date.parse(anchor);
      if (isNaN(ts)) return;
      if (Date.now() - ts > threshold) card.classList.add('kitchen-ticket--delayed');
      else card.classList.remove('kitchen-ticket--delayed');
    });
  }

  function renderWorkflow(data) {
    var newT = data.new || [];
    var prep = data.preparing || [];

    var newIds = newT.map(function (x) {
      return x.id;
    });
    var prepIds = prep.map(function (x) {
      return x.id;
    });
    var newlyAppeared = [];
    if (kitchenInitDone) {
      newIds.forEach(function (id) {
        if (prevNewOrderIds.indexOf(id) === -1) newlyAppeared.push(id);
      });
    }
    /** تنبيه واحد لكل حدث طلب جديد (مصدر واحد + فلترة معرفات مكررة) */
    var toNotifyIds = filterIdsNotYetNotified(newlyAppeared.slice());
    if (toNotifyIds.length && Notifications && Notifications.notifyNew) {
      markOrdersNotified(toNotifyIds);
      var firstTicket = newT.find(function (t) {
        return toNotifyIds.indexOf(t.id) !== -1;
      });
      var tableId = (firstTicket && firstTicket.tableId) || '';
      var tableLabel = (firstTicket && firstTicket.tableLabel) || tableId;
      var orderType = (firstTicket && firstTicket.orderType) || '';
      var title = toNotifyIds.length > 1 ? 'طلبات جديدة' : 'طلب جديد';
      var message =
        toNotifyIds.length > 1
          ? toNotifyIds.length + ' طلبات جديدة — أولها ' + tableLabel
          : 'طلب جديد — ' + tableLabel;
      Notifications.notifyNew({
        title: title,
        message: message,
        ttlMs: 4500,
      });
      if (window.VoiceNotify && typeof VoiceNotify.announceKitchenNew === 'function') {
        VoiceNotify.announceKitchenNew(tableId, orderType);
      }
    }

    // إصلاح: بعض السيناريوهات (مثل إرسال الكابتن للمطبخ) قد تظهر الطلب مباشرة في column `preparing`
    // وبالتالي لن يعتبر “جديد” في عمود `new`. هنا نُشعر أيضاً عند الظهور الأول داخل `preparing`.
    var newlyAppearedPrep = [];
    if (kitchenInitDone) {
      prepIds.forEach(function (id) {
        if (prevPreparingOrderIds.indexOf(id) === -1) newlyAppearedPrep.push(id);
      });
    }
    var toNotifyPrepIds = filterIdsNotYetNotified(newlyAppearedPrep.slice());
    if (toNotifyPrepIds.length && Notifications && Notifications.notifyNew) {
      markOrdersNotified(toNotifyPrepIds);
      var firstPrepTicket = prep.find(function (t) {
        return toNotifyPrepIds.indexOf(t.id) !== -1;
      });
      var prepTableId = (firstPrepTicket && firstPrepTicket.tableId) || '';
      var prepTitle = toNotifyPrepIds.length > 1 ? 'بدء تجهيز طلبات' : 'بدأ تجهيز طلب';
      var prepMessage =
        toNotifyPrepIds.length > 1
          ? toNotifyPrepIds.length + ' طلبات — أولها طاولة ' + prepTableId
          : 'بدأ تجهيز - طاولة ' + prepTableId;
      Notifications.notifyNew({
        title: prepTitle,
        message: prepMessage,
        ttlMs: 4500,
      });
      // لا ننادي VoiceNotify هنا لأن نصه الحالي مخصص لـ "طلب جديد"
    }

    newT.forEach(function (t) {
      t._flashIn = newlyAppeared.indexOf(t.id) !== -1;
    });
    prevNewOrderIds = newIds.slice();
    prevPreparingOrderIds = prepIds.slice();
    kitchenInitDone = true;

    function fillGrid(el, list, section) {
      if (!el) return;
      if (!list.length) {
        el.innerHTML = '<p class="kitchen-empty">لا يوجد</p>';
        return;
      }
      el.innerHTML = list
        .map(function (t) {
          return renderTicketCard(t, section);
        })
        .join('');
    }

    fillGrid(newGrid, newT, 'new');
    fillGrid(prepGrid, prep, 'preparing');

    var allTickets = newT.concat(prep);
    bindTicketInteractions(newGrid, allTickets);
    bindTicketInteractions(prepGrid, allTickets);

    if (summaryText) {
      summaryText.textContent = newT.length + prep.length + ' طلب نشط (جديد + تجهيز)';
    }
    tickElapsedDisplays();
  }

  function updateSummary() {
    if (!summaryBody) return;
    var now = Date.now();
    var newT = lastQueueData.new || [];
    var prep = lastQueueData.preparing || [];

    var newCount = newT.length;
    var preparingCount = prep.length;

    var oldestText = 'لا يوجد';
    var oldestLabel = 'أقدم طلب منتظر';

    if (summarySelectedOrderId) {
      var allTickets = newT.concat(prep);
      var selected = allTickets.find(function (t) {
        return t.id === summarySelectedOrderId;
      });
      if (selected && (selected.kitchenCreatedAt || selected.createdAt)) {
        var tsSel = Date.parse(selected.kitchenCreatedAt || selected.createdAt) || now;
        oldestText = formatDuration(tsSel, now);
        var table = selected.tableLabel || ('طاولة ' + (selected.tableId || ''));
        oldestLabel = summarySelectedLabel || ('مدة طلب ' + table);
      }
    } else if (newT.length) {
      var oldestTs = newT.reduce(function (min, t) {
        var ts = Date.parse(t.kitchenCreatedAt || t.createdAt) || now;
        return ts < min ? ts : min;
      }, now);
      oldestText = formatDuration(oldestTs, now);
      oldestLabel = 'أقدم طلب منتظر';
    }

    summaryBody.innerHTML =
      '<div class="kitchen-summary-grid">' +
      '<div class="kitchen-summary-card kitchen-summary-card--new">' +
      '<div class="label">طلبات جديدة الآن</div>' +
      '<div class="value">' +
      newCount +
      '</div>' +
      '</div>' +
      '<div class="kitchen-summary-card kitchen-summary-card--inprogress">' +
      '<div class="label">طلبات تحت التجهيز</div>' +
      '<div class="value">' +
      preparingCount +
      '</div>' +
      '</div>' +
      '<div class="kitchen-summary-card kitchen-summary-card--prepared">' +
      '<div class="label">طلبات مكتملة اليوم</div>' +
      '<div class="value">' +
      completedTodayCount +
      '</div>' +
      '</div>' +
      '<div class="kitchen-summary-card kitchen-summary-card--oldest">' +
      '<div class="label">' +
      escapeHtml(oldestLabel) +
      '</div>' +
      '<div class="value">' +
      escapeHtml(oldestText) +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function loadQueue() {
    return api.kitchen
      .queue()
      .then(function (data) {
        if (Array.isArray(data)) {
          lastQueueData = { new: mergeKitchenBatchTickets(data), preparing: [] };
        } else if (!data || typeof data !== 'object') {
          lastQueueData = { new: [], preparing: [] };
        } else {
          lastQueueData = {
            new: mergeKitchenBatchTickets(data.new || []),
            preparing: mergeKitchenBatchTickets(data.preparing || []),
          };
        }
        renderWorkflow(lastQueueData);
        updateSummary();
      })
      .catch(function (err) {
        console.error(err);
        if (summaryText) {
          summaryText.textContent = 'تعذّر تحميل الطلبات — تحقق من الاتصال بالخادم';
        }
      });
  }

  function loadCompletedTodayCount() {
    return api.kitchen
      .today()
      .then(function (tickets) {
        tickets = Array.isArray(tickets) ? tickets : [];
        completedTodayCount = tickets.length;
        updateSummary();
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  function refreshAll() {
    loadQueue();
    loadCompletedTodayCount();
  }

  /**
   * اتصال Socket واحد لكل تحميل صفحة؛ إعادة اتصال تلقائية؛ debounce للأحداث المتزامنة.
   * (مكافئ React: useEffect مع [] + cleanup — هنا IIFE + pagehide)
   */
  function setupKitchenSocket() {
    if (typeof io !== 'function') {
      console.error('Socket.io client not loaded');
      return;
    }
    var prev = window.__cafeKitchenSocket;
    if (prev && typeof prev.disconnect === 'function') {
      try {
        prev.removeAllListeners();
        prev.disconnect();
      } catch (err) {
        if (KITCHEN_SOCKET_DEBUG) console.debug('[kitchen] prev socket teardown', err);
      }
    }

    var token = sessionStorage.getItem('cafezip_saas_token') || '';
    var socket = io(window.location.origin, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
      query: { token: token }
    });
    window.__cafeKitchenSocket = socket;

    socket.on('connect', function () {
      if (KITCHEN_SOCKET_DEBUG) console.debug('[kitchen socket] connect', socket.id);
      refreshAll();
    });
    socket.on('disconnect', function (reason) {
      if (KITCHEN_SOCKET_DEBUG) console.debug('[kitchen socket] disconnect', reason);
    });
    socket.on('reconnect', function (n) {
      if (KITCHEN_SOCKET_DEBUG) console.debug('[kitchen socket] reconnect attempt', n);
      refreshAll();
    });
    socket.on('connect_error', function (err) {
      if (KITCHEN_SOCKET_DEBUG) console.debug('[kitchen socket] connect_error', err && err.message);
    });

    socket.on('orders-updated', function (payload) {
      if (KITCHEN_SOCKET_DEBUG) console.debug('[kitchen socket] recv orders-updated', payload);
      scheduleRealtimeRefresh('orders-updated');
    });
    socket.on('kitchen-updated', function (payload) {
      if (KITCHEN_SOCKET_DEBUG) console.debug('[kitchen socket] recv kitchen-updated', payload);
      scheduleRealtimeRefresh('kitchen-updated');
    });
    if (window.CafeHeaderBranding && kitchenHeaderCafeName) {
      window.CafeHeaderBranding.bindSocket(socket, kitchenHeaderCafeName, 'شاشة المطبخ');
    }

    function teardown() {
      clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = null;
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch (_) {}
      if (window.__cafeKitchenSocket === socket) window.__cafeKitchenSocket = null;
    }
    window.addEventListener('pagehide', teardown, { once: true });
  }

  if (window.CafeHeaderBranding && kitchenHeaderCafeName) {
    window.CafeHeaderBranding.load(kitchenHeaderCafeName, 'شاشة المطبخ');
  }

  try {
    setupKitchenSocket();
  } catch (e) {
    console.error(e);
  }

  setInterval(tickElapsedDisplays, ELAPSED_TICK_MS);
  setInterval(refreshAll, POLL_SYNC_MS);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      tickElapsedDisplays();
      refreshAll();
    }
  });

  (function mountVoiceMute() {
    var actions = document.querySelector('.kitchen-header-actions');
    if (actions && window.VoiceNotify && VoiceNotify.mountMuteButton) {
      VoiceNotify.mountMuteButton(actions, { beforeSelector: '#btnKitchenMenuAvailability' });
    }
  })();

  refreshAll();
})();
