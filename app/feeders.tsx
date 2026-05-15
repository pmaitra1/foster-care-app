import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchAllFeeders, createFeeder, rateFeeder, deleteFeeder } from '../lib/supabase/feeders';
import type { Feeder, FeederRating, NewFeederInput } from '../types';

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  g700: '#1A5C38', g500: '#2D8653', g300: '#4caf78',
  g100: '#D6EFE0', g50: '#F0FDF4',
  red: '#EF4444', redBg: '#FEF2F2', redBorder: '#FECACA',
  amber: '#F59E0B', amberBg: '#FFFBEB',
  gray900: '#111827', gray600: '#6B7280',
  gray400: '#9CA3AF', gray200: '#E5E7EB',
  gray100: '#F3F4F6', white: '#FFFFFF',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRatingStyle(rating: FeederRating) {
  switch (rating) {
    case 'good':    return { bg: C.g100,   text: C.g700,   label: '🟢 Good',    dot: C.g500 };
    case 'bad':     return { bg: C.redBg,  text: '#B91C1C', label: '🔴 Bad',    dot: C.red };
    case 'unrated': return { bg: C.gray100, text: C.gray600, label: '⚪ Unrated', dot: C.gray400 };
  }
}

// ── Add Feeder Modal ──────────────────────────────────────────────────────────
function AddFeederModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [colony, setColony] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      await createFeeder({ name: name.trim(), phone: phone.trim() || undefined, colony: colony.trim() || undefined });
      setName(''); setPhone(''); setColony('');
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={am.container}>
          <View style={am.header}>
            <Text style={am.title}>Add Feeder</Text>
            <TouchableOpacity onPress={onClose} style={am.close}>
              <Text style={{ fontSize: 14, color: C.gray600 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={am.content} keyboardShouldPersistTaps="handled">
            <Text style={am.label}>Full Name *</Text>
            <TextInput style={am.input} placeholder="e.g. Raju Bhai" placeholderTextColor={C.gray400} value={name} onChangeText={setName} autoFocus />

            <Text style={am.label}>Phone Number</Text>
            <TextInput style={am.input} placeholder="98100 XXXXX" placeholderTextColor={C.gray400} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

            <Text style={am.label}>Colony / Area</Text>
            <TextInput style={am.input} placeholder="e.g. Khirki Colony" placeholderTextColor={C.gray400} value={colony} onChangeText={setColony} />

            <TouchableOpacity style={am.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={am.saveBtnText}>Save Feeder</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const am = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 0 },
  label: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.gray900 },
  saveBtn: { backgroundColor: C.g700, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ── Rate Feeder Modal ─────────────────────────────────────────────────────────
function RateFeederModal({ feeder, visible, onClose, onSaved }: {
  feeder: Feeder | null; visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [rating, setRating] = useState<FeederRating>('unrated');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (feeder) { setRating(feeder.rating); setNotes(feeder.rating_notes ?? ''); }
  }, [feeder]);

  const save = async () => {
    if (!feeder) return;
    setSaving(true);
    try {
      await rateFeeder(feeder.feeder_id, rating, notes.trim() || undefined);
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const ratings: { key: FeederRating; label: string; desc: string }[] = [
    { key: 'good',    label: '🟢 Good',    desc: 'Feeds consistently and reliably' },
    { key: 'bad',     label: '🔴 Bad',     desc: 'Inconsistent or unreliable' },
    { key: 'unrated', label: '⚪ Unrated', desc: 'Not yet assessed' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={am.container}>
          <View style={am.header}>
            <Text style={am.title}>Rate · {feeder?.name}</Text>
            <TouchableOpacity onPress={onClose} style={am.close}>
              <Text style={{ fontSize: 14, color: C.gray600 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={am.content} keyboardShouldPersistTaps="handled">
            <Text style={am.label}>Reliability Rating</Text>
            {ratings.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[rm.option, rating === r.key && rm.optionActive]}
                onPress={() => setRating(r.key)}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={rm.optionLabel}>{r.label}</Text>
                  <Text style={rm.optionDesc}>{r.desc}</Text>
                </View>
                {rating === r.key && <Text style={{ color: C.g700 }}>✓</Text>}
              </TouchableOpacity>
            ))}

            <Text style={am.label}>Notes (optional)</Text>
            <TextInput
              style={[am.input, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Reason for this rating…"
              placeholderTextColor={C.gray400}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity style={am.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={am.saveBtnText}>Save Rating</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const rm = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray200, padding: 12, marginBottom: 8 },
  optionActive: { borderColor: C.g700, backgroundColor: C.g50 },
  optionLabel: { fontSize: 14, fontWeight: '600', color: C.gray900, marginBottom: 2 },
  optionDesc: { fontSize: 12, color: C.gray600 },
});

// ── Feeder Card ───────────────────────────────────────────────────────────────
function FeederCard({ feeder, onRate, onDelete }: {
  feeder: Feeder;
  onRate: () => void;
  onDelete: () => void;
}) {
  const rs = getRatingStyle(feeder.rating);

  const callFeeder = () => {
    if (!feeder.phone) { Alert.alert('No phone number saved'); return; }
    Linking.openURL(`tel:${feeder.phone}`);
  };

  return (
    <View style={fc.card}>
      <View style={fc.top}>
        <View style={[fc.dot, { backgroundColor: rs.dot }]} />
        <View style={{ flex: 1 }}>
          <Text style={fc.name}>{feeder.name}</Text>
          {feeder.colony && <Text style={fc.colony}>{feeder.colony}</Text>}
        </View>
        <View style={[fc.badge, { backgroundColor: rs.bg }]}>
          <Text style={[fc.badgeText, { color: rs.text }]}>{rs.label}</Text>
        </View>
      </View>

      {feeder.rating_notes && (
        <Text style={fc.notes}>{feeder.rating_notes}</Text>
      )}

      <View style={fc.actions}>
        {feeder.phone && (
          <TouchableOpacity style={fc.actionBtn} onPress={callFeeder} activeOpacity={0.75}>
            <Text style={fc.actionIcon}>📞</Text>
            <Text style={fc.actionText}>{feeder.phone}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[fc.actionBtn, fc.rateBtn]} onPress={onRate} activeOpacity={0.75}>
          <Text style={fc.actionIcon}>⭐</Text>
          <Text style={[fc.actionText, { color: C.g700 }]}>Rate</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[fc.actionBtn, fc.deleteBtn]} onPress={onDelete} activeOpacity={0.75}>
          <Text style={fc.actionIcon}>🗑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const fc = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, padding: 14, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  name: { fontSize: 14, fontWeight: '700', color: C.gray900 },
  colony: { fontSize: 11, color: C.gray600, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  notes: { fontSize: 12, color: C.gray600, fontStyle: 'italic', paddingLeft: 20 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.gray100 },
  rateBtn: { backgroundColor: C.g50 },
  deleteBtn: { marginLeft: 'auto', backgroundColor: C.redBg },
  actionIcon: { fontSize: 13 },
  actionText: { fontSize: 12, fontWeight: '500', color: C.gray600 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function FeedersScreen() {
  const insets = useSafeAreaInsets();
  const [feeders, setFeeders] = useState<Feeder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [ratingFeeder, setRatingFeeder] = useState<Feeder | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchAllFeeders();
      setFeeders(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const handleDelete = (feeder: Feeder) => {
    Alert.alert(
      `Remove ${feeder.name}?`,
      'This feeder will be unlinked from all dogs but the dogs will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => { await deleteFeeder(feeder.feeder_id); load(); } },
      ]
    );
  };

  const filtered = search.trim()
    ? feeders.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        (f.colony ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (f.phone ?? '').includes(search.trim())
      )
    : feeders;

  const good    = filtered.filter(f => f.rating === 'good');
  const bad     = filtered.filter(f => f.rating === 'bad');
  const unrated = filtered.filter(f => f.rating === 'unrated');

  type Row = { type: 'header'; title: string } | { type: 'feeder'; data: Feeder };
  const rows: Row[] = [];
  if (good.length > 0)    { rows.push({ type: 'header', title: '🟢 Good Feeders' });    good.forEach(f => rows.push({ type: 'feeder', data: f })); }
  if (bad.length > 0)     { rows.push({ type: 'header', title: '🔴 Needs Attention' }); bad.forEach(f => rows.push({ type: 'feeder', data: f })); }
  if (unrated.length > 0) { rows.push({ type: 'header', title: '⚪ Unrated' });          unrated.forEach(f => rows.push({ type: 'feeder', data: f })); }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topbar}>
        <View>
          <Text style={s.title}>Feeders</Text>
          <Text style={s.sub}>{feeders.length} caretakers in programme</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
          <Text style={s.addBtnText}>＋ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={s.searchBar}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search by name, colony or phone…"
          placeholderTextColor={C.gray400}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={s.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color={C.g700} size="large" /></View>
      ) : feeders.length === 0 ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 40 }}>👥</Text>
          <Text style={s.emptyTitle}>No feeders yet</Text>
          <Text style={s.emptySub}>Add the caretakers who look after your dogs</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowAdd(true)}>
            <Text style={s.emptyBtnText}>＋ Add First Feeder</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 40 }}>🔍</Text>
          <Text style={s.emptyTitle}>No feeders match</Text>
          <Text style={s.emptySub}>Try a different name, colony or phone number</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, i) => item.type === 'header' ? `h-${i}` : `f-${item.data.feeder_id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.g700} />}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <Text style={s.sectionHeader}>{item.title}</Text>;
            }
            return (
              <FeederCard
                feeder={item.data}
                onRate={() => setRatingFeeder(item.data)}
                onDelete={() => handleDelete(item.data)}
              />
            );
          }}
        />
      )}

      <AddFeederModal visible={showAdd} onClose={() => setShowAdd(false)} onSaved={load} />
      <RateFeederModal feeder={ratingFeeder} visible={!!ratingFeeder} onClose={() => setRatingFeeder(null)} onSaved={load} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 13, color: C.gray900, padding: 0 },
  searchClear: { fontSize: 12, color: C.gray400, padding: 4 },
  title: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  sub: { fontSize: 11, color: C.gray600, marginTop: 1 },
  addBtn: { backgroundColor: C.g700, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addBtnText: { fontSize: 11, fontWeight: '600', color: C.white },
  list: { padding: 12, paddingBottom: 32 },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.6, paddingVertical: 8, paddingHorizontal: 2 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.gray900 },
  emptySub: { fontSize: 13, color: C.gray600, textAlign: 'center', paddingHorizontal: 32 },
  emptyBtn: { backgroundColor: C.g700, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 8 },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: C.white },
});
