// scripts/ping.js
// Single-run keep-alive ping for Supabase (designed for CI / GitHub Actions)
// Exits 0 on success or failure to avoid failing scheduled workflows.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const VERBOSE = (process.env.VERBOSE || 'false').toLowerCase() === 'true';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables. Exiting gracefully.');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { headers: { 'X-Keep-Alive': 'true' } },
});

async function tryRpc() {
  try {
    // Many projects expose simple RPC like "select_now"; this is optional and will usually fail.
    const { data, error } = await supabase.rpc('select_now');
    if (!error) {
      console.log('RPC ping successful:', data);
      return true;
    }
    if (VERBOSE) console.log('RPC ping not available or failed:', error.message || error);
  } catch (e) {
    if (VERBOSE) console.log('RPC ping error:', e.message || e);
  }
  return false;
}

async function tryTableProbe() {
  // Common public tables to probe; adjust for your project if you know a safe public table
  const candidates = [
    'auth.users',      // may require special access
    'storage.objects', // public buckets might be accessible
    'profiles',
    'users',
    'posts',
    'messages',
  ];

  for (const tbl of candidates) {
    try {
      // Use head:true to avoid transferring row data; limit ensures minimal cost
      const { error, status } = await supabase
        .from(tbl)
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (!error) {
        console.log(`Table probe successful: ${tbl} (status ${status})`);
        return true;
      }
      if (VERBOSE) console.log(`Table probe failed for ${tbl}:`, error.message || error);
    } catch (e) {
      if (VERBOSE) console.log(`Table probe exception for ${tbl}:`, e.message || e);
    }
  }
  return false;
}

async function tryAuth() {
  try {
    // Try an auth endpoint (safe). This will succeed if anon key is valid.
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      console.log('Auth endpoint ping successful (getSession).');
      return true;
    }
    if (VERBOSE) console.log('Auth ping failed:', error.message || error);
  } catch (e) {
    if (VERBOSE) console.log('Auth ping exception:', e.message || e);
  }
  return false;
}

(async function main() {
  console.log(`[ping.js] Starting single-run ping to ${SUPABASE_URL}`);

  // Try RPC -> Table probe -> Auth
  if (await tryRpc()) {
    console.log('[ping.js] Ping via RPC succeeded.');
    process.exit(0);
  }

  if (await tryTableProbe()) {
    console.log('[ping.js] Ping via table probe succeeded.');
    process.exit(0);
  }

  if (await tryAuth()) {
    console.log('[ping.js] Ping via auth endpoint succeeded.');
    process.exit(0);
  }

  console.log('[ping.js] No ping method returned a definitive success, but requests were attempted. Exiting without failure.');
  process.exit(0);
})();
