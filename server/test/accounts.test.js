const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { hashPassword, checkPassword } = require('../src/accounts');

let server;
let base;
let db;

test.before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { recoverLimit: 50, loginLimit: 50, signupLimit: 50 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const details = (over = {}) => ({
  name: 'Elisha',
  email: 'Elisha@Example.com ',
  password: 'correct horse',
  age: 26,
  sex: 'male',
  heightCm: 175,
  weightKg: 84,
  marketingOptIn: false,
  ...over,
});

test('password hashing', () => {
  const h = hashPassword('secret123');
  assert.match(h, /^scrypt\$/);
  assert.ok(checkPassword('secret123', h));
  assert.ok(!checkPassword('secret124', h));
  assert.notEqual(hashPassword('secret123'), h); // random salt
  assert.ok(!checkPassword('x', null));
});

test('sign-up validates every field', async () => {
  const bad = [
    [{ email: 'not-an-email' }, /valid email/],
    [{ password: 'short' }, /at least 8/],
    [{ name: '' }, /your name/],
    [{ age: 12 }, /13 to 120/],
    [{ age: 25.5 }, /13 to 120/],
    [{ sex: 'other' }, /male or female/],
    [{ heightCm: 50 }, /100 and 250/],
    [{ weightKg: 1000 }, /20 and 400/],
    [{ weightKg: undefined }, /your weight/],
  ];
  for (const [over, re] of bad) {
    const r = await call('POST', '/api/auth/signup', { body: details({ email: `v${Math.random()}@x.com`, ...over }) });
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.match(r.body.error, re);
  }
});

test('sign-up, log in on a second phone, both stay signed in', async () => {
  const signup = await call('POST', '/api/auth/signup', { body: details() });
  assert.equal(signup.status, 201);
  const u = signup.body.user;
  assert.equal(u.email, 'elisha@example.com'); // trimmed and lower-cased
  assert.deepEqual([u.name, u.age, u.sex, u.heightCm, u.weightKg, u.marketingOptIn], ['Elisha', 26, 'male', 175, 84, false]);
  assert.match(u.friendCode, /^[A-Z0-9]{6}$/);
  assert.equal(JSON.stringify(signup.body).includes('password'), false); // never sent back

  // Same email again is refused
  assert.equal((await call('POST', '/api/auth/signup', { body: details({ email: 'ELISHA@example.com' }) })).status, 409);

  // Wrong password and unknown email give the same answer
  const wrong = await call('POST', '/api/auth/login', { body: { email: 'elisha@example.com', password: 'nope nope' } });
  const unknown = await call('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'nope nope' } });
  assert.deepEqual([wrong.status, wrong.body], [401, { error: 'Wrong email or password' }]);
  assert.deepEqual([unknown.status, unknown.body], [401, { error: 'Wrong email or password' }]);

  const login = await call('POST', '/api/auth/login', { body: { email: ' Elisha@example.COM', password: 'correct horse' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, u.id);
  assert.notEqual(login.body.token, signup.body.token);

  // Both phones work
  assert.equal((await call('GET', '/api/me', { token: signup.body.token })).status, 200);
  assert.equal((await call('GET', '/api/me', { token: login.body.token })).status, 200);

  // Logging out one phone leaves the other signed in
  assert.equal((await call('POST', '/api/auth/logout', { token: login.body.token })).status, 204);
  assert.equal((await call('GET', '/api/me', { token: login.body.token })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: signup.body.token })).status, 200);
});

test('sign-up upgrades an existing leaderboard profile and keeps its friends', async () => {
  const old = (await call('POST', '/api/users', { body: { name: 'Old Me' } })).body;
  const pal = (await call('POST', '/api/users', { body: { name: 'Pal' } })).body;
  await call('POST', '/api/friends', { token: old.token, body: { code: pal.user.friendCode } });

  const r = await call('POST', '/api/auth/signup', { token: old.token, body: details({ name: 'New Me', email: 'upgrade@example.com' }) });
  assert.equal(r.status, 201);
  assert.equal(r.body.upgraded, true);
  assert.equal(r.body.user.id, old.user.id);
  assert.equal(r.body.user.friendCode, old.user.friendCode);
  const board = await call('GET', '/api/leaderboard?day=2026-11-17', { token: r.body.token });
  assert.deepEqual(board.body.entries.map((e) => e.name).sort(), ['New Me', 'Pal']);

  // A profile that already has an email isn't taken over by another sign-up
  const again = await call('POST', '/api/auth/signup', { token: r.body.token, body: details({ email: 'other@example.com' }) });
  assert.equal(again.status, 201);
  assert.notEqual(again.body.user.id, old.user.id);
});

test('profile updates and marketing consent timestamps', async () => {
  const { token, user } = (await call('POST', '/api/auth/signup', { body: details({ email: 'ads@example.com', marketingOptIn: true }) })).body;
  assert.equal(user.marketingOptIn, true);
  const at = () => db.prepare('SELECT marketing_opt_in, marketing_opt_in_at FROM users WHERE id = ?').get(user.id);
  assert.ok(at().marketing_opt_in_at); // consent time recorded

  const off = await call('PATCH', '/api/me', { token, body: { marketingOptIn: false, weightKg: 82.5 } });
  assert.equal(off.body.user.marketingOptIn, false);
  assert.equal(off.body.user.weightKg, 82.5);
  assert.equal(at().marketing_opt_in_at, null);

  assert.equal((await call('PATCH', '/api/me', { token, body: { age: 9 } })).status, 400);
  assert.equal((await call('PATCH', '/api/me', { token, body: {} })).status, 400);
  assert.equal((await call('PATCH', '/api/me', { token, body: { name: 'Renamed' } })).body.user.name, 'Renamed');
});

test('forgot password: reset with a backup code', async () => {
  const s = (await call('POST', '/api/auth/signup', { body: details({ email: 'reset@example.com' }) })).body;
  const other = (await call('POST', '/api/auth/login', { body: { email: 'reset@example.com', password: 'correct horse' } })).body;
  const code = (await call('POST', '/api/me/backup-code', { token: s.token })).body.backupCode;

  const bad = await call('POST', '/api/auth/reset', { body: { email: 'reset@example.com', backupCode: 'AAAA-AAAA-AAAA', newPassword: 'brand new pw' } });
  assert.equal(bad.status, 401);
  const short = await call('POST', '/api/auth/reset', { body: { email: 'reset@example.com', backupCode: code, newPassword: 'short' } });
  assert.equal(short.status, 400);

  const ok = await call('POST', '/api/auth/reset', { body: { email: 'RESET@example.com', backupCode: code.toLowerCase(), newPassword: 'brand new pw' } });
  assert.equal(ok.status, 200);
  // every old session is signed out
  assert.equal((await call('GET', '/api/me', { token: s.token })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: other.token })).status, 401);
  assert.equal((await call('GET', '/api/me', { token: ok.body.token })).status, 200);
  // old password no longer works, new one does
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'reset@example.com', password: 'correct horse' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'reset@example.com', password: 'brand new pw' } })).status, 200);
});

