import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pedometer } from 'expo-sensors';
import { dayKey, lastNDays, stepStats } from '../calc';
import {
  loadGoal, loadSteps, saveGoal, saveSteps,
  loadWater, saveWater, loadWaterGoal, saveWaterGoal,
  loadReminder, saveReminder, loadWalks, loadWeights, loadBadges, saveBadges,
} from '../storage';
import { bestStreak, currentStreak, earnedBadges } from '../achievements';
import { requestReminderPermission, scheduleStepReminders } from '../reminders';
import { ReminderCard, StreakCard, WaterCard } from '../components/TodayCards';
import { Button, Card, Field, ProgressRing, Title, useTheme } from '../ui';

// history = { 'YYYY-MM-DD': { sensor: number, manual: number } }
const total = (entry) => (entry ? (entry.sensor || 0) + (entry.manual || 0) : 0);

function startOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function StepsScreen({ profile, onHistoryChange, active }) {
  const { c, s } = useTheme();
  const [history, setHistory] = useState({});
  const [goal, setGoal] = useState(10000);
  const [loaded, setLoaded] = useState(false);
  const [sensor, setSensor] = useState('checking'); // checking | on | unavailable | denied
  const [addText, setAddText] = useState('');
  const [goalText, setGoalText] = useState('');
  const [today, setToday] = useState(dayKey());
  const lastWatch = useRef(null);
  const [water, setWater] = useState({});
  const [waterGoal, setWaterGoal] = useState(8);
  const [reminder, setReminder] = useState({ enabled: false, hour: 19 });
  const [reminderNote, setReminderNote] = useState('');
  const [walks, setWalks] = useState([]);
  const [weights, setWeights] = useState([]);
  const [savedBadges, setSavedBadges] = useState([]);

  // Load saved data
  useEffect(() => {
    (async () => {
      const [h, g, w, wg, r, b] = await Promise.all([loadSteps(), loadGoal(), loadWater(), loadWaterGoal(), loadReminder(), loadBadges()]);
      setSavedBadges(b);
      setHistory(h);
      setGoal(g);
      setGoalText(String(g));
      setWater(w);
      setWaterGoal(wg);
      setReminder(r);
      setLoaded(true);
    })();
  }, []);

  // Walks and weights are saved by other tabs; re-read them whenever this tab is shown (for badges)
  useEffect(() => {
    if (!active) return;
    loadWalks().then(setWalks);
    loadWeights().then(setWeights);
  }, [active]);

  // Save whenever history changes (after the first load)
  useEffect(() => {
    if (!loaded) return;
    saveSteps(history);
    onHistoryChange?.(history);
  }, [history, loaded]);

  // Keep "today" correct if the app stays open past midnight
  useEffect(() => {
    const id = setInterval(() => setToday(dayKey()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const setSensorSteps = (key, steps) =>
    setHistory((h) => ({ ...h, [key]: { ...h[key], sensor: steps } }));

  // Motion sensor (pedometer)
  useEffect(() => {
    if (!loaded) return;
    let sub;
    let appSub;
    let cancelled = false;

    // iOS keeps 7 days of step data, so read whole days from the system.
    async function refreshIOS() {
      const now = new Date();
      for (const key of lastNDays(7, now)) {
        const start = startOfDay(key);
        const end = key === dayKey(now) ? now : new Date(start.getTime() + 86400000);
        try {
          const r = await Pedometer.getStepCountAsync(start, end);
          if (!cancelled) setSensorSteps(key, r.steps);
        } catch {}
      }
    }

    (async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (!available) return setSensor('unavailable');
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm.granted) return setSensor('denied');
        if (cancelled) return;
        setSensor('on');

        if (Platform.OS === 'ios') {
          await refreshIOS();
          sub = Pedometer.watchStepCount(() => {
            const now = new Date();
            Pedometer.getStepCountAsync(startOfDay(dayKey(now)), now)
              .then((r) => setSensorSteps(dayKey(now), r.steps))
              .catch(() => {});
          });
          appSub = AppState.addEventListener('change', (s) => s === 'active' && refreshIOS());
        } else {
          // Android: the watcher reports steps since it started, so add the difference
          // to today's stored count each time. Counts only while the app is open.
          lastWatch.current = 0;
          sub = Pedometer.watchStepCount(({ steps }) => {
            const delta = steps - (lastWatch.current || 0);
            lastWatch.current = steps;
            if (delta <= 0) return;
            const key = dayKey();
            setHistory((h) => ({ ...h, [key]: { ...h[key], sensor: (h[key]?.sensor || 0) + delta } }));
          });
        }
      } catch {
        setSensor('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      appSub?.remove();
    };
  }, [loaded]);

  function addManual(n) {
    const amount = Math.round(Number(n));
    if (!amount) return;
    setHistory((h) => {
      const cur = h[today] || {};
      const manual = Math.max(-(cur.sensor || 0), (cur.manual || 0) + amount);
      return { ...h, [today]: { ...cur, manual } };
    });
    setAddText('');
  }

  function clearManual() {
    setHistory((h) => ({ ...h, [today]: { ...h[today], manual: 0 } }));
  }

  function saveGoalText() {
    const g = Math.round(Number(goalText));
    if (g > 0) {
      setGoal(g);
      saveGoal(g);
    } else {
      setGoalText(String(goal));
    }
  }

  const steps = total(history[today]);

  // Rebuild evening reminders when steps, goal or settings change (waits a few seconds so
  // a burst of sensor updates only reschedules once)
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      scheduleStepReminders({ ...reminder, steps, goal }).catch(() => {});
    }, 3000);
    return () => clearTimeout(id);
  }, [loaded, steps, goal, reminder.enabled, reminder.hour]);

  async function changeReminder(next) {
    setReminderNote('');
    if (next.enabled && !reminder.enabled) {
      const ok = await requestReminderPermission().catch(() => false);
      if (!ok) {
        setReminderNote('Notifications are turned off for FitTrack. Allow them in your phone’s Settings to get reminders.');
        return;
      }
    }
    setReminder(next);
    saveReminder(next);
  }

  function changeWater(delta) {
    setWater((w) => {
      const next = { ...w, [today]: Math.max(0, Math.min(30, (w[today] || 0) + delta)) };
      saveWater(next);
      return next;
    });
  }

  function changeWaterGoal(g) {
    setWaterGoal(g);
    saveWaterGoal(g);
  }

  const streak = useMemo(() => currentStreak(history, goal, today), [history, goal, today]);
  const best = useMemo(() => bestStreak(history, goal), [history, goal]);
  // Badges earned now, plus any earned before (so changing a goal never takes a badge away)
  const earned = useMemo(() => {
    const now = earnedBadges({ history, goal, walks, water, waterGoal, weights });
    savedBadges.forEach((id) => now.add(id));
    return now;
  }, [history, goal, walks, water, waterGoal, weights, savedBadges]);

  useEffect(() => {
    if (loaded && earned.size > savedBadges.length) {
      const all = [...earned];
      setSavedBadges(all);
      saveBadges(all);
    }
  }, [loaded, earned]);

  const pct = Math.min(1, steps / goal);
  const { km, kcal } = stepStats(steps, profile.heightCm, profile.weightKg);
  const week = lastNDays(7);

  const sensorText = {
    checking: 'Checking for a step sensor…',
    on:
      Platform.OS === 'ios'
        ? 'Step sensor on. Steps are read from your iPhone’s motion data.'
        : 'Step sensor on. Steps are counted while the app is open.',
    unavailable: 'No step sensor here. Add your steps by hand below.',
    denied: 'Motion permission was refused. Allow “Physical activity / Motion” in settings, or add steps by hand.',
  }[sensor];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const done = pct >= 1;
  const glasses = water[today] || 0;

  return (
    <View>
      {/* Hero: big step ring on a gradient */}
      <LinearGradient
        colors={[c.primary, c.primary2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={hero.card}
      >
        <Text style={hero.greeting}>{greeting} 👋</Text>
        <Text style={hero.sub}>
          {done ? 'Goal smashed today. Keep it up!' : `${(goal - steps).toLocaleString()} steps to go`}
        </Text>
        <View style={{ alignItems: 'center', marginVertical: 14 }}>
          <ProgressRing size={210} stroke={18} progress={pct} color="#FFFFFF" track="rgba(255,255,255,0.25)" testID="steps-ring">
            <Text style={hero.icon}>{done ? '🏆' : '👟'}</Text>
            <Text style={hero.steps} testID="steps-today">{steps.toLocaleString()}</Text>
            <Text style={hero.goal}>of {goal.toLocaleString()} · {Math.round((steps / goal) * 100)}%</Text>
          </ProgressRing>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <HeroChip icon="📍" value={`${km.toFixed(2)} km`} label="Distance" />
          <HeroChip icon="⚡" value={`${Math.round(kcal)}`} label="kcal" />
          <HeroChip icon="🔥" value={`${streak}`} label={streak === 1 ? 'day streak' : 'day streak'} />
          <HeroChip icon="💧" value={`${glasses}/${waterGoal}`} label="water" />
        </View>
      </LinearGradient>
      <Text style={[s.muted, { textAlign: 'center', marginTop: -4, marginBottom: 14, fontSize: 12 }]} testID="sensor-status">
        {sensorText}
      </Text>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Title style={{ flex: 1, marginBottom: 0 }}>This week</Title>
          <Text style={s.muted}>{week.filter((k) => total(history[k]) >= goal).length}/7 goals hit</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((k) => {
            const v = total(history[k]);
            const d = startOfDay(k);
            const hit = v >= goal;
            const isToday = k === today;
            return (
              <View key={k} style={{ alignItems: 'center' }} testID="week-ring">
                <ProgressRing size={40} stroke={5} progress={v / goal} color={hit ? c.success : isToday ? c.primary : c.bar}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: c.text }}>
                    {hit ? '✓' : v >= 1000 ? `${Math.floor(v / 1000)}k` : v || ''}
                  </Text>
                </ProgressRing>
                <Text style={{ fontSize: 11, color: isToday ? c.primary : c.muted, marginTop: 6, fontWeight: isToday ? '800' : '600' }}>
                  {d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <Title>Add steps</Title>
        <View style={[s.row, { alignItems: 'flex-end' }]}>
          <Field
            placeholder="e.g. 2500"
            keyboardType="number-pad"
            value={addText}
            onChangeText={setAddText}
            onSubmitEditing={() => addManual(addText)}
            testID="steps-add-input"
          />
          <Button title="Add" onPress={() => addManual(addText)} />
        </View>
        <View style={[s.row, { marginTop: 10 }]}>
          <Button variant="outline" title="+500" onPress={() => addManual(500)} style={{ flex: 1 }} />
          <Button variant="outline" title="+1,000" onPress={() => addManual(1000)} style={{ flex: 1 }} />
          <Button variant="outline" title="Reset" onPress={clearManual} style={{ flex: 1 }} color={c.muted} />
        </View>
        <Text style={[s.muted, { marginTop: 8 }]}>
          Reset removes steps you added by hand today. Sensor steps are kept.
        </Text>
      </Card>

      <WaterCard
        glasses={glasses}
        goal={waterGoal}
        onAdd={() => changeWater(1)}
        onRemove={() => changeWater(-1)}
        onGoal={changeWaterGoal}
      />

      <StreakCard current={streak} best={best} earned={earned} goal={goal} />

      <ReminderCard reminder={reminder} onChange={changeReminder} note={reminderNote} />

      <Card>
        <Title>Daily step goal</Title>
        <View style={[s.row, { alignItems: 'flex-end' }]}>
          <Field
            suffix="steps"
            keyboardType="number-pad"
            value={goalText}
            onChangeText={setGoalText}
            onSubmitEditing={saveGoalText}
            testID="goal-input"
          />
          <Button title="Save" onPress={saveGoalText} />
        </View>
      </Card>
    </View>
  );
}

function HeroChip({ icon, value, label }) {
  return (
    <View style={hero.chip}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={hero.chipValue} numberOfLines={1}>{value}</Text>
      <Text style={hero.chipLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const hero = StyleSheet.create({
  card: { borderRadius: 28, padding: 20, marginBottom: 14 },
  greeting: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600', marginTop: 2 },
  icon: { fontSize: 24 },
  steps: { color: '#FFFFFF', fontSize: 46, fontWeight: '900', letterSpacing: -1 },
  goal: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  chip: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 16, paddingVertical: 10, alignItems: 'center' },
  chipValue: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, marginTop: 2 },
  chipLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '700' },
});
