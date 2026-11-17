// Weight log with a line chart. Logging a weight also updates the weight used by BMI and Calories.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { chartPoints, upsertWeight } from '../achievements';
import { dayKey } from '../calc';
import { loadWeights, saveWeights } from '../storage';
import { Button, Card, Field, Title, useTheme } from '../ui';

const W = 320;
const H = 160;

export default function WeightLog({ profile, setProfile }) {
  const { c, s } = useTheme();
  const [log, setLog] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [width, setWidth] = useState(W);

  useEffect(() => {
    loadWeights().then(setLog);
  }, []);

  function save(next) {
    setLog(next);
    saveWeights(next);
    const latest = next[next.length - 1];
    if (latest) setProfile({ ...profile, weightKg: String(latest.kg) });
  }

  function add() {
    const kg = Math.round(Number(String(text).replace(',', '.')) * 10) / 10;
    if (!(kg >= 20 && kg <= 400)) return setError('Enter a weight between 20 and 400 kg.');
    setError('');
    setText('');
    save(upsertWeight(log, dayKey(), kg));
  }

  function remove(day) {
    save(log.filter((e) => e.day !== day));
  }

  const { points, min, max } = chartPoints(log, width, H, 16);
  const first = log[0];
  const last = log[log.length - 1];
  const change = log.length > 1 ? last.kg - first.kg : null;

  return (
    <Card>
      <Title>Weight log</Title>
      <View style={[s.row, { alignItems: 'flex-end' }]}>
        <Field
          label="Today’s weight"
          suffix="kg"
          placeholder={profile.weightKg ? String(profile.weightKg) : '70'}
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          testID="weight-input"
        />
        <Button title="Log" onPress={add} />
      </View>
      {error ? <Text style={{ color: c.danger, marginTop: 8 }}>{error}</Text> : null}

      {log.length ? (
        <>
          {change != null ? (
            <Text style={{ marginTop: 14, fontWeight: '700', color: change <= 0 ? c.success : c.warning }} testID="weight-change">
              {change > 0 ? '+' : change < 0 ? '−' : '±'}{Math.abs(change).toFixed(1)} kg since {formatDay(first.day)}
            </Text>
          ) : null}
          <View style={{ marginTop: 10 }} onLayout={(e) => setWidth(Math.max(200, e.nativeEvent.layout.width))} testID="weight-chart">
            <Svg width={width} height={H}>
              <Line x1={0} y1={16} x2={width} y2={16} stroke={c.border} strokeDasharray="4 4" />
              <Line x1={0} y1={H - 16} x2={width} y2={H - 16} stroke={c.border} strokeDasharray="4 4" />
              <SvgText x={4} y={12} fontSize="10" fill={c.muted}>{max.toFixed(1)} kg</SvgText>
              <SvgText x={4} y={H - 4} fontSize="10" fill={c.muted}>{min.toFixed(1)} kg</SvgText>
              {points.length > 1 ? (
                <Polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={c.primary}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {points.map((p) => (
                <Circle key={p.day} cx={p.x} cy={p.y} r={5} fill={c.card} stroke={c.primary} strokeWidth={3} />
              ))}
            </Svg>
          </View>
          <View style={{ marginTop: 8 }}>
            {[...log].reverse().slice(0, 5).map((e) => (
              <View key={e.day} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }} testID="weight-row">
                <Text style={{ flex: 1, color: c.text }}>{formatDay(e.day)}</Text>
                <Text style={{ fontWeight: '700', color: c.text, marginRight: 14 }}>{e.kg.toFixed(1)} kg</Text>
                <Pressable onPress={() => remove(e.day)} hitSlop={8} accessibilityRole="button">
                  <Text style={{ color: c.muted, fontSize: 12 }}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={[s.muted, { marginTop: 12 }]}>
          Log your weight regularly to see a chart. Your latest entry is used for BMI and calories.
        </Text>
      )}
    </Card>
  );
}

function formatDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
