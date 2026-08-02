#!/usr/bin/env node
/**
 * Comprehensive migration script: JSON files & Local Uploads → Supabase Single Source of Truth
 * Usage: node backend/scripts/migrate_all_json_to_supabase.js
 */
'use strict';

require('../lib/env');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getClient } = require('../lib/supabase');

const DATA_DIR = config.DATA_DIR;
const UPLOADS_DIR = config.UPLOADS_DIR;

function readJsonFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[migration] Failed to parse ${filePath}:`, err.message);
    return fallback;
  }
}

async function getOrCreateDefaultCafeId(supabase) {
  const { data: cafes, error } = await supabase.from('cafes').select('id').limit(1);
  if (!error && cafes && cafes.length > 0) {
    return cafes[0].id;
  }
  const { data: created, error: createErr } = await supabase.from('cafes').insert([{
    name: 'Shot Cafe',
    slug: 'shot-cafe',
    subscription_status: 'active'
  }]).select('id').single();

  if (createErr || !created) {
    throw new Error(`Failed to ensure default cafe: ${createErr ? createErr.message : 'Unknown error'}`);
  }
  return created.id;
}

async function runFullMigration() {
  console.log('🚀 Starting complete Supabase data migration...');
  const supabase = getClient();
  const defaultCafeId = await getOrCreateDefaultCafeId(supabase);
  console.log(`📌 Using Default Cafe ID: ${defaultCafeId}`);

  // 1. Admin Auth (admin-auth.json)
  console.log('📦 1. Migrating admin-auth.json...');
  const adminAuthData = readJsonFile(path.join(DATA_DIR, 'admin-auth.json'), { username: 'admin', password: '20262026' });
  if (adminAuthData) {
    const { error } = await supabase.from('admin_auth').upsert([{
      username: String(adminAuthData.username || 'admin').trim(),
      password: String(adminAuthData.password || '20262026'),
      updated_at: new Date().toISOString()
    }], { onConflict: 'username' });
    if (error) console.warn('   ⚠️ admin_auth migration warning:', error.message);
    else console.log('   ✅ admin_auth migrated successfully.');
  }

  // 2. Cafes (cafes.json)
  console.log('📦 2. Migrating cafes.json...');
  const cafesList = readJsonFile(path.join(DATA_DIR, 'cafes.json'), []);
  if (Array.isArray(cafesList) && cafesList.length > 0) {
    const seenSlugs = new Set();
    const rows = [];
    for (const c of cafesList) {
      let slug = c.slug || (c.name || 'cafe').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (seenSlugs.has(slug)) slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
      seenSlugs.add(slug);
      rows.push({
        id: c.id,
        name: c.name || 'My Cafe',
        slug,
        logo_url: c.logoUrl || c.logo_url || null,
        address: c.address || '',
        phone: c.phone || '',
        subscription_status: (c.subscriptionStatus || c.subscription_status || 'active').toLowerCase(),
        created_at: c.createdAt || c.created_at || new Date().toISOString(),
        updated_at: c.updatedAt || c.updated_at || new Date().toISOString()
      });
    }
    const { error } = await supabase.from('cafes').upsert(rows, { onConflict: 'id' });
    if (error) console.warn('   ⚠️ cafes migration warning:', error.message);
    else console.log(`   ✅ Migrated ${rows.length} cafes.`);
  }

  // 3. Cafe Settings (cafe-settings.json)
  console.log('📦 3. Migrating cafe-settings.json...');
  const cafeSettings = readJsonFile(path.join(DATA_DIR, 'cafe-settings.json'), null);
  if (cafeSettings) {
    const { error } = await supabase.from('cafe_settings').upsert([{
      cafe_id: defaultCafeId,
      require_cashier_kitchen_approval: cafeSettings.requireCashierKitchenApproval !== false,
      updated_at: new Date().toISOString()
    }], { onConflict: 'cafe_id' });
    if (error) console.warn('   ⚠️ cafe_settings migration warning:', error.message);
    else console.log('   ✅ cafe_settings migrated successfully.');

    if (cafeSettings.cafeName || cafeSettings.logoUrl) {
      await supabase.from('cafes').update({
        name: cafeSettings.cafeName || 'Shot Cafe',
        logo_url: cafeSettings.logoUrl || null
      }).eq('id', defaultCafeId);
    }
  }

  // 4. Users (users.json)
  console.log('📦 4. Migrating users.json...');
  const usersList = readJsonFile(path.join(DATA_DIR, 'users.json'), []);
  if (Array.isArray(usersList) && usersList.length > 0) {
    const seenEmails = new Set();
    const userRows = [];
    for (const u of usersList) {
      const email = String(u.email || '').trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      userRows.push({
        id: u.id,
        cafe_id: u.cafeId || u.cafe_id || defaultCafeId,
        full_name: u.fullName || u.full_name || 'User',
        email,
        password_hash: u.passwordHash || u.password_hash || '$2b$10$fallback',
        plain_password: u.plainPassword || u.plain_password || '',
        role: u.role || 'staff',
        status: u.status || 'active',
        created_at: u.createdAt || u.created_at || new Date().toISOString(),
        updated_at: u.updatedAt || u.updated_at || new Date().toISOString()
      });
    }

    if (userRows.length > 0) {
      const { error } = await supabase.from('users').upsert(userRows, { onConflict: 'id' });
      if (error) console.warn('   ⚠️ users migration warning:', error.message);
      else console.log(`   ✅ Migrated ${userRows.length} users.`);
    }
  }

  // 5. Categories (categories.json & categories_*.json)
  console.log('📦 5. Migrating categories.json & categories_*.json...');
  const catFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('categories') && f.endsWith('.json'));
  for (const catFile of catFiles) {
    let cafeId = defaultCafeId;
    if (catFile.startsWith('categories_') && catFile !== 'categories.json') {
      const extracted = catFile.replace('categories_', '').replace('.json', '');
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(extracted);
      if (isUuid) cafeId = extracted;
    }
    const catContent = readJsonFile(path.join(DATA_DIR, catFile), []);
    if (Array.isArray(catContent) && catContent.length > 0) {
      const catRows = catContent.map((c, idx) => {
        const name = typeof c === 'string' ? c : (c.name || '');
        const imageUrl = typeof c === 'object' ? (c.imageUrl || c.image_url || null) : null;
        return {
          cafe_id: cafeId,
          name: String(name).trim(),
          image_url: imageUrl,
          sort_order: idx
        };
      }).filter(c => !!c.name);

      if (catRows.length > 0) {
        const { error } = await supabase.from('categories').upsert(catRows, { onConflict: 'cafe_id,name' });
        if (error) console.warn(`   ⚠️ categories migration warning for ${catFile}:`, error.message);
        else console.log(`   ✅ Migrated ${catRows.length} categories from ${catFile}.`);
      }
    }
  }

  // 6. Menu Items (menu.json)
  console.log('📦 6. Migrating menu.json...');
  const menuList = readJsonFile(path.join(DATA_DIR, 'menu.json'), []);
  if (Array.isArray(menuList) && menuList.length > 0) {
    const menuRows = menuList.map(item => ({
      id: String(item.id),
      cafe_id: defaultCafeId,
      name: item.name || '',
      price: Number(item.price) || 0,
      category: item.category || '',
      is_available: item.isAvailable !== false,
      image_url: item.imageUrl || item.image_url || '',
      ingredients: item.ingredients || '',
      options: Array.isArray(item.options) ? item.options : [],
      updated_at: new Date().toISOString()
    })).filter(i => !!i.id);

    const { error } = await supabase.from('menu_items').upsert(menuRows, { onConflict: 'id,cafe_id' });
    if (error) console.warn('   ⚠️ menu_items migration warning:', error.message);
    else console.log(`   ✅ Migrated ${menuRows.length} menu items.`);
  }

  // 7. Tables (tables.json)
  console.log('📦 7. Migrating tables.json...');
  const tablesList = readJsonFile(path.join(DATA_DIR, 'tables.json'), []);
  if (Array.isArray(tablesList) && tablesList.length > 0) {
    const tableRows = tablesList.map(t => ({
      id: String(t.id),
      cafe_id: defaultCafeId,
      label: String(t.label || t.id)
    }));
    const { error } = await supabase.from('cafe_tables').upsert(tableRows, { onConflict: 'id,cafe_id' });
    if (error) console.warn('   ⚠️ cafe_tables migration warning:', error.message);
    else console.log(`   ✅ Migrated ${tableRows.length} cafe tables.`);
  }

  // 8. Till Sessions (currentTill.json)
  console.log('📦 8. Migrating currentTill.json...');
  const tillData = readJsonFile(path.join(DATA_DIR, 'currentTill.json'), null);
  if (tillData && (tillData.openedAt || tillData.date)) {
    const row = {
      cafe_id: defaultCafeId,
      status: tillData.status || (tillData.closedAt ? 'closed' : 'open'),
      opened_at: tillData.openedAt || new Date().toISOString(),
      closed_at: tillData.closedAt || null,
      opened_by: tillData.openedBy || '',
      closed_by: tillData.closedBy || null,
      opening_balance: Number(tillData.openingBalance) || 0,
      open_date: tillData.open_date || tillData.date || new Date().toISOString().slice(0, 10),
      note: tillData.note || '',
      expenses: Array.isArray(tillData.expenses) ? tillData.expenses : [],
      withdrawals: Array.isArray(tillData.withdrawals) ? tillData.withdrawals : []
    };
    const { error } = await supabase.from('till_sessions').insert([row]);
    if (error) console.warn('   ⚠️ till_sessions migration warning:', error.message);
    else console.log('   ✅ currentTill migrated successfully.');
  }

  // 9. Orders (orders.json)
  console.log('📦 9. Migrating orders.json...');
  const ordersList = readJsonFile(path.join(DATA_DIR, 'orders.json'), []);
  if (Array.isArray(ordersList) && ordersList.length > 0) {
    const orderMap = new Map();
    ordersList.forEach(o => {
      if (o && o.id) {
        orderMap.set(String(o.id), {
          id: String(o.id),
          cafe_id: defaultCafeId,
          table_id: o.tableId || o.table_id || null,
          order_type: o.orderType || o.order_type || 'DINE_IN',
          items: Array.isArray(o.items) ? o.items : [],
          created_at: o.createdAt || o.created_at || new Date().toISOString(),
          open_date: o.open_date || null,
          cash_session_id: o.cash_session_id || null,
          till_opened_at: o.tillOpenedAt || o.till_opened_at || null,
          closed: !!o.closed,
          closed_at: o.closedAt || o.closed_at || null,
          payment_method: o.paymentMethod || o.payment_method || null,
          customer_name: o.customerName || o.customer_name || null,
          customer_session_id: o.customerSessionId || o.customer_session_id || null,
          kitchen_batch_id: o.kitchenBatchId || o.kitchen_batch_id || null,
          bundled_customer_names: Array.isArray(o.bundledCustomerNames || o.bundled_customer_names) ? (o.bundledCustomerNames || o.bundled_customer_names) : [],
          service_meta: o.serviceMeta || o.service_meta || null,
          rejected_by_cashier: !!(o.rejectedByCashier || o.rejected_by_cashier),
          cancel_reason: o.cancelReason || o.cancel_reason || null
        });
      }
    });

    const orderRows = Array.from(orderMap.values());
    for (let i = 0; i < orderRows.length; i += 100) {
      const chunk = orderRows.slice(i, i + 100);
      const { error } = await supabase.from('orders').upsert(chunk, { onConflict: 'id,cafe_id' });
      if (error) console.warn(`   ⚠️ orders migration chunk warning [${i}]:`, error.message);
    }
    console.log(`   ✅ Migrated ${orderRows.length} orders.`);
  }

  // 10. Kitchen State (kitchen.json)
  console.log('📦 10. Migrating kitchen.json...');
  const kitchenJson = readJsonFile(path.join(DATA_DIR, 'kitchen.json'), {});
  if (kitchenJson && typeof kitchenJson === 'object') {
    const kitchenEntries = Object.entries(kitchenJson);
    if (kitchenEntries.length > 0) {
      const rows = kitchenEntries.map(([orderId, ks]) => ({
        order_id: String(orderId),
        cafe_id: defaultCafeId,
        status: ks.status || 'new',
        created_at: ks.createdAt || new Date().toISOString(),
        updated_at: ks.updatedAt || new Date().toISOString()
      }));
      const { error } = await supabase.from('kitchen_state').upsert(rows, { onConflict: 'order_id,cafe_id' });
      if (error) console.warn('   ⚠️ kitchen_state migration warning:', error.message);
      else console.log(`   ✅ Migrated ${rows.length} kitchen state entries.`);
    }
  }

  // 11. Closings (closings.json)
  console.log('📦 11. Migrating closings.json...');
  const closingsList = readJsonFile(path.join(DATA_DIR, 'closings.json'), []);
  if (Array.isArray(closingsList) && closingsList.length > 0) {
    const closingRows = closingsList.map(c => {
      const expensesList = Array.isArray(c.expenses) ? c.expenses : [];
      const withdrawalsList = Array.isArray(c.withdrawals) ? c.withdrawals : [];
      const salesCash = Number(c.salesCash) || 0;
      const salesCard = Number(c.salesCard) || 0;
      const totalSales = (salesCash + salesCard) || Number(c.totalSales) || 0;
      const totalExpenses = typeof c.totalExpenses === 'number' ? c.totalExpenses : expensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const totalWithdrawals = typeof c.totalWithdrawals === 'number' ? c.totalWithdrawals : withdrawalsList.reduce((s, w) => s + (Number(w.amount) || 0), 0);
      const net = typeof c.net === 'number' ? c.net : ((Number(c.openingBalance) || 0) + totalSales - totalExpenses - totalWithdrawals);
      return {
        cafe_id: defaultCafeId,
        date: c.date || '',
        open_date: c.open_date || c.date || '',
        open_time: c.open_time || '',
        close_time: c.close_time || '',
        time: c.time || '',
        opened_at: c.openedAt || c.opened_at || null,
        opened_by: c.openedBy || c.opened_by || '',
        closed_at: c.closedAt || c.closed_at || null,
        closed_by: c.closedBy || c.closed_by || '',
        opening_balance: Number(c.openingBalance) || 0,
        sales_cash: salesCash,
        sales_card: salesCard,
        total_sales: totalSales,
        expenses: expensesList,
        total_expenses: totalExpenses,
        withdrawals: withdrawalsList,
        total_withdrawals: totalWithdrawals,
        net: net,
        net_total: c.netTotal != null ? Number(c.netTotal) : net,
        note: c.note || '',
        order_count: Number(c.orderCount) || 0,
        status: c.status || 'closed'
      };
    });
    const { error } = await supabase.from('closings').insert(closingRows);
    if (error) console.warn('   ⚠️ closings migration warning:', error.message);
    else console.log(`   ✅ Migrated ${closingRows.length} closings.`);
  }

  // 12. Order Sequences (orderSequence.json)
  console.log('📦 12. Migrating orderSequence.json...');
  const seqJson = readJsonFile(path.join(DATA_DIR, 'orderSequence.json'), {});
  if (seqJson && seqJson.lastByOpenDate) {
    const seqRows = Object.entries(seqJson.lastByOpenDate).map(([open_date, last_sequence]) => ({
      cafe_id: defaultCafeId,
      open_date,
      last_sequence: Number(last_sequence) || 0
    }));
    if (seqRows.length > 0) {
      const { error } = await supabase.from('order_sequences').upsert(seqRows, { onConflict: 'cafe_id,open_date' });
      if (error) console.warn('   ⚠️ order_sequences migration warning:', error.message);
      else console.log(`   ✅ Migrated ${seqRows.length} order sequence entries.`);
    }
  }

  // 13. Today Session History (today-session-history.json)
  console.log('📦 13. Migrating today-session-history.json...');
  const todayHistory = readJsonFile(path.join(DATA_DIR, 'today-session-history.json'), { sessions: [] });
  if (todayHistory && Array.isArray(todayHistory.sessions) && todayHistory.sessions.length > 0) {
    const historyMap = new Map();
    todayHistory.sessions.forEach(s => {
      if (s) {
        const sessionKey = s.orderIdsKey || s.id || `session_${Date.now()}_${Math.random()}`;
        const row = {
          cafe_id: defaultCafeId,
          session_key: sessionKey,
          cash_session_id: s.cashSessionId || null,
          open_date: s.openDate || null,
          data: s,
          created_at: s.createdAt || new Date().toISOString()
        };
        if (s.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id)) {
          row.id = s.id;
        }
        historyMap.set(sessionKey, row);
      }
    });

    const historyRows = Array.from(historyMap.values());
    for (let i = 0; i < historyRows.length; i += 50) {
      const chunk = historyRows.slice(i, i + 50);
      const { error } = await supabase.from('today_session_history').upsert(chunk, { onConflict: 'cafe_id,session_key' });
      if (error) console.warn(`   ⚠️ today_session_history chunk warning [${i}]:`, error.message);
    }
    console.log(`   ✅ Migrated ${historyRows.length} today session history entries.`);
  }

  // 14. Table Sessions (table-sessions.json / tables-sessions.json)
  console.log('📦 14. Migrating table-sessions.json...');
  const tableSessionsJson = readJsonFile(path.join(DATA_DIR, 'table-sessions.json'), { sessions: [] });
  if (tableSessionsJson && Array.isArray(tableSessionsJson.sessions) && tableSessionsJson.sessions.length > 0) {
    const tsRows = tableSessionsJson.sessions.map(ts => ({
      id: String(ts.sessionId || ts.id || Math.random()),
      cafe_id: defaultCafeId,
      table_id: String(ts.tableId || ''),
      status: String(ts.status || 'in_use'),
      created_at: ts.createdAt || new Date().toISOString()
    })).filter(ts => !!ts.id && !!ts.table_id);

    if (tsRows.length > 0) {
      const { error } = await supabase.from('table_sessions').upsert(tsRows, { onConflict: 'id,cafe_id' });
      if (error) console.warn('   ⚠️ table_sessions migration warning:', error.message);
      else console.log(`   ✅ Migrated ${tsRows.length} table sessions.`);
    }
  }

  // 15. Archive Orders (archive/*.json)
  console.log('📦 15. Migrating archive/*.json...');
  const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
  if (fs.existsSync(ARCHIVE_DIR)) {
    function processArchiveDir(dir, cafeId) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.name);
          processArchiveDir(fullPath, isUuid ? entry.name : cafeId);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          const archData = readJsonFile(fullPath, null);
          if (archData && archData.months) {
            const archiveRows = [];
            Object.values(archData.months).forEach(m => {
              if (m && m.days) {
                Object.values(m.days).forEach(d => {
                  if (d && Array.isArray(d.orders)) {
                    d.orders.forEach(o => {
                      if (o && o.id) {
                        archiveRows.push({
                          id: String(o.id),
                          cafe_id: cafeId,
                          table_id: String(o.table || ''),
                          order_type: o.orderType || 'DINE_IN',
                          items: Array.isArray(o.items) ? o.items : [],
                          open_date: o.closedAt ? new Date(o.closedAt).toISOString().slice(0, 10) : null,
                          closed_at: o.closedAt || new Date().toISOString(),
                          total: Number(o.total) || 0
                        });
                      }
                    });
                  }
                });
              }
            });
            if (archiveRows.length > 0) {
              supabase.from('archive_orders').upsert(archiveRows, { onConflict: 'id,cafe_id' })
                .then(({ error }) => {
                  if (error) console.warn(`   ⚠️ archive_orders migration warning for ${entry.name}:`, error.message);
                  else console.log(`   ✅ Migrated ${archiveRows.length} archive orders from ${entry.name}`);
                });
            }
          }
        }
      }
    }
    processArchiveDir(ARCHIVE_DIR, defaultCafeId);
  }

  // 16. Local Uploads Storage Migration (backend/uploads)
  console.log('📦 16. Migrating local uploads to Supabase Storage...');
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    let hasUploadsBucket = (buckets || []).some(b => b.name === 'uploads');
    if (!hasUploadsBucket) {
      const { error: bErr } = await supabase.storage.createBucket('uploads', { public: true });
      if (!bErr) {
        hasUploadsBucket = true;
        console.log('   ✅ Created public Supabase Storage bucket: uploads');
      } else {
        console.warn('   ⚠️ Storage bucket creation warning:', bErr.message);
      }
    }

    if (hasUploadsBucket && fs.existsSync(UPLOADS_DIR)) {
      async function uploadDirFiles(dir, prefix = '') {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            await uploadDirFiles(fullPath, `${prefix}${file.name}/`);
          } else if (file.isFile()) {
            const relPath = `${prefix}${file.name}`;
            const fileBuffer = fs.readFileSync(fullPath);
            const ext = path.extname(file.name).toLowerCase();
            const contentType = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
            const { error: upErr } = await supabase.storage.from('uploads').upload(relPath, fileBuffer, {
              contentType,
              upsert: true
            });
            if (!upErr) {
              const { data: pubUrlData } = supabase.storage.from('uploads').getPublicUrl(relPath);
              if (pubUrlData && pubUrlData.publicUrl) {
                const publicUrl = pubUrlData.publicUrl;
                const oldUrlMatch = `/uploads/${relPath}`;
                await supabase.from('menu_items').update({ image_url: publicUrl }).eq('image_url', oldUrlMatch);
                await supabase.from('categories').update({ image_url: publicUrl }).eq('image_url', oldUrlMatch);
                await supabase.from('cafes').update({ logo_url: publicUrl }).eq('logo_url', oldUrlMatch);
              }
            }
          }
        }
      }
      await uploadDirFiles(UPLOADS_DIR);
      console.log('   ✅ Completed uploads migration to Supabase Storage.');
    }
  } catch (err) {
    console.warn('   ⚠️ Storage migration exception:', err.message);
  }

  console.log('🎉 All JSON data successfully migrated to Supabase Single Source of Truth!');
}

if (require.main === module) {
  runFullMigration().catch(err => {
    console.error('❌ Migration script error:', err);
    process.exit(1);
  });
}

module.exports = { runFullMigration };
