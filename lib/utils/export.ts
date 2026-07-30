import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../supabase/client';
import { format } from 'date-fns';

/**
 * One-tap Excel export — pulls every dog + their medical records,
 * health updates, and reminders into a multi-sheet workbook
 * and opens the native share sheet.
 */
export async function exportAllDataToExcel(): Promise<void> {
  // 1. Fetch all data
  const [
    { data: dogs },
    { data: photos },
    { data: healthUpdates },
    { data: medicalRecords },
    { data: reminders },
  ] = await Promise.all([
    supabase.from('dogs').select('*').order('name'),
    supabase.from('dog_photos').select('*').eq('is_profile_photo', true),
    supabase.from('health_updates').select('*').order('update_date', { ascending: false }),
    supabase.from('medical_records').select('*').order('date_given', { ascending: false }),
    supabase.from('reminders').select('*').order('due_date'),
  ]);

  // 2. Build workbook
  const wb = XLSX.utils.book_new();

  const dogsSheet = XLSX.utils.json_to_sheet(
    (dogs ?? []).map((d: any) => ({
      ID: d.dog_id,
      Name: d.name,
      Gender: d.gender,
      'Date of Birth': d.date_of_birth ?? '',
      'Approx Age (months)': d.approx_age_months ?? '',
      Sterilized: d.sterilized ? 'Yes' : 'No',
      'Sterilization Date': d.sterilization_date ?? '',
      Status: d.current_status,
      Colony: d.location_address ?? '',
      'Feeder Name': d.feeder_name ?? '',
      'Feeder Phone': d.feeder_phone ?? '',
      Notes: d.notes ?? '',
      'Created At': d.created_at,
      'Updated At': d.updated_at,
    }))
  );
  XLSX.utils.book_append_sheet(wb, dogsSheet, 'Animals');

  const healthSheet = XLSX.utils.json_to_sheet(
    (healthUpdates ?? []).map((h: any) => ({
      'Dog ID': h.dog_id,
      Date: h.update_date,
      Type: h.update_type,
      Note: h.status_note,
      'Logged At': h.created_at,
    }))
  );
  XLSX.utils.book_append_sheet(wb, healthSheet, 'Health Updates');

  const medSheet = XLSX.utils.json_to_sheet(
    (medicalRecords ?? []).map((m: any) => ({
      'Dog ID': m.dog_id,
      'Event Type': m.event_type,
      'Event Name': m.event_name ?? '',
      'Date Given': m.date_given ?? '',
      'Next Due': m.next_due_date ?? '',
      Notes: m.notes ?? '',
    }))
  );
  XLSX.utils.book_append_sheet(wb, medSheet, 'Medical Records');

  const remindersSheet = XLSX.utils.json_to_sheet(
    (reminders ?? []).map((r: any) => ({
      'Dog ID': r.dog_id,
      Type: r.reminder_type,
      'Due Date': r.due_date,
      Status: r.status,
      'Auto Generated': r.is_auto_generated ? 'Yes' : 'No',
    }))
  );
  XLSX.utils.book_append_sheet(wb, remindersSheet, 'Reminders');

  // 3. Write to device and share
  const filename = `StreetFoster_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  const fileUri = FileSystem.cacheDirectory + filename;

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  await FileSystem.writeAsStringAsync(fileUri, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export Street Foster Data',
    UTI: 'com.microsoft.excel.xlsx',
  });
}
