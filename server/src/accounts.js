// Accounts: sign up / log in with email + password, profile details, marketing consent,
// password reset with a backup code, and syncing the user's progress between phones.
const crypto = require('node:crypto');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

// Passwords are hashed with scrypt and a random salt. Stored as "scrypt$salt$hash".
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function checkPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// A fixed hash to compare against when the email doesn't exist, so "no such email" and
// "wrong password" take the same time and can't be told apart.
const DUMMY_HASH = hashPassword('not-a-real-password');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

// Validates the profile fields that were sent. Returns { values } or { error }.
// `required` lists fields that must be present (used by sign-up).
function readProfile(body, required = []) {
  const v = {};
  const err = (error) => ({ error });
  const has = (k) => body[k] !== undefined && body[k] !== null && body[k] !== '';
  for (const k of required) if (!has(k)) return err(`Please fill in ${LABELS[k] || k}`);

  if (has('name')) {
    const n = String(body.name).trim().replace(/\s+/g, ' ');
    if (n.length < 1 || n.length > 30) return err('Name must be 1–30 characters');
    v.name = n;
  }
  if (has('age')) {
    const a = Number(body.age);
    // 13 is the usual minimum age for an online account and for marketing consent
    if (!Number.isInteger(a) || a < 13 || a > 120) return err('Age must be a whole number from 13 to 120');
    v.age = a;
  }
  if (has('sex')) {
    if (!['male', 'female'].includes(body.sex)) return err('Sex must be male or female');
    v.sex = body.sex;
  }
  if (has('heightCm')) {
    const h = Number(body.heightCm);
    if (!(h >= 100 && h <= 250)) return err('Height must be between 100 and 250 cm');
    v.height_cm = Math.round(h * 10) / 10;
  }
  if (has('weightKg')) {
    const w = Number(body.weightKg);
    if (!(w >= 20 && w <= 400)) return err('Weight must be between 20 and 400 kg');
    v.weight_kg = Math.round(w * 10) / 10;
  }
  if (body.marketingOptIn !== undefined) v.marketing_opt_in = body.marketingOptIn === true ? 1 : 0;
  return { values: v };
}
const LABELS = { name: 'your name', email: 'your email', password: 'a password', age: 'your age', sex: 'your sex', heightCm: 'your height', weightKg: 'your weight' };

function checkNewPassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 200) return 'Password is too long';
  return null;
}

const MAX_SYNC_BYTES = 3 * 1024 * 1024;

