/**
 * Supabase client — single instance for the backend.
 * Uses the service role key to bypass Row Level Security.
 * Never cache the result of getClient() across requests; tokens may rotate.
 */
const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getClient() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const urlTrimmed = url ? url.trim() : '';
  const keyTrimmed = key ? key.trim() : '';

  if (!urlTrimmed || !keyTrimmed) {
    throw new Error(
      '[supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.'
    );
  }

  // Validate URL format
  try {
    new URL(urlTrimmed);
  } catch (e) {
    throw new Error(`[supabase] SUPABASE_URL is not a valid URL: ${e.message}`);
  }

  _client = createClient(urlTrimmed, keyTrimmed, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _client;
}

/** Reset the cached client (useful for testing). */
function resetClient() {
  _client = null;
}

module.exports = { getClient, resetClient };
