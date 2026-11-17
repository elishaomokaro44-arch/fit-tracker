// Combining this phone's progress with the copy saved on the server.
// Pure functions (no React or storage) so they can be tested with Node.

// Everything that gets backed up and restored on a new phone
export const SYNC_KEYS = [
  'fit.steps', // { day: { sensor, manual } }
  'fit.goal',
  'fit.profile',
  'fit.water', // { day: glasses }
  'fit.waterGoal',
  'fit.weights', // [{ day, kg }]
  'fit.reminder',
  'fit.challengeGoal',
  'fit.badges', // [id]
  'fit.walks', // activities, newest first
  'fit.activityType',
  'fit.theme',
];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const MAX_ACTIVITIES = 100;

// How to combine each kind of data. Anything not listed: this phone's value wins if it has one.
const MERGERS = {
  // Same day on two phones: take the bigger count rather than adding (avoids double counting)
  'fit.steps': (l, r) => {
    const out = { ...r };
    for (const [day, e] of Object.entries(l)) {
      const o = out[day] || {};
      out[day] = { sensor: Math.max(e.sensor || 0, o.sensor || 0), manual: Math.max(e.manual || 0, o.manual || 0) };
    }
    return out;
  },
  'fit.water': (l, r) => {
    const out = { ...r };
    for (const [day, n] of Object.entries(l)) out[day] = Math.max(n || 0, out[day] || 0);
    return out;
  },
  'fit.weights': (l, r) => {
    const byDay = new Map(r.map((e) => [e.day, e]));
    for (const e of l) byDay.set(e.day, e); // this phone wins for the same day
    return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  },
  'fit.walks': (l, r) => {
    const byId = new Map(r.map((w) => [w.id, w]));
    for (const w of l) byId.set(w.id, w);
    return [...byId.values()]
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, MAX_ACTIVITIES);
  },
  'fit.badges': (l, r) => [...new Set([...r, ...l])],
};

const SHAPE = { 'fit.steps': isObj, 'fit.water': isObj, 'fit.weights': Array.isArray, 'fit.walks': Array.isArray, 'fit.badges': Array.isArray };

export function mergeData(local = {}, remote = {}) {
  const out = {};
  for (const key of SYNC_KEYS) {
    const l = local?.[key];
    const r = remote?.[key];
    const ok = SHAPE[key] || (() => true);
    const hasL = l !== undefined && l !== null && ok(l);
    const hasR = r !== undefined && r !== null && ok(r);
    if (hasL && hasR && MERGERS[key]) out[key] = MERGERS[key](l, r);
    else if (hasL) out[key] = l;
    else if (hasR) out[key] = r;
  }
  return out;
}

// Local profile fields filled in from the account details given at sign-up
export function profileFromUser(user, existing = {}) {
  const p = { ...existing };
  if (user.heightCm) p.heightCm = String(user.heightCm);
  if (user.weightKg) p.weightKg = String(user.weightKg);
  if (user.age) p.age = String(user.age);
  if (user.sex) p.sex = user.sex;
  return p;
}
