import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lastNDays } from './calc';

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

// The account (secret token + profile) is kept on the phone.
const ACCOUNT_KEY = 'fit.account';
export async function loadAccount() {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export async function saveAccount(account) {
  try {
    if (account) await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else await AsyncStorage.removeItem(ACCOUNT_KEY);
  } catch {}
}