function registerAccountRoutes(app, db, { auth, userFromRequest, publicUser, randomCode, normalizeBackupCode, rateLimiter, limits }) {
  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    codeExists: db.prepare('SELECT 1 FROM users WHERE friend_code = ?'),
    insertUser: db.prepare(`
      INSERT INTO users (name, friend_code, token_hash, email, password_hash, age, sex, height_cm, weight_kg,
                         marketing_opt_in, marketing_opt_in_at)
      VALUES (@name, @friend_code, @token_hash, @email, @password_hash, @age, @sex, @height_cm, @weight_kg,
              @marketing_opt_in, @marketing_opt_in_at)`),
    upgradeUser: db.prepare(`
      UPDATE users SET name = @name, email = @email, password_hash = @password_hash, age = @age, sex = @sex,
        height_cm = @height_cm, weight_kg = @weight_kg, marketing_opt_in = @marketing_opt_in,
        marketing_opt_in_at = @marketing_opt_in_at
      WHERE id = @id`),
    addSession: db.prepare('INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteAllSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    // the token from before sessions existed; replaced with junk to sign that phone out
    resetLegacyToken: db.prepare('UPDATE users SET token_hash = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    getData: db.prepare('SELECT data, updated_at FROM user_data WHERE user_id = ?'),
    putData: db.prepare(`
      INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  };

  function startSession(userId) {
    const token = newToken();
    q.addSession.run(sha256(token), userId);
    return token;
  }

  // Optional auth: used by sign-up to upgrade an existing leaderboard profile (keeps friends)
  const currentUser = (req) => userFromRequest(req)?.user || null;

  const signupLimiter = rateLimiter(limits.signup, 15 * 60 * 1000);
  const loginLimiter = rateLimiter(limits.login, 15 * 60 * 1000);
  const resetLimiter = rateLimiter(limits.reset, 15 * 60 * 1000);

  app.post('/api/auth/signup', signupLimiter, (req, res) => {
    const body = req.body || {};
    const email = cleanEmail(body.email);
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address' });
    const pwErr = checkNewPassword(body.password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const { values, error } = readProfile(body, ['name', 'age', 'sex', 'heightCm', 'weightKg']);
    if (error) return res.status(400).json({ error });
    if (q.userByEmail.get(email)) {
      return res.status(409).json({ error: 'An account with this email already exists. Log in instead.' });
    }

    const row = {
      ...values,
      email,
      password_hash: hashPassword(body.password),
      marketing_opt_in: values.marketing_opt_in || 0,
      marketing_opt_in_at: values.marketing_opt_in ? new Date().toISOString() : null,
    };

    // Upgrade the phone's existing leaderboard profile if it has one (and no email yet)
    const existing = currentUser(req);
    let userId;
    if (existing && !existing.email) {
      q.upgradeUser.run({ ...row, id: existing.id });
      userId = existing.id;
    } else {
      let code;
      do code = randomCode(); while (q.codeExists.get(code));
      // token_hash is required by the old schema; fill it with an unusable random value
      const { lastInsertRowid } = q.insertUser.run({ ...row, friend_code: code, token_hash: sha256(newToken()) });
      userId = Number(lastInsertRowid);
    }
    const token = startSession(userId);
    res.status(201).json({ user: publicUser(q.userById.get(userId)), token, upgraded: !!(existing && !existing.email) });
  });

  app.post('/api/auth/login', loginLimiter, (req, res) => {
    const email = cleanEmail(req.body?.email);
    const user = email && q.userByEmail.get(email);
    const ok = checkPassword(String(req.body?.password || ''), user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Wrong email or password' });
    const token = startSession(user.id);
    res.json({ user: publicUser(user), token });
  });

  app.post('/api/auth/logout', auth, (req, res) => {
    q.deleteSession.run(req.tokenHash);
    res.sendStatus(204);
  });

  // Forgot password: prove it's you with your backup code, then choose a new password.
  // Signs out every other phone.
  app.post('/api/auth/reset', resetLimiter, (req, res) => {
    const email = cleanEmail(req.body?.email);
    const user = email && q.userByEmail.get(email);
    const code = normalizeBackupCode(req.body?.backupCode);
    if (!user || !user.recovery_hash || code.length !== 12 || sha256(code) !== user.recovery_hash) {
      return res.status(401).json({ error: "That email and backup code don't match" });
    }
    const pwErr = checkNewPassword(req.body?.newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });
    q.setPassword.run(hashPassword(req.body.newPassword), user.id);
    q.deleteAllSessions.run(user.id);
    q.resetLegacyToken.run(sha256(newToken()), user.id);
    const token = startSession(user.id);
    res.json({ user: publicUser(q.userById.get(user.id)), token });
  });

  // Update profile details and email preferences (only the fields sent)
  app.patch('/api/me', auth, (req, res) => {
    const { values, error } = readProfile(req.body || {});
    if (error) return res.status(400).json({ error });
    if (!Object.keys(values).length) return res.status(400).json({ error: 'Nothing to update' });
    const fields = { ...values };
    if (values.marketing_opt_in !== undefined && values.marketing_opt_in !== req.user.marketing_opt_in) {
      fields.marketing_opt_in_at = values.marketing_opt_in ? new Date().toISOString() : null;
    }
    const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE users SET ${sets} WHERE id = @id`).run({ ...fields, id: req.user.id });
    res.json({ user: publicUser(q.userById.get(req.user.id)) });
  });

  // Progress sync: the phone downloads, merges with what it has, and uploads the result.
  app.get('/api/sync', auth, (req, res) => {
    const row = q.getData.get(req.user.id);
    res.json({ data: row ? JSON.parse(row.data) : null, updatedAt: row ? row.updated_at : null });
  });

  app.put('/api/sync', auth, (req, res) => {
    const data = req.body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Expected { data: { ... } }' });
    }
    const json = JSON.stringify(data);
    if (json.length > MAX_SYNC_BYTES) return res.status(413).json({ error: 'Too much data to sync' });
    const updatedAt = new Date().toISOString();
    q.putData.run(req.user.id, json, updatedAt);
    res.json({ updatedAt });
  });
}

module.exports = { registerAccountRoutes, hashPassword, checkPassword, MAX_SYNC_BYTES };
