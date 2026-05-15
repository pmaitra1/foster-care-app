import { useEffect, useState, useCallback } from 'react';import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Pressable, TextInput,
  KeyboardAvoidingView, Platform, Modal, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase/client';
import type { Dog, HealthUpdate, MedicalRecord, Reminder, UpdateType, MedicalEventType, ReminderType } from '../../types';
import { format, parseISO, differenceInMonths, addMonths, addWeeks } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Image } from 'react-native';

const C = {
  g700: '#1A5C38', g500: '#2D8653', g300: '#4caf78',
  g100: '#D6EFE0', g50: '#F0FDF4',
  t600: '#0D9488', t100: '#CCFBF1',
  red: '#EF4444', redBg: '#FEF2F2', redBorder: '#FECACA',
  amber: '#F59E0B', amberBg: '#FFFBEB', amberBorder: '#FDE68A',
  blue: '#3B82F6', blueBg: '#EFF6FF',
  gray900: '#111827', gray600: '#6B7280',
  gray400: '#9CA3AF', gray200: '#E5E7EB',
  gray100: '#F3F4F6', white: '#FFFFFF',
};

function getAgeMonths(dog: Dog): number | null {
  if (dog.date_of_birth) return differenceInMonths(new Date(), parseISO(dog.date_of_birth));
  return dog.approx_age_months ?? null;
}

function formatAge(months: number | null): string {
  if (months === null) return 'Age unknown';
  if (months < 12) return `${months} months old`;
  return `${Math.floor(months / 12)} yr old`;
}

function getStatusColours(status: string) {
  switch (status) {
    case 'critical':        return { bg: C.redBg,   border: C.redBorder,   text: '#B91C1C', label: 'Critical' };
    case 'needs_attention': return { bg: C.amberBg, border: C.amberBorder, text: '#92400E', label: 'Needs Attention' };
    case 'healthy':         return { bg: C.g50,     border: C.g100,        text: C.g700,    label: 'Healthy' };
    case 'follow_up':       return { bg: C.t100,    border: C.t600,        text: C.t600,    label: 'Follow Up' };
    default:                return { bg: C.gray100, border: C.gray200,     text: C.gray600, label: status };
  }
}

function getReminderColours(type: string, daysUntil: number) {
  if (daysUntil < 0)   return { bg: C.redBg,   border: C.redBorder,   text: '#B91C1C', label: 'Overdue' };
  if (daysUntil === 0) return { bg: C.redBg,   border: C.redBorder,   text: '#B91C1C', label: 'Due Today' };
  if (daysUntil <= 7)  return { bg: C.amberBg, border: C.amberBorder, text: '#92400E', label: `Due in ${daysUntil}d` };
  return { bg: C.g50, border: C.g100, text: C.g700, label: `Due ${daysUntil}d` };
}

function getUpdateTypeColour(type: UpdateType) {
  switch (type) {
    case 'parvo':    return { bg: C.redBg,   text: '#B91C1C' };
    case 'vomiting': return { bg: C.amberBg, text: '#92400E' };
    case 'feeding':  return { bg: C.g50,     text: C.g700 };
    case 'general':  return { bg: C.gray100, text: C.gray600 };
    default:         return { bg: C.blueBg,  text: C.blue };
  }
}

