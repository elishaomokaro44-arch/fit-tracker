import { Pressable, Text, View } from 'react-native';
import { ACTIVITY_LEVELS, bmrMifflin, calorieTargets, tdee } from '../calc';
import { Card, Field, Segmented, Title, useTheme } from '../ui';

export default function CaloriesScreen({ profile, setProfile }) {
  const { c, s } = useTheme();
  const sex = profile.sex || 'male';
  const activity = profile.activity || 'light';
  const set = (k, v) => setProfile({ ...profile, [k]: v });

  const bmr = bmrMifflin({ sex, age: profile.age, heightCm: profile.heightCm, weightKg: profile.weightKg });
  const total = tdee(bmr, activity);
  const t = calorieTargets(total, sex);

  return (
    <View>
      <Card>
        <Title>About you</Title>
        <Segmented
          value={sex}
          onChange={(v) => set('sex', v)}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
        />
        <View style={{ height: 14 }} />
        <View style={s.row}>
          <Field label="Age" suffix="yrs" keyboardType="number-pad" value={String(profile.age || '')} placeholder="25" onChangeText={(v) => set('age', v)} testID="cal-age" />
          <Field label="Height" suffix="cm" value={String(profile.heightCm || '')} placeholder="170" onChangeText={(v) => set('heightCm', v)} testID="cal-height" />
          <Field label="Weight" suffix="kg" value={String(profile.weightKg || '')} placeholder="70" onChangeText={(v) => set('weightKg', v)} testID="cal-weight" />
        </View>
      </Card>

      <Card>
        <Title>Activity level</Title>
        {ACTIVITY_LEVELS.map((l) => {
          const active = l.key === activity;
          return (
            <Pressable
              key={l.key}
              onPress={() => set('activity', l.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                marginBottom: 8,
                borderColor: active ? c.primary : c.border,
                backgroundColor: active ? c.primarySoft : 'transparent',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: c.text }}>{l.label}</Text>
                <Text style={s.muted}>{l.hint}</Text>
              </View>
              <Text style={s.muted}>×{l.factor}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <Title>Your daily calories</Title>
        {t ? (
          <>
            <View style={[s.row, { marginBottom: 14 }]}>
              <Stat label="BMR (at rest)" value={Math.round(bmr)} testID="cal-bmr" />
              <Stat label="TDEE (with activity)" value={t.maintain} testID="cal-tdee" />
            </View>
            <Target label="Lose ~1 kg / week" kcal={t.loseFast} />
            <Target label="Lose ~0.5 kg / week" kcal={t.lose} />
            <Target label="Maintain weight" kcal={t.maintain} highlight />
            <Target label="Gain ~0.5 kg / week" kcal={t.gain} />
            <Text style={[s.muted, { marginTop: 8 }]}>
              Calculated with the Mifflin-St Jeor formula. Weight-loss targets never go below {t.floor} kcal/day.
            </Text>
          </>
        ) : (
          <Text style={s.muted}>Enter your age, height and weight to see your numbers.</Text>
        )}
      </Card>
    </View>
  );
}

function Stat({ label, value, testID }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.card2, borderRadius: 12, padding: 12 }}>
      <Text style={s.muted}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '800', color: c.text }} testID={testID}>
        {value.toLocaleString()}
      </Text>
      <Text style={s.muted}>kcal / day</Text>
    </View>
  );
}

function Target({ label, kcal, highlight }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}
    >
      <Text style={{ color: c.text, fontWeight: highlight ? '700' : '400' }}>{label}</Text>
      <Text style={{ color: highlight ? c.primary : c.text, fontWeight: '700' }}>
        {kcal.toLocaleString()} kcal
      </Text>
    </View>
  );
}
