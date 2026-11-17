import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import StepsScreen from './src/screens/StepsScreen';
import BmiScreen from './src/screens/BmiScreen';
import CaloriesScreen from './src/screens/CaloriesScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import WalkScreen from './src/screens/WalkScreen';
import { api, loadAccount, saveAccount } from './src/api';
import { loadProfile, loadThemeMode, saveProfile, saveThemeMode } from './src/storage';
import { Segmented, ThemeProvider, useTheme } from './src/ui';

const TABS = [
  { key: 'steps', label: 'Today', icon: '👟', title: 'Today' },
  { key: 'walk', label: 'Activity', icon: '🏃', title: 'Activity' },
  { key: 'bmi', label: 'BMI', icon: '⚖️', title: 'Body' },
  { key: 'calories', label: 'Calories', icon: '🔥', title: 'Calories' },
  { key: 'friends', label: 'Friends', icon: '🏆', title: 'Friends' },
];

const MODE_ICON = { system: '🌓', light: '☀️', dark: '🌙' };

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
        <Main mode={mode} setMode={changeMode} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Main({ mode, setMode }) {
  const { c, scheme } = useTheme();
  const [tab, setTab] = useState('steps');
  const [showAppearance, setShowAppearance] = useState(false);
  const scrollRef = useRef(null);
  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), []);

  // Each tab starts at the top
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [tab]);
  const [profile, setProfileState] = useState({});
  const loaded = useRef(false);

  // Match the area behind the app (seen when the keyboard opens) to the theme
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

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

  // Leaderboard account (null = not joined). Steps upload to the server when they change.
  const [account, setAccountState] = useState(null);
  const accountRef = useRef(null);
  const historyRef = useRef(null);
  const syncTimer = useRef(null);

  useEffect(() => {
    loadAccount().then((a) => {
      accountRef.current = a;
      setAccountState(a);
    });
  }, []);

  const setAccount = useCallback((a) => {
    accountRef.current = a;
    setAccountState(a);
    saveAccount(a);
  }, []);

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

  // Upload as soon as someone joins, so they appear with today's steps
  useEffect(() => {
    if (account) syncNow().catch(() => {});
  }, [account, syncNow]);

  const current = TABS.find((t) => t.key === tab);

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={[st.appName, { color: c.primary }]}>FITTRACK</Text>
          <Text style={[st.screenTitle, { color: c.text }]}>{current.title}</Text>
        </View>
        <Pressable
          onPress={() => setShowAppearance(!showAppearance)}
          style={[st.modeBtn, { backgroundColor: c.card, borderColor: c.border }]}
          accessibilityRole="button"
          accessibilityLabel="Appearance"
          testID="appearance-button"
        >
          <Text style={{ fontSize: 18 }}>{MODE_ICON[mode]}</Text>
        </Pressable>
      </View>
      {showAppearance ? (
        <View style={st.appearance} testID="appearance-panel">
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>APPEARANCE</Text>
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              setShowAppearance(false);
            }}
            options={[
              { value: 'system', label: '🌓 Auto' },
              { value: 'light', label: '☀️ Light' },
              { value: 'dark', label: '🌙 Dark' },
            ]}
          />
        </View>
      ) : null}
      <ScrollView ref={scrollRef} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {/* Today stays mounted so the sensor keeps counting while you use other tabs */}
        <View style={{ display: tab === 'steps' ? 'flex' : 'none' }}>
          <StepsScreen profile={profile} onHistoryChange={onHistoryChange} active={tab === 'steps'} />
        </View>
        {/* Walk stays mounted too, so GPS tracking continues if you switch tabs mid-walk */}
        <View style={{ display: tab === 'walk' ? 'flex' : 'none' }}>
          <WalkScreen profile={profile} scrollToTop={scrollToTop} />
        </View>
        {tab === 'bmi' && <BmiScreen profile={profile} setProfile={setProfile} />}
        {tab === 'calories' && <CaloriesScreen profile={profile} setProfile={setProfile} />}
        {tab === 'friends' && <FriendsScreen account={account} setAccount={setAccount} syncNow={syncNow} />}
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
  modeBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  appearance: { paddingHorizontal: 18, paddingBottom: 6 },
  content: { padding: 16, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 2 : 8, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center' },
  tabIcon: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14 },
  tabLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
