import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase/client';
import { format, parseISO } from 'date-fns';

// ── Configure foreground behaviour ────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Permission ────────────────────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Reminder label helpers ────────────────────────────────────────────────────
function getReminderTitle(type: string, dogName: string): string {
  switch (type) {
    case '6_month_check': return `🐶 ${dogName} — 6-Month Check`;
    case 'vaccination':   return `💉 ${dogName} — Vaccination Due`;
    case 'deworming':     return `🩺 ${dogName} — Deworming Due`;
    case 'manual':        return `⏰ ${dogName} — Reminder`;
    default:              return `🐾 ${dogName} — Reminder`;
  }
}

function getReminderBody(type: string, dueDate: string, daysUntil: number): string {
  const dateStr = format(parseISO(dueDate), 'dd MMM yyyy');
  if (daysUntil < 0)  return `Overdue since ${dateStr} — please action this.`;
  if (daysUntil === 0) return `Due today (${dateStr}) — tap to view.`;
  if (daysUntil === 1) return `Due tomorrow, ${dateStr}.`;
  return `Due on ${dateStr}.`;
}

// ── Schedule all pending reminders ────────────────────────────────────────────
/**
 * Fetches all pending reminders from Supabase and schedules
 * a local push notification for each one.
 * Safe to call on every app launch — cancels old ones first.
 */
export async function scheduleAllReminderNotifications(): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  // Cancel previously scheduled notifications to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch pending reminders joined with dog name
  const { data, error } = await supabase
    .from('reminders')
    .select('reminder_id, reminder_type, due_date, dog_id, dogs(name)')
    .eq('status', 'pending')
    .order('due_date');

  if (error || !data) return;

  let scheduledCount = 0;

  for (const reminder of data) {
    const dogName = (reminder as any).dogs?.name ?? 'Unknown';
    const dueDate = new Date(reminder.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

    // Schedule notification at 8 AM on the due date
    // For overdue items, fire immediately (in 5 seconds)
    let trigger: Notifications.NotificationTriggerInput;

    if (daysUntil < 0) {
      // Overdue — fire in 5 seconds so user sees it on launch
      trigger = { seconds: 5, repeats: false } as any;
    } else {
      const fireDate = new Date(reminder.due_date);
      fireDate.setHours(8, 0, 0, 0);

      // Only schedule if fire date is in the future
      if (fireDate <= new Date()) continue;
      trigger = { date: fireDate } as any;
    }

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: getReminderTitle(reminder.reminder_type, dogName),
          body: getReminderBody(reminder.reminder_type, reminder.due_date, daysUntil),
          data: {
            reminder_id: reminder.reminder_id,
            dog_id: reminder.dog_id,
          },
          sound: true,
          badge: 1,
        },
        trigger,
      });
      scheduledCount++;
    } catch (e) {
      console.warn('Failed to schedule notification:', e);
    }
  }

  console.log(`📲 Scheduled ${scheduledCount} notifications`);
}

// ── Badge count ───────────────────────────────────────────────────────────────
/**
 * Updates the app badge with the number of overdue + today reminders.
 */
export async function updateBadgeCount(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const { count } = await supabase
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lte('due_date', todayStr);

  const badge = count ?? 0;
  await Notifications.setBadgeCountAsync(badge);
  return badge;
}

// ── Handle notification tap ───────────────────────────────────────────────────
/**
 * Returns the dog_id from a notification tap so you can navigate to the dog.
 */
export function getDogIdFromNotification(
  response: Notifications.NotificationResponse
): number | null {
  const data = response.notification.request.content.data;
  return (data?.dog_id as number) ?? null;
}
