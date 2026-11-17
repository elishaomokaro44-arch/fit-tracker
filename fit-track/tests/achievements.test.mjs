import test from 'node:test';
import assert from 'node:assert/strict';
import * as a from '../src/achievements.js';

const H = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { manual: v }]));

test('current streak counts back from today, or from yesterday if today is not done yet', () => {
  const h = H({ '2026-11-14': 9000, '2026-11-15': 6000, '2026-11-16': 7000, '2026-11-17': 2000 });
  assert.equal(a.currentStreak(h, 5000, '2026-11-17'), 3); // today not done yet, streak still alive
  assert.equal(a.currentStreak({ ...h, ...H({ '2026-11-17': 5000 }) }, 5000, '2026-11-17'), 4);
  assert.equal(a.currentStreak(h, 5000, '2026-11-19'), 0); // missed the 18th
  assert.equal(a.currentStreak({}, 5000, '2026-11-17'), 0);
});

test('streaks cross month boundaries', () => {
  const h = H({ '2026-10-30': 8000, '2026-10-31': 8000, '2026-11-01': 8000 });
  assert.equal(a.currentStreak(h, 8000, '2026-11-01'), 3);
  assert.equal(a.bestStreak(h, 8000), 3);
});

test('best streak finds the longest run', () => {
  const h = H({ '2026-11-01': 9000, '2026-11-02': 9000, '2026-11-04': 9000, '2026-11-05': 9000, '2026-11-06': 9000, '2026-11-07': 100 });
  assert.equal(a.bestStreak(h, 9000), 3);
  assert.equal(a.bestStreak({}, 9000), 0);
});

test('badges', () => {
  const none = a.earnedBadges({});
  assert.equal(none.size, 0);
  const h = {};
  for (let d = 1; d <= 7; d++) h[`2026-11-0${d}`] = { sensor: 10500 };
  const got = a.earnedBadges({
    history: h,
    goal: 10000,
    walks: [{ distanceM: 5200 }],
    water: { '2026-11-01': 8 },
    waterGoal: 8,
    weights: [{ day: '2026-11-01', kg: 80 }],
  });
  assert.deepEqual(
    [...got].sort(),
    ['10k', '5k-walk', 'first-steps', 'first-walk', 'goal', 'hydrated', 'streak3', 'streak7', 'weigh-in'].sort()
  );
  assert.ok(!got.has('20k') && !got.has('streak30'));
  assert.ok(a.BADGES.every((b) => b.id && b.icon && b.name && b.desc));
});

test('weekly challenge progress', () => {
  const tue = new Date(2026, 10, 17); // Tuesday
  const p = a.challengeProgress(12000, 50000, tue);
  assert.equal(p.daysLeft, 6);
  assert.equal(p.remaining, 38000);
  assert.equal(p.perDay, 6334);
  assert.equal(p.done, false);
  near(p.pct, 0.24);
  const sun = a.challengeProgress(60000, 50000, new Date(2026, 10, 22));
  assert.deepEqual([sun.daysLeft, sun.remaining, sun.done, sun.pct], [1, 0, true, 1]);
});

test('weight log keeps one entry per day, sorted', () => {
  let log = [];
  log = a.upsertWeight(log, '2026-11-10', 82);
  log = a.upsertWeight(log, '2026-11-01', 84);
  log = a.upsertWeight(log, '2026-11-10', 81.5);
  assert.deepEqual(log, [{ day: '2026-11-01', kg: 84 }, { day: '2026-11-10', kg: 81.5 }]);
});

test('chart points span the box and put heavier higher up', () => {
  const log = [{ day: '2026-11-01', kg: 84 }, { day: '2026-11-05', kg: 80 }, { day: '2026-11-11', kg: 82 }];
  const { points, min, max } = a.chartPoints(log, 300, 100, 10);
  assert.deepEqual([min, max], [80, 84]);
  assert.equal(points[0].x, 10);
  assert.equal(points[2].x, 290);
  assert.equal(points[0].y, 10); // 84 kg at the top
  assert.equal(points[1].y, 90); // 80 kg at the bottom
  assert.equal(a.chartPoints([{ day: '2026-11-01', kg: 70 }], 300, 100).points[0].x, 150);
  assert.deepEqual(a.chartPoints([], 300, 100).points, []);
});

function near(x, y, tol = 1e-9) {
  assert.ok(Math.abs(x - y) <= tol, `${x} vs ${y}`);
}

test('activity badges', () => {
  const got = a.earnedBadges({ walks: [{ type: 'run', distanceM: 3000 }, { type: 'cycle', distanceM: 12000 }] });
  assert.ok(got.has('first-walk') && got.has('first-run') && got.has('first-ride'));
  assert.ok(!got.has('5k-walk')); // the 12 km ride doesn't count
  assert.ok(a.earnedBadges({ walks: [{ distanceM: 5100 }] }).has('5k-walk')); // old walk without a type
});
