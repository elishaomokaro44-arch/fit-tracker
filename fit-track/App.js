import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import StepsScreen from './src/screens/StepsScreen';
import BmiScreen from './src/screens/BmiScreen';
import CaloriesScreen from './src/screens/CaloriesScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import { api, loadAccount, saveAccount } from './src/api';
import { loadProfile, saveProfile } from './src/storage';
import { colors } from './src/ui';

const TABS = [
  { key: 'steps', label: 'Steps', icon: '👟', title: 'Step tracker' },
  { key: 'bmi', label: 'BMI', icon: '⚖️', title: 'BMI calculator' },
  { key: 'calories', label: 'Calories', icon: '🔥', title: 'Calorie calculator' },
  { key: 'friends', label: 'Friends', icon: '👥', title: 'Friends & leaderboard' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [tab, setTab] = useState('steps');
  const [profile, setProfileState] = useState({});
  const loaded = useRef(false);

  // Height, weight, age, sex and activity are shared by the Steps, BMI and Calories screens.
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
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <Text style={s.appName}>FitTrack</Text>
        <Text style={s.screenTitle}>{current.title}</Text>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Steps stays mounted so the sensor keeps counting while you use other tabs */}
        <View style={{ display: tab === 'steps' ? 'flex' : 'none' }}>
          <StepsScreen profile={profile} onHistoryChange={onHistoryChange} />
        </View>
        {tab === 'bmi' && <BmiScreen profile={profile} setProfile={setProfile} />}
        {tab === 'calories' && <CaloriesScreen profile={profile} setProfile={setProfile} />}
        {tab === 'friends' && <FriendsScreen account={account} setAccount={setAccount} syncNow={syncNow} />}
      </ScrollView>
      <View style={s.tabBar}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text style={{ fontSize: 20, opacity: active ? 1 : 0.5 }}>{t.icon}</Text>
              <Text style={[s.tabLabel, active && { color: colors.primary }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  appName: { color: colors.primary, fontWeight: '800', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  screenTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
  content: { padding: 16, paddingBottom: 32, width: '100%', maxWidth: 560, alignSelf: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingBottom: Platform.OS === 'ios' ? 4 : 8,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 2 },
});
