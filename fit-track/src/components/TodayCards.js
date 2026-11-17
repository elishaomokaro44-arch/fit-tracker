// Cards shown on the Today tab: water, streak and badges, evening reminder.
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { BADGES } from '../achievements';
import { remindersSupported } from '../reminders';
import { Button, Card, ProgressRing, Segmented, Title, useTheme } from '../ui';

export function WaterCard({ glasses, goal, onAdd, onRemove, onGoal }) {
  const { c, s } = useTheme();
  const [editing, setEditing] = useState(false);
  const done = glasses >= goal;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Title style={{ flex: 1, marginBottom: 0 }}>💧 Water</Title>
        <Pressable onPress={() => setEditing(!editing)} accessibilityRole="button">
          <Text style={[s.link, { color: c.water }]}>{editing ? 'Done' : 'Change goal'}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing size={96} stroke={11} progress={glasses / goal} color={c.water} track={c.waterSoft}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: c.text }}>{glasses}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: c.muted }}>of {goal}</Text>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: c.text, fontWeight: '700' }} testID="water-count">
            {glasses} of {goal} glasses
          </Text>
          <Text style={[s.muted, { marginBottom: 10 }]}>
            {((glasses * 250) / 1000).toFixed(2)} L of {((goal * 250) / 1000).toFixed(1)} L
          </Text>
          {done ? <Text style={{ color: c.water, fontWeight: '800', marginBottom: 8 }}>Water goal reached! 🎉</Text> : null}
          {!editing ? (
            <View style={s.row}>
              <Button variant="outline" title="−" onPress={onRemove} color={c.water} style={{ paddingHorizontal: 18 }} />
              <Button title="+ Glass" onPress={onAdd} color={c.water} style={{ flex: 1 }} />
            </View>
          ) : null}
        </View>
      </View>
      {editing ? (
        <View style={{ marginTop: 14 }}>
          <Text style={[s.muted, { marginBottom: 6 }]}>Daily goal (glasses of 250 ml)</Text>
          <Segmented value={goal} onChange={onGoal} options={[6, 8, 10, 12].map((n) => ({ value: n, label: `${n}` }))} />
        </View>
      ) : null}
    </Card>
  );
}

export function StreakCard({ current, best, earned, goal }) {
  const { c, s } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: current > 0 ? c.primarySoft : c.card2, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
          <Text style={{ fontSize: 34 }}>{current > 0 ? '🔥' : '🌱'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: c.text }} testID="streak-current">
            {current}-day streak
          </Text>
          <Text style={s.muted}>
            Days in a row hitting {goal.toLocaleString()} steps · best {best}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 18, marginBottom: 10 }}>
        <Title style={{ flex: 1, marginBottom: 0 }}>Badges</Title>
        <Text style={[s.muted, { fontWeight: '700' }]}>{earned.size} / {BADGES.length}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {BADGES.map((b) => {
          const got = earned.has(b.id);
          return (
            <View key={b.id} testID={got ? 'badge-earned' : 'badge-locked'} style={{ width: '33.33%', padding: 4 }}>
              <View
                style={{
                  alignItems: 'center',
                  padding: 8,
                  borderRadius: 18,
                  minHeight: 100,
                  backgroundColor: got ? c.primarySoft : c.card2,
                  borderWidth: got ? 1.5 : 0,
                  borderColor: c.primary,
                }}
              >
                <Text style={{ fontSize: 28, opacity: got ? 1 : 0.3 }}>{got ? b.icon : '🔒'}</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: got ? c.text : c.muted, textAlign: 'center', marginTop: 4 }}>{b.name}</Text>
                <Text style={{ fontSize: 10, color: c.muted, textAlign: 'center' }}>{b.desc}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function ReminderCard({ reminder, onChange, note }) {
  const { c, s } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Title style={{ marginBottom: 2 }}>🔔 Evening reminder</Title>
          <Text style={s.muted}>A notification if you’re short of your step goal.</Text>
        </View>
        <Switch
          value={reminder.enabled}
          onValueChange={(enabled) => onChange({ ...reminder, enabled })}
          disabled={!remindersSupported}
          trackColor={{ true: c.primary, false: c.track }}
          thumbColor="#FFFFFF"
          testID="reminder-switch"
        />
      </View>
      {reminder.enabled ? (
        <View style={{ marginTop: 12 }}>
          <Text style={[s.muted, { marginBottom: 6 }]}>Remind me at</Text>
          <Segmented
            value={reminder.hour}
            onChange={(hour) => onChange({ ...reminder, hour })}
            options={[18, 19, 20, 21].map((h) => ({ value: h, label: `${h - 12} pm` }))}
          />
        </View>
      ) : null}
      {!remindersSupported ? (
        <Text style={[s.muted, { marginTop: 8 }]}>Reminders work in the phone app, not in the browser.</Text>
      ) : null}
      {note ? <Text style={{ marginTop: 8, color: c.warnText }} testID="reminder-note">{note}</Text> : null}
    </Card>
  );
}
