import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { api, API_URL } from '../api';
import { dayKey } from '../calc';
import { Button, Card, Field, Segmented, Title, styles, colors } from '../ui';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function FriendsScreen({ account, setAccount, syncNow }) {
  const [notice, setNotice] = useState('');
  if (!account) return <JoinCard setAccount={setAccount} notice={notice} />;
  const onSignedOut = (why) => {
    setNotice(why || '');
    setAccount(null);
  };
  return <Signed account={account} onSignedOut={onSignedOut} syncNow={syncNow} />;
}

function JoinCard({ setAccount, notice }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    if (!name.trim()) return setError('Enter a name your friends will recognise.');
    setBusy(true);
    setError('');
    try {
      const { user, token } = await api.signUp(name);
      setAccount({ user, token });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Title>Join the leaderboard</Title>
      {notice ? <Text style={{ color: '#b45309', marginBottom: 10 }}>{notice}</Text> : null}
      <Text style={[styles.muted, { marginBottom: 12 }]}>
        Pick a display name. You'll get a friend code to share, and your daily step totals for the last 7 days will be visible to friends you add.
      </Text>
      <View style={[styles.row, { alignItems: 'flex-end' }]}>
        <Field
          label="Display name"
          keyboardType="default"
          autoCapitalize="words"
          maxLength={30}
          placeholder="e.g. Osaru"
          value={name}
          onChangeText={setName}
          onSubmitEditing={join}
          testID="join-name"
        />
        <Button title={busy ? '…' : 'Join'} onPress={join} />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Card>
  );
}

function Signed({ account, onSignedOut, syncNow }) {
  const { token, user } = account;
  const [period, setPeriod] = useState('today');
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [addMsg, setAddMsg] = useState(null); // { ok, text }
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // A 401 means the account no longer exists on the server (e.g. database reset)
  const handleError = useCallback(
    (e) => {
      if (e.status === 401) {
        onSignedOut("Your profile wasn't found on the server (it may have been reset), so you've been signed out. Join again to get a new friend code.");
        return;
      }
      setError(e.message);
    },
    [onSignedOut]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await syncNow(); // upload my latest steps first so my row is current
      setBoard(await api.leaderboard(token, period, dayKey()));
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [token, period, syncNow, handleError]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  async function addFriend() {
    if (!code.trim()) return;
    setAddMsg(null);
    try {
      const { friend } = await api.addFriend(token, code);
      setAddMsg({ ok: true, text: `${friend.name} added!` });
      setCode('');
      load();
    } catch (e) {
      if (e.status === 401) return handleError(e);
      setAddMsg({ ok: false, text: e.message });
    }
  }

  async function removeFriend(entry) {
    if (confirmRemove !== entry.id) return setConfirmRemove(entry.id);
    setConfirmRemove(null);
    try {
      await api.removeFriend(token, entry.id);
      load();
    } catch (e) {
      handleError(e);
    }
  }

  async function leave() {
    if (!confirmLeave) return setConfirmLeave(true);
    try {
      await api.deleteMe(token);
    } catch (e) {
      if (e.status !== 401) return setError(e.message);
    }
    onSignedOut('');
  }

  const top = board?.entries[0]?.steps || 0;
  const friendCount = board ? board.entries.length - 1 : 0;

  return (
    <View>
      <Card>
        <Text style={styles.muted}>Signed in as {user.name}. Your friend code:</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Text selectable style={{ flex: 1, fontSize: 30, fontWeight: '800', letterSpacing: 4, color: colors.primary }} testID="my-code">
            {user.friendCode}
          </Text>
          <Button
            variant="outline"
            title="Share"
            onPress={() =>
              Share.share({ message: `Add me on FitTrack! My friend code is ${user.friendCode}` }).catch(() => {})
            }
          />
        </View>
      </Card>

      <Card>
        <Title>Add a friend</Title>
        <View style={[styles.row, { alignItems: 'flex-end' }]}>
          <Field
            placeholder="Friend code, e.g. K7P2QX"
            keyboardType="default"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            onSubmitEditing={addFriend}
            testID="friend-code-input"
          />
          <Button title="Add" onPress={addFriend} />
        </View>
        {addMsg ? (
          <Text style={{ marginTop: 8, color: addMsg.ok ? '#16a34a' : '#dc2626' }} testID="add-msg">
            {addMsg.text}
          </Text>
        ) : null}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[styles.title, { flex: 1, marginBottom: 0 }]}>Leaderboard</Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : (
            <Pressable onPress={load} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Refresh</Text>
            </Pressable>
          )}
        </View>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'Last 7 days' },
          ]}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {board ? (
          <>
            <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, marginTop: 14, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                Group total · {board.entries.length} {board.entries.length === 1 ? 'person' : 'people'}
              </Text>
              <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }} testID="group-total">
                {board.groupTotal.toLocaleString()}
              </Text>
              <Text style={styles.muted}>steps</Text>
            </View>
            <View style={{ marginTop: 8 }}>
              {board.entries.map((e) => (
                <View key={e.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }} testID="lb-row">
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ width: 34, fontSize: e.rank <= 3 ? 20 : 15, fontWeight: '700', color: colors.muted }}>
                      {MEDALS[e.rank - 1] || `${e.rank}.`}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: e.isMe ? '800' : '500', color: colors.text }} numberOfLines={1}>
                      {e.name}{e.isMe ? ' (you)' : ''}
                    </Text>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{e.steps.toLocaleString()}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 34 }}>
                    <View style={{ flex: 1, height: 6, backgroundColor: '#eef2f4', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ width: `${top ? (e.steps / top) * 100 : 0}%`, height: '100%', backgroundColor: e.isMe ? colors.primary : '#99d5cf' }} />
                    </View>
                    {!e.isMe ? (
                      <Pressable onPress={() => removeFriend(e)} hitSlop={8} style={{ marginLeft: 10 }} accessibilityRole="button">
                        <Text style={{ fontSize: 12, color: confirmRemove === e.id ? '#dc2626' : colors.muted }}>
                          {confirmRemove === e.id ? 'Tap to confirm' : 'Remove'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
            {friendCount === 0 ? (
              <Text style={[styles.muted, { marginTop: 12, textAlign: 'center' }]}>
                Share your code or add a friend's code to start competing.
              </Text>
            ) : null}
          </>
        ) : !error ? (
          <Text style={[styles.muted, { marginTop: 14 }]}>Loading…</Text>
        ) : null}
      </Card>

      <Pressable onPress={leave} style={{ alignItems: 'center', padding: 8 }} accessibilityRole="button">
        <Text style={{ color: '#dc2626', fontSize: 13 }}>
          {confirmLeave ? 'Tap again to delete your profile from the server' : 'Leave the leaderboard'}
        </Text>
      </Pressable>
      <Text style={[styles.muted, { textAlign: 'center', fontSize: 11 }]}>Server: {API_URL}</Text>
    </View>
  );
}

function ErrorText({ children }) {
  return <Text style={{ marginTop: 10, color: '#dc2626' }}>{children}</Text>;
}
