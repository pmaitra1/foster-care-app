import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase/client';
import { format, parseISO } from 'date-fns';

const C = {
  g700: '#1A5C38', g300: '#4caf78', g100: '#D6EFE0', g50: '#F0FDF4',
  t600: '#0D9488', t100: '#CCFBF1',
  red: '#EF4444', redBg: '#FEF2F2', redBorder: '#FECACA',
  amber: '#F59E0B', amberBg: '#FFFBEB', amberBorder: '#FDE68A',
  gray900: '#111827', gray600: '#6B7280',
  gray400: '#9CA3AF', gray200: '#E5E7EB', gray100: '#F3F4F6', white: '#FFFFFF',
};

interface AlertItem {
  reminder_id: number;
  dog_id: number;
  dog_name: string;
  reminder_type: string;
  due_date: string;
  is_auto_generated: boolean;
  days_until: number;
  section: 'overdue' | 'today' | 'week' | 'upcoming';
}

function getSection(d: number): AlertItem['section'] {
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 7) return 'week';
  return 'upcoming';
}

function formatDue(days: number, due_date: string): string {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `Due in ${days} days`;
  return format(parseISO(due_date), 'dd MMM yyyy');
}

function getReminderLabel(type: string): string {
  switch (type) {
    case '6_month_check': return '6-Month Check';
    case 'vaccination':   return 'Vaccination';
    case 'deworming':     return 'Deworming';
    case 'manual':        return 'Reminder';
    default:              return type;
  }
}

function getEmoji(type: string): string {
  switch (type) {
    case '6_month_check': return '🐶';
    case 'vaccination':   return '💉';
    case 'deworming':     return '🩺';
    default:              return '🔔';
  }
}

function getColors(section: AlertItem['section']) {
  switch (section) {
    case 'overdue':  return { bg: C.redBg,   border: C.redBorder,   icon: '#FEE2E2', badge: '#B91C1C' };
    case 'today':    return { bg: C.amberBg, border: C.amberBorder, icon: '#FEF3C7', badge: '#92400E' };
    case 'week':     return { bg: C.amberBg, border: C.amberBorder, icon: '#FEF3C7', badge: '#92400E' };
    case 'upcoming': return { bg: C.g50,     border: C.g100,        icon: C.g100,    badge: C.g700 };
  }
}

function AlertCard({ item, onDone, onPress }: { item: AlertItem; onDone: () => void; onPress: () => void }) {
  const col = getColors(item.section);
  return (
    <TouchableOpacity style={[s.card, { backgroundColor: col.bg, borderColor: col.border }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.cardIcon, { backgroundColor: col.icon }]}>
        <Text style={{ fontSize: 18 }}>{getEmoji(item.reminder_type)}</Text>
      </View>
      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <View style={[s.badge, { backgroundColor: col.icon }]}>
            <Text style={[s.badgeText, { color: col.badge }]}>{getReminderLabel(item.reminder_type)}</Text>
          </View>
          {item.is_auto_generated && (
            <View style={[s.badge, { backgroundColor: C.t100 }]}>
              <Text style={[s.badgeText, { color: C.t600 }]}>Auto</Text>
            </View>
          )}
        </View>
        <Text style={s.cardTitle}>{item.dog_name}</Text>
        <Text style={s.cardMeta}>⏱ {formatDue(item.days_until, item.due_date)}</Text>
      </View>
      {(item.section === 'overdue' || item.section === 'today') && (
        <TouchableOpacity style={s.doneBtn} onPress={onDone} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.doneBtnText}>✓</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('reminders')
      .select('reminder_id, dog_id, reminder_type, due_date, is_auto_generated, dogs(name)')
      .eq('status', 'pending')
      .order('due_date');

    const mapped: AlertItem[] = (data ?? []).map((r: any) => {
      const d = new Date(r.due_date); d.setHours(0, 0, 0, 0);
      const days = Math.round((d.getTime() - today.getTime()) / 86400000);
      return {
        reminder_id: r.reminder_id, dog_id: r.dog_id,
        dog_name: r.dogs?.name ?? 'Unknown',
        reminder_type: r.reminder_type, due_date: r.due_date,
        is_auto_generated: r.is_auto_generated,
        days_until: days, section: getSection(days),
      };
    });
    setAlerts(mapped);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAlerts().finally(() => setLoading(false));
    }, [fetchAlerts])
  );

  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchAlerts(); setRefreshing(false); }, [fetchAlerts]);

  const markDone = async (item: AlertItem) => {
    await supabase.from('reminders').update({ status: 'completed' }).eq('reminder_id', item.reminder_id);
    await supabase.from('health_updates').insert({
      dog_id: item.dog_id,
      update_date: format(new Date(), 'yyyy-MM-dd'),
      status_note: `Reminder completed: ${getReminderLabel(item.reminder_type)}`,
      update_type: 'general',
    });
    fetchAlerts();
  };

  const urgentCount = alerts.filter(a => a.section === 'overdue' || a.section === 'today').length;

  type Row = { type: 'header'; title: string; count: number } | { type: 'item'; data: AlertItem };
  const rows: Row[] = [];
  const sections: { key: AlertItem['section']; label: string }[] = [
    { key: 'overdue',  label: 'Overdue' },
    { key: 'today',    label: 'Today' },
    { key: 'week',     label: 'This Week' },
    { key: 'upcoming', label: 'Upcoming' },
  ];
  sections.forEach(({ key, label }) => {
    const items = alerts.filter(a => a.section === key);
    if (items.length > 0) {
      rows.push({ type: 'header', title: label, count: items.length });
      items.forEach(a => rows.push({ type: 'item', data: a }));
    }
  });

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topbar}>
        <Text style={s.title}>Alerts</Text>
        <Text style={[s.sub, urgentCount > 0 && { color: C.red }]}>
          {loading ? '—' : urgentCount > 0 ? `${urgentCount} need attention today` : 'All clear today'}
        </Text>
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={C.g700} size="large" /></View>
      ) : alerts.length === 0 ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 48 }}>🎉</Text>
          <Text style={s.emptyTitle}>All clear!</Text>
          <Text style={s.emptySub}>No pending reminders right now.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, i) => item.type === 'header' ? `h-${i}` : `a-${item.data.reminder_id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.g700} />}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>{item.title}</Text>
                  <View style={s.sectionCount}><Text style={s.sectionCountText}>{item.count}</Text></View>
                </View>
              );
            }
            return (
              <AlertCard
                item={item.data}
                onDone={() => markDone(item.data)}
                onPress={() => router.push(`/dog/${item.data.dog_id}` as any)}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  topbar: { backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  sub: { fontSize: 11, color: C.gray600, marginTop: 1 },
  list: { padding: 12, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionCount: { backgroundColor: C.gray200, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  sectionCountText: { fontSize: 11, fontWeight: '600', color: C.gray600 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', gap: 5, marginBottom: 3, flexWrap: 'wrap' },
  cardTitle: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  cardMeta: { fontSize: 11, color: C.gray600, marginTop: 2 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  doneBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.g700, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontSize: 14, color: C.white, fontWeight: '700' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.gray900 },
  emptySub: { fontSize: 13, color: C.gray600 },
});
