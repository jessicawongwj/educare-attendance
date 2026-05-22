const tokenCache = new Map();

const ADMIN_EMAILS = new Set([
  'jessica.wong@niet.edu.au',
  'shuang.wu@niet.edu.au',
  'nicole@charltonbrown.edu.au',
  'jason.yang@niet.edu.au',
  'maria.a.b@educare.edu.au',
]);

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
  return ADMIN_EMAILS.has((email || '').toLowerCase());
}

module.exports = { validateToken, isAdminUser };
