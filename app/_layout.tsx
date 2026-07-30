import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  scheduleAllReminderNotifications,
  updateBadgeCount,
  getDogIdFromNotification,
} from '../lib/utils/notifications';

export default function RootLayout() {
const router = useRouter();
const notificationListener = useRef<Notifications.Subscription | null>(null);
const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Schedule notifications and update badge on launch
    scheduleAllReminderNotifications().catch((error) => {
      console.warn('Initial reminder scheduling failed:', error);
    });
    updateBadgeCount().catch((error) => {
      console.warn('Initial badge update failed:', error);
    });

    // Listen for notifications received while app is open
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      updateBadgeCount().catch((error) => {
        console.warn('Badge update on notification failed:', error);
      });
    });

    // Handle notification tap — navigate to dog detail
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const dogId = getDogIdFromNotification(response);
      if (dogId) {
        router.push(`/dog/${dogId}` as any);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="tabs" />
        <Stack.Screen name="dog/[id]" />
        <Stack.Screen name="feeders" />
        <Stack.Screen
          name="modals/add-dog"
          options={{ presentation: 'modal' }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
