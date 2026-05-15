import { supabase } from './client';
import type {
  Dog,
  DogWithPhoto,
  NewDogInput,
  AnimalCategory,
  MapPinColour,
  CurrentStatus,
} from './index';
import { differenceInMonths, parseISO } from 'date-fns';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getDogCategory(dog: Dog): AnimalCategory {
  const ageMonths = dog.date_of_birth
    ? differenceInMonths(new Date(), parseISO(dog.date_of_birth))
    : dog.approx_age_months ?? 999;

  if (ageMonths < 12) return 'puppy';
  if (dog.gender === 'female' && !dog.sterilized) return 'unsterilised_female';
  return 'adult';
}

export function getMapPinColour(
  dog: Dog,
  hasDueOrOverdueReminder: boolean,
  hasUpcomingReminderWithin7Days: boolean
): MapPinColour {
  if (dog.current_status === 'critical' || hasDueOrOverdueReminder) return 'red';
  if (
    dog.current_status === 'needs_attention' ||
    hasUpcomingReminderWithin7Days ||
    (dog.gender === 'female' && !dog.sterilized)
  )
    return 'amber';
  if (dog.current_status === 'follow_up') return 'grey';
  return 'green';
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Fetch all dogs with their profile photo URL */
export async function fetchAllDogs(): Promise<DogWithPhoto[]> {
  const { data: dogs, error } = await supabase
    .from('dogs')
    .select('*')
    .order('name');

  if (error) throw error;

  const { data: photos } = await supabase
    .from('dog_photos')
    .select('dog_id, photo_url')
    .eq('is_profile_photo', true);

  const photoMap = new Map(photos?.map((p) => [p.dog_id, p.photo_url]) ?? []);

  return dogs.map((dog) => ({
    ...dog,
    profile_photo_url: photoMap.get(dog.dog_id) ?? null,
    category: getDogCategory(dog),
    map_pin_colour: getMapPinColour(dog, false, false), // reminder flags wired in hooks
  }));
}

/** Fetch a single dog by ID */
export async function fetchDogById(dogId: number): Promise<Dog> {
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .eq('dog_id', dogId)
    .single();

  if (error) throw error;
  return data;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Insert a new dog record and auto-create reminder schedule */
export async function createDog(input: NewDogInput): Promise<Dog> {
  const { data, error } = await supabase
    .from('dogs')
    .insert({
      ...input,
      sterilized: false,
      current_status: 'healthy' as CurrentStatus,
    })
    .select()
    .single();

  if (error) throw error;

  // Auto-generate 6-month reminders if DOB is known
  if (input.date_of_birth) {
    await autoCreateBirthdayReminders(data.dog_id, input.date_of_birth);
  }

  return data;
}

/** Update any fields on a dog */
export async function updateDog(
  dogId: number,
  updates: Partial<Dog>
): Promise<Dog> {
  const { data, error } = await supabase
    .from('dogs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('dog_id', dogId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Mark a dog as sterilised and log it */
export async function markSterilised(dogId: number, date: string) {
  await updateDog(dogId, {
    sterilized: true,
    sterilization_date: date,
  });

  await supabase.from('medical_records').insert({
    dog_id: dogId,
    event_type: 'sterilization',
    event_name: 'Sterilisation',
    date_given: date,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function autoCreateBirthdayReminders(dogId: number, dob: string) {
  const dobDate = parseISO(dob);

  const preWarning = new Date(dobDate);
  preWarning.setMonth(preWarning.getMonth() + 5);
  preWarning.setDate(preWarning.getDate() + 21); // 5m 3w

  const sixMonths = new Date(dobDate);
  sixMonths.setMonth(sixMonths.getMonth() + 6);

  await supabase.from('reminders').insert([
    {
      dog_id: dogId,
      reminder_type: '6_month_check',
      due_date: preWarning.toISOString().split('T')[0],
      is_auto_generated: true,
      status: 'pending',
    },
    {
      dog_id: dogId,
      reminder_type: '6_month_check',
      due_date: sixMonths.toISOString().split('T')[0],
      is_auto_generated: true,
      status: 'pending',
    },
  ]);
}
