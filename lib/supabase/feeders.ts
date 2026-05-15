import { supabase } from './client';
import type { Feeder, NewFeederInput, FeederRating } from '../../types';

// ── Queries ───────────────────────────────────────────────────────────────────

/** Fetch all feeders ordered by name */
export async function fetchAllFeeders(): Promise<Feeder[]> {
  const { data, error } = await supabase
    .from('feeders')
    .select('*')
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/** Fetch a single feeder by ID */
export async function fetchFeederById(feederId: number): Promise<Feeder | null> {
  const { data, error } = await supabase
    .from('feeders')
    .select('*')
    .eq('feeder_id', feederId)
    .single();

  if (error) return null;
  return data;
}

/** Fetch all dogs linked to a feeder */
export async function fetchFeederDogs(feederId: number) {
  const { data, error } = await supabase
    .from('dogs')
    .select('dog_id, name, current_status, location_address')
    .eq('feeder_id', feederId)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Create a new feeder */
export async function createFeeder(input: NewFeederInput): Promise<Feeder> {
  const { data, error } = await supabase
    .from('feeders')
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      colony: input.colony ?? null,
      rating: input.rating ?? 'unrated',
      rating_notes: input.rating_notes ?? null,
      location_latitude: input.location_latitude ?? null,
      location_longitude: input.location_longitude ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Update a feeder's details */
export async function updateFeeder(
  feederId: number,
  updates: Partial<Feeder>
): Promise<Feeder> {
  const { data, error } = await supabase
    .from('feeders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('feeder_id', feederId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Update just the rating of a feeder */
export async function rateFeeder(
  feederId: number,
  rating: FeederRating,
  notes?: string
): Promise<void> {
  const { error } = await supabase
    .from('feeders')
    .update({
      rating,
      rating_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('feeder_id', feederId);

  if (error) throw error;
}

/** Delete a feeder — dogs linked to them will have feeder_id set to null */
export async function deleteFeeder(feederId: number): Promise<void> {
  const { error } = await supabase
    .from('feeders')
    .delete()
    .eq('feeder_id', feederId);

  if (error) throw error;
}

/** Link an existing feeder to a dog */
export async function linkFeederToDog(
  dogId: number,
  feederId: number,
  feederPhone?: string
): Promise<void> {
  const { error } = await supabase
    .from('dogs')
    .update({
      feeder_id: feederId,
      feeder_phone: feederPhone ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('dog_id', dogId);

  if (error) throw error;
}

// ── Map pin colour ─────────────────────────────────────────────────────────────

export function getFeederPinColour(rating: FeederRating): 'green' | 'red' | 'grey' {
  switch (rating) {
    case 'good':    return 'green';
    case 'bad':     return 'red';
    case 'unrated': return 'grey';
  }
}
