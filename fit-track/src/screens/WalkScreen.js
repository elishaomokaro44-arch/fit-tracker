// Activity tab: track a walk, run or bike ride with GPS, then show a summary page.
// (Saved activities still live under the 'fit.walks' storage key, so older walks keep working.)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import RouteMap from '../components/RouteMap';
import {
  ACTIVITIES,
  acceptPoint,
  activityCalories,
  activityOf,
  formatDuration,
  formatKm,
  formatPace,
  formatSpeed,
  paceSecPerKm,
  routeDistanceM,
  simplifySegments,
  speedKmh,
} from '../geo';
import { loadActivityType, loadWalks, saveActivityType, saveWalks } from '../storage';
import { Button, Card, Segmented, Title, useTheme } from '../ui';

const KEEP_AWAKE_TAG = 'activity';
const MIN_SAVE_DISTANCE_M = 20;

// Compact storage format <-> map points
const pack = (segments) => segments.map((seg) => seg.map((p) => [round6(p.latitude), round6(p.longitude)]));
const unpack = (segments) => segments.map((seg) => seg.map(([latitude, longitude]) => ({ latitude, longitude })));
const round6 = (n) => Math.round(n * 1e6) / 1e6;

export default function WalkScreen({ profile, scrollToTop }) {
  const { c, s } = useTheme();
  // view: 'main', or { id, celebrate } to show an activity's summary page
  const [view, setView] = useState('main');
  const [walks, setWalks] = useState([]);
  const [type, setType] = useState('walk'); // chosen activity type
  const [status, setStatus] = useState('idle'); // idle | tracking | paused
  const [permission, setPermission] = useState('unknown'); // unknown | granted | denied
  const [message, setMessage] = useState('');
  const [current, setCurrent] = useState(null);
  const [segments, setSegments] = useState([]);
  const [now, setNow] = useState(Date.now());

  // Timing: seconds from finished stretches + the stretch in progress
  const doneSecs = useRef(0);
  const stretchStart = useRef(null);
  const startedAt = useRef(null);
  const sub = useRef(null);
  const statusRef = useRef('idle');
  const typeRef = useRef('walk'); // the type of the activity in progress
  statusRef.current = status;

  useEffect(() => {
    loadWalks().then(setWalks);
    loadActivityType().then((t) => setType(ACTIVITIES[t] ? t : 'walk'));
    // Check (don't ask) for permission, and show where you are if already allowed
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (!p.granted) return;
        setPermission('granted');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCurrent(toPoint(pos));
      })
      .catch(() => {});
    return () => stopWatching();
  }, []);

  // Tick once a second while tracking, for the clock
  useEffect(() => {
    if (status !== 'tracking') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Opening or leaving a summary page starts at the top of the screen
  useEffect(() => {
    scrollToTop?.();
  }, [view]);

  const elapsed =
    doneSecs.current + (status === 'tracking' && stretchStart.current ? (now - stretchStart.current) / 1000 : 0);
  const distance = useMemo(() => routeDistanceM(segments), [segments]);

  function chooseType(t) {
    setType(t);
    saveActivityType(t);
  }

  async function ensurePermission() {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        setMessage('Location is turned off on this phone. Turn it on in Settings, then try again.');
        return false;
      }
      const p = await Location.requestForegroundPermissionsAsync();
      setPermission(p.granted ? 'granted' : 'denied');
      if (!p.granted) setMessage('FitTrack needs your location to draw your route.');
      return p.granted;
    } catch {
      setMessage('Location isn’t available on this device.');
      return false;
    }
  }

  async function startWatching() {
    stopWatching();
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 },
      (pos) => {
        const point = toPoint(pos);
        setCurrent(point);
        if (statusRef.current !== 'tracking') return;
        const maxSpeed = ACTIVITIES[typeRef.current].maxSpeed;
        setSegments((segs) => {
          const last = segs[segs.length - 1];
          if (!last || !acceptPoint(last[last.length - 1], point, maxSpeed)) return segs;
          return [...segs.slice(0, -1), [...last, point]];
        });
      },
      () => setMessage('Lost the GPS signal. Keep the app open and try moving to a clearer spot.')
    );
  }

  function stopWatching() {
    sub.current?.remove();
    sub.current = null;
  }

  async function start() {
    setMessage('');
    if (!(await ensurePermission())) return;
    typeRef.current = type;
    doneSecs.current = 0;
    startedAt.current = new Date();
    stretchStart.current = Date.now();
    setNow(Date.now());
    setSegments([[]]);
    setStatus('tracking');
    statusRef.current = 'tracking';
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    try {
      await startWatching();
    } catch {
      setMessage('Couldn’t start GPS tracking.');
    }
  }

  function pause() {
    doneSecs.current += (Date.now() - stretchStart.current) / 1000;
    stretchStart.current = null;
    setStatus('paused');
    statusRef.current = 'paused';
  }

  function resume() {
    stretchStart.current = Date.now();
    setNow(Date.now());
    setSegments((segs) => [...segs, []]); // new stretch: no distance counted across the pause
    setStatus('tracking');
    statusRef.current = 'tracking';
  }

  async function stop() {
    if (status === 'tracking') pause();
    stopWatching();
    Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
    const durationSec = Math.round(doneSecs.current);
    const finalSegments = segments.filter((seg) => seg.length > 1);
    const distanceM = routeDistanceM(finalSegments);
    const act = ACTIVITIES[typeRef.current];
    setStatus('idle');
    statusRef.current = 'idle';
    setSegments([]);

    if (distanceM < MIN_SAVE_DISTANCE_M) {
      setMessage(`No movement was recorded, so this ${act.noun} wasn’t saved.`);
      return;
    }
    const activity = {
      id: String(Date.now()),
      type: act.key,
      startedAt: startedAt.current.toISOString(),
      durationSec,
      distanceM: Math.round(distanceM),
      kcal: activityCalories(act.key, distanceM, durationSec, profile.weightKg),
      segments: pack(simplifySegments(finalSegments)),
    };
    const next = [activity, ...walks];
    setWalks(next);
    saveWalks(next);
    setView({ id: activity.id, celebrate: true }); // the summary page
  }

  const deleteWalk = useCallback(
    (id) => {
      const next = walks.filter((w) => w.id !== id);
      setWalks(next);
      saveWalks(next);
      setView('main');
    },
    [walks]
  );

  const viewing = view !== 'main' ? walks.find((w) => w.id === view.id) : null;
  if (viewing) {
    return (
      <ActivitySummary
        key={viewing.id}
        activity={viewing}
        celebrate={view.celebrate}
        onDone={() => setView('main')}
        onDelete={deleteWalk}
      />
    );
  }

  const active = status !== 'idle';
  const act = ACTIVITIES[active ? typeRef.current : type];

  return (
    <View>
      {!active ? (
        <View style={{ marginBottom: 14 }}>
          <Segmented
            value={type}
            onChange={chooseType}
            testID="activity-type"
            options={Object.values(ACTIVITIES).map((a) => ({ value: a.key, label: `${a.icon} ${a.label}` }))}
          />
        </View>
      ) : (
        <View style={[st.livePill, { backgroundColor: status === 'paused' ? c.warnBg : c.primarySoft }]} testID="live-pill">
          <Text style={{ fontSize: 16 }}>{act.icon}</Text>
          <Text style={{ fontWeight: '900', color: status === 'paused' ? c.warnText : c.primary, marginLeft: 6 }}>
            {status === 'paused' ? 'PAUSED' : `${act.noun.toUpperCase()} IN PROGRESS`}
          </Text>
        </View>
      )}

      <RouteMap segments={segments} current={current} live />

      {active ? (
        <Card style={{ marginTop: 14 }}>
          <View style={s.row}>
            <Big label="Distance" value={formatKm(distance)} unit="km" testID="walk-distance" />
            <Big label="Time" value={formatDuration(elapsed)} testID="walk-time" />
            {act.showSpeed ? (
              <Big label="Speed" value={formatSpeed(speedKmh(distance, elapsed))} unit="km/h" testID="walk-pace" />
            ) : (
              <Big label="Pace" value={formatPace(paceSecPerKm(distance, elapsed))} unit="/km" testID="walk-pace" />
            )}
          </View>
          <View style={[s.row, { marginTop: 16 }]}>
            {status === 'tracking' ? (
              <Button variant="outline" title="Pause" onPress={pause} style={{ flex: 1 }} />
            ) : (
              <Button variant="outline" title="Resume" onPress={resume} style={{ flex: 1 }} />
            )}
            <Button title="Finish" onPress={stop} color={c.danger} style={{ flex: 1 }} />
          </View>
          <Text style={[s.muted, { marginTop: 10, textAlign: 'center' }]}>
            Keep FitTrack open during your {act.noun}. The screen stays on while tracking.
          </Text>
        </Card>
      ) : (
        <View style={{ marginTop: 14 }}>
          <Pressable onPress={start} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <LinearGradient colors={[c.primary, c.primary2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.startBtn}>
              <Text style={st.startText} testID="start-button">▶  Start {act.noun}</Text>
            </LinearGradient>
          </Pressable>
          {permission === 'unknown' ? (
            <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>You’ll be asked to allow location the first time.</Text>
          ) : null}
        </View>
      )}

      {message ? (
        <Card style={[s.warnCard, { marginTop: 14 }]}>
          <Text style={{ color: c.warnText }} testID="walk-message">{message}</Text>
          {permission === 'denied' ? (
            <Pressable onPress={() => Linking.openSettings().catch(() => {})} style={{ marginTop: 8 }}>
              <Text style={s.link}>Open Settings</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ marginTop: 14 }}>
        <Title>History</Title>
        {walks.length ? (
          <>
            <WeekSummary walks={walks} />
            {walks.map((w) => {
              const a = activityOf(w);
              return (
                <Pressable key={w.id} onPress={() => setView({ id: w.id, celebrate: false })} accessibilityRole="button" testID="walk-row"
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }}>
                  <View style={[st.rowIcon, { backgroundColor: c.primarySoft }]}>
                    <Text style={{ fontSize: 20 }}>{a.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: c.text }}>{a.label} · {formatKm(w.distanceM)} km</Text>
                    <Text style={s.muted}>{formatWhen(w.startedAt)}</Text>
                  </View>
                  <Text style={[s.muted, { marginRight: 10, textAlign: 'right' }]}>
                    {formatDuration(w.durationSec)}{'\n'}{w.kcal} kcal
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <Text style={s.muted}>Your walks, runs and rides will appear here.</Text>
        )}
      </Card>
    </View>
  );
}

// Shown straight after finishing (celebrate = true) and when opening a past activity.
function ActivitySummary({ activity, celebrate, onDone, onDelete }) {
  const { c, s } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const segments = useMemo(() => unpack(activity.segments), [activity]);
  const a = activityOf(activity);
  const pace = paceSecPerKm(activity.distanceM, activity.durationSec);
  const speed = speedKmh(activity.distanceM, activity.durationSec);

  return (
    <View testID="activity-summary">
      {!celebrate ? (
        <Pressable onPress={onDone} style={{ paddingVertical: 6, marginBottom: 6 }} accessibilityRole="button">
          <Text style={[s.link, { fontSize: 16 }]}>‹ All activities</Text>
        </Pressable>
      ) : null}

      <LinearGradient colors={[c.primary, c.primary2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.summaryHero}>
        <Text style={{ fontSize: 44, textAlign: 'center' }}>{a.icon}</Text>
        <Text style={st.summaryTitle} testID="summary-title">{celebrate ? `${a.done} 🎉` : a.label}</Text>
        <Text style={st.summaryWhen}>{formatWhen(activity.startedAt)}</Text>
        <View style={{ flexDirection: 'row', marginTop: 18 }}>
          <HeroStat label="Distance" value={formatKm(activity.distanceM)} unit="km" testID="detail-distance" />
          <View style={st.divider} />
          <HeroStat label="Time" value={formatDuration(activity.durationSec)} testID="detail-time" />
          <View style={st.divider} />
          <HeroStat label="Calories" value={String(activity.kcal)} unit="kcal" testID="detail-kcal" />
        </View>
      </LinearGradient>

      <RouteMap segments={segments} current={null} live={false} height={240} />

      <View style={[s.row, { marginTop: 14 }]}>
        <Tile label={a.showSpeed ? 'Avg speed' : 'Avg pace'} value={a.showSpeed ? `${formatSpeed(speed)} km/h` : `${formatPace(pace)} /km`} testID="detail-pace" />
        <Tile label={a.showSpeed ? 'Avg pace' : 'Avg speed'} value={a.showSpeed ? `${formatPace(pace)} /km` : `${formatSpeed(speed)} km/h`} />
      </View>
      <Text style={[s.muted, { textAlign: 'center', marginTop: 10, fontSize: 12 }]}>
        Calories are an estimate based on your weight, distance and {a.key === 'cycle' ? 'speed' : 'pace'}.
      </Text>

      {celebrate ? <Button title="Done" onPress={onDone} style={{ marginTop: 16 }} /> : null}
      <Pressable onPress={() => (confirm ? onDelete(activity.id) : setConfirm(true))} style={{ alignItems: 'center', padding: 12 }} accessibilityRole="button">
        <Text style={{ color: c.danger }}>{confirm ? `Tap again to delete this ${a.noun}` : `Delete ${a.noun}`}</Text>
      </Pressable>
    </View>
  );
}

function HeroStat({ label, value, unit, testID }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={st.heroValue} testID={testID}>{value}</Text>
      <Text style={st.heroLabel}>{unit ? `${label} (${unit})` : label}</Text>
    </View>
  );
}

function Tile({ label, value, testID }) {
  const { c, s } = useTheme();
  return (
    <View style={[s.card, { flex: 1, marginBottom: 0, alignItems: 'center', padding: 14 }]}>
      <Text style={s.muted}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '900', color: c.text, marginTop: 2 }} testID={testID}>{value}</Text>
    </View>
  );
}

function WeekSummary({ walks }) {
  const { c } = useTheme();
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = walks.filter((w) => new Date(w.startedAt).getTime() >= weekAgo);
  const km = recent.reduce((n, w) => n + w.distanceM, 0);
  const kcal = recent.reduce((n, w) => n + (w.kcal || 0), 0);
  const counts = Object.values(ACTIVITIES)
    .map((a) => [a.icon, recent.filter((w) => activityOf(w).key === a.key).length])
    .filter(([, n]) => n > 0)
    .map(([icon, n]) => `${icon} ${n}`)
    .join('   ');
  return (
    <View style={{ backgroundColor: c.primarySoft, borderRadius: 16, padding: 12, marginBottom: 6 }} testID="week-summary">
      <Text style={{ color: c.primary, fontWeight: '800' }}>
        Last 7 days: {formatKm(km)} km · {kcal} kcal · {recent.length} {recent.length === 1 ? 'activity' : 'activities'}
      </Text>
      {counts ? <Text style={{ color: c.primary, marginTop: 4 }}>{counts}</Text> : null}
    </View>
  );
}

function Big({ label, value, unit, testID }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.muted}>{label}</Text>
      <Text style={{ fontSize: 26, fontWeight: '900', color: c.text }} testID={testID}>
        {value}
        {unit ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.muted }}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function toPoint(pos) {
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  };
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const st = StyleSheet.create({
  livePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 12 },
  startBtn: { borderRadius: 24, paddingVertical: 22, alignItems: 'center' },
  startText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  summaryHero: { borderRadius: 28, padding: 20, marginBottom: 14 },
  summaryTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  summaryWhen: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontWeight: '600', marginTop: 2 },
  heroValue: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: 4 },
});
