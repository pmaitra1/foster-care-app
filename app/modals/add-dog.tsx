import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Pressable, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase/client';
import { fetchAllFeeders, createFeeder } from '../../lib/supabase/feeders';
import type { Gender, Feeder } from '../../types';
import { format, addMonths, addWeeks } from 'date-fns';

const C = {
  g700: '#1A5C38', g500: '#2D8653', g300: '#4caf78',
  g100: '#D6EFE0', g50: '#F0FDF4',
  t600: '#0D9488', t100: '#CCFBF1',
  red: '#EF4444', redBg: '#FEF2F2',
  gray900: '#111827', gray600: '#6B7280',
  gray400: '#9CA3AF', gray200: '#E5E7EB',
  gray100: '#F3F4F6', white: '#FFFFFF',
};

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={si.row}>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < current - 1;
        const active = i === current - 1;
        return (
          <View key={i} style={si.item}>
            <View style={[si.dot, done && si.dotDone, active && si.dotActive]}>
              <Text style={[si.dotText, (done || active) && si.dotTextActive]}>{done ? '✓' : i + 1}</Text>
            </View>
            {i < total - 1 && <View style={[si.line, done && si.lineDone]} />}
          </View>
        );
      })}
    </View>
  );
}
const si = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  item: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: C.g700, borderColor: C.g700 },
  dotDone: { backgroundColor: C.g500, borderColor: C.g500 },
  dotText: { fontSize: 11, fontWeight: '600', color: C.gray400 },
  dotTextActive: { color: C.white },
  line: { flex: 1, height: 1.5, backgroundColor: C.gray200, marginHorizontal: 4 },
  lineDone: { backgroundColor: C.g500 },
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      {children}
    </View>
  );
}
const f = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
});

const inputStyle: any = {
  backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200,
  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  fontSize: 14, color: C.gray900,
};

