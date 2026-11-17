import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export const colors = {
  bg: '#f4f6f8',
  card: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  primary: '#0f766e',
  primarySoft: '#ccfbf1',
};

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Label({ children }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({ label, suffix, ...props }) {
  return (
    <View style={{ flex: 1 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholderTextColor="#9ca3af"
          {...props}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

// Row of pill buttons, one of which is selected
export function Segmented({ options, value, onChange, testID }) {
  return (
    <View style={styles.segment} testID={testID}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, active && styles.segItemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', style }) {
  const outline = variant === 'outline';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        outline && styles.btnOutline,
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      <Text style={[styles.btnText, outline && { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  label: { fontSize: 13, color: colors.muted, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 16, color: colors.text, minWidth: 0 },
  suffix: { color: colors.muted, marginLeft: 6 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#eef2f4',
    borderRadius: 10,
    padding: 3,
  },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segItemActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  segText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  segTextActive: { color: colors.primary },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', gap: 10 },
  muted: { color: colors.muted, fontSize: 13 },
});
