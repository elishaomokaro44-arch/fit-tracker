// Evening step reminders, as local notifications (scheduled on the phone, no server needed).
//
// A scheduled notification can't check your steps at the moment it fires, so:
//  - today's reminder says exactly how many steps you're short, and is cancelled once you hit your goal
//  - the next 6 evenings get a general "have you hit your goal?" reminder
// Every time the app opens or your steps change, all of these are rebuilt with fresh numbers.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const remindersSupported = Platform.OS !== 'web';

const IDS = Array.from({ length: 7 }, (_, i) => `step-reminder-${i}`);
const CHANNEL = 'reminders';

// Show reminders even if FitTrack is open when they fire
if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestReminderPermission() {
  if (!remindersSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function cancelStepReminders() {
  if (!remindersSupported) return;
  await Promise.all(IDS.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

export async function scheduleStepReminders({ enabled, hour, steps, goal }) {
  if (!remindersSupported) return;
  await cancelStepReminders();
  if (!enabled) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Step reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, 0, 0);
    let body;
    if (i === 0) {
      if (at <= now || steps >= goal) continue; // too late today, or goal already reached
      body = `You're ${(goal - steps).toLocaleString()} steps short of your ${goal.toLocaleString()} goal. A short walk will do it!`;
    } else {
      body = 'Have you hit your step goal today? Open FitTrack to check.';
    }
    await Notifications.scheduleNotificationAsync({
      identifier: IDS[i],
      content: { title: '👟 Step reminder', body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}
