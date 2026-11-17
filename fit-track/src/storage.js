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
