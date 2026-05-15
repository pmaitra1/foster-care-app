import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator,
  RefreshControl, Pressable, Image, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase/client';
import type { Dog, CurrentStatus } from '../../types';
import { differenceInMonths, parseISO } from 'date-fns';

const C = {
  g900: '#0f3d24', g700: '#1A5C38', g500: '#2D8653',
  g300: '#4caf78', g100: '#D6EFE0', g50: '#F0FDF4',
  t600: '#0D9488', t100: '#CCFBF1',
  red: '#EF4444', redBg: '#FEF2F2',
  amber: '#F59E0B', amberBg: '#FFFBEB',
  gray900: '#111827', gray600: '#6B7280',
  gray400: '#9CA3AF', gray200: '#E5E7EB',
  gray100: '#F3F4F6', white: '#FFFFFF',
};

interface DogRow extends Dog {
  profile_photo_url: string | null;
  age_months: number | null;
  feeder_name: string | null;
  feeder_id_val: number | null;
  has_recent_vaccination: boolean;
}

interface ActiveFilters {
  status: string[];        // healthy, needs_attention, critical, follow_up
  gender: string[];        // male, female, unknown
  ageCategory: string[];   // puppy, adult
  sterilized: string[];    // yes, no
  vaccinated: string[];    // yes, no
  feeder_id: number | null;
  location: string;
}

const DEFAULT_FILTERS: ActiveFilters = {
  status: [], gender: [], ageCategory: [], sterilized: [],
  vaccinated: [], feeder_id: null, location: '',
};

function getAgeMonths(dog: Dog): number | null {
  if (dog.date_of_birth) return differenceInMonths(new Date(), parseISO(dog.date_of_birth));
  return dog.approx_age_months ?? null;
}

function formatAge(months: number | null): string {
  if (months === null) return 'Age unknown';
  if (months < 12) return `${months} mo`;
  return `${Math.floor(months / 12)} yr`;
}

function getStatusBadge(status: CurrentStatus) {
  switch (status) {
    case 'critical':        return { label: 'Critical',        bg: '#FEE2E2', text: '#B91C1C' };
    case 'needs_attention': return { label: 'Needs Attention', bg: '#FEF3C7', text: '#92400E' };
    case 'healthy':         return { label: 'Healthy',         bg: C.g100,    text: C.g700 };
    case 'follow_up':       return { label: 'Follow Up',       bg: C.t100,    text: C.t600 };
  }
}

function countActiveFilters(f: ActiveFilters): number {
  return (
    f.status.length + f.gender.length + f.ageCategory.length +
    f.sterilized.length + f.vaccinated.length +
    (f.feeder_id !== null ? 1 : 0) +
    (f.location.trim() !== '' ? 1 : 0)
  );
}

// ── Multi-select toggle helper ────────────────────────────────────────────────
function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

