const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp, daysEnding, thisWeekDays } = require('../src/app');

let server;
let base;

test.before(async () => {
  server = createApp(openDb(':memory:'), { recoverLimit: 5 }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const signUp = async (name) => (await call('POST', '/api/users', { body: { name } })).body;

test('daysEnding crosses month ends', () => {
  assert.deepEqual(daysEnding('2026-03-02', 3), ['2026-02-28', '2026-03-01', '2026-03-02']);
});

test('sign-up validates names and returns a friend code', async () => {
  assert.equal((await call('POST', '/api/users', { body: { name: '  ' } })).status, 400);
  assert.equal((await call('POST', '/api/users', { body: { name: 'x'.repeat(31) } })).status, 400);
  const r = await call('POST', '/api/users', { body: { name: '  Osaru   E ' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.name, 'Osaru E');
  assert.match(r.body.user.friendCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.ok(r.body.token.length > 30);
});

test('auth is required and checked', async () => {
  assert.equal((await call('GET', '/api/me')).status, 401);
  assert.equal((await call('GET', '/api/me', { token: 'nope' })).status, 401);
  const a = await signUp('Ada');
  const me = await call('GET', '/api/me', { token: a.token });
  assert.equal(me.body.user.name, 'Ada');
  const renamed = await call('PATCH', '/api/me', { token: a.token, body: { name: 'Ada L' } });
  assert.equal(renamed.body.user.name, 'Ada L');
});

test('step upload validation', async () => {
  const a = await signUp('V');
  const bad = [
    { days: [] },
    { days: { '2026-02-30': 10 } },
    { days: { '2026-11-17': -1 } },
    { days: { '2026-11-17': 1.5 } },
    { days: { '2026-11-17': 999999 } },
    { days: Object.fromEntries(daysEnding('2026-11-17', 32).map((d) => [d, 1])) },
  ];
  for (const body of bad) {
    assert.equal((await call('PUT', '/api/steps', { token: a.token, body })).status, 400, JSON.stringify(body).slice(0, 60));
  }
  const ok = await call('PUT', '/api/steps', { token: a.token, body: { days: { '2026-11-17': 100 } } });
  assert.equal(ok.body.saved, 1);
  // Bad JSON is a 400, not a crash
  const res = await fetch(base + '/api/steps', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
    body: '{oops',
  });
  assert.equal(res.status, 400);
});

test('friends and leaderboard', async () => {
  const me = await signUp('Elisha');
  const tolu = await signUp('Tolu');
  const chidi = await signUp('Chidi');
  const stranger = await signUp('Stranger');

  // Add by code (lowercase works), mutual, no duplicates, not yourself
  assert.equal((await call('POST', '/api/friends', { token: me.token, body: { code: 'ZZZZZZ' } })).status, 404);
  assert.equal((await call('POST', '/api/friends', { token: me.token, body: { code: me.user.friendCode } })).status, 400);
  const added = await call('POST', '/api/friends', { token: me.token, body: { code: tolu.user.friendCode.toLowerCase() } });
  assert.equal(added.status, 201);
  assert.equal(added.body.friend.name, 'Tolu');
  assert.equal((await call('POST', '/api/friends', { token: tolu.token, body: { code: me.user.friendCode } })).status, 409);
  await call('POST', '/api/friends', { token: me.token, body: { code: chidi.user.friendCode } });

  const put = (u, days) => call('PUT', '/api/steps', { token: u.token, body: { days } });
  await put(me, { '2026-11-17': 4500, '2026-11-16': 8000, '2026-11-10': 50000 });
  await put(tolu, { '2026-11-17': 9000, '2026-11-15': 1000 });
  await put(chidi, { '2026-11-17': 4500 });
  await put(stranger, { '2026-11-17': 99999 });

  const today = await call('GET', '/api/leaderboard?period=today&day=2026-11-17', { token: me.token });
  assert.deepEqual(
    today.body.entries.map((e) => [e.rank, e.name, e.steps, e.isMe]),
    [
      [1, 'Tolu', 9000, false],
      [2, 'Chidi', 4500, false],
      [2, 'Elisha', 4500, true],
    ]
  );
  assert.equal(today.body.groupTotal, 18000);

  // Week = 11th–17th, so the 10th is excluded
  const week = await call('GET', '/api/leaderboard?period=week&day=2026-11-17', { token: me.token });
  assert.equal(week.body.from, '2026-11-11');
  assert.deepEqual(week.body.entries.map((e) => [e.name, e.steps]), [
    ['Elisha', 12500],
    ['Tolu', 10000],
    ['Chidi', 4500],
  ]);

  // Tolu sees Elisha but not Chidi (friendships aren't transitive)
  const toluView = await call('GET', '/api/leaderboard?day=2026-11-17', { token: tolu.token });
  assert.deepEqual(toluView.body.entries.map((e) => e.name).sort(), ['Elisha', 'Tolu']);

  // Removing works both ways
  assert.equal((await call('DELETE', `/api/friends/${tolu.user.id}`, { token: me.token })).status, 204);
  const after = await call('GET', '/api/leaderboard?day=2026-11-17', { token: tolu.token });
  assert.deepEqual(after.body.entries.map((e) => e.name), ['Tolu']);

  // Deleting an account removes it from friends' boards
  await call('DELETE', '/api/me', { token: chidi.token });
  const final = await call('GET', '/api/leaderboard?day=2026-11-17', { token: me.token });
  assert.deepEqual(final.body.entries.map((e) => e.name), ['Elisha']);
  assert.equal((await call('GET', '/api/leaderboard?day=bad', { token: me.token })).status, 400);
});

test('thisWeekDays starts on Monday', () => {
  // 2026-11-17 is a Tuesday
  assert.deepEqual(thisWeekDays('2026-11-17'), ['2026-11-16', '2026-11-17']);
  assert.deepEqual(thisWeekDays('2026-11-16'), ['2026-11-16']);
  assert.equal(thisWeekDays('2026-11-22').length, 7); // Sunday
  assert.equal(thisWeekDays('2026-11-22')[0], '2026-11-16');
});

test('this-week leaderboard (for the group challenge)', async () => {
  const a = await signUp('WeekA');
  const b = await signUp('WeekB');
  await call('POST', '/api/friends', { token: a.token, body: { code: b.user.friendCode } });
  await call('PUT', '/api/steps', { token: a.token, body: { days: { '2026-11-15': 9999, '2026-11-16': 3000, '2026-11-17': 4000 } } });
  await call('PUT', '/api/steps', { token: b.token, body: { days: { '2026-11-17': 5000 } } });
  const r = await call('GET', '/api/leaderboard?period=thisweek&day=2026-11-17', { token: a.token });
  assert.equal(r.body.period, 'thisweek');
  assert.equal(r.body.from, '2026-11-16'); // Sunday the 15th is last week
  assert.equal(r.body.groupTotal, 12000);
});

test('backup code restores a profile and signs the old phone out', async () => {
  const u = await signUp('Restorer');
  assert.equal(u.user.hasBackupCode, false);
  const friend = await signUp('Pal');
  await call('POST', '/api/friends', { token: u.token, body: { code: friend.user.friendCode } });

  const made = await call('POST', '/api/me/backup-code', { token: u.token });
  assert.equal(made.status, 201);
  assert.match(made.body.backupCode, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal((await call('GET', '/api/me', { token: u.token })).body.user.hasBackupCode, true);

  // Typed in lowercase without dashes still works
  const typed = made.body.backupCode.replace(/-/g, ' ').toLowerCase();
  const restored = await call('POST', '/api/recover', { body: { code: typed } });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.user.id, u.user.id);
  assert.equal(restored.body.user.friendCode, u.user.friendCode);
  assert.notEqual(restored.body.token, u.token);

  // Old phone is signed out, new phone keeps the friends
  assert.equal((await call('GET', '/api/me', { token: u.token })).status, 401);
  const board = await call('GET', '/api/leaderboard?day=2026-11-17', { token: restored.body.token });
  assert.deepEqual(board.body.entries.map((e) => e.name).sort(), ['Pal', 'Restorer']);

  // Making a new code replaces the old one
  const again = await call('POST', '/api/me/backup-code', { token: restored.body.token });
  assert.equal((await call('POST', '/api/recover', { body: { code: made.body.backupCode } })).status, 404);
  assert.equal((await call('POST', '/api/recover', { body: { code: again.body.backupCode } })).status, 200);
});

test('backup code guessing is rate limited', async () => {
  // Earlier test used 3 of the 5 allowed attempts from this IP
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await call('POST', '/api/recover', { body: { code: 'AAAA-AAAA-AAAA' } })).status);
  assert.ok(statuses.includes(429), statuses.join(','));
});