function GenderPicker({ value, onChange }: { value: Gender; onChange: (g: Gender) => void }) {
  const opts: { key: Gender; label: string; emoji: string }[] = [
    { key: 'male', label: 'Male', emoji: '♂️' },
    { key: 'female', label: 'Female', emoji: '♀️' },
    { key: 'unknown', label: 'Unknown', emoji: '❓' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {opts.map((o) => (
        <Pressable key={o.key} style={[gp.btn, value === o.key && gp.btnActive]} onPress={() => onChange(o.key)}>
          <Text style={gp.emoji}>{o.emoji}</Text>
          <Text style={[gp.label, value === o.key && gp.labelActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const gp = StyleSheet.create({
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center', gap: 4 },
  btnActive: { backgroundColor: C.g50, borderColor: C.g700 },
  emoji: { fontSize: 18 },
  label: { fontSize: 12, fontWeight: '500', color: C.gray600 },
  labelActive: { color: C.g700, fontWeight: '600' },
});

function FeederPickerModal({ visible, onClose, onSelect }: {
  visible: boolean; onClose: () => void; onSelect: (feeder: Feeder) => void;
}) {
  const [feeders, setFeeders] = useState<Feeder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchAllFeeders().then(setFeeders).finally(() => setLoading(false));
    }
  }, [visible]);

  const handleCreate = async () => {
    if (!newName.trim()) { Alert.alert('Name required'); return; }
    setCreating(true);
    try {
      const feeder = await createFeeder({ name: newName.trim(), phone: newPhone.trim() || undefined });
      onSelect(feeder);
      setNewName(''); setNewPhone(''); setShowCreate(false);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCreating(false);
    }
  };

  const dot = (rating: string) => rating === 'good' ? '🟢' : rating === 'bad' ? '🔴' : '⚪';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={fp.container}>
        <View style={fp.header}>
          <Text style={fp.title}>{showCreate ? 'New Feeder' : 'Select Feeder'}</Text>
          <TouchableOpacity onPress={onClose} style={fp.close}>
            <Text style={{ fontSize: 14, color: C.gray600 }}>✕</Text>
          </TouchableOpacity>
        </View>

        {!showCreate ? (
          <FlatList
            data={feeders}
            keyExtractor={(f) => String(f.feeder_id)}
            contentContainerStyle={{ padding: 12 }}
            ListEmptyComponent={
              loading
                ? <View style={fp.centered}><ActivityIndicator color={C.g700} /></View>
                : <View style={fp.centered}><Text style={{ color: C.gray400, fontSize: 13 }}>No feeders yet — create one below</Text></View>
            }
            ListHeaderComponent={
              <TouchableOpacity style={fp.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
                <Text style={fp.createBtnText}>＋ Create New Feeder</Text>
              </TouchableOpacity>
            }
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => (
              <TouchableOpacity style={fp.feederRow} onPress={() => { onSelect(item); onClose(); }} activeOpacity={0.75}>
                <Text style={{ fontSize: 14 }}>{dot(item.rating)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={fp.feederName}>{item.name}</Text>
                  {item.colony && <Text style={fp.feederSub}>{item.colony}</Text>}
                  {item.phone && <Text style={fp.feederSub}>📞 {item.phone}</Text>}
                </View>
                <Text style={{ fontSize: 18, color: C.gray400 }}>›</Text>
              </TouchableOpacity>
            )}
          />
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity onPress={() => setShowCreate(false)} style={{ marginBottom: 16 }}>
                <Text style={{ color: C.g700, fontWeight: '600' }}>← Back to list</Text>
              </TouchableOpacity>
              <Text style={fp.fieldLabel}>Full Name *</Text>
              <TextInput style={inputStyle} placeholder="e.g. Raju Bhai" placeholderTextColor={C.gray400} value={newName} onChangeText={setNewName} autoFocus />
              <Text style={[fp.fieldLabel, { marginTop: 12 }]}>Phone Number</Text>
              <TextInput style={[inputStyle, { marginTop: 6 }]} placeholder="98100 XXXXX" placeholderTextColor={C.gray400} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
              <TouchableOpacity style={[styles.btnPrimary, { marginTop: 20 }]} onPress={handleCreate} disabled={creating} activeOpacity={0.85}>
                {creating ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnPrimaryText}>Create & Select</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const fp = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  centered: { padding: 40, alignItems: 'center' },
  createBtn: { backgroundColor: C.g700, borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  createBtnText: { fontSize: 13, fontWeight: '700', color: C.white },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
  feederRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, padding: 12 },
  feederName: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  feederSub: { fontSize: 11, color: C.gray600, marginTop: 1 },
});

export default function AddDogModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const [showFeederPicker, setShowFeederPicker] = useState(false);

  const [locationMode, setLocationMode] = useState<'gps' | 'manual'>('gps');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unknown');
  const [dob, setDob] = useState('');
  const [approxAge, setApproxAge] = useState('');
  const [colony, setColony] = useState('');
  const [selectedFeeder, setSelectedFeeder] = useState<Feeder | null>(null);
  const [notes, setNotes] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [savedDogId, setSavedDogId] = useState<number | null>(null);
  const [autoSchedule, setAutoSchedule] = useState<{ label: string; date: string }[]>([]);

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission needed'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      setPhotoUris((prev) => (prev.includes(uri) ? prev : [...prev, uri]));
    }
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: false,
      allowsMultipleSelection: true as any,
      selectionLimit: 10 as any,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setPhotoUris((prev) => [...new Set([...prev, ...uris])]);
    }
  };

  const captureLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location permission needed'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      setManualLat(loc.coords.latitude.toFixed(6));
      setManualLng(loc.coords.longitude.toFixed(6));
      const geo = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (geo[0] && !colony) {
        setColony([geo[0].district, geo[0].subregion, geo[0].city].filter(Boolean).join(', '));
      }
    } catch {
      Alert.alert('Could not get location', 'Check your GPS settings');
    } finally {
      setLocating(false);
    }
  };

  const applyManualCoords = () => {
  const lat = parseFloat(manualLat);
  const lng = parseFloat(manualLng);
  if (isNaN(lat) || isNaN(lng)) { Alert.alert('Invalid coordinates', 'Enter valid numbers.'); return; }
  if (lat < -90 || lat > 90) { Alert.alert('Invalid latitude', 'Must be between -90 and 90.'); return; }
  if (lng < -180 || lng > 180) { Alert.alert('Invalid longitude', 'Must be between -180 and 180.'); return; }
  setLatitude(lat);
  setLongitude(lng);
};

  const validateStep2 = () => {
    if (!name.trim()) { Alert.alert('Name required', "Please enter the dog's name"); return false; }
    return true;
  };

  const saveDog = async () => {
  if (!validateStep2()) return;
  setSaving(true);
  try {
    // Resolve final coordinates based on mode
    let finalLat = latitude;
    let finalLng = longitude;
    if (locationMode === 'manual' && manualLat.trim() && manualLng.trim()) {
      const lat = parseFloat(manualLat);
      const lng = parseFloat(manualLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        finalLat = lat;
        finalLng = lng;
      }
    }

    const input: any = {
      name: name.trim(), gender,
      location_address: colony.trim() || null,
      location_latitude: finalLat,
      location_longitude: finalLng,
      feeder_id: selectedFeeder?.feeder_id ?? null,
      feeder_phone: selectedFeeder?.phone ?? null,
      notes: notes.trim() || null,
      sterilized: false, current_status: 'healthy',
    };
    if (dob.trim()) input.date_of_birth = dob.trim();
    else if (approxAge.trim()) input.approx_age_months = parseInt(approxAge) || null;

    const { data: dog, error } = await supabase.from('dogs').insert(input).select().single();
    if (error) throw error;

    if (photoUris.length > 0) {
      for (let i = 0; i < photoUris.length; i += 1) {
        const uri = photoUris[i];
        const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        const fileName = `dog_${dog.dog_id}_${Date.now()}_${i}.${ext}`;
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
        const { data: uploadData } = await supabase.storage.from('dog-photos').upload(fileName, decode(base64), { contentType: mimeType });
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(fileName);
          await supabase.from('dog_photos').insert({
            dog_id: dog.dog_id,
            photo_url: urlData.publicUrl,
            is_profile_photo: i === 0,
          });
        }
      }
    }

      const schedule: { label: string; date: string }[] = [];
      if (dob.trim()) {
        const dobDate = new Date(dob.trim());
        const preWarn = addWeeks(addMonths(dobDate, 5), 3);
        const sixMonth = addMonths(dobDate, 6);
        await supabase.from('reminders').insert([
          { dog_id: dog.dog_id, reminder_type: '6_month_check', due_date: format(preWarn, 'yyyy-MM-dd'), is_auto_generated: true, status: 'pending' },
          { dog_id: dog.dog_id, reminder_type: '6_month_check', due_date: format(sixMonth, 'yyyy-MM-dd'), is_auto_generated: true, status: 'pending' },
        ]);
        schedule.push(
          { label: '6-Month Pre-warning', date: format(preWarn, 'dd MMM yyyy') },
          { label: '6-Month Check', date: format(sixMonth, 'dd MMM yyyy') },
        );
      }
      setSavedDogId(dog.dog_id);
      setAutoSchedule(schedule);
      setStep(4);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const renderStep1 = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <StepIndicator current={1} total={4} />
      <Text style={styles.stepTitle}>Add Photos</Text>
      <Text style={styles.stepSub}>Take one or more photos, or choose multiple from library</Text>
      {photoUris.length > 0 ? (
        <View style={styles.photoPreview}>
          <Text style={{ fontSize: 64 }}>🐕</Text>
          <Text style={styles.photoTaken}>{photoUris.length} photo{photoUris.length === 1 ? '' : 's'} selected ✓</Text>
          <TouchableOpacity onPress={() => setPhotoUris([])}><Text style={styles.photoRetake}>Clear all</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoPlaceholder}>
          <Text style={{ fontSize: 40 }}>📸</Text>
          <Text style={styles.photoHint}>Tap to take photos</Text>
          <Text style={styles.photoHintSub}>or pick multiple from library</Text>
        </View>
      )}
      <TouchableOpacity style={styles.btnPrimary} onPress={pickFromCamera} activeOpacity={0.85}><Text style={styles.btnPrimaryText}>Open Camera</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.btnSecondary, { marginTop: 8 }]} onPress={pickFromLibrary} activeOpacity={0.85}><Text style={styles.btnSecondaryText}>Choose from Library</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setStep(2)} style={styles.skipBtn}><Text style={styles.skipText}>Skip for now →</Text></TouchableOpacity>
    </ScrollView>
  );

  const renderStep2 = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <StepIndicator current={2} total={4} />
        <Text style={styles.stepTitle}>Basic Details</Text>

        <Field label="Dog's Name / Nickname *">
          <TextInput style={inputStyle} placeholder="e.g. Bruno, Kali, Moti…" placeholderTextColor={C.gray400} value={name} onChangeText={setName} autoFocus />
        </Field>
        <Field label="Gender"><GenderPicker value={gender} onChange={setGender} /></Field>
        <Field label="Date of Birth">
          <TextInput style={inputStyle} placeholder="YYYY-MM-DD (if known)" placeholderTextColor={C.gray400} value={dob} onChangeText={setDob} keyboardType="numbers-and-punctuation" />
        </Field>
        <Field label="Or Approximate Age (months)">
          <TextInput style={inputStyle} placeholder="e.g. 6 (if DOB unknown)" placeholderTextColor={C.gray400} value={approxAge} onChangeText={setApproxAge} keyboardType="number-pad" />
        </Field>
        <Field label="Colony / Area">
          <TextInput style={inputStyle} placeholder="e.g. Khirki Colony, Malviya Nagar" placeholderTextColor={C.gray400} value={colony} onChangeText={setColony} />
        </Field>

        <Field label="Feeder">
          <TouchableOpacity style={[inputStyle, styles.feederPickerBtn]} onPress={() => setShowFeederPicker(true)} activeOpacity={0.75}>
            {selectedFeeder ? (
              <View style={{ flex: 1 }}>
                <Text style={styles.feederSelectedName}>{selectedFeeder.name}</Text>
                {selectedFeeder.phone && <Text style={styles.feederSelectedPhone}>📞 {selectedFeeder.phone}</Text>}
              </View>
            ) : (
              <Text style={styles.feederPlaceholder}>Select or create a feeder…</Text>
            )}
            <Text style={styles.feederChevron}>›</Text>
          </TouchableOpacity>
          {selectedFeeder && (
            <TouchableOpacity onPress={() => setSelectedFeeder(null)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: C.red }}>Clear selection</Text>
            </TouchableOpacity>
          )}
        </Field>

        <Field label="Notes">
          <TextInput style={[inputStyle, { height: 72, textAlignVertical: 'top' }]} placeholder="Any extra observations…" placeholderTextColor={C.gray400} value={notes} onChangeText={setNotes} multiline />
        </Field>

        <TouchableOpacity style={styles.btnPrimary} onPress={() => { if (validateStep2()) setStep(3); }} activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>Next → Drop Pin on Map</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );

