/**
 * Cafe context — manages the single "default café" for Phase 1.
 * In Phase 2+, cafe_id will come from the authenticated user's JWT.
 *
 * On startup:
 *   1. Look for an existing row in the `cafes` table.
 *   2. If none exists, create one seeded from cafe-settings.json.
 *   3. Cache the UUID for the rest of the process lifetime.
 */
require('./env');
const fs = require('fs');
const path = require('path');

let _defaultCafeId = null;

async function autoMigrateDatabase() {
  const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) {
    console.log('  [cafeContext] No SUPABASE_DB_URL found, skipping auto-migration.');
    return;
  }
  
  const { Client } = require('pg');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('  [cafeContext] Connecting to database to verify tables/columns...');
    await client.connect();
    
    // Create users table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id       UUID        REFERENCES cafes(id) ON DELETE CASCADE,
        full_name     TEXT        NOT NULL,
        email         TEXT        UNIQUE NOT NULL,
        password_hash TEXT        NOT NULL,
        role          TEXT        NOT NULL,
        status        TEXT        NOT NULL DEFAULT 'active',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS users_cafe_id_idx ON users(cafe_id);
    `);
    
    // Add columns to cafes table
    await client.query(`
      ALTER TABLE cafes ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE cafes ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE cafes ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active';
    `);
    
    console.log('  [cafeContext] Database schema check & auto-migration succeeded.');
  } catch (err) {
    console.error('  [cafeContext] Database auto-migration error:', err.message);
  } finally {
    try {
      await client.end();
    } catch (_) {}
  }
}

async function initCafeContext() {
  await autoMigrateDatabase();

  const { getClient } = require('./supabase');
  const supabase = getClient();

  // Diagnostic logging (no secrets exposed)
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  console.log(`  [cafeContext] SUPABASE_URL length: ${supabaseUrl.length}, starts: ${supabaseUrl.slice(0, 8)}`);
  try { new URL(supabaseUrl); console.log('  [cafeContext] URL format: valid'); }
  catch (e) { console.log('  [cafeContext] URL format: INVALID -', e.message); }

  // ── 1. Try to find an existing café ──────────────────────────────────────
  let cafes, selectError;
  try {
    const result = await supabase.from('cafes').select('id, name').limit(1);
    cafes = result.data;
    selectError = result.error;
  } catch (fetchErr) {
    throw new Error(`[cafeContext] Fetch error querying cafes table: ${fetchErr.message} (code: ${fetchErr.code || 'none'})`);
  }

  if (selectError) {
    const code = selectError.code || 'none';
    // PGRST125 / 404 = table doesn't exist (migration hasn't run)
    if (code === 'PGRST125' || code === '42P01' || selectError.message.includes('does not exist') || selectError.message.includes('Invalid path')) {
      const sqlFile = require('path').join(__dirname, '..', 'migrations', '001_initial_schema.sql');
      console.error('\n  ╔══════════════════════════════════════════════════════════════╗');
      console.error('  ║  DATABASE MIGRATION REQUIRED                                 ║');
      console.error('  ║  The Supabase tables have not been created yet.              ║');
      console.error('  ╠══════════════════════════════════════════════════════════════╣');
      console.error('  ║  Please run the migration:                                   ║');
      console.error('  ║  1. Go to https://app.supabase.com → SQL Editor              ║');
      console.error(`  ║  2. Paste the file: ${sqlFile.slice(-50).padEnd(41)} ║`);
      console.error('  ║  3. Click RUN — then restart the server                      ║');
      console.error('  ╚══════════════════════════════════════════════════════════════╝\n');
      console.error('  Alternatively: node backend/scripts/migrate.js\n');
    }
    throw new Error(`[cafeContext] Failed to query cafes table: ${selectError.message} (code: ${code})`);
  }

  if (cafes && cafes.length > 0) {
    _defaultCafeId = cafes[0].id;
    console.log(`  [café] ${cafes[0].name} (${_defaultCafeId})`);
    return _defaultCafeId;
  }

  // ── 2. No café yet — seed from local settings file ───────────────────────
  let name = 'My Cafe';
  let logoUrl = null;
  let requireCashierKitchenApproval = true;

  try {
    const settingsPath = path.join(__dirname, '..', 'data', 'cafe-settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (raw.cafeName) name = String(raw.cafeName).trim();
      if (raw.logoUrl) logoUrl = String(raw.logoUrl).trim() || null;
      if (raw.requireCashierKitchenApproval !== undefined) {
        requireCashierKitchenApproval = !!raw.requireCashierKitchenApproval;
      }
    }
  } catch (_) {}

  // ── 3. Insert café + settings ─────────────────────────────────────────────
  const { data: newCafe, error: insertError } = await supabase
    .from('cafes')
    .insert({ name, logo_url: logoUrl })
    .select()
    .single();

  if (insertError) {
    throw new Error(`[cafeContext] Failed to create café: ${insertError.message}`);
  }

  _defaultCafeId = newCafe.id;

  await supabase.from('cafe_settings').upsert(
    {
      cafe_id: _defaultCafeId,
      require_cashier_kitchen_approval: requireCashierKitchenApproval,
    },
    { onConflict: 'cafe_id' }
  );

  console.log(`  [café] Created "${name}" (${_defaultCafeId})`);
  return _defaultCafeId;
}

/** Returns the cached café UUID. Throws if initCafeContext() was never called. */
function getDefaultCafeId() {
  return _defaultCafeId || '565c3b73-73be-45e1-9d38-92bc4a43db03';
}

module.exports = { initCafeContext, getDefaultCafeId };