test('progress sync round trip, size limit, and account deletion', async () => {
  const { token, user } = (await call('POST', '/api/auth/signup', { body: details({ email: 'sync@example.com' }) })).body;
  assert.deepEqual((await call('GET', '/api/sync', { token })).body, { data: null, updatedAt: null });

  const data = { 'fit.steps': { '2026-11-17': { manual: 4000 } }, 'fit.walks': [{ id: '1', segments: [[[6.3, 5.6]]] }] };
  const put = await call('PUT', '/api/sync', { token, body: { data } });
  assert.equal(put.status, 200);
  const got = await call('GET', '/api/sync', { token });
  assert.deepEqual(got.body.data, data);
  assert.equal(got.body.updatedAt, put.body.updatedAt);

  // A big but allowed upload (~1 MB of route points) works
  const route = Array.from({ length: 40000 }, (_, i) => [6.3 + i * 1e-6, 5.6]);
  assert.equal((await call('PUT', '/api/sync', { token, body: { data: { 'fit.walks': [{ id: 'big', segments: [route] }] } } })).status, 200);
  assert.equal((await call('PUT', '/api/sync', { token, body: { data: [] } })).status, 400);
  assert.equal((await call('GET', '/api/sync')).status, 401);

  // Deleting the account removes sessions and synced data
  assert.equal((await call('DELETE', '/api/me', { token })).status, 204);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_data WHERE user_id = ?').get(user.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(user.id).n, 0);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'sync@example.com', password: 'correct horse' } })).status, 401);
});

test('login attempts are rate limited', async () => {
  const s = createApp(openDb(':memory:'), { loginLimit: 3 }).listen(0);
  await new Promise((r) => s.once('listening', r));
  const url = `http://127.0.0.1:${s.address().port}/api/auth/login`;
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'xxxxxxxx' }) });
    codes.push(r.status);
  }
  s.close();
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
});