const renderStep3 = () => {
  const hasCoords = latitude !== null && longitude !== null;
  const manualReady = manualLat.trim() !== '' && manualLng.trim() !== '' &&
    !isNaN(parseFloat(manualLat)) && !isNaN(parseFloat(manualLng));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <StepIndicator current={3} total={4} />
        <Text style={styles.stepTitle}>Pin Location</Text>
        <Text style={styles.stepSub}>Set this dog's location on the map</Text>

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <Pressable style={[styles.modeBtn, locationMode === 'gps' && styles.modeBtnActive]} onPress={() => setLocationMode('gps')}>
            <Text style={styles.modeBtnIcon}>📍</Text>
            <Text style={[styles.modeBtnText, locationMode === 'gps' && styles.modeBtnTextActive]}>Use GPS</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, locationMode === 'manual' && styles.modeBtnActive]} onPress={() => setLocationMode('manual')}>
            <Text style={styles.modeBtnIcon}>⌨️</Text>
            <Text style={[styles.modeBtnText, locationMode === 'manual' && styles.modeBtnTextActive]}>Enter Manually</Text>
          </Pressable>
        </View>

        {locationMode === 'gps' ? (
          <>
            <View style={styles.mapPlaceholder}>
              <Text style={{ fontSize: 48 }}>📍</Text>
              {hasCoords ? (
                <>
                  <Text style={styles.locationCaptured}>✅ Location captured</Text>
                  <Text style={styles.locationCoords}>{latitude?.toFixed(5)}, {longitude?.toFixed(5)}</Text>
                  {colony ? <Text style={styles.locationAddress}>{colony}</Text> : null}
                </>
              ) : (
                <>
                  <Text style={styles.locationHint}>Tap below to capture GPS</Text>
                  <Text style={styles.locationHintSub}>Marks {name || 'the dog'}'s spot on the map</Text>
                </>
              )}
            </View>
            <TouchableOpacity style={[styles.btnPrimary, locating && styles.btnDisabled]} onPress={captureLocation} disabled={locating} activeOpacity={0.85}>
              {locating ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnPrimaryText}>{hasCoords ? '🔄 Recapture Location' : '📍 Use My Current Location'}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.manualCard}>
            <Text style={styles.manualHint}>
              Find coordinates by long-pressing a spot on Google Maps and copying the numbers shown.
            </Text>
            <Field label="Latitude">
              <TextInput style={inputStyle} placeholder="e.g. 28.52345" placeholderTextColor={C.gray400} value={manualLat} onChangeText={setManualLat} keyboardType="decimal-pad" />
            </Field>
            <Field label="Longitude">
              <TextInput style={inputStyle} placeholder="e.g. 77.18765" placeholderTextColor={C.gray400} value={manualLng} onChangeText={setManualLng} keyboardType="decimal-pad" onSubmitEditing={applyManualCoords} />
            </Field>
            {manualReady && (
              <TouchableOpacity style={styles.verifyBtn} onPress={applyManualCoords} activeOpacity={0.85}>
                <Text style={styles.verifyBtnText}>✓ Verify Coordinates</Text>
              </TouchableOpacity>
            )}
            {hasCoords && (
              <View style={styles.coordConfirmed}>
                <Text style={styles.coordConfirmedText}>✅ {latitude?.toFixed(5)}, {longitude?.toFixed(5)}</Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.btnRow, { marginTop: 16 }]}>
          <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setStep(2)} activeOpacity={0.85}><Text style={styles.btnSecondaryText}>← Back</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, { flex: 2 }]} onPress={saveDog} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnPrimaryText}>Confirm & Save →</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={saveDog} style={styles.skipBtn} disabled={saving}><Text style={styles.skipText}>Skip location & save →</Text></TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

  const renderStep4 = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}>
      <View style={styles.successCircle}><Text style={{ fontSize: 40 }}>🐕</Text></View>
      <Text style={styles.successTitle}>{name} Added!</Text>
      <Text style={styles.successSub}>Dog profile created{selectedFeeder ? ` · Linked to ${selectedFeeder.name}` : ''}</Text>
      {autoSchedule.length > 0 && (
        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleHeader}>⚡ Auto-Schedule Created</Text>
          {autoSchedule.map((s, i) => (
            <View key={i} style={styles.scheduleRow}>
              <Text style={styles.scheduleLabel}>{s.label}</Text>
              <Text style={styles.scheduleDate}>{s.date}</Text>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity style={[styles.btnPrimary, { width: '100%', marginTop: 16 }]} onPress={() => { router.back(); if (savedDogId) router.push(`/dog/${savedDogId}` as any); }} activeOpacity={0.85}>
        <Text style={styles.btnPrimaryText}>View Dog Profile →</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btnSecondary, { width: '100%', marginTop: 8 }]} onPress={() => router.back()} activeOpacity={0.85}>
        <Text style={styles.btnSecondaryText}>Back to My Dogs</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{step === 4 ? '🎉 Done!' : 'Add New Dog'}</Text>
        {step < 4 && (
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}

      {step === 1 && photoUris.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom || 16 }]}>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => setStep(2)} activeOpacity={0.85}>
            <Text style={styles.btnPrimaryText}>Next → Basic Details</Text>
          </TouchableOpacity>
        </View>
      )}

      <FeederPickerModal
        visible={showFeederPicker}
        onClose={() => setShowFeederPicker(false)}
        onSelect={(feeder) => { setSelectedFeeder(feeder); setShowFeederPicker(false); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: C.gray600 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  stepTitle: { fontSize: 18, fontWeight: '700', color: C.gray900, marginBottom: 4 },
  stepSub: { fontSize: 12, color: C.gray600, marginBottom: 16 },
  photoPlaceholder: { backgroundColor: C.g50, borderWidth: 2, borderColor: C.g300, borderStyle: 'dashed', borderRadius: 12, height: 160, alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 },
  photoPreview: { backgroundColor: C.g100, borderRadius: 12, height: 160, alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 },
  photoHint: { fontSize: 13, fontWeight: '600', color: C.g700 },
  photoHintSub: { fontSize: 11, color: C.gray600 },
  photoTaken: { fontSize: 13, fontWeight: '600', color: C.g700 },
  photoRetake: { fontSize: 12, color: C.gray600, textDecorationLine: 'underline' },
  mapPlaceholder: { backgroundColor: C.g50, borderRadius: 12, height: 200, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, borderWidth: 1, borderColor: C.g100 },
  locationHint: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  locationHintSub: { fontSize: 12, color: C.gray600 },
  locationCaptured: { fontSize: 14, fontWeight: '700', color: C.g700 },
  locationCoords: { fontSize: 11, color: C.gray600, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  locationAddress: { fontSize: 12, color: C.gray600 },
  feederPickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feederSelectedName: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  feederSelectedPhone: { fontSize: 11, color: C.gray600, marginTop: 1 },
  feederPlaceholder: { fontSize: 14, color: C.gray400, flex: 1 },
  feederChevron: { fontSize: 18, color: C.gray400 },
  btnPrimary: { backgroundColor: C.g700, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: C.white },
  btnSecondary: { backgroundColor: C.gray100, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  btnDisabled: { opacity: 0.6 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  skipBtn: { alignItems: 'center', marginTop: 14 },
  skipText: { fontSize: 12, color: C.gray400 },
  successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.g100, alignItems: 'center', justifyContent: 'center', marginBottom: 12, marginTop: 20 },
  successTitle: { fontSize: 22, fontWeight: '700', color: C.gray900, marginBottom: 4 },
  successSub: { fontSize: 13, color: C.gray600, marginBottom: 20, textAlign: 'center' },
  scheduleCard: { backgroundColor: C.t100, borderWidth: 1, borderColor: C.t600, borderRadius: 12, padding: 14, width: '100%', gap: 8 },
  scheduleHeader: { fontSize: 11, fontWeight: '700', color: C.t600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scheduleLabel: { fontSize: 12, color: C.gray900 },
  scheduleDate: { fontSize: 12, fontWeight: '600', color: C.t600 },
  footer: { padding: 16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200 },
  modeToggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: C.gray200 },
modeBtnActive: { backgroundColor: C.g50, borderColor: C.g700 },
modeBtnIcon: { fontSize: 16 },
modeBtnText: { fontSize: 13, fontWeight: '600', color: C.gray600 },
modeBtnTextActive: { color: C.g700 },
manualCard: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, padding: 14, marginBottom: 8 },
manualHint: { fontSize: 12, color: C.gray600, lineHeight: 18, marginBottom: 12 },
verifyBtn: { backgroundColor: C.g50, borderWidth: 1.5, borderColor: C.g700, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
verifyBtnText: { fontSize: 13, fontWeight: '600', color: C.g700 },
coordConfirmed: { backgroundColor: C.g100, borderRadius: 8, padding: 10, marginTop: 10 },
coordConfirmedText: { fontSize: 12, color: C.g700, fontWeight: '500' },
});