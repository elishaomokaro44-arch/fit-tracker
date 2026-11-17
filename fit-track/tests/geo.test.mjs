import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../src/geo.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
// Benin City, roughly. 0.001° of latitude ≈ 111 m.
const P = (lat, lon, t = 0, accuracy = 5) => ({ latitude: lat, longitude: lon, timestamp: t, accuracy });

test('haversine distance', () => {
  near(g.distanceM(P(6.335, 5.6037), P(6.336, 5.6037)), 111.2, 0.5);
  // Lagos to Benin City is about 233 km in a straight line
  near(g.distanceM(P(6.5244, 3.3792), P(6.335, 5.6037)) / 1000, 246, 15);
  assert.equal(g.distanceM(P(1, 1), P(1, 1)), 0);
});

test('route distance does not count the gap across a pause', () => {
  const seg1 = [P(6.335, 5.6037), P(6.336, 5.6037)];
  const seg2 = [P(6.340, 5.6037), P(6.341, 5.6037)];
  near(g.routeDistanceM([seg1, seg2]), 222.4, 1);
  assert.equal(g.routeDistanceM([]), 0);
});

test('GPS filtering', () => {
  const a = P(6.335, 5.6037, 0);
  assert.equal(g.acceptPoint(null, a), true);
  assert.equal(g.acceptPoint(null, P(6.335, 5.6037, 0, 80)), false); // poor accuracy
  assert.equal(g.acceptPoint(a, P(6.33502, 5.6037, 5000)), false); // ~2 m drift
  assert.equal(g.acceptPoint(a, P(6.3351, 5.6037, 10000)), true); // ~11 m in 10 s, walking
  assert.equal(g.acceptPoint(a, P(6.345, 5.6037, 10000)), false); // 1.1 km in 10 s, impossible
});

test('pace, duration and distance formatting', () => {
  assert.equal(g.paceSecPerKm(30, 60), null); // too short to say
  assert.equal(g.paceSecPerKm(2000, 1200), 600);
  assert.equal(g.formatPace(600), '10:00');
  assert.equal(g.formatPace(329.6), '5:30');
  assert.equal(g.formatPace(null), '–:––');
  assert.equal(g.formatDuration(65), '1:05');
  assert.equal(g.formatDuration(3725), '1:02:05');
  assert.equal(g.formatDuration(0), '0:00');
  assert.equal(g.formatKm(3216), '3.22');
});

test('calories: walking vs running', () => {
  assert.equal(g.walkCalories(4000, 2400, 80), 240); // 10:00/km walk: 4 × 80 × 0.75
  assert.equal(g.walkCalories(5000, 1500, 80), 400); // 5:00/km run: 5 × 80 × 1.0
  assert.equal(g.walkCalories(1000, 600, ''), 53); // no weight → 70 kg
});

test('simplify keeps ends and caps size', () => {
  const seg = Array.from({ length: 1000 }, (_, i) => P(6 + i * 1e-4, 5));
  const out = g.simplifySegments([seg], 400);
  assert.ok(out[0].length <= 401, `${out[0].length}`);
  assert.equal(out[0][0], seg[0]);
  assert.equal(out[0].at(-1), seg.at(-1));
  const small = [[P(1, 1), P(2, 2)]];
  assert.equal(g.simplifySegments(small), small);
});

test('region fits all points', () => {
  const r = g.regionForPoints([P(6.33, 5.60), P(6.34, 5.62)]);
  near(r.latitude, 6.335, 1e-9);
  near(r.longitude, 5.61, 1e-9);
  assert.ok(r.latitudeDelta >= 0.01 && r.longitudeDelta >= 0.02);
  assert.equal(g.regionForPoints([]), null);
});

test('activity types and calories', () => {
  assert.equal(g.activityOf({}).key, 'walk'); // old saved walks have no type
  assert.equal(g.activityOf({ type: 'cycle' }).key, 'cycle');
  assert.equal(g.activityCalories('walk', 4000, 2400, 80), 240); // same as before
  assert.equal(g.activityCalories('run', 5000, 1800, 70), 350); // 5 km × 70 kg × 1.0
  assert.equal(g.activityCalories('cycle', 20000, 3600, 70), 560); // 20 km/h → MET 8 → 8 × 70 × 1 h
  assert.equal(g.activityCalories('cycle', 10000, 3600, 70), 280); // easy 10 km/h → MET 4
  assert.equal(g.activityCalories('cycle', 30000, 3600, ''), 840); // 30 km/h → MET 12, 70 kg default
  // cycling burns far less per km than running
  assert.ok(g.activityCalories('cycle', 10000, 1800, 70) < g.activityCalories('run', 10000, 1800, 70));
});

test('speed and per-activity GPS limits', () => {
  assert.equal(g.speedKmh(30, 10), null);
  assert.equal(g.speedKmh(10000, 1800), 20);
  assert.equal(g.formatSpeed(19.96), '20.0');
  assert.equal(g.formatSpeed(null), '–.–');
  const a = P(6.335, 5.6037, 0);
  const b = P(6.33635, 5.6037, 10000); // ~150 m in 10 s = 15 m/s (54 km/h)
  assert.equal(g.acceptPoint(a, b), false); // too fast for walking/running
  assert.equal(g.acceptPoint(a, b, g.ACTIVITIES.cycle.maxSpeed), true); // fine on a bike downhill
});
