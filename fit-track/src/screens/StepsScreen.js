import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { dayKey, lastNDays, stepStats } from '../calc';
import { loadGoal, loadSteps, saveGoal, saveSteps } from '../storage';
import { Button, Card, Field, Title, styles, colors } from '../ui';

// history = { 'YYYY-MM-DD': { sensor: number, manual: number } }
const total = (entry) => (entry ? (entry.sensor || 0) + (entry.manual || 0) : 0);

function startOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function StepsScreen({ profile, onHistoryChange }) {
  const [history, setHistory] = useState({});
  const [goal, setGoal] = useState(10000);
  const [loaded, setLoaded] = useState(false);
  const [sensor, setSensor] = useState('checking'); // checking | on | unavailable | denied
  const [addText, setAddText] = useState('');
  const [goalText, setGoalText] = useState('');
  const [today, setToday] = useState(dayKey());
  const lastWatch = useRef(null);

  // Load saved data
  useEffect(() => {
    (async () => {
      const [h, g] = await Promise.all([loadSteps(), loadGoal()]);
      setHistory(h);
      setGoal(g);
      setGoalText(String(g));
      setLoaded(true);
    })();
  }, []);

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
  const pct = Math.min(1, steps / goal);
  const { km, kcal } = stepStats(steps, profile.heightCm, profile.weightKg);
  const week = lastNDays(7);
  const weekMax = Math.max(goal, ...week.map((k) => total(history[k])));

  const sensorText = {
    checking: 'Checking for a step sensor…',
    on:
      Platform.OS === 'ios'
        ? 'Step sensor on. Steps are read from your iPhone’s motion data.'
        : 'Step sensor on. Steps are counted while the app is open.',
    unavailable: 'No step sensor here. Add your steps by hand below.',
    denied: 'Motion permission was refused. Allow “Physical activity / Motion” in settings, or add steps by hand.',
  }[sensor];

  return (
    <View>
      <Card style={{ alignItems: 'center' }}>
        <Text style={styles.muted}>Today</Text>
        <Text style={{ fontSize: 52, fontWeight: '800', color: colors.text }} testID="steps-today">
          {steps.toLocaleString()}
        </Text>
        <Text style={styles.muted}>of {goal.toLocaleString()} steps · {Math.round(pct * 100)}%</Text>
        <View style={{ width: '100%', height: 12, backgroundColor: '#eef2f4', borderRadius: 6, marginTop: 14, overflow: 'hidden' }}>
          <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: pct >= 1 ? '#16a34a' : colors.primary }} />
        </View>
        {pct >= 1 ? <Text style={{ marginTop: 8, color: '#16a34a', fontWeight: '700' }}>Goal reached!</Text> : null}
        <View style={[styles.row, { marginTop: 14, width: '100%' }]}>
          <Mini label="Distance" value={`${km.toFixed(2)} km`} />
          <Mini label="Burned (approx.)" value={`${Math.round(kcal)} kcal`} />
        </View>
        <Text style={[styles.muted, { marginTop: 12, textAlign: 'center' }]} testID="sensor-status">
          {sensorText}
        </Text>
      </Card>

      <Card>
        <Title>Add steps by hand</Title>
        <View style={[styles.row, { alignItems: 'flex-end' }]}>
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
        <View style={[styles.row, { marginTop: 10 }]}>
          <Button variant="outline" title="+500" onPress={() => addManual(500)} style={{ flex: 1 }} />
          <Button variant="outline" title="+1,000" onPress={() => addManual(1000)} style={{ flex: 1 }} />
          <Button variant="outline" title="Reset" onPress={clearManual} style={{ flex: 1 }} />
        </View>
        <Text style={[styles.muted, { marginTop: 8 }]}>
          Reset removes steps you added by hand today. Sensor steps are kept.
        </Text>
      </Card>

      <Card>
        <Title>Daily goal</Title>
        <View style={[styles.row, { alignItems: 'flex-end' }]}>
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

      <Card>
        <Title>Last 7 days</Title>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 8 }}>
          {week.map((k) => {
            const v = total(history[k]);
            const d = startOfDay(k);
            return (
              <View key={k} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>
                  {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                </Text>
                <View
                  style={{
                    width: '100%',
                    height: Math.max(3, (v / weekMax) * 100),
                    borderRadius: 6,
                    backgroundColor: v >= goal ? '#16a34a' : k === today ? colors.primary : '#99d5cf',
                  }}
                />
                <Text style={{ fontSize: 11, color: k === today ? colors.text : colors.muted, marginTop: 6, fontWeight: k === today ? '700' : '400' }}>
                  {d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3)}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[styles.muted, { marginTop: 10 }]}>Green bars reached your goal.</Text>
      </Card>
    </View>
  );
}

function Mini({ label, value }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10, alignItems: 'center' }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>{value}</Text>
    </View>
  );
}
