// First screen for anyone not logged in: sign up, log in, or reset a forgotten password.
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api';
import { loadOwner, loadProfile } from '../storage';
import { Button, Card, Field, Segmented, useTheme } from '../ui';

// onDone({ user, token }, mode) is called after a successful sign-up ('signup') or log-in ('login')
export default function AuthScreen({ legacyAccount, notice, onDone }) {
  const { c, s } = useTheme();
  const [mode, setMode] = useState('signup'); // signup | login | reset
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    name: legacyAccount?.user?.name || '',
    email: '',
    password: '',
    age: '',
    sex: 'male',
    heightCm: '',
    weightKg: '',
    marketingOptIn: false, // consent must be a clear opt-in, so it starts off
    backupCode: '',
  });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  // Fill in anything this phone already knows (height, weight, age, sex), but only on a phone that
  // hasn't belonged to an account yet, so a new person doesn't see the last person's details
  useEffect(() => {
    (async () => {
      if ((await loadOwner()) != null) return;
      const p = await loadProfile();
      setF((x) => ({
        ...x,
        heightCm: x.heightCm || p.heightCm || '',
        weightKg: x.weightKg || p.weightKg || '',
        age: x.age || p.age || '',
        sex: p.sex || x.sex,
      }));
    })();
  }, []);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await api.register(
          {
            name: f.name,
            email: f.email,
            password: f.password,
            age: f.age === '' ? '' : Number(f.age),
            sex: f.sex,
            heightCm: f.heightCm === '' ? '' : Number(String(f.heightCm).replace(',', '.')),
            weightKg: f.weightKg === '' ? '' : Number(String(f.weightKg).replace(',', '.')),
            marketingOptIn: f.marketingOptIn,
          },
          legacyAccount?.token
        );
        onDone(r, 'signup');
      } else if (mode === 'login') {
        onDone(await api.logIn(f.email, f.password), 'login');
      } else {
        onDone(await api.resetPassword(f.email, f.backupCode, f.password), 'login');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (m) => {
    setMode(m);
    setError('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={[c.primary, c.primary2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
            <Text style={st.logo}>👟 FitTrack</Text>
            <Text style={st.tagline}>
              {mode === 'signup'
                ? 'Create your account to track steps, activities and progress, and keep them safe on any phone.'
                : mode === 'login'
                  ? 'Welcome back! Log in to get your progress on this phone.'
                  : 'Use the backup code you saved to choose a new password.'}
            </Text>
          </LinearGradient>

          {notice ? (
            <Card style={s.warnCard}>
              <Text style={{ color: c.warnText }}>{notice}</Text>
            </Card>
          ) : null}

          <Card>
            {mode !== 'reset' ? (
              <View style={{ marginBottom: 16 }}>
                <Segmented
                  value={mode}
                  onChange={switchTo}
                  testID="auth-mode"
                  options={[
                    { value: 'signup', label: 'Sign up' },
                    { value: 'login', label: 'Log in' },
                  ]}
                />
              </View>
            ) : (
              <Text style={[s.title, { marginBottom: 14 }]}>Reset password</Text>
            )}

            {mode === 'signup' ? (
              <Row>
                <Field label="Name" keyboardType="default" autoCapitalize="words" maxLength={30} placeholder="e.g. Elisha"
                  value={f.name} onChangeText={set('name')} testID="su-name" />
              </Row>
            ) : null}

            <Row>
              <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
                textContentType="emailAddress" placeholder="you@example.com" value={f.email} onChangeText={set('email')} testID="au-email" />
            </Row>

            {mode === 'reset' ? (
              <Row>
                <Field label="Backup code" keyboardType="default" autoCapitalize="characters" autoCorrect={false}
                  placeholder="XXXX-XXXX-XXXX" value={f.backupCode} onChangeText={(t) => set('backupCode')(t.toUpperCase())} testID="au-code" />
              </Row>
            ) : null}

            <Row>
              <Field
                label={mode === 'reset' ? 'New password' : 'Password'}
                keyboardType="default"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
                value={f.password}
                onChangeText={set('password')}
                onSubmitEditing={mode !== 'signup' ? submit : undefined}
                testID="au-password"
              />
            </Row>

            {mode === 'signup' ? (
              <>
                <Text style={[s.label, { marginTop: 4 }]}>About you</Text>
                <View style={{ marginBottom: 12 }}>
                  <Segmented value={f.sex} onChange={set('sex')} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
                </View>
                <View style={[s.row, { marginBottom: 12 }]}>
                  <Field label="Age" suffix="yrs" keyboardType="number-pad" placeholder="25" value={String(f.age)} onChangeText={set('age')} testID="su-age" />
                  <Field label="Height" suffix="cm" placeholder="170" value={String(f.heightCm)} onChangeText={set('heightCm')} testID="su-height" />
                  <Field label="Weight" suffix="kg" placeholder="70" value={String(f.weightKg)} onChangeText={set('weightKg')} testID="su-weight" />
                </View>

                <Pressable onPress={() => set('marketingOptIn')(!f.marketingOptIn)} style={[st.consent, { backgroundColor: c.card2 }]} accessibilityRole="checkbox" accessibilityState={{ checked: f.marketingOptIn }}>
                  <Switch value={f.marketingOptIn} onValueChange={set('marketingOptIn')} trackColor={{ true: c.primary, false: c.track }} thumbColor="#FFFFFF" testID="su-marketing" />
                  <Text style={{ flex: 1, marginLeft: 12, color: c.text }}>
                    Email me fitness tips, offers and news from FitTrack. You can turn this off at any time.
                  </Text>
                </Pressable>
              </>
            ) : null}

            {error ? <Text style={{ color: c.danger, marginBottom: 10 }} testID="auth-error">{error}</Text> : null}

            <Button
              title={busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'login' ? 'Log in' : 'Set new password'}
              onPress={busy ? undefined : submit}
              style={{ marginTop: 4 }}
            />

            {mode === 'login' ? (
              <Pressable onPress={() => switchTo('reset')} style={{ alignItems: 'center', marginTop: 14 }} accessibilityRole="button">
                <Text style={s.link}>Forgot password?</Text>
              </Pressable>
            ) : null}
            {mode === 'reset' ? (
              <Pressable onPress={() => switchTo('login')} style={{ alignItems: 'center', marginTop: 14 }} accessibilityRole="button">
                <Text style={s.link}>‹ Back to log in</Text>
              </Pressable>
            ) : null}
          </Card>

          <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>
            {mode === 'signup'
              ? 'Your details are stored on the FitTrack server so you can log in on another phone. Only your name and step totals are shown to friends you add.'
              : mode === 'reset'
                ? 'No backup code? It’s created in the Friends tab once you’re logged in. Without it, a password can’t be reset yet.'
                : ''}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ children }) {
  return <View style={{ marginBottom: 12 }}>{children}</View>;
}

const st = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { borderRadius: 28, padding: 22, marginBottom: 14 },
  logo: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600', marginTop: 6, lineHeight: 21 },
  consent: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginBottom: 14 },
});
