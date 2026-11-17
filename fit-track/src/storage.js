import AsyncStorage from '@react-native-async-storage/async-storage';

// Everything is stored on the phone only (AsyncStorage = the app's local storage).
const KEYS = {
  steps: 'fit.steps', // { 'YYYY-MM-DD': number }
  goal: 'fit.goal', // number
  profile: 'fit.profile', // { sex, age, heightCm, weightKg, activity }
};

async function readJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJSON(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: keep running with in-memory state.
  }
}

export const loadSteps = () => readJSON(KEYS.steps, {});
export const saveSteps = (v) => writeJSON(KEYS.steps, v);
export const loadGoal = () => readJSON(KEYS.goal, 10000);
export const saveGoal = (v) => writeJSON(KEYS.goal, v);
export const loadProfile = () => readJSON(KEYS.profile, {});
export const saveProfile = (v) => writeJSON(KEYS.profile, v);

// Walk history: newest first. Routes are stored compactly as [[lat, lon], ...] per segment.
const WALKS_KEY = 'fit.walks';
const MAX_WALKS = 100;
export const loadWalks = () => readJSON(WALKS_KEY, []);
export const saveWalks = (walks) => writeJSON(WALKS_KEY, walks.slice(0, MAX_WALKS));

// Water: { 'YYYY-MM-DD': glasses } and a daily goal in glasses (250 ml each)
export const loadWater = () => readJSON('fit.water', {});
export const saveWater = (v) => writeJSON('fit.water', v);
export const loadWaterGoal = () => readJSON('fit.waterGoal', 8);
export const saveWaterGoal = (v) => writeJSON('fit.waterGoal', v);

// Weight log: [{ day: 'YYYY-MM-DD', kg }], oldest first
export const loadWeights = () => readJSON('fit.weights', []);
export const saveWeights = (v) => writeJSON('fit.weights', v);

// Evening step reminder: { enabled, hour }
export const loadReminder = () => readJSON('fit.reminder', { enabled: false, hour: 19 });
export const saveReminder = (v) => writeJSON('fit.reminder', v);

// Weekly group challenge goal (steps)
export const loadChallengeGoal = () => readJSON('fit.challengeGoal', 50000);
export const saveChallengeGoal = (v) => writeJSON('fit.challengeGoal', v);

// Badges already earned (kept even if goals change later)
export const loadBadges = () => readJSON('fit.badges', []);
export const saveBadges = (v) => writeJSON('fit.badges', v);

// Appearance: 'system' | 'light' | 'dark'
export const loadThemeMode = () => readJSON('fit.theme', 'system');
export const saveThemeMode = (v) => writeJSON('fit.theme', v);

// Last activity type chosen on the Activity tab: 'walk' | 'run' | 'cycle'
export const loadActivityType = () => readJSON('fit.activityType', 'walk');
export const saveActivityType = (v) => writeJSON('fit.activityType', v);

// Which account the progress on this phone belongs to (so another person logging in
// on the same phone doesn't get it). Not synced.
export const loadOwner = () => readJSON('fit.owner', null);
export const saveOwner = (v) => writeJSON('fit.owner', v);
