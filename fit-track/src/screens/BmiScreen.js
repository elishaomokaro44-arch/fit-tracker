import { useState } from 'react';
import { Text, View } from 'react-native';
import { bmi, bmiCategory, feetInchesToCm, healthyWeightRange, lbToKg, LB_PER_KG } from '../calc';
import { Card, Field, Segmented, Title, styles, colors } from '../ui';

// Height/weight come from the shared profile so the calorie screen can reuse them.
export default function BmiScreen({ profile, setProfile }) {
  const [units, setUnits] = useState('metric');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [lb, setLb] = useState('');

  const heightCm = profile.heightCm || '';
  const weightKg = profile.weightKg || '';

  const value = bmi(weightKg, heightCm);
  const cat = bmiCategory(value);
  const range = healthyWeightRange(heightCm);

  function onImperial(nextFt, nextIn, nextLb) {
    setFt(nextFt);
    setInch(nextIn);
    setLb(nextLb);
    setProfile({
      ...profile,
      heightCm: nextFt ? feetInchesToCm(nextFt, nextIn).toFixed(1) : '',
      weightKg: nextLb ? lbToKg(nextLb).toFixed(1) : '',
    });
  }

  function switchUnits(u) {
    if (u === 'imperial') {
      // Pre-fill imperial fields from the stored metric values
      const totalIn = Number(heightCm) / 2.54;
      setFt(heightCm ? String(Math.floor(totalIn / 12)) : '');
      setInch(heightCm ? String(Math.round(totalIn % 12)) : '');
      setLb(weightKg ? String(Math.round(Number(weightKg) * LB_PER_KG)) : '');
    }
    setUnits(u);
  }

  // Bar position: map BMI 15–40 onto 0–100%
  const pos = value ? Math.min(100, Math.max(0, ((value - 15) / 25) * 100)) : null;

  return (
    <View>
      <Card>
        <Title>Your measurements</Title>
        <Segmented
          value={units}
          onChange={switchUnits}
          options={[
            { value: 'metric', label: 'Metric (cm, kg)' },
            { value: 'imperial', label: 'Imperial (ft, lb)' },
          ]}
        />
        <View style={{ height: 14 }} />
        {units === 'metric' ? (
          <View style={styles.row}>
            <Field
              label="Height"
              suffix="cm"
              value={String(heightCm)}
              placeholder="170"
              onChangeText={(t) => setProfile({ ...profile, heightCm: t })}
              testID="bmi-height"
            />
            <Field
              label="Weight"
              suffix="kg"
              value={String(weightKg)}
              placeholder="70"
              onChangeText={(t) => setProfile({ ...profile, weightKg: t })}
              testID="bmi-weight"
            />
          </View>
        ) : (
          <View style={styles.row}>
            <Field label="Height" suffix="ft" value={ft} placeholder="5" onChangeText={(t) => onImperial(t, inch, lb)} />
            <Field label=" " suffix="in" value={inch} placeholder="7" onChangeText={(t) => onImperial(ft, t, lb)} />
            <Field label="Weight" suffix="lb" value={lb} placeholder="154" onChangeText={(t) => onImperial(ft, inch, t)} />
          </View>
        )}
      </Card>

      <Card>
        <Title>Your BMI</Title>
        {value ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text style={{ fontSize: 44, fontWeight: '800', color: colors.text }} testID="bmi-value">
                {value.toFixed(1)}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: cat.color }} testID="bmi-category">
                {cat.label}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 12 }}>
              <View style={{ flex: 3.5, backgroundColor: '#3b82f6' }} />
              <View style={{ flex: 6.5, backgroundColor: '#16a34a' }} />
              <View style={{ flex: 5, backgroundColor: '#f59e0b' }} />
              <View style={{ flex: 10, backgroundColor: '#dc2626' }} />
            </View>
            <View style={{ height: 14 }}>
              <View style={{ position: 'absolute', left: `${pos}%`, marginLeft: -6, top: 0, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.text }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.muted}>Under 18.5</Text>
              <Text style={styles.muted}>18.5–24.9</Text>
              <Text style={styles.muted}>25–29.9</Text>
              <Text style={styles.muted}>30+</Text>
            </View>
            {range ? (
              <Text style={[styles.muted, { marginTop: 12 }]}>
                A healthy weight for your height is about {range.min.toFixed(0)}–{range.max.toFixed(0)} kg.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.muted}>Enter your height and weight to see your BMI.</Text>
        )}
      </Card>
      <Text style={[styles.muted, { textAlign: 'center' }]}>
        BMI is a rough guide for adults. It doesn't account for muscle mass, age or body shape.
      </Text>
    </View>
  );
}
