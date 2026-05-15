import { supabase } from './client';
import type {
  Reminder,
  ReminderWithDog,
  HealthUpdate,
  MedicalRecord,
  NewHealthUpdateInput,
  NewMedicalRecordInput,
  NewReminderInput,
} from './index';
import { addMonths, addDays, formatISO } from 'date-fns';

// ── Reminders ─────────────────────────────────────────────────────────────────

/** Fetch all pending reminders due today or overdue, joined with dog name */
export async function fetchTodayReminders(): Promise<ReminderWithDog[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reminders')
    .select(`
      *,
      dogs (name, dog_photos (photo_url, is_profile_photo))
    `)
    .eq('status', 'pending')
    .lte('due_date', today)
    .order('due_date');

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    ...r,
    dog_name: r.dogs?.name ?? 'Unknown',
    dog_profile_photo_url:
      r.dogs?.dog_photos?.find((p: any) => p.is_profile_photo)?.photo_url ?? null,
  }));
}

/** Fetch all pending reminders due within the next 7 days */
export async function fetchWeekReminders(): Promise<ReminderWithDog[]> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const in7Days = addDays(today, 7).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reminders')
    .select(`
      *,
      dogs (name, dog_photos (photo_url, is_profile_photo))
    `)
    .eq('status', 'pending')
    .gte('due_date', todayStr)
    .lte('due_date', in7Days)
    .order('due_date');

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    ...r,
    dog_name: r.dogs?.name ?? 'Unknown',
    dog_profile_photo_url:
      r.dogs?.dog_photos?.find((p: any) => p.is_profile_photo)?.photo_url ?? null,
  }));
}

/** Fetch all reminders for a specific dog */
export async function fetchDogReminders(dogId: number): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('dog_id', dogId)
    .eq('status', 'pending')
    .order('due_date');

  if (error) throw error;
  return data ?? [];
}

/** Mark a reminder as completed — also logs the action in health_updates */
export async function completeReminder(
  reminderId: number,
  dogId: number,
  label: string
) {
  await supabase
    .from('reminders')
    .update({ status: 'completed' })
    .eq('reminder_id', reminderId);

  await supabase.from('health_updates').insert({
    dog_id: dogId,
    update_date: new Date().toISOString().split('T')[0],
    status_note: `✅ Reminder completed: ${label}`,
    update_type: 'general',
  });
}

/** Create a manual reminder */
export async function createReminder(input: NewReminderInput): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      dog_id: input.dog_id,
      reminder_type: input.reminder_type,
      due_date: input.due_date,
      is_auto_generated: false,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Health Updates ─────────────────────────────────────────────────────────────

/** Fetch full health timeline for a dog, newest first */
export async function fetchHealthUpdates(dogId: number): Promise<HealthUpdate[]> {
  const { data, error } = await supabase
    .from('health_updates')
    .select('*')
    .eq('dog_id', dogId)
    .order('update_date', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Log a new health update */
export async function createHealthUpdate(
  input: NewHealthUpdateInput
): Promise<HealthUpdate> {
  const { data, error } = await supabase
    .from('health_updates')
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Medical Records ───────────────────────────────────────────────────────────

/** Fetch all medical records for a dog */
export async function fetchMedicalRecords(dogId: number): Promise<MedicalRecord[]> {
  const { data, error } = await supabase
    .from('medical_records')
    .select('*')
    .eq('dog_id', dogId)
    .order('date_given', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Log a vaccination or deworming event and auto-create next-due reminder */
export async function logMedicalEvent(
  input: NewMedicalRecordInput
): Promise<MedicalRecord> {
  const { data, error } = await supabase
    .from('medical_records')
    .insert(input)
    .select()
    .single();

  if (error) throw error;

  // Auto-create reminder if next_due_date is set
  if (input.next_due_date) {
    const reminderType =
      input.event_type === 'deworming' ? 'deworming' : 'vaccination';

    await supabase.from('reminders').insert({
      dog_id: input.dog_id,
      reminder_type: reminderType,
      due_date: input.next_due_date,
      is_auto_generated: true,
      status: 'pending',
    });
  }

  return data;
}
