// Streaks, badges, weekly-challenge and weight-chart helpers. Plain functions so they can be tested.
import { dayKey } from './calc.js';

// history = { 'YYYY-MM-DD': { sensor, manual } }
export const stepsOn = (history, key) => {
  const e = history[key];
  return e ? (e.sensor || 0) + (e.manual || 0) : 0;
};

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

// Current streak: days in a row hitting the goal, ending today. If today isn't done yet,
// the streak ending yesterday still counts (you have until midnight to keep it going).
export function currentStreak(history, goal, today = dayKey()) {
  let day = stepsOn(history, today) >= goal ? today : addDays(today, -1);
  let n = 0;
  while (stepsOn(history, day) >= goal) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(history, goal) {
  const hits = Object.keys(history)
    .filter((k) => stepsOn(history, k) >= goal)
    .sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of hits) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export const BADGES = [
  { id: 'first-steps', icon: '👣', name: 'First steps', desc: '1,000 steps in a day' },
  { id: 'goal', icon: '🎯', name: 'Goal getter', desc: 'Hit your daily step goal' },
  { id: 'streak3', icon: '🔥', name: 'On fire', desc: '3-day goal streak' },
  { id: 'streak7', icon: '📅', name: 'Week warrior', desc: '7-day goal streak' },
  { id: 'streak30', icon: '🏆', name: 'Unstoppable', desc: '30-day goal streak' },
  { id: '10k', icon: '🔟', name: '10K club', desc: '10,000 steps in a day' },
  { id: '20k', icon: '🚀', name: 'Super walker', desc: '20,000 steps in a day' },
  { id: 'first-walk', icon: '🗺️', name: 'Explorer', desc: 'Save your first activity' },
  { id: 'first-run', icon: '🏃', name: 'Runner', desc: 'Finish a run' },
  { id: 'first-ride', icon: '🚴', name: 'Cyclist', desc: 'Finish a bike ride' },
  { id: '5k-walk', icon: '🥾', name: 'Long haul', desc: 'Walk or run 5 km' },
  { id: 'hydrated', icon: '💧', name: 'Hydrated', desc: 'Hit your water goal' },
  { id: 'weigh-in', icon: '⚖️', name: 'Weigh-in', desc: 'Log your weight' },
];

// Returns the set of earned badge ids
export function earnedBadges({ history = {}, goal = 10000, walks = [], water = {}, waterGoal = 8, weights = [] }) {
  const days = Object.keys(history);
  const maxDay = days.reduce((m, k) => Math.max(m, stepsOn(history, k)), 0);
  const best = bestStreak(history, goal);
  const earned = new Set();
  if (maxDay >= 1000) earned.add('first-steps');
  if (best >= 1) earned.add('goal');
  if (best >= 3) earned.add('streak3');
  if (best >= 7) earned.add('streak7');
  if (best >= 30) earned.add('streak30');
  if (maxDay >= 10000) earned.add('10k');
  if (maxDay >= 20000) earned.add('20k');
  if (walks.length) earned.add('first-walk');
  if (walks.some((w) => w.type === 'run')) earned.add('first-run');
  if (walks.some((w) => w.type === 'cycle')) earned.add('first-ride');
  // a 5 km bike ride is too easy for this one: walks and runs only
  if (walks.some((w) => w.type !== 'cycle' && w.distanceM >= 5000)) earned.add('5k-walk');
  if (Object.values(water).some((n) => n >= waterGoal)) earned.add('hydrated');
  if (weights.length) earned.add('weigh-in');
  return earned;
}

// Weekly group challenge: progress and what's left
export function challengeProgress(groupTotal, goal, today = new Date()) {
  const daysLeft = 7 - ((today.getDay() + 6) % 7); // including today; Monday = 7, Sunday = 1
  const remaining = Math.max(0, goal - groupTotal);
  return {
    pct: goal > 0 ? Math.min(1, groupTotal / goal) : 0,
    remaining,
    done: groupTotal >= goal,
    daysLeft,
    perDay: daysLeft ? Math.ceil(remaining / daysLeft) : remaining,
  };
}

// Weight log: list of { day, kg }, one per day, oldest first
export function upsertWeight(log, day, kg) {
  const rest = log.filter((e) => e.day !== day);
  return [...rest, { day, kg }].sort((a, b) => (a.day < b.day ? -1 : 1));
}

// Points for a line chart: x spread by date, y scaled to the min/max weight (with padding)
export function chartPoints(log, width, height, pad = 8) {
  if (!log.length) return { points: [], min: 0, max: 0 };
  const kgs = log.map((e) => e.kg);
  let min = Math.min(...kgs);
  let max = Math.max(...kgs);
  if (max - min < 2) {
    min -= 1;
    max += 1;
  }
  const t = (d) => new Date(`${d}T00:00:00`).getTime();
  const t0 = t(log[0].day);
  const span = Math.max(1, t(log[log.length - 1].day) - t0);
  const points = log.map((e) => ({
    x: log.length === 1 ? width / 2 : pad + ((t(e.day) - t0) / span) * (width - pad * 2),
    y: pad + (1 - (e.kg - min) / (max - min)) * (height - pad * 2),
    ...e,
  }));
  return { points, min, max };
}
