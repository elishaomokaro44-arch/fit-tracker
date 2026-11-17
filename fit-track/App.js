import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import StepsScreen from './src/screens/StepsScreen';
import BmiScreen from './src/screens/BmiScreen';
import CaloriesScreen from './src/screens/CaloriesScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import WalkScreen from './src/screens/WalkScreen';
import AuthScreen from './src/screens/AuthScreen';
import AccountPanel, { Avatar } from './src/components/AccountPanel';
import { api, clearLocalProgress, loadAccount, saveAccount, syncProgress } from './src/api';
import { profileFromUser } from './src/sync';
import { loadOwner, loadProfile, loadThemeMode, saveOwner, saveProfile, saveThemeMode } from './src/storage';
import { Segmented, ThemeProvider, useTheme } from './src/ui';

const TABS = [
  { key: 'steps', label: 'Today', icon: '👟', title: 'Today' },
  { key: 'walk', label: 'Activity', icon: '🏃', title: 'Activity' },
  { key: 'bmi', label: 'BMI', icon: '⚖️', title: 'Body' },
  { key: 'calories', label: 'Calories', icon: '🔥', title: 'Calories' },
  { key: 'friends', label: 'Friends', icon: '🏆', title: 'Friends' },
];

const MODE_ICON = { system: '🌓', light: '☀️', dark: '🌙' };
const SYNC_EVERY_MS = 5 * 60 * 1000;

// Gives up waiting after `ms` (the app still opens if the server is slow or offline)
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

