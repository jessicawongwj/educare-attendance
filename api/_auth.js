const { sql } = require('./_db');

const tokenCache = new Map();

const ADMIN_EMAILS = new Set([
  'jessica.wong@niet.edu.au',
  'shuang.wu@niet.edu.au',
  'nicole@charltonbrown.edu.au',
  'jason.yang@niet.edu.au',
  'maria.a.b@educare.edu.au',
]);

// DB-backed admin cache (refreshed every 5 min)
let dbAdminCache = new Set();
let dbAdminCacheExpiry = 0;

async function ensureAdminCache(pool) {
  const now = Date.now();
  if (now < dbAdminCacheExpiry) return;
  try {
    const result = await pool.request()
      .input('k', sql.VarChar(100), 'admin_emails')
      .query('SELECT value FROM app_settings WHERE [key] = @k');
    if (result.recordset.length) {
      const parsed = JSON.parse(result.recordset[0].value);
      dbAdminCache = new Set(Array.isArray(parsed) ? parsed.map(e => e.toLowerCase()) : []);
    } else {
      dbAdminCache = new Set();
    }
    dbAdminCacheExpiry = now + 5 * 60 * 1000;
  } catch (e) {
    console.error('ensureAdminCache error:', e.message);
  }
}

async function validateToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const now = Date.now();

  if (tokenCache.has(token)) {
    const c = tokenCache.get(token);
    if (now < c.expiry) return c.user;
    tokenCache.delete(token);
  }

  try {
    const r = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    if (tokenCache.size > 500) {
      for (const [k, v] of tokenCache) if (now > v.expiry) tokenCache.delete(k);
    }
    tokenCache.set(token, { user, expiry: now + 55000 });
    return user;
  } catch { return null; }
}

function isAdminUser(email) {
  const e = (email || '').toLowerCase();
  return ADMIN_EMAILS.has(e) || dbAdminCache.has(e);
}

module.exports = { validateToken, isAdminUser, ensureAdminCache };
