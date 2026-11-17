// FitTrack API: accounts, friends, step sync and leaderboard.
const crypto = require('node:crypto');
const express = require('express');
const { registerAccountRoutes } = require('./accounts');

// No 0/O or 1/I/L, so codes are easy to read out to a friend.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STEPS_PER_DAY = 150000;
const MAX_FRIENDS = 100;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function randomCode(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

function cleanName(name) {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length >= 1 && n.length <= 30 ? n : null;
}

function isValidDay(day) {
  if (!DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

// Monday to `day` (inclusive) of the week containing `day`
function thisWeekDays(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return daysEnding(day, sinceMonday + 1);
}

// Backup codes: 12 characters shown as XXXX-XXXX-XXXX. Dashes, spaces and case are ignored.
function newBackupCode() {
  const raw = randomCode(12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}
const normalizeBackupCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Small in-memory limiter so nobody can guess backup codes by trying millions of them.
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let h = hits.get(key);
    if (!h || h.resetAt < now) h = { count: 0, resetAt: now + windowMs };
    h.count++;
    hits.set(key, h);
    if (hits.size > 10000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    if (h.count > max) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    next();
  };
}

// The 'n' days ending on `day` (inclusive), oldest first
function daysEnding(day, n) {
  const end = new Date(`${day}T00:00:00Z`);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

function createApp(db, { recoverLimit = 10, loginLimit = 10, signupLimit = 20 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy (Caddy, a load balancer), set TRUST_PROXY=1 so rate limits see real client IPs
  if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
  // Small bodies everywhere except progress sync, which can include activity routes
  const smallJson = express.json({ limit: '20kb' });
  const bigJson = express.json({ limit: '3mb' });
  app.use((req, res, next) => (req.path === '/api/sync' ? bigJson : smallJson)(req, res, next));

  // Allow the web version of the app (a different port) to call the API.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const q = {
    userBySession: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'),
    userByToken: db.prepare('SELECT * FROM users WHERE token_hash = ?'),
    userByRecovery: db.prepare('SELECT id, name, friend_code FROM users WHERE recovery_hash = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    setRecovery: db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?'),
    setToken: db.prepare('UPDATE users SET token_hash = ? WHERE id = ?'),
    userByCode: db.prepare('SELECT id, name FROM users WHERE friend_code = ?'),
    codeExists: db.prepare('SELECT 1 FROM users WHERE friend_code = ?'),
    insertUser: db.prepare('INSERT INTO users (name, friend_code, token_hash) VALUES (?, ?, ?)'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    upsertSteps: db.prepare(`
      INSERT INTO steps (user_id, day, steps) VALUES (?, ?, ?)
      ON CONFLICT (user_id, day) DO UPDATE SET steps = excluded.steps`),
    addFriend: db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)'),
    removeFriend: db.prepare(
      'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'
    ),
    isFriend: db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?'),
    friendCount: db.prepare('SELECT COUNT(*) AS n FROM friends WHERE user_id = ?'),
    friendIds: db.prepare('SELECT friend_id FROM friends WHERE user_id = ?'),
  };

  // Every route except sign-up needs "Authorization: Bearer <token>".
  // Finds the user for "Authorization: Bearer <token>": a login session, or the single
  // token profiles had before accounts existed.
  function userFromRequest(req) {
    const m = /^Bearer (\S+)$/.exec(req.get('authorization') || '');
    if (!m) return null;
    const tokenHash = sha256(m[1]);
    const user = q.userBySession.get(tokenHash) || q.userByToken.get(tokenHash);
    return user ? { user, tokenHash } : null;
  }

  function auth(req, res, next) {
    const found = userFromRequest(req);
    if (!found) return res.status(401).json({ error: 'Not signed in' });
    req.user = found.user;
    req.tokenHash = found.tokenHash;
    next();
  }

  const publicUser = (u) => ({
    id: u.id,
    name: u.name,
    friendCode: u.friend_code,
    hasBackupCode: !!u.recovery_hash,
    email: u.email || null,
    age: u.age ?? null,
    sex: u.sex || null,
    heightCm: u.height_cm ?? null,
    weightKg: u.weight_kg ?? null,
    marketingOptIn: !!u.marketing_opt_in,
  });
  const newToken = () => crypto.randomBytes(32).toString('base64url');

  app.get('/health', (req, res) => res.json({ ok: true }));

  // Create an account. Returns a secret token the phone keeps; there's no password.
  app.post('/api/users', (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Name must be 1–30 characters' });
    let code;
    do code = randomCode(); while (q.codeExists.get(code));
    const token = newToken();
    const { lastInsertRowid } = q.insertUser.run(name, code, sha256(token));
    res.status(201).json({ user: { id: Number(lastInsertRowid), name, friendCode: code, hasBackupCode: false }, token });
  });

  // Create (or replace) the backup code. It's shown once; only its hash is stored.
  app.post('/api/me/backup-code', auth, (req, res) => {
    const backupCode = newBackupCode();
    q.setRecovery.run(sha256(normalizeBackupCode(backupCode)), req.user.id);
    res.status(201).json({ backupCode });
  });

  // Restore a profile on a new phone. Gives this phone a new token, which signs the old phone out.
  app.post('/api/recover', rateLimiter(recoverLimit, 15 * 60 * 1000), (req, res) => {
    const code = normalizeBackupCode(req.body?.code);
    const user = code.length === 12 && q.userByRecovery.get(sha256(code));
    if (!user) return res.status(404).json({ error: "That backup code doesn't match any profile" });
    // Sign out every other phone, then sign this one in
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    const token = newToken();
    q.setToken.run(sha256(token), user.id);
    res.json({ user: publicUser(q.userById.get(user.id)), token });
  });

  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

  registerAccountRoutes(app, db, {
    auth,
    userFromRequest,
    publicUser,
    randomCode,
    normalizeBackupCode,
    rateLimiter,
    limits: { signup: signupLimit, login: loginLimit, reset: recoverLimit },
  });

  app.delete('/api/me', auth, (req, res) => {
    q.deleteUser.run(req.user.id);
    res.sendStatus(204);
  });

  // Upload step totals: { days: { "2026-11-17": 4500, ... } } (up to 31 days at once)
  app.put('/api/steps', auth, (req, res) => {
    const days = req.body?.days;
    if (!days || typeof days !== 'object' || Array.isArray(days)) {
      return res.status(400).json({ error: 'Expected { days: { "YYYY-MM-DD": steps } }' });
    }
    const entries = Object.entries(days);
    if (entries.length > 31) return res.status(400).json({ error: 'Too many days at once (max 31)' });
    for (const [day, steps] of entries) {
      if (!isValidDay(day)) return res.status(400).json({ error: `Bad date: ${day}` });
      if (!Number.isInteger(steps) || steps < 0 || steps > MAX_STEPS_PER_DAY) {
        return res.status(400).json({ error: `Bad step count for ${day}` });
      }
    }
    for (const [day, steps] of entries) q.upsertSteps.run(req.user.id, day, steps);
    res.json({ saved: entries.length });
  });

  // Add a friend by their code. Friendship is mutual straight away.
  app.post('/api/friends', auth, (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const friend = q.userByCode.get(code);
    if (!friend) return res.status(404).json({ error: 'No one has that friend code' });
    if (friend.id === req.user.id) return res.status(400).json({ error: "That's your own code" });
    if (q.isFriend.get(req.user.id, friend.id)) {
      return res.status(409).json({ error: `${friend.name} is already your friend` });
    }
    if (q.friendCount.get(req.user.id).n >= MAX_FRIENDS) {
      return res.status(400).json({ error: `You can have up to ${MAX_FRIENDS} friends` });
    }
    q.addFriend.run(req.user.id, friend.id);
    q.addFriend.run(friend.id, req.user.id);
    res.status(201).json({ friend: { id: friend.id, name: friend.name } });
  });

  app.delete('/api/friends/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    q.removeFriend.run(req.user.id, id, id, req.user.id);
    res.sendStatus(204);
  });

  // Leaderboard for you + your friends.
  // ?period=today|week  &day=YYYY-MM-DD (the phone's "today", since time zones differ)
  app.get('/api/leaderboard', auth, (req, res) => {
    const period = ['week', 'thisweek'].includes(req.query.period) ? req.query.period : 'today';
    const day = String(req.query.day || new Date().toISOString().slice(0, 10));
    if (!isValidDay(day)) return res.status(400).json({ error: 'Bad day' });
    const days = period === 'week' ? daysEnding(day, 7) : period === 'thisweek' ? thisWeekDays(day) : [day];

    const ids = [req.user.id, ...q.friendIds.all(req.user.id).map((r) => r.friend_id)];
    const idMarks = ids.map(() => '?').join(',');
    const dayMarks = days.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT u.id, u.name, COALESCE(SUM(s.steps), 0) AS steps
         FROM users u
         LEFT JOIN steps s ON s.user_id = u.id AND s.day IN (${dayMarks})
         WHERE u.id IN (${idMarks})
         GROUP BY u.id
         ORDER BY steps DESC, u.name COLLATE NOCASE ASC`
      )
      .all(...days, ...ids);

    // Equal step counts share a rank (1, 2, 2, 4 ...)
    let lastSteps = null;
    let lastRank = 0;
    const entries = rows.map((r, i) => {
      const steps = Number(r.steps);
      const rank = steps === lastSteps ? lastRank : i + 1;
      lastSteps = steps;
      lastRank = rank;
      return { rank, id: r.id, name: r.name, steps, isMe: r.id === req.user.id };
    });

    res.json({
      period,
      from: days[0],
      to: days[days.length - 1],
      groupTotal: entries.reduce((sum, e) => sum + e.steps, 0),
      entries,
    });
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // Bad JSON and other errors
  app.use((err, req, res, next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Server error' : 'Bad request' });
  });

  return app;
}

module.exports = { createApp, daysEnding, thisWeekDays, isValidDay };
