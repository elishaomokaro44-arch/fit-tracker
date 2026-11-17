// Route maths for the Walk tab. Plain functions (no React) so they can be tested with Node.

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

// Distance in metres between two { latitude, longitude } points (haversine formula)
export function distanceM(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Total length of a route, in metres. A route is a list of segments (one per
// stretch between Pause and Resume), so no distance is counted across a pause.
export function routeDistanceM(segments) {
  let total = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) total += distanceM(seg[i - 1], seg[i]);
  }
  return total;
}

// GPS readings jump around. Decide whether a new reading should be added to the route.
//  - ignore readings with poor accuracy (> 35 m)
//  - ignore tiny moves (< 4 m) that are usually just GPS drift while standing still
//  - ignore impossible jumps (faster than 12 m/s ≈ 43 km/h, quicker than any runner)
export const MAX_ACCURACY_M = 35;
export const MIN_MOVE_M = 4;
export const MAX_SPEED_MS = 12;

export function acceptPoint(prev, next, maxSpeedMs = MAX_SPEED_MS) {
  if (next.accuracy != null && next.accuracy > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const d = distanceM(prev, next);
  if (d < MIN_MOVE_M) return false;
  const dt = (next.timestamp - prev.timestamp) / 1000;
  if (dt > 0 && d / dt > maxSpeedMs) return false;
  return true;
}

// Seconds per km, or null if there's not enough distance yet to be meaningful
export function paceSecPerKm(distanceMeters, seconds) {
  if (distanceMeters < 50 || seconds <= 0) return null;
  return seconds / (distanceMeters / 1000);
}

export function formatPace(secPerKm) {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm > 3600) return '–:––';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function formatKm(distanceMeters) {
  return (distanceMeters / 1000).toFixed(2);
}

// Calories: about 0.75 kcal per kg per km walking, about 1.0 when running
// (faster than 7:30 per km). Uses 70 kg if no weight has been entered.
export const RUN_PACE_SEC_PER_KM = 450;
export function walkCalories(distanceMeters, seconds, weightKg) {
  const w = Number(weightKg) > 0 ? Number(weightKg) : 70;
  const km = distanceMeters / 1000;
  const pace = paceSecPerKm(distanceMeters, seconds);
  const factor = pace != null && pace < RUN_PACE_SEC_PER_KM ? 1.0 : 0.75;
  return Math.round(km * w * factor);
}

// Keep saved routes small: thin each segment to at most `max` points in total,
// always keeping each segment's first and last point.
export function simplifySegments(segments, max = 400) {
  const total = segments.reduce((n, s) => n + s.length, 0);
  if (total <= max) return segments;
  const step = Math.ceil(total / max);
  return segments.map((seg) =>
    seg.filter((_, i) => i === 0 || i === seg.length - 1 || i % step === 0)
  );
}

// Map region that fits every point, with some padding
export function regionForPoints(points) {
  if (!points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.005, (maxLon - minLon) * 1.4),
  };
}

// Activity types. maxSpeed (m/s) is the fastest believable GPS movement for that activity.
export const ACTIVITIES = {
  walk: { key: 'walk', label: 'Walk', icon: '🚶', noun: 'walk', done: 'Walk complete!', maxSpeed: MAX_SPEED_MS, showSpeed: false },
  run: { key: 'run', label: 'Run', icon: '🏃', noun: 'run', done: 'Run complete!', maxSpeed: MAX_SPEED_MS, showSpeed: false },
  cycle: { key: 'cycle', label: 'Cycle', icon: '🚴', noun: 'ride', done: 'Ride complete!', maxSpeed: 25, showSpeed: true },
};
// Activities saved before types existed were all walks
export const activityOf = (a) => ACTIVITIES[a?.type] || ACTIVITIES.walk;

// Average speed in km/h, or null if there's not enough distance yet
export function speedKmh(distanceMeters, seconds) {
  if (distanceMeters < 50 || seconds <= 0) return null;
  return (distanceMeters / seconds) * 3.6;
}

export function formatSpeed(kmh) {
  return kmh == null || !Number.isFinite(kmh) ? '–.–' : kmh.toFixed(1);
}

// Calories for any activity. Walking and running go by distance; cycling goes by
// speed and time (MET values: roughly 4 for an easy ride up to 12 for racing pace).
export function activityCalories(type, distanceMeters, seconds, weightKg) {
  const w = Number(weightKg) > 0 ? Number(weightKg) : 70;
  if (type === 'cycle') {
    const v = speedKmh(distanceMeters, seconds);
    const met = v == null || v < 16 ? 4 : v < 19 ? 6.8 : v < 22 ? 8 : v < 25 ? 10 : 12;
    return Math.round((met * w * seconds) / 3600);
  }
  if (type === 'run') return Math.round((distanceMeters / 1000) * w * 1.0);
  return walkCalories(distanceMeters, seconds, weightKg);
}
