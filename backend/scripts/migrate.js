#!/usr/bin/env node
/**
 * Database migration runner — Phase 1
 * Tries multiple connection strategies for Supabase PostgreSQL.
 * Usage: node backend/scripts/migrate.js
 */
'use strict';

require('../lib/env');

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_FILE = path.join(__dirname, '..', 'migrations', '001_initial_schema.sql');

/**
 * Supabase supports multiple connection formats:
 * 1. Direct:      postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
 * 2. Pooler (tx): postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 * 3. Pooler (se): postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
 *
 * The user MUST be 'postgres.[ref]' for pooler connections (not just 'postgres').
 * This script tries to auto-detect the format and fix user if needed.
 */
function buildConnectionVariants(connString) {
  const variants = [];
  if (!connString) return variants;

  // Always add the original first
  variants.push({ label: 'original', connString, ssl: { rejectUnauthorized: false } });

  try {
    const u = new URL(connString);
    const user = u.username;
    const host = u.hostname;
    const port = u.port;
    const password = u.password;
    const db = u.pathname.replace(/^\//, '') || 'postgres';

    // If user is just 'postgres' and host contains 'pooler.supabase.com'
    // try adding project ref to user
    if (user === 'postgres' && host.includes('pooler.supabase.com')) {
      // Extract project ref from SUPABASE_URL if available
      const apiUrl = (process.env.SUPABASE_URL || '').trim();
      const refMatch = apiUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
      if (refMatch) {
        const ref = refMatch[1];
        const fixedUser = `postgres.${ref}`;
        const fixedUrl = `postgresql://${fixedUser}:${password}@${host}:${port}/${db}`;
        variants.push({ label: `pooler-user-${fixedUser}`, connString: fixedUrl, ssl: { rejectUnauthorized: false } });
      }
    }

    // Also try with ssl: true (different behavior)
    variants.push({ label: 'original-ssl-true', connString, ssl: true });
    variants.push({ label: 'original-no-ssl', connString, ssl: false });

    // If host is the pooler host, try direct connection
    if (host.includes('pooler.supabase.com')) {
      const apiUrl = (process.env.SUPABASE_URL || '').trim();
      const refMatch = apiUrl.match(/https?:\/\/([^.]+)\.supabase\.co/);
      if (refMatch) {
        const ref = refMatch[1];
        const directHost = `db.${ref}.supabase.co`;
        const directUrl = `postgresql://postgres:${password}@${directHost}:5432/${db}`;
        variants.push({ label: `direct-${directHost}`, connString: directUrl, ssl: { rejectUnauthorized: false } });
      }
    }
  } catch (_) {}

  return variants;
}

async function tryConnect(variant) {
  const client = new Client({ connectionString: variant.connString, ssl: variant.ssl });
  try {
    await client.connect();
    return client;
  } catch (err) {
    try { await client.end(); } catch (_) {}
    throw err;
  }
}

async function run() {
  const connString = (process.env.SUPABASE_DB_URL || '').trim();
  if (!connString) {
    console.error('❌  SUPABASE_DB_URL is not set.');
    process.exit(1);
  }

  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const variants = buildConnectionVariants(connString);

  let client = null;
  let lastError = null;

  for (const variant of variants) {
    try {
      console.log(`🔌  Trying connection: ${variant.label}…`);
      client = await tryConnect(variant);
      console.log(`✅  Connected via: ${variant.label}`);
      break;
    } catch (err) {
      console.warn(`    ↳ Failed: ${err.message}`);
      lastError = err;
    }
  }

  if (!client) {
    console.error('\n❌  All connection strategies failed.');
    console.error('   Last error:', lastError && lastError.message);
    console.error('\n📋  Please run the migration manually in the Supabase SQL Editor:');
    console.error('   1. Open https://app.supabase.com and select your project');
    console.error('   2. Go to SQL Editor');
    console.error(`   3. Paste the contents of: ${SQL_FILE}`);
    console.error('   4. Click "Run"\n');
    process.exit(1);
  }

  try {
    console.log('📦  Running migration: 001_initial_schema.sql…');
    await client.query(sql);
    const sql2File = path.join(__dirname, '..', 'migrations', '002_complete_supabase_migration.sql');
    if (fs.existsSync(sql2File)) {
      console.log('📦  Running migration: 002_complete_supabase_migration.sql…');
      const sql2 = fs.readFileSync(sql2File, 'utf8');
      await client.query(sql2);
    }
    console.log('✅  Migration complete — all tables created.');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    try { await client.end(); } catch (_) {}
  }
}

run();
