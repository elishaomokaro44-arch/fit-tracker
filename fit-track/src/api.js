import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { lastNDays } from './calc';
import { mergeData, SYNC_KEYS } from './sync';

const API_PORT = 4000;

// Where the FitTrack server is:
// 1. EXPO_PUBLIC_API_URL if you set it (use this once the server is hosted, e.g. on AWS).
// 2. Otherwise, in development, the same computer that is running `npm start`.
function resolveApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host || 'localhost'}:${API_PORT}`;
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Can't reach the FitTrack server (${API_URL}). Is it running?`, 0);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) throw new ApiError(data?.error || `Server error (${res.status})`, res.status);
  return data;
}

export const api = {
  signUp: (name) => request('POST', '/api/users', { body: { name } }),
  deleteMe: (token) => request('DELETE', '/api/me', { token }),
  // existingToken: this phone's old leaderboard profile, so sign-up keeps its friends
  register: (details, existingToken) => request('POST', '/api/auth/signup', { token: existingToken, body: details }),
  logIn: (email, password) => request('POST', '/api/auth/login', { body: { email, password } }),
  logOut: (token) => request('POST', '/api/auth/logout', { token }),
  resetPassword: (email, backupCode, newPassword) =>
    request('POST', '/api/auth/reset', { body: { email, backupCode, newPassword } }),
  updateMe: (token, fields) => request('PATCH', '/api/me', { token, body: fields }),
  getSync: (token) => request('GET', '/api/sync', { token }),
  putSync: (token, data) => request('PUT', '/api/sync', { token, body: { data } }),
  me: (token) => request('GET', '/api/me', { token }),
  createBackupCode: (token) => request('POST', '/api/me/backup-code', { token }),
  recover: (code) => request('POST', '/api/recover', { body: { code } }),
  addFriend: (token, code) => request('POST', '/api/friends', { token, body: { code } }),
  removeFriend: (token, id) => request('DELETE', `/api/friends/${id}`, { token }),
  leaderboard: (token, period, day) =>
    request('GET', `/api/leaderboard?period=${period}&day=${day}`, { token }),
  // history = { 'YYYY-MM-DD': { sensor, manual } }; uploads the last 7 days' totals
  syncSteps: (token, history) => {
    const days = {};
    for (const key of lastNDays(7)) {
      const e = history[key];
      if (e) days[key] = Math.max(0, Math.round((e.sensor || 0) + (e.manual || 0)));
    }
    return request('PUT', '/api/steps', { token, body: { days } });
  },
};

// The account (login token + user details). On phones it's kept in secure storage (iOS Keychain /
// Android Keystore); the web version, used only for testing, falls back to normal storage.
const ACCOUNT_KEY = 'fit.account';
const SECURE_KEY = 'fit_account';
const useSecure = Platform.OS !== 'web';

export async function loadAccount() {
  try {
    if (useSecure) {
      const raw = await SecureStore.getItemAsync(SECURE_KEY);
      if (raw) return JSON.parse(raw);
    }
    // Older versions kept it in normal storage: read it, and move it to secure storage
    const legacy = await AsyncStorage.getItem(ACCOUNT_KEY);
    if (!legacy) return null;
    const account = JSON.parse(legacy);
    if (useSecure) {
      await SecureStore.setItemAsync(SECURE_KEY, legacy);
      await AsyncStorage.removeItem(ACCOUNT_KEY);
    }
    return account;
  } catch {
    return null;
  }
}

export async function saveAccount(account) {
  try {
    if (useSecure) {
      if (account) await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(account));
      else await SecureStore.deleteItemAsync(SECURE_KEY);
      await AsyncStorage.removeItem(ACCOUNT_KEY);
    } else if (account) await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else await AsyncStorage.removeItem(ACCOUNT_KEY);
  } catch {}
}

// ---- Progress sync -------------------------------------------------------------

export async function readLocalProgress() {
  const pairs = await AsyncStorage.multiGet(SYNC_KEYS);
  const out = {};
  for (const [k, v] of pairs) {
    if (v == null) continue;
    try {
      out[k] = JSON.parse(v);
    } catch {}
  }
  return out;
}

export async function writeLocalProgress(data) {
  const pairs = Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)]);
  if (pairs.length) await AsyncStorage.multiSet(pairs);
}

// Used on log-out and account deletion, so the next person on this phone starts clean
export async function clearLocalProgress() {
  await AsyncStorage.multiRemove(SYNC_KEYS);
}

// Download the server copy, combine it with this phone's data, upload the result.
// With pullIntoPhone, also save the combined data on this phone (only safe before the
// screens load, e.g. at start-up or right after logging in).
export async function syncProgress(token, { pullIntoPhone = false } = {}) {
  const [remote, local] = await Promise.all([api.getSync(token), readLocalProgress()]);
  const merged = mergeData(local, remote.data || {});
  if (pullIntoPhone) await writeLocalProgress(merged);
  await api.putSync(token, merged);
  return merged;
}
