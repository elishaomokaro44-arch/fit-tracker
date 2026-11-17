// Theme (light and dark colours) and the shared building blocks every screen uses.
//
// Components get the current colours and styles with:   const { c, s } = useTheme();
//   c = colours (c.primary, c.card, ...)   s = ready-made styles (s.title, s.muted, s.row, ...)
import { createContext, useContext, useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

export const palettes = {
  light: {
    scheme: 'light',
    bg: '#F1F3F8',
    card: '#FFFFFF',
    card2: '#F5F7FB', // tiles inside cards
    input: '#F5F7FB',
    text: '#0E1726',
    muted: '#667085',
    border: '#E6E9F0',
    track: '#E9ECF3', // empty part of rings and bars
    primary: '#FF5A1F', // energetic orange
    primary2: '#FF2D6F', // gradient end (pink-red)
    primarySoft: '#FFEDE5',
    onPrimary: '#FFFFFF',
    success: '#12B76A',
    successSoft: '#DCFCE7',
    warning: '#F59E0B',
    warnBg: '#FFF7E6',
    warnBorder: '#FCD34D',
    warnText: '#92400E',
    danger: '#E5484D',
    water: '#0EA5E9',
    waterSoft: '#E0F2FE',
    info: '#3B82F6',
    bar: '#FFC2A8', // past-day bars and other soft accents
    tabBar: '#FFFFFF',
    shadow: '#1A2440',
  },
  dark: {
    scheme: 'dark',
    bg: '#0A0E15',
    card: '#141A24',
    card2: '#1C2431',
    input: '#1C2431',
    text: '#F2F5FA',
    muted: '#8E9AAF',
    border: '#232C3A',
    track: '#263041',
    primary: '#FF6A33',
    primary2: '#FF3D7F',
    primarySoft: '#3A2119',
    onPrimary: '#FFFFFF',
    success: '#32D583',
    successSoft: '#0F2E20',
    warning: '#FDB022',
    warnBg: '#2A2112',
    warnBorder: '#6B4E16',
    warnText: '#FCD9A0',
    danger: '#F97066',
    water: '#38BDF8',
    waterSoft: '#0C2A3A',
    info: '#60A5FA',
    bar: '#7A3A26',
    tabBar: '#10151E',
    shadow: '#000000',
  },
};

function makeStyles(c) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 22,
      padding: 18,
      marginBottom: 14,
      // soft floating shadow in light mode, a thin outline in dark mode
      ...(c.scheme === 'light'
        ? { shadowColor: c.shadow, shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 }
        : { borderWidth: 1, borderColor: c.border }),
    },
    title: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 12, letterSpacing: -0.2 },
    label: { fontSize: 13, color: c.muted, marginBottom: 6, fontWeight: '600' },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: c.input,
      borderWidth: 1,
      borderColor: c.border,
    },
    input: { flex: 1, paddingVertical: 12, fontSize: 16, color: c.text, minWidth: 0 },
    suffix: { color: c.muted, marginLeft: 6, fontWeight: '600' },
    segment: { flexDirection: 'row', backgroundColor: c.card2, borderRadius: 14, padding: 4 },
    segItem: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
    segItemActive: { backgroundColor: c.primary },
    segText: { color: c.muted, fontWeight: '700', fontSize: 13 },
    segTextActive: { color: c.onPrimary },
    btn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
    btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.primary },
    btnText: { color: c.onPrimary, fontWeight: '800', fontSize: 15 },
    row: { flexDirection: 'row', gap: 10 },
    muted: { color: c.muted, fontSize: 13 },
    tile: { flex: 1, backgroundColor: c.card2, borderRadius: 16, padding: 12 },
    link: { color: c.primary, fontWeight: '700' },
    warnCard: { backgroundColor: c.warnBg, borderColor: c.warnBorder, borderWidth: 1 },
  });
}

const ThemeContext = createContext(null);

// mode: 'system' (follow the phone), 'light' or 'dark'
export function ThemeProvider({ mode = 'system', children }) {
  const system = useColorScheme();
  const scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo(() => {
    const c = palettes[scheme];
    return { scheme, c, s: makeStyles(c) };
  }, [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function Card({ children, style, testID }) {
  const { s } = useTheme();
  return <View style={[s.card, style]} testID={testID}>{children}</View>;
}

export function Title({ children, style }) {
  const { s } = useTheme();
  return <Text style={[s.title, style]}>{children}</Text>;
}

export function Label({ children }) {
  const { s } = useTheme();
  return <Text style={s.label}>{children}</Text>;
}

export function Field({ label, suffix, ...props }) {
  const { c, s } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.inputWrap}>
        <TextInput style={s.input} keyboardType="decimal-pad" placeholderTextColor={c.muted} {...props} />
        {suffix ? <Text style={s.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

// Row of pill buttons, one of which is selected
export function Segmented({ options, value, onChange, testID }) {
  const { s } = useTheme();
  return (
    <View style={s.segment} testID={testID}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.segItem, active && s.segItemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[s.segText, active && s.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', style, color }) {
  const { c, s } = useTheme();
  const outline = variant === 'outline';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.btn,
        color && !outline && { backgroundColor: color },
        outline && s.btnOutline,
        outline && color && { borderColor: color },
        pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <Text style={[s.btnText, outline && { color: color || c.primary }]}>{title}</Text>
    </Pressable>
  );
}

// Circular progress ring. progress is 0–1 (anything above 1 shows a full ring).
// With `gradient`, the ring fades from colors[0] to colors[1].
let ringId = 0;
export function ProgressRing({ size = 200, stroke = 18, progress = 0, color, colors: grad, track, children, testID }) {
  const { c } = useTheme();
  const id = useMemo(() => `ring${ringId++}`, []);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress || 0));
  const strokeColor = grad ? `url(#${id})` : color || c.primary;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} testID={testID}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {grad ? (
          <Defs>
            <SvgGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={grad[0]} />
              <Stop offset="1" stopColor={grad[1]} />
            </SvgGradient>
          </Defs>
        ) : null}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track || c.track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={strokeColor}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - p)}
            // start at 12 o'clock and go clockwise
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

// Small stat tile: icon, value, label
export function Stat({ icon, value, label, color, testID }) {
  const { c, s } = useTheme();
  return (
    <View style={[s.tile, { alignItems: 'center', paddingVertical: 12 }]}>
      {icon ? <Text style={{ fontSize: 18 }}>{icon}</Text> : null}
      <Text style={{ fontSize: 17, fontWeight: '800', color: color || c.text, marginTop: 2 }} testID={testID}>{value}</Text>
      <Text style={[s.muted, { fontSize: 11, marginTop: 1 }]}>{label}</Text>
    </View>
  );
}
