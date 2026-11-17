// Drop-down panel from the header: who's logged in, email preferences, log out, delete account.
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { api } from '../api';
import { Button, Card, useTheme } from '../ui';

export default function AccountPanel({ account, updateAccount, signOut }) {
  const { c, s } = useTheme();
  const { user, token } = account;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggleMarketing(on) {
    setError('');
    setBusy('marketing');
    try {
      const r = await api.updateMe(token, { marketingOptIn: on });
      updateAccount({ ...account, user: { ...user, ...r.user } });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function logOut() {
    setBusy('logout');
    await signOut();
  }

  async function deleteAccount() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy('delete');
    setError('');
    try {
      await signOut({ deleteAccount: true });
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  }

  return (
    <Card style={{ marginHorizontal: 16, marginBottom: 8 }} testID="account-panel">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Avatar name={user.name} size={48} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '900', color: c.text }}>{user.name}</Text>
          <Text style={s.muted} testID="account-email">{user.email}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card2, borderRadius: 14, padding: 12 }}>
        <Text style={{ flex: 1, color: c.text }}>Fitness tips, offers and news by email</Text>
        <Switch
          value={!!user.marketingOptIn}
          onValueChange={toggleMarketing}
          disabled={busy === 'marketing'}
          trackColor={{ true: c.primary, false: c.track }}
          thumbColor="#FFFFFF"
          testID="account-marketing"
        />
      </View>

      {error ? <Text style={{ color: c.danger, marginTop: 10 }}>{error}</Text> : null}

      <Button variant="outline" title={busy === 'logout' ? 'Logging out…' : 'Log out'} onPress={logOut} style={{ marginTop: 14 }} />
      <Pressable onPress={deleteAccount} style={{ alignItems: 'center', paddingTop: 14 }} accessibilityRole="button">
        <Text style={{ color: c.danger, fontSize: 13, textAlign: 'center' }}>
          {busy === 'delete'
            ? 'Deleting…'
            : confirmDelete
              ? 'Tap again to permanently delete your account, friends and saved progress'
              : 'Delete account'}
        </Text>
      </Pressable>
    </Card>
  );
}

export function Avatar({ name, size = 42 }) {
  const { c } = useTheme();
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: size * 0.42 }}>{initial}</Text>
    </View>
  );
}
