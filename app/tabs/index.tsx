import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Pressable, ScrollView, Image,
} from 'react-native';
import { Platform } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase/client';
import { differenceInMonths, parseISO } from 'date-fns';

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  g700: '#1A5C38', g500: '#2D8653', g100: '#D6EFE0', g50: '#F0FDF4',
  red: '#EF4444', redBg: '#FEF2F2',
  amber: '#F59E0B', amberBg: '#FFFBEB',
  gray900: '#111827', gray600: '#6B7280',
  gray400: '#9CA3AF', gray200: '#E5E7EB',
  gray100: '#F3F4F6', white: '#FFFFFF',
};

// Delhi default region
const DELHI_REGION: Region = {
  latitude: 28.6139,
  longitude: 77.2090,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

// ── Types ─────────────────────────────────────────────────────────────────────
type PinColour = 'red' | 'amber' | 'green' | 'grey';

interface DogPin {
  dog_id: number;
  name: string;
  latitude: number;
  longitude: number;
  current_status: string;
  gender: string;
  sterilized: boolean;
  date_of_birth: string | null;
  approx_age_months: number | null;
  location_address: string | null;
  profile_photo_url: string | null;
  has_overdue_reminder: boolean;
  has_vaccination: boolean;
  pin_colour: PinColour;
}

// ── Pin colour logic ──────────────────────────────────────────────────────────
function getPinColour(dog: Omit<DogPin, 'pin_colour'>): PinColour {
  if (dog.current_status === 'critical' || dog.has_overdue_reminder) return 'red';
  if (
    dog.current_status === 'needs_attention' ||
    (dog.gender === 'female' && !dog.sterilized)
  ) return 'amber';
  if (dog.current_status === 'follow_up') return 'grey';
  return 'green';
}

function getPinEmoji(colour: PinColour): string {
  switch (colour) {
    case 'red':   return '🔴';
    case 'amber': return '🟡';
    case 'green': return '🟢';
    case 'grey':  return '⚪';
  }
}

function getAgeMonths(dob: string | null, approx: number | null): number | null {
  if (dob) return differenceInMonths(new Date(), parseISO(dob));
  return approx ?? null;
}

function formatAge(months: number | null): string {
  if (months === null) return 'Age unknown';
  if (months < 12) return `${months} mo`;
  return `${Math.floor(months / 12)} yr`;
}

// ── Custom map marker ─────────────────────────────────────────────────────────
function renderDogMarker(dog: DogPin, onPress: () => void) {
  const colours: Record<PinColour, string> = {
    red: C.red, amber: C.amber, green: C.g500, grey: C.gray400,
  };
  const bgColours: Record<PinColour, string> = {
    red: C.redBg, amber: C.amberBg, green: C.g50, grey: C.gray100,
  };

  const age = getAgeMonths(dog.date_of_birth, dog.approx_age_months);
  const isPuppy = age !== null && age < 12;

  const genderEmoji = dog.gender === 'male' ? '♂' : dog.gender === 'female' ? '♀' : '?';
  const genderColor = dog.gender === 'male' ? '#3B82F6' : dog.gender === 'female' ? '#EC4899' : C.gray400;

  return (
    <Marker
      key={dog.dog_id}
      coordinate={{ latitude: dog.latitude, longitude: dog.longitude }}
      onPress={onPress}
      tracksViewChanges={false}
    >
      <View style={mk.container}>
        {/* Top badges */}
        <View style={mk.topRow}>
          {/* Top left — puppy */}
          {isPuppy
            ? <View style={[mk.badge, { backgroundColor: '#FEF3C7' }]}><Text style={mk.badgeText}>🐶</Text></View>
            : <View style={mk.badgeSpacer} />
          }
          {/* Top right — vaccination */}
          <View style={[mk.badge, { backgroundColor: dog.has_vaccination ? '#D1FAE5' : '#FEE2E2' }]}>
            <Text style={mk.badgeText}>{dog.has_vaccination ? '💉' : '✕'}</Text>
          </View>
        </View>

        {/* Main circle pin */}
        <View style={[mk.pin, { borderColor: colours[dog.pin_colour], backgroundColor: bgColours[dog.pin_colour] }]}>
          {dog.profile_photo_url
            ? <Image source={{ uri: dog.profile_photo_url }} style={mk.photo} />
            : <Text style={mk.emoji}>🐕</Text>
          }
        </View>

        {/* Bottom badges */}
        <View style={mk.bottomRow}>
          {/* Bottom left — gender */}
          <View style={[mk.badge, { backgroundColor: C.white, borderWidth: 1, borderColor: genderColor }]}>
            <Text style={[mk.badgeText, { color: genderColor, fontWeight: '700' }]}>{genderEmoji}</Text>
          </View>
          {/* Bottom right — sterilisation */}
          <View style={[mk.badge, { backgroundColor: dog.sterilized ? '#D1FAE5' : '#FEF3C7' }]}>
            <Text style={mk.badgeText}>{dog.sterilized ? '✂️' : '⏳'}</Text>
          </View>
        </View>

        {/* Stem dot */}
        <View style={[mk.dot, { backgroundColor: colours[dog.pin_colour] }]} />
      </View>
    </Marker>
  );
}

const mk = StyleSheet.create({
  container: { alignItems: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', width: 56, marginBottom: 2 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', width: 56, marginTop: 2 },
  badge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeSpacer: { width: 18 },
  badgeText: { fontSize: 9, lineHeight: 12 },
  pin: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  photo: { width: 40, height: 40, borderRadius: 20 },
  emoji: { fontSize: 22 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 2, borderWidth: 1.5, borderColor: C.white },
});

// ── Dog detail card (bottom sheet) ───────────────────────────────────────────
function DogCard({ dog, onClose, onView }: { dog: DogPin; onClose: () => void; onView: () => void }) {
  const age = getAgeMonths(dog.date_of_birth, dog.approx_age_months);
  const colours: Record<PinColour, string> = {
    red: C.red, amber: C.amber, green: C.g500, grey: C.gray400,
  };

  return (
    <View style={dc.card}>
      <View style={dc.top}>
        <View style={dc.avatar}>
          {dog.profile_photo_url
            ? <Image source={{ uri: dog.profile_photo_url }} style={dc.photo} />
            : <Text style={{ fontSize: 28 }}>🐕</Text>
          }
        </View>
        <View style={dc.info}>
          <View style={dc.nameRow}>
            <Text style={dc.name}>{dog.name}</Text>
            <Text style={{ fontSize: 14 }}>{getPinEmoji(dog.pin_colour)}</Text>
          </View>
          <Text style={dc.sub}>{dog.location_address ?? 'Location pinned'} · {formatAge(age)}</Text>
          <View style={dc.badges}>
            {(() => {
              const age = getAgeMonths(dog.date_of_birth, dog.approx_age_months);
              const isPuppy = age !== null && age < 12;
              return (
                <>
                  {isPuppy && <View style={[dc.badge, { backgroundColor: '#FEF3C7' }]}><Text style={[dc.badgeText, { color: '#92400E' }]}>🐶 Puppy</Text></View>}
                  <View style={[dc.badge, { backgroundColor: dog.gender === 'male' ? '#EFF6FF' : dog.gender === 'female' ? '#FDF2F8' : C.gray100 }]}>
                    <Text style={[dc.badgeText, { color: dog.gender === 'male' ? '#3B82F6' : dog.gender === 'female' ? '#EC4899' : C.gray600 }]}>
                      {dog.gender === 'male' ? '♂️ Male' : dog.gender === 'female' ? '♀️ Female' : '❓ Unknown'}
                    </Text>
                  </View>
                  <View style={[dc.badge, { backgroundColor: dog.sterilized ? '#D1FAE5' : '#FEF3C7' }]}>
                    <Text style={[dc.badgeText, { color: dog.sterilized ? C.g700 : '#92400E' }]}>{dog.sterilized ? '✂️ Sterilised' : '⏳ Not Sterilised'}</Text>
                  </View>
                  <View style={[dc.badge, { backgroundColor: dog.has_vaccination ? '#D1FAE5' : '#FEE2E2' }]}>
                    <Text style={[dc.badgeText, { color: dog.has_vaccination ? C.g700 : C.red }]}>{dog.has_vaccination ? '💉 Vaccinated' : '❌ Unvaccinated'}</Text>
                  </View>
                  {dog.has_overdue_reminder && <View style={[dc.badge, { backgroundColor: C.redBg }]}><Text style={[dc.badgeText, { color: C.red }]}>⚠️ Overdue reminder</Text></View>}
                </>
              );
            })()}
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={dc.closeBtn}>
          <Text style={{ fontSize: 14, color: C.gray400 }}>✕</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={dc.viewBtn} onPress={onView} activeOpacity={0.85}>
        <Text style={dc.viewBtnText}>View Full Profile →</Text>
      </TouchableOpacity>
    </View>
  );
}

const dc = StyleSheet.create({
  card: { backgroundColor: C.white, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 0, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { width: 56, height: 56, borderRadius: 28 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  sub: { fontSize: 12, color: C.gray600, marginBottom: 4 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  viewBtn: { backgroundColor: C.g700, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  viewBtnText: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  const pinItems = [
    { emoji: '🔴', label: 'Critical/Overdue' },
    { emoji: '🟡', label: 'Needs Attention' },
    { emoji: '🟢', label: 'Healthy' },
    { emoji: '⚪', label: 'Follow Up' },
  ];
  const badgeItems = [
    { emoji: '🐶', label: 'Puppy' },
    { emoji: '💉', label: 'Vaccinated' },
    { emoji: '✂️', label: 'Sterilised' },
    { emoji: '♂/♀', label: 'Gender' },
  ];
  return (
    <View style={lg.wrap}>
      <View style={lg.row}>
        {pinItems.map(({ emoji, label }) => (
          <View key={label} style={lg.item}>
            <Text style={{ fontSize: 10 }}>{emoji}</Text>
            <Text style={lg.label}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={[lg.divider]} />
      <View style={lg.row}>
        {badgeItems.map(({ emoji, label }) => (
          <View key={label} style={lg.item}>
            <Text style={{ fontSize: 10 }}>{emoji}</Text>
            <Text style={lg.label}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const lg = StyleSheet.create({
  wrap: { backgroundColor: C.white, borderRadius: 10, padding: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 3 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  divider: { height: 1, backgroundColor: C.gray200, marginVertical: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  label: { fontSize: 9, color: C.gray600, fontWeight: '500' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const [dogs, setDogs] = useState<DogPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDog, setSelectedDog] = useState<DogPin | null>(null);
  const [locating, setLocating] = useState(false);

  const fetchDogs = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [dogsRes, remindersRes, photosRes, vacsRes] = await Promise.allSettled([
        supabase.from('dogs').select('*').not('location_latitude', 'is', null),
        supabase.from('reminders').select('dog_id').eq('status', 'pending').lte('due_date', today),
        supabase.from('dog_photos').select('dog_id, photo_url').eq('is_profile_photo', true),
        supabase.from('medical_records').select('dog_id').in('event_type', ['vaccination', 'rabies']),
      ]);

      if (dogsRes.status !== 'fulfilled' || dogsRes.value.error) {
        console.warn('Failed to load dogs', dogsRes.status === 'fulfilled' ? dogsRes.value.error : dogsRes.reason);
        setDogs([]);
        return;
      }

      const remindersData = remindersRes.status === 'fulfilled' && !remindersRes.value.error
        ? remindersRes.value.data ?? []
        : [];
      const photosData = photosRes.status === 'fulfilled' && !photosRes.value.error
        ? photosRes.value.data ?? []
        : [];
      const vacsData = vacsRes.status === 'fulfilled' && !vacsRes.value.error
        ? vacsRes.value.data ?? []
        : [];

      const overdueSet = new Set<number>(remindersData.map((r: any) => r.dog_id));
      const photoMap = new Map<number, string>(photosData.map((p: any) => [p.dog_id, p.photo_url]));
      const vacSet = new Set<number>(vacsData.map((v: any) => v.dog_id));

      const pins: DogPin[] = (dogsRes.value.data ?? [])
        .filter((d: any) => d.location_latitude && d.location_longitude)
        .map((d: any) => {
          const base = {
            dog_id: d.dog_id,
            name: d.name,
            latitude: d.location_latitude,
            longitude: d.location_longitude,
            current_status: d.current_status,
            gender: d.gender,
            sterilized: d.sterilized,
            date_of_birth: d.date_of_birth,
            approx_age_months: d.approx_age_months,
            location_address: d.location_address,
            profile_photo_url: photoMap.get(d.dog_id) ?? null,
            has_overdue_reminder: overdueSet.has(d.dog_id),
            has_vaccination: vacSet.has(d.dog_id),
            pin_colour: 'green' as PinColour,
          };
          return { ...base, pin_colour: getPinColour(base) };
        });

      setDogs(pins);
    } catch (error) {
      console.warn('Failed to fetch map data', error);
      setDogs([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDogs().finally(() => setLoading(false));
    }, [fetchDogs])
  );

  const goToMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 800);
    } catch { /* ignore */ }
    finally { setLocating(false); }
  };

  // Stats
  const redCount   = dogs.filter(d => d.pin_colour === 'red').length;
  const amberCount = dogs.filter(d => d.pin_colour === 'amber').length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <View>
          <Text style={styles.title}>Colony Map</Text>
          <Text style={styles.sub}>
            {loading ? 'Loading…' : `${dogs.length} dogs pinned${redCount > 0 ? ` · 🔴 ${redCount} urgent` : ''}`}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/modals/add-dog')} activeOpacity={0.85}>
          <Text style={styles.addBtnText}>＋ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={C.g700} size="large" /></View>
      ) : (
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={DELHI_REGION}
            showsUserLocation
            showsMyLocationButton={false}
            onPress={() => setSelectedDog(null)}
          >
            {dogs.map((dog) => renderDogMarker(dog, () => setSelectedDog(dog)))}
          </MapView>

          {/* Legend */}
          <View style={styles.legend}>
            <Legend />
          </View>

          {/* My location button */}
          <TouchableOpacity style={styles.locBtn} onPress={goToMyLocation} activeOpacity={0.85}>
            {locating
              ? <ActivityIndicator color={C.g700} size="small" />
              : <Text style={styles.locBtnIcon}>📍</Text>
            }
          </TouchableOpacity>

          {/* No dogs with pins */}
          {dogs.length === 0 && (
            <View style={styles.emptyOverlay}>
              <Text style={styles.emptyText}>No dogs with GPS pins yet</Text>
              <Text style={styles.emptySub}>Add a dog and capture their location</Text>
            </View>
          )}
        </View>
      )}

      {/* Selected dog card */}
      {selectedDog && (
        <DogCard
          dog={selectedDog}
          onClose={() => setSelectedDog(null)}
          onView={() => {
            setSelectedDog(null);
            router.push(`/dog/${selectedDog.dog_id}` as any);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  sub: { fontSize: 11, color: C.gray600, marginTop: 1 },
  addBtn: { backgroundColor: C.g700, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addBtnText: { fontSize: 11, fontWeight: '600', color: C.white },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  legend: { position: 'absolute', top: 12, left: 12, right: 12 },
  locBtn: { position: 'absolute', bottom: 20, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
  locBtnIcon: { fontSize: 22 },
  emptyOverlay: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: C.white, borderRadius: 12, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  emptyText: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  emptySub: { fontSize: 12, color: C.gray600, marginTop: 2 },
});