function Section({ title, action, onAction, children }: {
  title: string; action?: string; onAction?: () => void; children: React.ReactNode;
}) {
  return (
    <View style={sec.wrap}>
      <View style={sec.header}>
        <Text style={sec.title}>{title}</Text>
        {action && onAction && (
          <TouchableOpacity onPress={onAction}>
            <Text style={sec.action}>{action}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  wrap: { marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 12, fontWeight: '700', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.8 },
  action: { fontSize: 12, fontWeight: '600', color: C.g700 },
});

function QABtn({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity style={[qa.btn, primary && qa.btnPrimary]} onPress={onPress} activeOpacity={0.75}>
      <Text style={qa.icon}>{icon}</Text>
      <Text style={[qa.label, primary && qa.labelPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}
const qa = StyleSheet.create({
  btn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gray100, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: C.gray200 },
  btnPrimary: { backgroundColor: C.g50, borderColor: C.g300 },
  icon: { fontSize: 16 },
  label: { fontSize: 10, fontWeight: '600', color: C.gray600 },
  labelPrimary: { color: C.g700 },
});

// ── Log Update Modal ──────────────────────────────────────────────────────────
function LogUpdateModal({ dogId, dogName, visible, onClose, onSaved }: {
  dogId: number; dogName: string; visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = useState<UpdateType>('general');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const UPDATE_TYPES: UpdateType[] = ['general', 'parvo', 'feeding', 'vomiting', 'other'];
  const QUICK = ['Not eating', 'Follow up feeder', 'Doing well', 'Vomiting', 'Eating well'];

  const save = async () => {
    if (!note.trim()) { Alert.alert('Please enter a note'); return; }
    setSaving(true);
    try {
      await supabase.from('health_updates').insert({
        dog_id: dogId, update_date: format(new Date(), 'yyyy-MM-dd'),
        status_note: note.trim(), update_type: type,
      });
      if (status) await supabase.from('dogs').update({ current_status: status }).eq('dog_id', dogId);
      onSaved(); setNote(''); setType('general'); setStatus(''); onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={lum.container}>
          <View style={lum.header}>
            <Text style={lum.title}>Add Update · {dogName}</Text>
            <TouchableOpacity onPress={onClose} style={lum.close}><Text style={{ fontSize: 14, color: C.gray600 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={lum.content} keyboardShouldPersistTaps="handled">
            <Text style={lum.sectionLabel}>Update Type</Text>
            <View style={lum.chips}>
              {UPDATE_TYPES.map((t) => {
                const col = getUpdateTypeColour(t); const active = type === t;
                return (
                  <Pressable key={t} style={[lum.chip, active && { backgroundColor: col.bg, borderColor: col.text }]} onPress={() => setType(t)}>
                    <Text style={[lum.chipText, active && { color: col.text }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={lum.sectionLabel}>Current Status (optional)</Text>
            <View style={lum.statusGrid}>
              {['healthy', 'needs_attention', 'critical', 'follow_up'].map((s) => {
                const col = getStatusColours(s);
                return (
                  <Pressable key={s} style={[lum.statusBtn, status === s && { backgroundColor: col.bg, borderColor: col.text }]} onPress={() => setStatus(status === s ? '' : s)}>
                    <Text style={[lum.statusText, status === s && { color: col.text, fontWeight: '600' }]}>{col.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={lum.sectionLabel}>Field Note</Text>
            <TextInput style={lum.noteInput} placeholder="What did you observe?" placeholderTextColor={C.gray400} value={note} onChangeText={setNote} multiline numberOfLines={4} textAlignVertical="top" autoFocus />
            <Text style={lum.sectionLabel}>Quick Templates</Text>
            <View style={lum.chips}>
              {QUICK.map((q) => (<Pressable key={q} style={lum.quickChip} onPress={() => setNote(q)}><Text style={lum.quickChipText}>{q}</Text></Pressable>))}
            </View>
            <TouchableOpacity style={lum.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={lum.saveBtnText}>Save Update</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const lum = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 0 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: C.gray200 },
  chipText: { fontSize: 12, fontWeight: '500', color: C.gray600 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statusBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: C.gray200 },
  statusText: { fontSize: 12, color: C.gray600 },
  noteInput: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.g300, borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900, minHeight: 88 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.gray100, borderRadius: 10 },
  quickChipText: { fontSize: 11, color: C.gray600 },
  saveBtn: { backgroundColor: C.g700, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ── Log Medical Modal ─────────────────────────────────────────────────────────
function LogMedicalModal({ dogId, dogName, visible, onClose, onSaved }: {
  dogId: number; dogName: string; visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [eventType, setEventType] = useState<MedicalEventType>('vaccination');
  const [eventName, setEventName] = useState('');
  const [dateGiven, setDateGiven] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEventTypeChange = (type: MedicalEventType) => {
    setEventType(type);
    const given = dateGiven ? new Date(dateGiven) : new Date();
    if (type === 'vaccination') { setNextDueDate(format(addMonths(given, 12), 'yyyy-MM-dd')); setEventName(''); }
    else if (type === 'deworming') { setNextDueDate(format(addMonths(given, 3), 'yyyy-MM-dd')); setEventName('Deworming'); }
    else if (type === 'rabies') { setNextDueDate(format(addMonths(given, 12), 'yyyy-MM-dd')); setEventName('Rabies Vaccine'); }
    else { setNextDueDate(''); setEventName(''); }
  };

  const EVENT_TYPES: { key: MedicalEventType; label: string; emoji: string; hint: string }[] = [
    { key: 'vaccination', label: 'Vaccination', emoji: '💉', hint: 'Next due in 12 months' },
    { key: 'deworming',   label: 'Deworming',   emoji: '🩺', hint: 'Next due in 3 months' },
    { key: 'rabies',      label: 'Rabies',       emoji: '🔴', hint: 'Next due in 12 months' },
    { key: 'other',       label: 'Other',        emoji: '📋', hint: 'Set next due manually' },
  ];
  const VACCINE_QUICK = ['Nobivac DHPPi', 'Nobivac Puppy DP', 'Canigen DHPPi', 'Nobivac Rabies'];

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('medical_records').insert({
        dog_id: dogId, event_type: eventType,
        event_name: eventName.trim() || null,
        date_given: dateGiven || null,
        next_due_date: nextDueDate || null,
        notes: notes.trim() || null,
      });
      if (nextDueDate) {
        const reminderType = eventType === 'deworming' ? 'deworming' : 'vaccination';
        await supabase.from('reminders').insert({ dog_id: dogId, reminder_type: reminderType, due_date: nextDueDate, is_auto_generated: true, status: 'pending' });
      }
      const label = eventName.trim() || eventType;
      await supabase.from('health_updates').insert({
        dog_id: dogId, update_date: dateGiven || format(new Date(), 'yyyy-MM-dd'),
        status_note: `💉 ${label} given${nextDueDate ? ` · Next due ${format(parseISO(nextDueDate), 'dd MMM yyyy')}` : ''}`,
        update_type: 'general',
      });
      onSaved();
      setEventType('vaccination'); setEventName(''); setNotes('');
      setDateGiven(format(new Date(), 'yyyy-MM-dd')); setNextDueDate('');
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={mm.container}>
          <View style={mm.header}>
            <Text style={mm.title}>Log Medical Event · {dogName}</Text>
            <TouchableOpacity onPress={onClose} style={mm.close}><Text style={{ fontSize: 14, color: C.gray600 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={mm.content} keyboardShouldPersistTaps="handled">
            <Text style={mm.sectionLabel}>Event Type</Text>
            <View style={mm.typeGrid}>
              {EVENT_TYPES.map((e) => (
                <Pressable key={e.key} style={[mm.typeBtn, eventType === e.key && mm.typeBtnActive]} onPress={() => handleEventTypeChange(e.key)}>
                  <Text style={mm.typeEmoji}>{e.emoji}</Text>
                  <Text style={[mm.typeLabel, eventType === e.key && mm.typeLabelActive]}>{e.label}</Text>
                  <Text style={mm.typeHint}>{e.hint}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={mm.sectionLabel}>{eventType === 'vaccination' ? 'Vaccine Name' : 'Event Name'}</Text>
            <TextInput style={mm.input} placeholder={eventType === 'vaccination' ? 'e.g. Nobivac DHPPi' : 'e.g. Deworming treatment'} placeholderTextColor={C.gray400} value={eventName} onChangeText={setEventName} />
            {eventType === 'vaccination' && (
              <>
                <Text style={mm.sectionLabel}>Quick Select</Text>
                <View style={mm.quickRow}>
                  {VACCINE_QUICK.map((v) => (<Pressable key={v} style={mm.quickChip} onPress={() => setEventName(v)}><Text style={mm.quickChipText}>{v}</Text></Pressable>))}
                </View>
              </>
            )}
            <Text style={mm.sectionLabel}>Date Given</Text>
            <TextInput style={mm.input} placeholder="YYYY-MM-DD" placeholderTextColor={C.gray400} value={dateGiven} onChangeText={setDateGiven} keyboardType="numbers-and-punctuation" />
            <Text style={mm.sectionLabel}>Next Due Date</Text>
            <TextInput style={[mm.input, nextDueDate ? mm.inputFilled : null]} placeholder="YYYY-MM-DD (auto-calculated)" placeholderTextColor={C.gray400} value={nextDueDate} onChangeText={setNextDueDate} keyboardType="numbers-and-punctuation" />
            {nextDueDate ? <Text style={mm.nextDueHint}>⚡ Reminder auto-created for {format(parseISO(nextDueDate), 'dd MMM yyyy')}</Text> : null}
            <Text style={mm.sectionLabel}>Notes (optional)</Text>
            <TextInput style={[mm.input, { height: 64, textAlignVertical: 'top' }]} placeholder="Batch number, vet name, reactions…" placeholderTextColor={C.gray400} value={notes} onChangeText={setNotes} multiline />
            <TouchableOpacity style={mm.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={mm.saveBtnText}>Save Medical Record</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const mm = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8, marginTop: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeBtn: { width: '47%', padding: 12, borderRadius: 10, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center', gap: 3 },
  typeBtnActive: { backgroundColor: C.g50, borderColor: C.g700 },
  typeEmoji: { fontSize: 20 },
  typeLabel: { fontSize: 12, fontWeight: '600', color: C.gray600 },
  typeLabelActive: { color: C.g700 },
  typeHint: { fontSize: 10, color: C.gray400, textAlign: 'center' },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.gray900 },
  inputFilled: { borderColor: C.g300 },
  nextDueHint: { fontSize: 11, color: C.t600, fontWeight: '500', marginTop: 4 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.gray100, borderRadius: 10, borderWidth: 1, borderColor: C.gray200 },
  quickChipText: { fontSize: 11, color: C.gray600 },
  saveBtn: { backgroundColor: C.g700, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ── Add Reminder Modal ────────────────────────────────────────────────────────
function AddReminderModal({ dogId, dogName, visible, onClose, onSaved }: {
  dogId: number; dogName: string; visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [reminderType, setReminderType] = useState<ReminderType>('manual');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const TYPES: { key: ReminderType; label: string; emoji: string }[] = [
    { key: 'manual',        label: 'Manual',       emoji: '📌' },
    { key: 'vaccination',   label: 'Vaccination',  emoji: '💉' },
    { key: 'deworming',     label: 'Deworming',    emoji: '🩺' },
    { key: '6_month_check', label: '6-Month Check', emoji: '🐶' },
  ];

  // Quick date shortcuts
  const setQuickDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDueDate(format(d, 'yyyy-MM-dd'));
  };

  const save = async () => {
    if (!dueDate.trim()) { Alert.alert('Please set a due date'); return; }
    setSaving(true);
    try {
      await supabase.from('reminders').insert({
        dog_id: dogId,
        reminder_type: reminderType,
        due_date: dueDate,
        is_auto_generated: false,
        status: 'pending',
      });
      onSaved();
      setReminderType('manual'); setDueDate('');
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={rm.container}>
          <View style={rm.header}>
            <Text style={rm.title}>Add Reminder · {dogName}</Text>
            <TouchableOpacity onPress={onClose} style={rm.close}><Text style={{ fontSize: 14, color: C.gray600 }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={rm.content} keyboardShouldPersistTaps="handled">

            <Text style={rm.sectionLabel}>Reminder Type</Text>
            <View style={rm.typeGrid}>
              {TYPES.map((t) => (
                <Pressable key={t.key} style={[rm.typeBtn, reminderType === t.key && rm.typeBtnActive]} onPress={() => setReminderType(t.key)}>
                  <Text style={rm.typeEmoji}>{t.emoji}</Text>
                  <Text style={[rm.typeLabel, reminderType === t.key && rm.typeLabelActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={rm.sectionLabel}>Due Date</Text>
            <TextInput
              style={rm.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.gray400}
              value={dueDate}
              onChangeText={setDueDate}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={rm.sectionLabel}>Quick Date</Text>
            <View style={rm.quickRow}>
              {[
                { label: 'Tomorrow', days: 1 },
                { label: 'In 3 days', days: 3 },
                { label: 'In 1 week', days: 7 },
                { label: 'In 2 weeks', days: 14 },
                { label: 'In 1 month', days: 30 },
                { label: 'In 3 months', days: 90 },
              ].map((q) => (
                <Pressable key={q.label} style={rm.quickChip} onPress={() => setQuickDate(q.days)}>
                  <Text style={rm.quickChipText}>{q.label}</Text>
                </Pressable>
              ))}
            </View>

            {dueDate ? (
              <View style={rm.preview}>
                <Text style={rm.previewText}>
                  ⏰ Reminder set for {format(new Date(dueDate), 'dd MMM yyyy')}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity style={rm.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={rm.saveBtnText}>Set Reminder</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const rm = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8, marginTop: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { width: '47%', padding: 12, borderRadius: 10, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center', gap: 4 },
  typeBtnActive: { backgroundColor: C.g50, borderColor: C.g700 },
  typeEmoji: { fontSize: 20 },
  typeLabel: { fontSize: 12, fontWeight: '600', color: C.gray600 },
  typeLabelActive: { color: C.g700 },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.gray900 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.gray100, borderRadius: 20, borderWidth: 1, borderColor: C.gray200 },
  quickChipText: { fontSize: 12, color: C.gray600 },
  preview: { backgroundColor: C.t100, borderRadius: 10, padding: 12, marginTop: 12 },
  previewText: { fontSize: 13, fontWeight: '600', color: C.t600 },
  saveBtn: { backgroundColor: C.g700, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ── Edit Dog Modal ────────────────────────────────────────────────────────────
function EditDogModal({ dog, visible, onClose, onSaved }: {
  dog: Dog; visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(dog.name);
  const [gender, setGender] = useState<Gender>(dog.gender);
  const [dob, setDob] = useState(dog.date_of_birth ?? '');
  const [approxAge, setApproxAge] = useState(dog.approx_age_months?.toString() ?? '');
  const [colony, setColony] = useState(dog.location_address ?? '');
  const [feederPhone, setFeederPhone] = useState(dog.feeder_phone ?? '');
  const [status, setStatus] = useState(dog.current_status);
  const [notes, setNotes] = useState(dog.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Keep form in sync if dog prop changes
  useEffect(() => {
    setName(dog.name); setGender(dog.gender);
    setDob(dog.date_of_birth ?? ''); setApproxAge(dog.approx_age_months?.toString() ?? '');
    setColony(dog.location_address ?? ''); setFeederPhone(dog.feeder_phone ?? '');
    setStatus(dog.current_status); setNotes(dog.notes ?? '');
  }, [dog]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name is required'); return; }
    setSaving(true);
    try {
      const updates: any = {
        name: name.trim(),
        gender,
        location_address: colony.trim() || null,
        feeder_phone: feederPhone.trim() || null,
        current_status: status,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (dob.trim()) { updates.date_of_birth = dob.trim(); updates.approx_age_months = null; }
      else if (approxAge.trim()) { updates.approx_age_months = parseInt(approxAge) || null; updates.date_of_birth = null; }

      const { error } = await supabase.from('dogs').update(updates).eq('dog_id', dog.dog_id);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const GENDERS: { key: Gender; label: string; emoji: string }[] = [
    { key: 'male', label: 'Male', emoji: '♂️' },
    { key: 'female', label: 'Female', emoji: '♀️' },
    { key: 'unknown', label: 'Unknown', emoji: '❓' },
  ];

  const STATUSES = [
    { key: 'healthy',          label: 'Healthy',          col: C.g700,    bg: C.g50 },
    { key: 'needs_attention',  label: 'Needs Attention',  col: '#92400E', bg: C.amberBg },
    { key: 'critical',         label: 'Critical',         col: '#B91C1C', bg: C.redBg },
    { key: 'follow_up',        label: 'Follow Up',        col: C.t600,    bg: C.t100 },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={em.container}>
          <View style={em.header}>
            <TouchableOpacity onPress={onClose} style={em.cancelBtn}>
              <Text style={em.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={em.title}>Edit · {dog.name}</Text>
            <TouchableOpacity onPress={save} disabled={saving} style={em.saveBtn}>
              {saving ? <ActivityIndicator color={C.white} size="small" /> : <Text style={em.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={em.content} keyboardShouldPersistTaps="handled">

            <Text style={em.sectionLabel}>Name</Text>
            <TextInput style={em.input} value={name} onChangeText={setName} placeholder="Dog's name" placeholderTextColor={C.gray400} autoFocus />

            <Text style={em.sectionLabel}>Gender</Text>
            <View style={em.genderRow}>
              {GENDERS.map((g) => (
                <Pressable key={g.key} style={[em.genderBtn, gender === g.key && em.genderBtnActive]} onPress={() => setGender(g.key)}>
                  <Text style={em.genderEmoji}>{g.emoji}</Text>
                  <Text style={[em.genderLabel, gender === g.key && em.genderLabelActive]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={em.sectionLabel}>Current Status</Text>
            <View style={em.statusGrid}>
              {STATUSES.map((s) => (
                <Pressable
                  key={s.key}
                  style={[em.statusBtn, status === s.key && { backgroundColor: s.bg, borderColor: s.col }]}
                  onPress={() => setStatus(s.key as any)}
                >
                  <Text style={[em.statusLabel, status === s.key && { color: s.col, fontWeight: '700' }]}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={em.sectionLabel}>Date of Birth</Text>
            <TextInput style={em.input} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor={C.gray400} keyboardType="numbers-and-punctuation" />

            <Text style={em.sectionLabel}>Or Approx Age (months)</Text>
            <TextInput style={em.input} value={approxAge} onChangeText={setApproxAge} placeholder="e.g. 6" placeholderTextColor={C.gray400} keyboardType="number-pad" />

            <Text style={em.sectionLabel}>Colony / Area</Text>
            <TextInput style={em.input} value={colony} onChangeText={setColony} placeholder="e.g. Khirki Colony" placeholderTextColor={C.gray400} />

            <Text style={em.sectionLabel}>Feeder Phone</Text>
            <TextInput style={em.input} value={feederPhone} onChangeText={setFeederPhone} placeholder="98100 XXXXX" placeholderTextColor={C.gray400} keyboardType="phone-pad" />

            <Text style={em.sectionLabel}>Notes</Text>
            <TextInput
              style={[em.input, { height: 80, textAlignVertical: 'top' }]}
              value={notes} onChangeText={setNotes}
              placeholder="Any observations…" placeholderTextColor={C.gray400}
              multiline
            />

            <TouchableOpacity style={em.saveBtnFull} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={C.white} /> : <Text style={em.saveBtnFullText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Gender = 'male' | 'female' | 'unknown';

const em = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  title: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  cancelBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  cancelText: { fontSize: 14, color: C.gray600 },
  saveBtn: { backgroundColor: C.g700, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  saveText: { fontSize: 13, fontWeight: '700', color: C.white },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.gray900 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: C.gray200, alignItems: 'center', gap: 3 },
  genderBtnActive: { backgroundColor: C.g50, borderColor: C.g700 },
  genderEmoji: { fontSize: 18 },
  genderLabel: { fontSize: 12, fontWeight: '500', color: C.gray600 },
  genderLabelActive: { color: C.g700, fontWeight: '600' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1.5, borderColor: C.gray200 },
  statusLabel: { fontSize: 12, color: C.gray600 },
  saveBtnFull: { backgroundColor: C.g700, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  saveBtnFullText: { fontSize: 14, fontWeight: '700', color: C.white },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [dog, setDog] = useState<Dog | null>(null);
  const [updates, setUpdates] = useState<HealthUpdate[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showMedicalModal, setShowMedicalModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const dogId = parseInt(id);
    const [dogRes, updatesRes, recordsRes, remindersRes, photoRes] = await Promise.all([
      supabase.from('dogs').select('*').eq('dog_id', dogId).single(),
      supabase.from('health_updates').select('*').eq('dog_id', dogId).order('update_date', { ascending: false }).limit(10),
      supabase.from('medical_records').select('*').eq('dog_id', dogId).order('date_given', { ascending: false }),
      supabase.from('reminders').select('*').eq('dog_id', dogId).eq('status', 'pending').order('due_date'),
      supabase.from('dog_photos').select('photo_url').eq('dog_id', dogId).eq('is_profile_photo', true).single(),
    ]);
    if (dogRes.data) setDog(dogRes.data);
    if (updatesRes.data) setUpdates(updatesRes.data);
    if (recordsRes.data) setRecords(recordsRes.data);
    if (remindersRes.data) setReminders(remindersRes.data);
    setProfilePhotoUrl(photoRes.data?.photo_url ?? null);
  }, [id]);

  const uploadPhoto = async () => {
    Alert.alert('Add Photo', 'Choose source', [
      { text: 'Camera', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Camera permission needed'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
        if (!result.canceled) await savePhoto(result.assets[0].uri);
      }},
      { text: 'Library', onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
        if (!result.canceled) await savePhoto(result.assets[0].uri);
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const savePhoto = async (uri: string) => {
    if (!id) return;
    const dogId = parseInt(id);
    try {
      const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const fileName = `dog_${dogId}_${Date.now()}.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
      const { data: uploadData, error } = await supabase.storage
        .from('dog-photos').upload(fileName, decode(base64), { contentType: mimeType });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(fileName);
      // Remove old profile photo record then insert new one
      await supabase.from('dog_photos').delete().eq('dog_id', dogId).eq('is_profile_photo', true);
      await supabase.from('dog_photos').insert({ dog_id: dogId, photo_url: urlData.publicUrl, is_profile_photo: true });
      setProfilePhotoUrl(urlData.publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAll().finally(() => setLoading(false));
    }, [fetchAll])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const callFeeder = () => {
    const phone = dog?.feeder_phone;
    if (!phone) { Alert.alert('No feeder phone number saved'); return; }
    Linking.openURL(`tel:${phone}`);
  };

  const markSterilised = async () => {
    Alert.alert('Mark as Sterilised', 'Record today as the sterilisation date?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        await supabase.from('dogs').update({ sterilized: true, sterilization_date: today }).eq('dog_id', parseInt(id!));
        await supabase.from('medical_records').insert({ dog_id: parseInt(id!), event_type: 'sterilization', event_name: 'Sterilisation', date_given: today });
        fetchAll();
      }},
    ]);
  };

  const completeReminder = async (reminderId: number, label: string) => {
    await supabase.from('reminders').update({ status: 'completed' }).eq('reminder_id', reminderId);
    await supabase.from('health_updates').insert({
      dog_id: parseInt(id!), update_date: format(new Date(), 'yyyy-MM-dd'),
      status_note: `✅ Reminder completed: ${label}`, update_type: 'general',
    });
    fetchAll();
  };

  if (loading) return <View style={[styles.centered, { paddingTop: insets.top }]}><ActivityIndicator color={C.g700} size="large" /></View>;
  if (!dog) return <View style={[styles.centered, { paddingTop: insets.top }]}><Text style={{ color: C.gray600 }}>Dog not found</Text></View>;

  const statusCol = getStatusColours(dog.current_status);
  const ageMonths = getAgeMonths(dog);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topbarTitle}>{dog.name}</Text>
        <TouchableOpacity onPress={() => setShowEditModal(true)} style={styles.editBtn}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.g700} />}
        >
        {/* Hero */}
        <View style={styles.hero}>
          <TouchableOpacity style={styles.heroAvatar} onPress={uploadPhoto} activeOpacity={0.8}>
            {profilePhotoUrl ? (
              <Image source={{ uri: profilePhotoUrl }} style={styles.heroAvatarImage} />
            ) : (
              <View style={styles.heroAvatarPlaceholder}>
                <Text style={{ fontSize: 36 }}>🐕</Text>
                <Text style={styles.heroAvatarHint}>📷</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.heroInfo}>
            <View style={styles.heroNameRow}>
            <Text style={styles.heroName}>{dog.name}</Text>
            <View style={[styles.badge, { backgroundColor: statusCol.bg, borderColor: statusCol.border }]}>
            <Text style={[styles.badgeText, { color: statusCol.text }]}>{statusCol.label}</Text>
            </View>
  {ageMonths !== null && ageMonths < 12 && (
    <View style={[styles.badge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
      <Text style={[styles.badgeText, { color: '#92400E' }]}>🐶 Puppy</Text>
    </View>
  )}
</View>
            <Text style={styles.heroSub}>{dog.location_address ?? 'Location not set'} · {formatAge(ageMonths)}</Text>
            <Text style={styles.heroFeeder}>{dog.feeder_phone ? `📞 ${dog.feeder_phone}` : 'No feeder contact'}</Text>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.qaRow}>
          <QABtn icon="📞" label="Call Feeder" onPress={callFeeder} primary />
          <QABtn icon="✏️" label="Add Update" onPress={() => setShowLogModal(true)} />
          <QABtn icon="💉" label="Medical" onPress={() => setShowMedicalModal(true)} />
          <QABtn icon="⏰" label="Reminder" onPress={() => setShowReminderModal(true)} />
        </View>

        {/* Sterilised button if not done */}
        {!dog.sterilized && (
          <TouchableOpacity style={styles.sterilisePrompt} onPress={markSterilised} activeOpacity={0.8}>
            <Text style={styles.sterilisePromptText}>✂️ Mark as Sterilised</Text>
          </TouchableOpacity>
        )}

        {/* Details */}
        <Section title="Details">
          <View style={styles.infoCard}>
            <InfoRow label="Gender" value={dog.gender.charAt(0).toUpperCase() + dog.gender.slice(1)} />
            <InfoRow label="Date of Birth" value={dog.date_of_birth ? format(parseISO(dog.date_of_birth), 'dd MMM yyyy') : 'Unknown'} />
            <InfoRow label="Sterilised" value={dog.sterilized ? `✅ Yes${dog.sterilization_date ? ' · ' + format(parseISO(dog.sterilization_date), 'dd MMM yyyy') : ''}` : '❌ No'} />
            <InfoRow label="Colony" value={dog.location_address ?? '—'} last />
          </View>
        </Section>

        {/* Reminders */}
        <Section title="Active Reminders" action="+ Add" onAction={() => setShowReminderModal(true)}>
          {reminders.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No active reminders</Text>
              <TouchableOpacity onPress={() => setShowReminderModal(true)}>
                <Text style={styles.emptyAction}>+ Set a reminder</Text>
              </TouchableOpacity>
            </View>
          ) : (
            reminders.map((r) => {
              const daysUntil = Math.ceil((new Date(r.due_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000);
              const col = getReminderColours(r.reminder_type, daysUntil);
              return (
                <View key={r.reminder_id} style={[styles.reminderCard, { backgroundColor: col.bg, borderColor: col.border }]}>
                  <View style={styles.reminderTop}>
                    <View style={[styles.badge, { backgroundColor: col.bg, borderColor: col.border }]}>
                      <Text style={[styles.badgeText, { color: col.text }]}>{col.label}</Text>
                    </View>
                    {r.is_auto_generated && (
                      <View style={[styles.badge, { backgroundColor: C.t100, borderColor: C.t600 }]}>
                        <Text style={[styles.badgeText, { color: C.t600 }]}>Auto</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.reminderLabel}>{r.reminder_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                  <Text style={styles.reminderDate}>📅 {format(parseISO(r.due_date), 'dd MMM yyyy')}</Text>
                  <View style={styles.reminderActions}>
                    <TouchableOpacity style={styles.reminderDoneBtn} onPress={() => completeReminder(r.reminder_id, r.reminder_type)}>
                      <Text style={styles.reminderDoneBtnText}>✓ Mark Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </Section>

        {/* Health timeline */}
        <Section title="Health Timeline">
          {updates.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No updates yet</Text>
              <TouchableOpacity onPress={() => setShowLogModal(true)}>
                <Text style={styles.emptyAction}>+ Log first update</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.timeline}>
              {updates.map((u, i) => {
                const col = getUpdateTypeColour(u.update_type);
                return (
                  <View key={u.update_id} style={[styles.timelineItem, i === updates.length - 1 && { borderLeftColor: 'transparent' }]}>
                    <View style={[styles.timelineDot, { backgroundColor: col.bg, borderColor: col.text }]} />
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineDate}>{format(parseISO(u.update_date), 'dd MMM')}</Text>
                        <View style={[styles.badge, { backgroundColor: col.bg }]}>
                          <Text style={[styles.badgeText, { color: col.text }]}>{u.update_type.charAt(0).toUpperCase() + u.update_type.slice(1)}</Text>
                        </View>
                      </View>
                      <Text style={styles.timelineNote}>{u.status_note}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Section>

        {/* Medical records */}
        <Section title="Medical Records" action="+ Add" onAction={() => setShowMedicalModal(true)}>
          {records.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No medical records yet</Text>
              <TouchableOpacity onPress={() => setShowMedicalModal(true)}>
                <Text style={styles.emptyAction}>+ Log first medical event</Text>
              </TouchableOpacity>
            </View>
          ) : (
            records.map((r) => (
              <View key={r.record_id} style={styles.medRow}>
                <Text style={styles.medIcon}>
                  {r.event_type === 'vaccination' ? '💉' : r.event_type === 'deworming' ? '🩺' : r.event_type === 'sterilization' ? '✂️' : r.event_type === 'rabies' ? '🔴' : '📋'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName}>{r.event_name ?? r.event_type}</Text>
                  <Text style={styles.medDate}>Given: {r.date_given ? format(parseISO(r.date_given), 'dd MMM yyyy') : '—'}</Text>
                </View>
                {r.next_due_date && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.medNext}>Next: {format(parseISO(r.next_due_date), 'dd MMM')}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </Section>

        {/* Sterilisation status */}
        <Section title="Sterilisation">
          {dog.sterilized ? (
            <View style={[styles.sterilisedCard, { backgroundColor: C.g50, borderColor: C.g100 }]}>
              <Text style={{ fontSize: 20 }}>✅</Text>
              <View>
                <Text style={[styles.sterilisedTitle, { color: C.g700 }]}>Sterilised</Text>
                {dog.sterilization_date && <Text style={styles.sterilisedDate}>{format(parseISO(dog.sterilization_date), 'dd MMM yyyy')}</Text>}
              </View>
            </View>
          ) : (
            <View style={[styles.sterilisedCard, { backgroundColor: C.amberBg, borderColor: C.amberBorder }]}>
              <Text style={{ fontSize: 20 }}>⏳</Text>
              <View>
                <Text style={[styles.sterilisedTitle, { color: '#92400E' }]}>Pending</Text>
                {dog.date_of_birth && (
                  <Text style={styles.sterilisedDate}>
                    Eligible: {format(new Date(new Date(dog.date_of_birth).setMonth(new Date(dog.date_of_birth).getMonth() + 6)), 'dd MMM yyyy')}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.sterilisedBtn} onPress={markSterilised}>
                <Text style={styles.sterilisedBtnText}>Mark Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {dog.notes && (
          <Section title="Notes">
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{dog.notes}</Text>
            </View>
          </Section>
        )}
      </ScrollView>

      <LogUpdateModal dogId={parseInt(id!)} dogName={dog.name} visible={showLogModal} onClose={() => setShowLogModal(false)} onSaved={fetchAll} />
      <LogMedicalModal dogId={parseInt(id!)} dogName={dog.name} visible={showMedicalModal} onClose={() => setShowMedicalModal(false)} onSaved={fetchAll} />
      <AddReminderModal dogId={parseInt(id!)} dogName={dog.name} visible={showReminderModal} onClose={() => setShowReminderModal(false)} onSaved={fetchAll} />
      <EditDogModal dog={dog} visible={showEditModal} onClose={() => setShowEditModal(false)} onSaved={fetchAll} />
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[ir.row, !last && ir.border]}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  border: { borderBottomWidth: 1, borderBottomColor: C.gray100 },
  label: { fontSize: 13, color: C.gray600 },
  value: { fontSize: 13, fontWeight: '500', color: C.gray900, maxWidth: '60%', textAlign: 'right' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  topbarTitle: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 18, color: C.gray900 },
  editBtn: { backgroundColor: C.g50, borderWidth: 1, borderColor: C.g300, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  editBtnText: { fontSize: 12, fontWeight: '600', color: C.g700 },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 40 },
  hero: { flexDirection: 'row', gap: 12, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, padding: 14, marginBottom: 10 },
  heroAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.g100, overflow: 'hidden' },
  heroAvatarImage: { width: 72, height: 72, borderRadius: 36 },
  heroAvatarPlaceholder: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', gap: 0 },
  heroAvatarHint: { fontSize: 12, position: 'absolute', bottom: 4, right: 4 },
  heroInfo: { flex: 1 },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  heroName: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  heroSub: { fontSize: 12, color: C.gray600, marginBottom: 2 },
  heroFeeder: { fontSize: 11, color: C.gray400 },
  qaRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  sterilisePrompt: { backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amberBorder, borderRadius: 10, padding: 10, alignItems: 'center', marginBottom: 12 },
  sterilisePromptText: { fontSize: 13, fontWeight: '600', color: '#92400E' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  infoCard: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, paddingHorizontal: 14 },
  reminderCard: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8, gap: 4 },
  reminderTop: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  reminderLabel: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  reminderDate: { fontSize: 11, color: C.gray600 },
  reminderActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  reminderDoneBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: C.g700 },
  reminderDoneBtnText: { fontSize: 12, fontWeight: '600', color: C.white },
  timeline: { paddingLeft: 8 },
  timelineItem: { flexDirection: 'row', gap: 12, paddingBottom: 14, borderLeftWidth: 2, borderLeftColor: C.gray200, marginLeft: 6 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginLeft: -7, marginTop: 3, flexShrink: 0 },
  timelineContent: { flex: 1, paddingBottom: 4 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  timelineDate: { fontSize: 11, fontWeight: '600', color: C.gray600 },
  timelineNote: { fontSize: 12, color: C.gray900, lineHeight: 18 },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, padding: 12, marginBottom: 8 },
  medIcon: { fontSize: 20 },
  medName: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  medDate: { fontSize: 11, color: C.gray600, marginTop: 2 },
  medNext: { fontSize: 11, fontWeight: '600', color: C.amber },
  sterilisedCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, padding: 12 },
  sterilisedTitle: { fontSize: 13, fontWeight: '700' },
  sterilisedDate: { fontSize: 11, color: C.gray600, marginTop: 2 },
  sterilisedBtn: { marginLeft: 'auto', backgroundColor: C.g700, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  sterilisedBtnText: { fontSize: 12, fontWeight: '600', color: C.white },
  notesCard: { backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, padding: 12 },
  notesText: { fontSize: 13, color: C.gray600, lineHeight: 20 },
  emptyState: { backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, padding: 20, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 13, color: C.gray400 },
  emptyAction: { fontSize: 13, color: C.g700, fontWeight: '600' },
});
