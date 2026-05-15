import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { exportAllDataToExcel } from '../../lib/utils/export';

const C = {
  g700: '#1A5C38', g100: '#D6EFE0', g50: '#F0FDF4',
  t100: '#CCFBF1', t600: '#0D9488',
  gray900: '#111827', gray600: '#6B7280',
  gray200: '#E5E7EB', gray100: '#F3F4F6', white: '#FFFFFF',
  gray400: '#9CA3AF',
};

function MenuItem({ icon, iconBg, label, sub, onPress }: {
  icon: string; iconBg: string; label: string; sub: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.menuIcon, { backgroundColor: iconBg }]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.menuLabel}>{label}</Text>
        <Text style={s.menuSub}>{sub}</Text>
      </View>
      <Text style={s.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleExport = async () => {
    try {
      await exportAllDataToExcel();
    } catch (e: any) {
      Alert.alert('Export failed', e.message);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topbar}>
        <Text style={s.title}>More</Text>
      </View>

      <View style={s.scroll}>
        {/* Profile */}
        <View style={s.card}>
          <View style={s.profileRow}>
            <View style={s.avatar}><Text style={{ fontSize: 24 }}>👩</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>Street Foster</Text>
              <Text style={s.profileEmail}>Delhi Programme · Admin</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionHeader}>Programme</Text>

        <MenuItem
          icon="👥" iconBg="#EDE9FE"
          label="Feeders" sub="Manage feeder contacts & ratings"
          onPress={() => router.push('/feeders' as any)}
        />

        <Text style={s.sectionHeader}>Data</Text>

        <MenuItem
          icon="📊" iconBg="#D1FAE5"
          label="Export to Excel" sub="Monthly data export · one tap"
          onPress={handleExport}
        />

        <Text style={s.sectionHeader}>App</Text>

        <MenuItem
          icon="🔔" iconBg={C.t100}
          label="Notifications" sub="Push alerts & reminders"
          onPress={() => Alert.alert('Coming soon')}
        />

        <MenuItem
          icon="📶" iconBg="#EFF6FF"
          label="Offline Sync" sub="Add dogs without internet"
          onPress={() => Alert.alert('Coming soon')}
        />

        <MenuItem
          icon="❓" iconBg="#FEF3C7"
          label="Help & FAQ" sub="How to use the app"
          onPress={() => Alert.alert('Coming soon')}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  topbar: { backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  scroll: { padding: 12, gap: 0 },
  card: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, padding: 12, marginBottom: 4 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 14, fontWeight: '700', color: C.gray900 },
  profileEmail: { fontSize: 11, color: C.gray600 },
  sectionHeader: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 6, marginLeft: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, padding: 12, marginBottom: 8 },
  menuIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  menuSub: { fontSize: 11, color: C.gray600, marginTop: 1 },
  menuChevron: { fontSize: 20, color: C.gray400 },
});