export default function App() {
  const [mode, setMode] = useState('system');
  useEffect(() => {
    loadThemeMode().then(setMode);
  }, []);
  const changeMode = useCallback((m) => {
    setMode(m);
    saveThemeMode(m);
  }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider mode={mode}>
        <Root mode={mode} setMode={changeMode} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Decides what to show: a loading screen, sign-up / log-in, or the app itself.
function Root({ mode, setMode }) {
  const { c, scheme } = useTheme();
  const [phase, setPhase] = useState('loading'); // loading | auth | ready
  const [account, setAccountState] = useState(null);
  const [legacy, setLegacy] = useState(null); // a leaderboard-only profile from before accounts existed
  const [notice, setNotice] = useState('');

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  useEffect(() => {
    (async () => {
      const a = await loadAccount();
      if (a?.user?.email) {
        // Bring in anything saved from other phones before the screens load
        try {
          await withTimeout(syncProgress(a.token, { pullIntoPhone: true }), 5000);
        } catch (e) {
          if (e.status === 401) {
            // This login is no longer valid (e.g. the password was reset on another phone).
            // Keep the data on this phone; it's cleared only if someone else logs in.
            await saveAccount(null);
            setNotice('You’ve been signed out. Please log in again.');
            setPhase('auth');
            return;
          }
          // offline or slow server: open the app anyway and sync later
        }
        setAccountState(a);
        setPhase('ready');
      } else {
        setLegacy(a);
        setPhase('auth');
      }
    })();
  }, []);

  async function onAuthed({ user, token }, how) {
    // Someone else's progress is still on this phone (they were signed out without logging out): clear it
    const owner = await loadOwner();
    if (owner != null && owner !== user.id) await clearLocalProgress();
    await saveOwner(user.id);

    const acc = { user, token };
    await saveAccount(acc);
    if (how === 'login') {
      // New phone: download everything
      await withTimeout(syncProgress(token, { pullIntoPhone: true }), 8000).catch(() => {});
      const p = await loadProfile();
      if (!p.heightCm) await saveProfile(profileFromUser(user, p));
    } else {
      // Sign-up: the details just entered become this phone's profile, then back everything up
      await saveProfile(profileFromUser(user, await loadProfile()));
      syncProgress(token).catch(() => {});
    }
    setLegacy(null);
    setNotice('');
    setAccountState(acc);
    setPhase('ready');
  }

  // Log out (backs up first), delete the account, or handle being signed out by the server
  const signOut = useCallback(
    async ({ deleteAccount = false, why = '', expired = false } = {}) => {
      const a = account;
      if (a && deleteAccount) {
        await api.deleteMe(a.token); // errors are shown by the account panel
      } else if (a && !expired) {
        await withTimeout(syncProgress(a.token), 5000).catch(() => {});
        await api.logOut(a.token).catch(() => {});
      }
      await saveAccount(null);
      // After a normal log-out or deletion, wipe this phone. If the server signed us out
      // (e.g. password reset on another phone), keep the data in case it hasn't been backed up;
      // it's cleared if someone else logs in.
      if (!expired) {
        await clearLocalProgress();
        await saveOwner(null);
      }
      setNotice(why);
      setAccountState(null);
      setLegacy(null);
      setPhase('auth');
    },
    [account]
  );

  const updateAccount = useCallback(
    (a) => {
      if (!a) {
        signOut({ expired: true, why: 'You’ve been signed out. Please log in again.' });
        return;
      }
      setAccountState(a);
      saveAccount(a);
    },
    [signOut]
  );

  if (phase === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Text style={{ color: c.primary, fontSize: 28, fontWeight: '900', marginBottom: 16 }}>👟 FitTrack</Text>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (phase === 'auth') {
    return (
      <>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <AuthScreen legacyAccount={legacy} notice={notice} onDone={onAuthed} />
      </>
    );
  }
  return <Main key={account.user.id} mode={mode} setMode={setMode} account={account} updateAccount={updateAccount} signOut={signOut} />;
}

function Main({ mode, setMode, account, updateAccount, signOut }) {
  const { c, scheme } = useTheme();
  const [tab, setTab] = useState('steps');
  const [panel, setPanel] = useState(null); // null | 'appearance' | 'account'
  const scrollRef = useRef(null);
  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), []);

  // Each tab starts at the top
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [tab]);

  const [profile, setProfileState] = useState({});
  const loaded = useRef(false);

  // Height, weight, age, sex and activity are shared by the Today, BMI and Calories screens.
  useEffect(() => {
    loadProfile().then((p) => {
      setProfileState(p);
      loaded.current = true;
    });
  }, []);

  const setProfile = (p) => {
    setProfileState(p);
    if (loaded.current) saveProfile(p);
  };

  // Back up progress every few minutes and whenever the app goes into the background
  useEffect(() => {
    const backup = () => syncProgress(account.token).catch(() => {});
    const id = setInterval(backup, SYNC_EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'background' && backup());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [account.token]);

  // Leaderboard: today's steps upload a moment after they change
  const accountRef = useRef(account);
  accountRef.current = account;
  const historyRef = useRef(null);
  const syncTimer = useRef(null);

  const syncNow = useCallback(async () => {
    clearTimeout(syncTimer.current);
    const a = accountRef.current;
    if (a && historyRef.current) await api.syncSteps(a.token, historyRef.current);
  }, []);

  const onHistoryChange = useCallback(
    (h) => {
      historyRef.current = h;
      clearTimeout(syncTimer.current);
      // Wait a moment so quick changes go up as one request; ignore network errors here,
      // the next change or a leaderboard refresh will try again.
      syncTimer.current = setTimeout(() => syncNow().catch(() => {}), 2000);
    },
    [syncNow]
  );

  const current = TABS.find((t) => t.key === tab);
  const firstName = (account.user.name || '').trim().split(/\s+/)[0];
  const togglePanel = (p) => setPanel(panel === p ? null : p);

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          {tab === 'steps' ? (
            <>
              <Text style={[st.appName, { color: c.primary }]}>WELCOME BACK,</Text>
              <Text style={[st.screenTitle, { color: c.text }]} numberOfLines={1} testID="welcome">
                {firstName} 👋
              </Text>
            </>
          ) : (
            <>
              <Text style={[st.appName, { color: c.primary }]}>FITTRACK</Text>
              <Text style={[st.screenTitle, { color: c.text }]}>{current.title}</Text>
            </>
          )}
        </View>
        <Pressable
          onPress={() => togglePanel('appearance')}
          style={[st.roundBtn, { backgroundColor: c.card, borderColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel="Appearance"
          testID="appearance-button"
        >
          <Text style={{ fontSize: 18 }}>{MODE_ICON[mode]}</Text>
        </Pressable>
        <Pressable onPress={() => togglePanel('account')} style={{ marginLeft: 8 }} accessibilityRole="button" accessibilityLabel="Account" testID="account-button">
          <Avatar name={account.user.name} size={42} />
        </Pressable>
      </View>
      {panel === 'appearance' ? (
        <View style={st.appearance} testID="appearance-panel">
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>APPEARANCE</Text>
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              setPanel(null);
            }}
            options={[
              { value: 'system', label: '🌓 Auto' },
              { value: 'light', label: '☀️ Light' },
              { value: 'dark', label: '🌙 Dark' },
            ]}
          />
        </View>
      ) : null}
      {panel === 'account' ? <AccountPanel account={account} updateAccount={updateAccount} signOut={signOut} /> : null}
      <ScrollView ref={scrollRef} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {/* Today stays mounted so the sensor keeps counting while you use other tabs */}
        <View style={{ display: tab === 'steps' ? 'flex' : 'none' }}>
          <StepsScreen profile={profile} onHistoryChange={onHistoryChange} active={tab === 'steps'} />
        </View>
        {/* Activity stays mounted too, so GPS tracking continues if you switch tabs mid-activity */}
        <View style={{ display: tab === 'walk' ? 'flex' : 'none' }}>
          <WalkScreen profile={profile} scrollToTop={scrollToTop} />
        </View>
        {tab === 'bmi' && <BmiScreen profile={profile} setProfile={setProfile} />}
        {tab === 'calories' && <CaloriesScreen profile={profile} setProfile={setProfile} />}
        {tab === 'friends' && <FriendsScreen account={account} setAccount={updateAccount} syncNow={syncNow} />}
      </ScrollView>
      <View style={[st.tabBar, { backgroundColor: c.tabBar, borderTopColor: c.border }]}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={st.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <View style={[st.tabIcon, active && { backgroundColor: c.primarySoft }]}>
                <Text style={{ fontSize: 19, opacity: active ? 1 : 0.55 }}>{t.icon}</Text>
              </View>
              <Text style={[st.tabLabel, { color: active ? c.primary : c.muted }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'center' },
  appName: { fontWeight: '900', fontSize: 12, letterSpacing: 2 },
  screenTitle: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  roundBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  appearance: { paddingHorizontal: 18, paddingBottom: 6 },
  content: { padding: 16, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 2 : 8, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center' },
  tabIcon: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14 },
  tabLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
