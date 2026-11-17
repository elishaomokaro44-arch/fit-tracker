import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, profileFromUser, SYNC_KEYS } from '../src/sync.js';

test('new phone: everything comes from the server', () => {
  const remote = {
    'fit.steps': { '2026-11-16': { sensor: 9000 } },
    'fit.goal': 12000,
    'fit.walks': [{ id: 'a', startedAt: '2026-11-16T08:00:00Z' }],
    'fit.theme': 'dark',
  };
  assert.deepEqual(mergeData({}, remote), remote);
  assert.deepEqual(mergeData(undefined, remote), remote);
});

test('steps and water take the larger value per day instead of adding', () => {
  const m = mergeData(
    { 'fit.steps': { d1: { sensor: 5000, manual: 0 }, d2: { manual: 300 } }, 'fit.water': { d1: 3, d3: 1 } },
    { 'fit.steps': { d1: { sensor: 4000, manual: 1000 }, d0: { sensor: 7000 } }, 'fit.water': { d1: 5, d2: 2 } }
  );
  assert.deepEqual(m['fit.steps'], {
    d0: { sensor: 7000 },
    d1: { sensor: 5000, manual: 1000 },
    d2: { sensor: 0, manual: 300 },
  });
  assert.deepEqual(m['fit.water'], { d1: 5, d2: 2, d3: 1 });
});

test('activities, weights and badges are combined', () => {
  const m = mergeData(
    {
      'fit.walks': [{ id: 'b', startedAt: '2026-11-17T09:00:00Z', kcal: 10 }, { id: 'a', startedAt: '2026-11-15T09:00:00Z', kcal: 99 }],
      'fit.weights': [{ day: '2026-11-10', kg: 82 }],
      'fit.badges': ['goal', '10k'],
    },
    {
      'fit.walks': [{ id: 'a', startedAt: '2026-11-15T09:00:00Z', kcal: 1 }, { id: 'c', startedAt: '2026-11-16T09:00:00Z' }],
      'fit.weights': [{ day: '2026-11-01', kg: 84 }, { day: '2026-11-10', kg: 83 }],
      'fit.badges': ['goal', 'hydrated'],
    }
  );
  assert.deepEqual(m['fit.walks'].map((w) => w.id), ['b', 'c', 'a']); // newest first, no duplicates
  assert.equal(m['fit.walks'][2].kcal, 99); // this phone's copy wins
  assert.deepEqual(m['fit.weights'], [{ day: '2026-11-01', kg: 84 }, { day: '2026-11-10', kg: 82 }]);
  assert.deepEqual(m['fit.badges'].sort(), ['10k', 'goal', 'hydrated']);
});

test('settings: this phone wins, server fills gaps; junk is ignored', () => {
  const m = mergeData(
    { 'fit.goal': 8000, 'fit.theme': 'light', 'fit.walks': 'oops' },
    { 'fit.goal': 12000, 'fit.waterGoal': 10, 'fit.walks': [{ id: 'x', startedAt: '2026-01-01' }], 'not.ours': 1 }
  );
  assert.equal(m['fit.goal'], 8000);
  assert.equal(m['fit.theme'], 'light');
  assert.equal(m['fit.waterGoal'], 10);
  assert.deepEqual(m['fit.walks'], [{ id: 'x', startedAt: '2026-01-01' }]); // bad local value ignored
  assert.equal('not.ours' in m, false);
  assert.ok(!SYNC_KEYS.includes('fit.account')); // the login token is never uploaded
});

test('activity history is capped at 100', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: String(i), startedAt: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}Z` }));
  assert.equal(mergeData({ 'fit.walks': many.slice(0, 80) }, { 'fit.walks': many.slice(70) })['fit.walks'].length, 100);
});

test('profile filled from sign-up details', () => {
  assert.deepEqual(profileFromUser({ heightCm: 175, weightKg: 84, age: 26, sex: 'male' }, { activity: 'light' }), {
    activity: 'light',
    heightCm: '175',
    weightKg: '84',
    age: '26',
    sex: 'male',
  });
});
