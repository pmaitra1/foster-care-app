// ─────────────────────────────────────────────
// Street Foster — Database & App Types
// Mirrors the schema defined in StreetFoster_Requirements v1.0
// ─────────────────────────────────────────────
 
// ── Enums ─────────────────────────────────────
 
export type Gender = 'male' | 'female' | 'unknown';
 
export type CurrentStatus = 'healthy' | 'needs_attention' | 'critical' | 'follow_up';
 
export type AnimalCategory = 'puppy' | 'unsterilised_female' | 'adult';
 
export type UpdateType = 'general' | 'parvo' | 'feeding' | 'vomiting' | 'other';
 
export type MedicalEventType =
  | 'vaccination'
  | 'deworming'
  | 'rabies'
  | 'sterilization'
  | 'other';
 
export type ReminderType =
  | '6_month_check'
  | 'vaccination'
  | 'deworming'
  | 'manual';
 
export type ReminderStatus = 'pending' | 'completed' | 'dismissed';
 
export type MapPinColour = 'red' | 'amber' | 'green' | 'grey';
 
export type FeederRating = 'good' | 'bad' | 'unrated';        // ← NEW
 
// ── Table: feeders ────────────────────────────  ← NEW TABLE
 
export interface Feeder {
  feeder_id: number;
  name: string;
  phone: string | null;
  colony: string | null;
  rating: FeederRating;
  rating_notes: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  created_at: string;
  updated_at: string;
}
 
// ── Table: dogs ───────────────────────────────
 
export interface Dog {
  dog_id: number;
  name: string;
  date_of_birth: string | null;       // ISO date string e.g. "2024-01-15"
  approx_age_months: number | null;
  gender: Gender;
  location_latitude: number | null;
  location_longitude: number | null;
  location_address: string | null;
  feeder_id: number | null;           // ← FK to feeders table (was feeder_name)
  feeder_phone: string | null;        // ← kept for quick tap-to-call
  sterilized: boolean;
  sterilization_date: string | null;
  current_status: CurrentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
 
// ── Table: dog_photos ─────────────────────────
 
export interface DogPhoto {
  photo_id: number;
  dog_id: number;
  photo_url: string;
  uploaded_at: string;
  is_profile_photo: boolean;
}
 
// ── Table: health_updates ─────────────────────
 
export interface HealthUpdate {
  update_id: number;
  dog_id: number;
  update_date: string;
  status_note: string;
  update_type: UpdateType;
  created_at: string;
}
 
// ── Table: medical_records ────────────────────
 
export interface MedicalRecord {
  record_id: number;
  dog_id: number;
  event_type: MedicalEventType;
  event_name: string | null;
  date_given: string | null;
  next_due_date: string | null;
  notes: string | null;
}
 
// ── Table: reminders ─────────────────────────
 
export interface Reminder {
  reminder_id: number;
  dog_id: number;
  reminder_type: ReminderType;
  due_date: string;
  is_auto_generated: boolean;
  status: ReminderStatus;
  created_at: string;
}
 
// ── Enriched / joined types ───────────────────
 
/** Dog with profile photo + feeder record resolved */
export interface DogWithPhoto extends Dog {
  profile_photo_url: string | null;
  category: AnimalCategory;
  map_pin_colour: MapPinColour;
  feeder: Feeder | null;              // ← NEW: full feeder record joined in
}
 
/** Reminder joined with the dog's name — used in the Alerts tab */
export interface ReminderWithDog extends Reminder {
  dog_name: string;
  dog_profile_photo_url: string | null;
}
 
/** Feeder with their map pin colour resolved */
export interface FeederWithPinColour extends Feeder {
  map_pin_colour: 'green' | 'red' | 'grey';
}
 
// ── Form / input types ────────────────────────
 
export interface NewDogInput {
  name: string;
  gender: Gender;
  date_of_birth?: string;
  approx_age_months?: number;
  location_latitude?: number;
  location_longitude?: number;
  location_address?: string;
  feeder_id?: number;                 // ← FK (was feeder_name)
  feeder_phone?: string;              // ← kept for quick entry
  notes?: string;
}
 
export interface NewFeederInput {     // ← NEW
  name: string;
  phone?: string;
  colony?: string;
  rating?: FeederRating;
  rating_notes?: string;
  location_latitude?: number;
  location_longitude?: number;
}
 
export interface NewHealthUpdateInput {
  dog_id: number;
  update_date: string;
  status_note: string;
  update_type: UpdateType;
}
 
export interface NewMedicalRecordInput {
  dog_id: number;
  event_type: MedicalEventType;
  event_name?: string;
  date_given?: string;
  next_due_date?: string;
  notes?: string;
}
 
export interface NewReminderInput {
  dog_id: number;
  reminder_type: ReminderType;
  due_date: string;
  label?: string;
}