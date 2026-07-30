import { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase/client';
import { updateBadgeCount } from '../../lib/utils/notifications';

const C = {
  g700: '#1A5C38', g50: '#F0FDF4',
  gray400: '#9CA3AF', gray200: '#E5E7EB',
  red: '#EF4444', white: '#FFFFFF',
};

function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    const fetchUrgent = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase
          .from('reminders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
          .lte('due_date', today);
        setUrgentCount(count ?? 0);
        await updateBadgeCount();
      } catch (error) {
        console.warn('Failed to refresh urgent reminders:', error);
        setUrgentCount(0);
      }
    };
    fetchUrgent();
    const interval = setInterval(fetchUrgent, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { key: 'index',  label: 'Home',    icon: '🗺' },
    { key: 'alerts', label: 'Alerts',  icon: '🔔' },
    { key: 'add',    label: '',        icon: '+' },
    { key: 'dogs',   label: 'My Dogs', icon: '🐾' },
    { key: 'more',   label: 'More',    icon: '⋯' },
  ];

  return (
    <View style={[s.tabBar, { paddingBottom: insets.bottom || 8 }]}>
      {tabs.map((tab) => {
        if (tab.key === 'add') {
          return (
            <TouchableOpacity key="add" style={s.fabWrap} onPress={() => router.push('/modals/add-dog')} activeOpacity={0.85}>
              <View style={s.fab}>
                <Text style={s.fabIcon}>+</Text>
              </View>
            </TouchableOpacity>
          );
        }

        const route = state.routes.find((r: any) => r.name === tab.key);
        if (!route) return null;
        const isFocused = state.index === state.routes.indexOf(route);

        return (
          <TouchableOpacity key={tab.key} style={s.tabItem} onPress={() => navigation.navigate(tab.key)} activeOpacity={0.7}>
            <View style={s.iconWrap}>
              <Text style={s.tabIcon}>{tab.icon}</Text>
              {tab.key === 'alerts' && urgentCount > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{urgentCount > 9 ? '9+' : urgentCount}</Text>
                </View>
              )}
            </View>
            <Text style={[s.tabLabel, isFocused && s.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function Layout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="dogs" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 6, paddingHorizontal: 8, height: 64 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 18, lineHeight: 22 },
  tabLabel: { fontSize: 9, fontWeight: '500', color: C.gray400 },
  tabLabelActive: { color: C.g700, fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -8, backgroundColor: C.red, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: C.white },
  badgeText: { fontSize: 9, fontWeight: '700', color: C.white },
  fabWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.g700, alignItems: 'center', justifyContent: 'center', marginTop: -14, borderWidth: 3, borderColor: C.white, shadowColor: C.g700, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  fabIcon: { fontSize: 22, color: C.white, fontWeight: '300', lineHeight: 26 },
});