// ── Filter chip inside sheet ──────────────────────────────────────────────────
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[fs.chip, active && fs.chipActive]} onPress={onPress}>
      <Text style={[fs.chipText, active && fs.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Filter Sheet ──────────────────────────────────────────────────────────────
function FilterSheet({ visible, filters, feeders, locations, onApply, onClose }: {
  visible: boolean;
  filters: ActiveFilters;
  feeders: { feeder_id: number; name: string }[];
  locations: string[];
  onApply: (f: ActiveFilters) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<ActiveFilters>(filters);
  const insets = useSafeAreaInsets();

  useEffect(() => { if (visible) setLocal(filters); }, [visible]);

  const apply = () => { onApply(local); onClose(); };
  const reset = () => setLocal(DEFAULT_FILTERS);
  const count = countActiveFilters(local);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[fs.container, { paddingBottom: insets.bottom || 16 }]}>
        {/* Header */}
        <View style={fs.header}>
          <TouchableOpacity onPress={onClose} style={fs.cancelBtn}>
            <Text style={fs.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={fs.title}>Filter Dogs</Text>
          <TouchableOpacity onPress={reset}>
            <Text style={[fs.resetText, count > 0 && { color: C.red }]}>
              {count > 0 ? `Clear (${count})` : 'Reset'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={fs.content} showsVerticalScrollIndicator={false}>

          {/* Status */}
          <Text style={fs.sectionLabel}>Health Status</Text>
          <View style={fs.row}>
            {['healthy', 'needs_attention', 'critical', 'follow_up'].map(s => (
              <Chip key={s} label={s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                active={local.status.includes(s)} onPress={() => setLocal(p => ({ ...p, status: toggle(p.status, s) }))} />
            ))}
          </View>

          {/* Gender */}
          <Text style={fs.sectionLabel}>Gender</Text>
          <View style={fs.row}>
            {[{ k: 'male', l: '♂️ Male' }, { k: 'female', l: '♀️ Female' }, { k: 'unknown', l: '❓ Unknown' }].map(({ k, l }) => (
              <Chip key={k} label={l} active={local.gender.includes(k)} onPress={() => setLocal(p => ({ ...p, gender: toggle(p.gender, k) }))} />
            ))}
          </View>

          {/* Age category */}
          <Text style={fs.sectionLabel}>Age Category</Text>
          <View style={fs.row}>
            <Chip label="🐶 Puppy (< 1 yr)" active={local.ageCategory.includes('puppy')}
              onPress={() => setLocal(p => ({ ...p, ageCategory: toggle(p.ageCategory, 'puppy') }))} />
            <Chip label="🐕 Adult (≥ 1 yr)" active={local.ageCategory.includes('adult')}
              onPress={() => setLocal(p => ({ ...p, ageCategory: toggle(p.ageCategory, 'adult') }))} />
          </View>

          {/* Sterilisation */}
          <Text style={fs.sectionLabel}>Sterilisation</Text>
          <View style={fs.row}>
            <Chip label="✅ Sterilised" active={local.sterilized.includes('yes')}
              onPress={() => setLocal(p => ({ ...p, sterilized: toggle(p.sterilized, 'yes') }))} />
            <Chip label="⏳ Not Sterilised" active={local.sterilized.includes('no')}
              onPress={() => setLocal(p => ({ ...p, sterilized: toggle(p.sterilized, 'no') }))} />
          </View>

          {/* Vaccination */}
          <Text style={fs.sectionLabel}>Vaccination</Text>
          <View style={fs.row}>
            <Chip label="💉 Vaccinated" active={local.vaccinated.includes('yes')}
              onPress={() => setLocal(p => ({ ...p, vaccinated: toggle(p.vaccinated, 'yes') }))} />
            <Chip label="❌ Not Vaccinated" active={local.vaccinated.includes('no')}
              onPress={() => setLocal(p => ({ ...p, vaccinated: toggle(p.vaccinated, 'no') }))} />
          </View>

          {/* Location */}
          <Text style={fs.sectionLabel}>Colony / Location</Text>
          <TextInput
            style={fs.input}
            placeholder="e.g. Khirki Colony"
            placeholderTextColor={C.gray400}
            value={local.location}
            onChangeText={v => setLocal(p => ({ ...p, location: v }))}
          />
          {locations.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {locations.map(loc => (
                  <Chip key={loc} label={loc}
                    active={local.location === loc}
                    onPress={() => setLocal(p => ({ ...p, location: p.location === loc ? '' : loc }))}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {/* Feeder */}
          <Text style={fs.sectionLabel}>Feeder</Text>
          <View style={fs.row}>
            <Chip label="Any feeder" active={local.feeder_id === null}
              onPress={() => setLocal(p => ({ ...p, feeder_id: null }))} />
            <Chip label="No feeder" active={local.feeder_id === -1}
              onPress={() => setLocal(p => ({ ...p, feeder_id: p.feeder_id === -1 ? null : -1 }))} />
          </View>
          {feeders.length > 0 && (
            <View style={[fs.row, { marginTop: 6 }]}>
              {feeders.map(f => (
                <Chip key={f.feeder_id} label={`👤 ${f.name}`}
                  active={local.feeder_id === f.feeder_id}
                  onPress={() => setLocal(p => ({ ...p, feeder_id: p.feeder_id === f.feeder_id ? null : f.feeder_id }))}
                />
              ))}
            </View>
          )}

        </ScrollView>

        {/* Apply button */}
        <View style={fs.footer}>
          <TouchableOpacity style={fs.applyBtn} onPress={apply} activeOpacity={0.85}>
            <Text style={fs.applyBtnText}>
              {count > 0 ? `Apply ${count} Filter${count > 1 ? 's' : ''}` : 'Apply'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const fs = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  cancelBtn: { paddingVertical: 4 },
  cancelText: { fontSize: 14, color: C.gray600 },
  resetText: { fontSize: 14, color: C.gray400 },
  content: { padding: 16, paddingBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200 },
  chipActive: { backgroundColor: C.g50, borderColor: C.g700 },
  chipText: { fontSize: 12, fontWeight: '500', color: C.gray600 },
  chipTextActive: { color: C.g700, fontWeight: '600' },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.gray900 },
  footer: { padding: 16, paddingTop: 8 },
  applyBtn: { backgroundColor: C.g700, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyBtnText: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ── Dog Card ──────────────────────────────────────────────────────────────────
function DogCard({ dog, onPress }: { dog: DogRow; onPress: () => void }) {
  const badge = getStatusBadge(dog.current_status);
  const age = dog.age_months;
  const isPuppy = age !== null && age < 12;

  return (
    <Pressable style={styles.dogCard} onPress={onPress} android_ripple={{ color: C.gray100 }}>
      <View style={styles.dogAvatar}>
        {dog.profile_photo_url
          ? <Image source={{ uri: dog.profile_photo_url }} style={styles.dogAvatarImage} />
          : <Text style={styles.dogAvatarEmoji}>🐕</Text>
        }
      </View>
      <View style={styles.dogInfo}>
        <Text style={styles.dogName}>{dog.name}</Text>
        <Text style={styles.dogColony}>{dog.location_address ?? 'Location not set'} · {formatAge(age)}</Text>
        {dog.feeder_name && <Text style={styles.dogFeeder}>👤 {dog.feeder_name}</Text>}
        <View style={styles.dogMeta}>
          {isPuppy && (
            <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.badgeText, { color: '#92400E' }]}>🐶 Puppy</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DogsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [dogs, setDogs] = useState<DogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ActiveFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [feeders, setFeeders] = useState<{ feeder_id: number; name: string }[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [vaccinatedIds, setVaccinatedIds] = useState<Set<number>>(new Set());

  const fetchDogs = useCallback(async () => {
    const [dogsRes, feedersRes, vacsRes] = await Promise.all([
      supabase.from('dogs').select('*, dog_photos(photo_url, is_profile_photo), feeders(name)').order('name'),
      supabase.from('feeders').select('feeder_id, name').order('name'),
      supabase.from('medical_records').select('dog_id').in('event_type', ['vaccination', 'rabies']),
    ]);

    if (dogsRes.error) { console.error(dogsRes.error); return; }

    // Build vaccinated set
    const vacIds = new Set<number>((vacsRes.data ?? []).map((v: any) => v.dog_id));
    setVaccinatedIds(vacIds);

    const mapped: DogRow[] = (dogsRes.data ?? []).map((d: any) => ({
      ...d,
      profile_photo_url: d.dog_photos?.find((p: any) => p.is_profile_photo)?.photo_url ?? null,
      age_months: getAgeMonths(d),
      feeder_name: d.feeders?.name ?? null,
      feeder_id_val: d.feeder_id ?? null,
      has_recent_vaccination: vacIds.has(d.dog_id),
    }));

    setDogs(mapped);

    // Extract unique locations for quick-select chips
    const locs = [...new Set(mapped.map(d => d.location_address).filter(Boolean))] as string[];
    setLocations(locs.slice(0, 8));

    setFeeders(feedersRes.data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDogs().finally(() => setLoading(false));
    }, [fetchDogs])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDogs();
    setRefreshing(false);
  }, [fetchDogs]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filtered = dogs.filter(d => {
    const age = d.age_months;
    const isPuppy = age !== null && age < 12;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      const match = d.name.toLowerCase().includes(q) ||
        (d.location_address ?? '').toLowerCase().includes(q) ||
        (d.feeder_name ?? '').toLowerCase().includes(q);
      if (!match) return false;
    }

    // Status
    if (filters.status.length > 0 && !filters.status.includes(d.current_status)) return false;

    // Gender
    if (filters.gender.length > 0 && !filters.gender.includes(d.gender)) return false;

    // Age category
    if (filters.ageCategory.length > 0) {
      const cat = isPuppy ? 'puppy' : 'adult';
      if (!filters.ageCategory.includes(cat)) return false;
    }

    // Sterilised
    if (filters.sterilized.length > 0) {
      const val = d.sterilized ? 'yes' : 'no';
      if (!filters.sterilized.includes(val)) return false;
    }

    // Vaccinated
    if (filters.vaccinated.length > 0) {
      const val = d.has_recent_vaccination ? 'yes' : 'no';
      if (!filters.vaccinated.includes(val)) return false;
    }

    // Location
    if (filters.location.trim()) {
      if (!(d.location_address ?? '').toLowerCase().includes(filters.location.toLowerCase())) return false;
    }

    // Feeder
    if (filters.feeder_id === -1) {
      if (d.feeder_id_val !== null) return false;
    } else if (filters.feeder_id !== null) {
      if (d.feeder_id_val !== filters.feeder_id) return false;
    }

    return true;
  });

  const activeFilterCount = countActiveFilters(filters);
  const hasFilters = activeFilterCount > 0 || search.trim() !== '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topbar}>
        <View>
          <Text style={styles.topbarTitle}>My Dogs</Text>
          <Text style={styles.topbarSub}>{dogs.length} in programme</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/modals/add-dog')} activeOpacity={0.85}>
          <Text style={styles.addBtnText}>＋ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={C.g700} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={d => String(d.dog_id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.g700} />}
          ListHeaderComponent={
            <>
              {/* Search + Filter row */}
              <View style={styles.searchRow}>
                <View style={styles.searchBar}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search name, colony, feeder…"
                    placeholderTextColor={C.gray400}
                    value={search}
                    onChangeText={setSearch}
                    returnKeyType="search"
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Text style={styles.clearSearch}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
                  onPress={() => setShowFilters(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.filterBtnIcon}>⚙️</Text>
                  {activeFilterCount > 0 && (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Active filter summary */}
              {activeFilterCount > 0 && (
                <View style={styles.activeFiltersRow}>
                  <Text style={styles.activeFiltersText}>
                    {filtered.length} of {dogs.length} dogs · {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                  </Text>
                  <TouchableOpacity onPress={() => setFilters(DEFAULT_FILTERS)}>
                    <Text style={styles.clearFiltersText}>Clear all</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🐾</Text>
              <Text style={styles.emptyTitle}>{hasFilters ? 'No dogs match' : 'No dogs yet'}</Text>
              <Text style={styles.emptySub}>
                {hasFilters ? 'Try adjusting your search or filters' : 'Tap + Add to register the first dog'}
              </Text>
              {hasFilters && (
                <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => { setSearch(''); setFilters(DEFAULT_FILTERS); }}>
                  <Text style={styles.clearFiltersBtnText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <DogCard dog={item} onPress={() => router.push(`/dog/${item.dog_id}`)} />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      <FilterSheet
        visible={showFilters}
        filters={filters}
        feeders={feeders}
        locations={locations}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  topbarTitle: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  topbarSub: { fontSize: 11, color: C.gray600, marginTop: 1 },
  addBtn: { backgroundColor: C.g700, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addBtnText: { fontSize: 11, fontWeight: '600', color: C.white },
  list: { padding: 12 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.gray200, gap: 8 },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 13, color: C.gray900, padding: 0 },
  clearSearch: { fontSize: 12, color: C.gray400, padding: 4 },
  filterBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' },
  filterBtnActive: { backgroundColor: C.g50, borderColor: C.g700 },
  filterBtnIcon: { fontSize: 18 },
  filterBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: C.red, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { fontSize: 9, fontWeight: '700', color: C.white },
  activeFiltersRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.g50, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8, borderWidth: 1, borderColor: C.g100 },
  activeFiltersText: { fontSize: 11, color: C.g700, fontWeight: '500' },
  clearFiltersText: { fontSize: 11, color: C.red, fontWeight: '600' },
  dogCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  dogAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dogAvatarImage: { width: 44, height: 44, borderRadius: 22 },
  dogAvatarEmoji: { fontSize: 22 },
  dogInfo: { flex: 1 },
  dogName: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  dogColony: { fontSize: 11, color: C.gray600, marginTop: 2 },
  dogFeeder: { fontSize: 11, color: C.gray400, marginTop: 1 },
  dogMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  chevron: { fontSize: 20, color: C.gray400 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.gray900 },
  emptySub: { fontSize: 13, color: C.gray600, textAlign: 'center', paddingHorizontal: 32 },
  clearFiltersBtn: { backgroundColor: C.g700, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 8 },
  clearFiltersBtnText: { fontSize: 12, fontWeight: '600', color: C.white },
});
