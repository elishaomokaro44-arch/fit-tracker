import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, Text, View } from 'react-native';
import { api, API_URL } from '../api';
import { dayKey } from '../calc';
import { challengeProgress } from '../achievements';
import { loadChallengeGoal, saveChallengeGoal } from '../storage';
import { Button, Card, Field, ProgressRing, Segmented, Title, useTheme } from '../ui';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function FriendsScreen({ account, setAccount, syncNow }) {
  const [notice, setNotice] = useState('');
  const onSignedOut = useCallback(
    (why) => {
      setNotice(why || '');
      setAccount(null);
    },
    [setAccount]
  );
  const updateUser = useCallback(
    (patch) => account && setAccount({ ...account, user: { ...account.user, ...patch } }),
    [account, setAccount]
  );
  if (!account) return <JoinCard setAccount={setAccount} notice={notice} />;
  return <Signed account={account} onSignedOut={onSignedOut} updateUser={updateUser} syncNow={syncNow} />;
}

function JoinCard({ setAccount, notice }) {
  const { c, s } = useTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [backup, setBackup] = useState('');

  async function restore() {
    if (!backup.trim()) return setError('Enter your backup code.');
    setBusy(true);
    setError('');
    try {
      const { user, token } = await api.recover(backup);
      setAccount({ user, token });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

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
      {notice ? <Text style={{ color: c.warnText, marginBottom: 10 }}>{notice}</Text> : null}
      <Text style={[s.muted, { marginBottom: 12 }]}>
        Pick a display name. You'll get a friend code to share, and your daily step totals for the last 7 days will be visible to friends you add.
      </Text>
      <View style={[s.row, { alignItems: 'flex-end' }]}>
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

      <View style={{ borderTopWidth: 1, borderTopColor: c.border, marginTop: 16, paddingTop: 12 }}>
        {restoring ? (
          <>
            <Text style={[s.muted, { marginBottom: 8 }]}>
              Enter the backup code you saved. Your profile, friend code and friends will come back. The old phone will be signed out.
            </Text>
            <View style={[s.row, { alignItems: 'flex-end' }]}>
              <Field
                keyboardType="default"
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="XXXX-XXXX-XXXX"
                value={backup}
                onChangeText={(t) => setBackup(t.toUpperCase())}
                onSubmitEditing={restore}
                testID="restore-input"
              />
              <Button title={busy ? '…' : 'Restore'} onPress={restore} />
            </View>
          </>
        ) : (
          <Pressable onPress={() => { setRestoring(true); setError(''); }} accessibilityRole="button">
            <Text style={{ color: c.primary, fontWeight: '700' }}>Already have a profile? Restore it with a backup code</Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

function Signed({ account, onSignedOut, updateUser, syncNow }) {
  const { c, s } = useTheme();
  const { token, user } = account;
  const [period, setPeriod] = useState('today');
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [addMsg, setAddMsg] = useState(null); // { ok, text }
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [week, setWeek] = useState(null); // this week's (Mon–today) group total, for the challenge
  const [challengeGoal, setChallengeGoal] = useState(50000);

  useEffect(() => {
    loadChallengeGoal().then(setChallengeGoal);
    // Profiles made before backup codes existed don't know whether they have one yet
    if (user.hasBackupCode === undefined) {
      api.me(token).then((r) => updateUser({ hasBackupCode: r.user.hasBackupCode })).catch(() => {});
    }
  }, []);

  // A 401 means the account no longer exists on the server (e.g. database reset)
  const handleError = useCallback(
    (e) => {
      if (e.status === 401) {
        onSignedOut("Your profile wasn't found on this phone's server account (it may have been restored on another phone, or the server was reset), so you've been signed out. Restore it with your backup code, or join again.");
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
      const day = dayKey();
      const [b, w] = await Promise.all([
        api.leaderboard(token, period, day),
        api.leaderboard(token, 'thisweek', day),
      ]);
      setBoard(b);
      setWeek(w);
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

  const top = board?.entries[0]?.steps || 0;
  const friendCount = board ? board.entries.length - 1 : 0;

  return (
    <View>
      <Card>
        <Text style={s.muted}>Signed in as {user.name}. Your friend code:</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Text selectable style={{ flex: 1, fontSize: 30, fontWeight: '800', letterSpacing: 4, color: c.primary }} testID="my-code">
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

      <BackupCard token={token} hasBackupCode={user.hasBackupCode} updateUser={updateUser} onError={handleError} />

      <Card>
        <Title>Add a friend</Title>
        <View style={[s.row, { alignItems: 'flex-end' }]}>
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
          <Text style={{ marginTop: 8, color: addMsg.ok ? c.success : c.danger }} testID="add-msg">
            {addMsg.text}
          </Text>
        ) : null}
      </Card>

      <ChallengeCard
        week={week}
        goal={challengeGoal}
        onGoal={(g) => {
          setChallengeGoal(g);
          saveChallengeGoal(g);
        }}
      />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[s.title, { flex: 1, marginBottom: 0 }]}>Leaderboard</Text>
          {loading ? <ActivityIndicator color={c.primary} /> : (
            <Pressable onPress={load} accessibilityRole="button">
              <Text style={{ color: c.primary, fontWeight: '700' }}>Refresh</Text>
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
            <View style={{ backgroundColor: c.primarySoft, borderRadius: 12, padding: 12, marginTop: 14, alignItems: 'center' }}>
              <Text style={{ color: c.primary, fontWeight: '600' }}>
                Group total · {board.entries.length} {board.entries.length === 1 ? 'person' : 'people'}
              </Text>
              <Text style={{ fontSize: 30, fontWeight: '800', color: c.text }} testID="group-total">
                {board.groupTotal.toLocaleString()}
              </Text>
              <Text style={s.muted}>steps</Text>
            </View>
            <View style={{ marginTop: 8 }}>
              {board.entries.map((e) => (
                <View key={e.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }} testID="lb-row">
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ width: 34, fontSize: e.rank <= 3 ? 20 : 15, fontWeight: '700', color: c.muted }}>
                      {MEDALS[e.rank - 1] || `${e.rank}.`}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: e.isMe ? '800' : '500', color: c.text }} numberOfLines={1}>
                      {e.name}{e.isMe ? ' (you)' : ''}
                    </Text>
                    <Text style={{ fontWeight: '700', color: c.text }}>{e.steps.toLocaleString()}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginLeft: 34 }}>
                    <View style={{ flex: 1, height: 6, backgroundColor: c.track, borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ width: `${top ? (e.steps / top) * 100 : 0}%`, height: '100%', backgroundColor: e.isMe ? c.primary : c.bar }} />
                    </View>
                    {!e.isMe ? (
                      <Pressable onPress={() => removeFriend(e)} hitSlop={8} style={{ marginLeft: 10 }} accessibilityRole="button">
                        <Text style={{ fontSize: 12, color: confirmRemove === e.id ? c.danger : c.muted }}>
                          {confirmRemove === e.id ? 'Tap to confirm' : 'Remove'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
            {friendCount === 0 ? (
              <Text style={[s.muted, { marginTop: 12, textAlign: 'center' }]}>
                Share your code or add a friend's code to start competing.
              </Text>
            ) : null}
          </>
        ) : !error ? (
          <Text style={[s.muted, { marginTop: 14 }]}>Loading…</Text>
        ) : null}
      </Card>

      <Text style={[s.muted, { textAlign: 'center', fontSize: 11 }]}>Server: {API_URL}</Text>
    </View>
  );
}

function ErrorText({ children }) {
  const { c } = useTheme();
  return <Text style={{ marginTop: 10, color: c.danger }}>{children}</Text>;
}

function ChallengeCard({ week, goal, onGoal }) {
  const { c, s } = useTheme();
  const [editing, setEditing] = useState(false);
  if (!week) return null;
  const p = challengeProgress(week.groupTotal, goal);
  const top = week.entries[0];
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={[s.title, { flex: 1, marginBottom: 0 }]}>🏁 Weekly group challenge</Text>
        <Pressable onPress={() => setEditing(!editing)} accessibilityRole="button">
          <Text style={{ color: c.primary, fontWeight: '700' }}>{editing ? 'Done' : 'Change'}</Text>
        </Pressable>
      </View>
      <Text style={s.muted}>
        {goal.toLocaleString()} steps together, Monday to Sunday · {week.entries.length} {week.entries.length === 1 ? 'person' : 'people'}
      </Text>
      {editing ? (
        <View style={{ marginTop: 10 }}>
          <Segmented
            value={goal}
            onChange={onGoal}
            options={[25000, 50000, 100000, 200000].map((g) => ({ value: g, label: `${g / 1000}k` }))}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 }}>
        <ProgressRing size={112} stroke={13} progress={p.pct} colors={p.done ? [c.success, c.success] : [c.warning, c.primary]} testID="challenge-ring">
          <Text style={{ fontSize: 22, fontWeight: '900', color: c.text }}>{Math.round((week.groupTotal / goal) * 100)}%</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', color: c.muted }}>{p.done ? 'DONE' : 'OF GOAL'}</Text>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: c.text }} testID="challenge-total">
            {week.groupTotal.toLocaleString()}
            <Text style={{ fontSize: 13, color: c.muted, fontWeight: '700' }}> / {goal.toLocaleString()}</Text>
          </Text>
          <Text style={{ marginTop: 4, color: p.done ? c.success : c.text, fontWeight: p.done ? '800' : '500' }} testID="challenge-status">
            {p.done
              ? '🎉 Challenge complete! Great teamwork.'
              : `${p.remaining.toLocaleString()} to go · ${p.daysLeft} ${p.daysLeft === 1 ? 'day' : 'days'} left · about ${p.perDay.toLocaleString()} a day as a group`}
          </Text>
          {top && top.steps > 0 ? (
            <Text style={[s.muted, { marginTop: 4 }]}>👑 {top.name} leads ({top.steps.toLocaleString()})</Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function BackupCard({ token, hasBackupCode, updateUser, onError }) {
  const { c, s } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  async function create() {
    if (hasBackupCode && !confirmNew) return setConfirmNew(true);
    setBusy(true);
    try {
      const r = await api.createBackupCode(token);
      setCode(r.backupCode);
      setConfirmNew(false);
      updateUser({ hasBackupCode: true });
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <Card style={s.warnCard}>
        <Title>Your backup code</Title>
        <Text selectable style={{ fontSize: 24, fontWeight: '800', letterSpacing: 2, color: c.text, textAlign: 'center', marginVertical: 8 }} testID="backup-code">
          {code}
        </Text>
        <Text style={{ color: c.warnText, marginBottom: 10 }}>
          Write this down or save it somewhere safe. It won’t be shown again. Anyone with this code can take over your profile, so keep it private.
        </Text>
        <View style={s.row}>
          <Button variant="outline" title="Save / share" style={{ flex: 1 }}
            onPress={() => Share.share({ message: `My FitTrack backup code: ${code}` }).catch(() => {})} />
          <Button title="I’ve saved it" style={{ flex: 1 }} onPress={() => setCode('')} />
        </View>
      </Card>
    );
  }

  if (hasBackupCode) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, color: c.text }}>✅ Backup code created</Text>
          <Pressable onPress={create} accessibilityRole="button">
            <Text style={{ color: confirmNew ? c.danger : c.primary, fontWeight: '700', fontSize: 13 }}>
              {busy ? '…' : confirmNew ? 'Tap again: old code stops working' : 'Make a new code'}
            </Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  return (
    <Card style={s.warnCard}>
      <Text style={{ color: c.warnText, marginBottom: 10 }} testID="backup-prompt">
        ⚠️ No backup code yet. If you lose or change your phone, you’ll lose your profile and friends. Create a code so you can restore them.
      </Text>
      <Button title={busy ? '…' : 'Create backup code'} onPress={create} />
    </Card>
  );
}
