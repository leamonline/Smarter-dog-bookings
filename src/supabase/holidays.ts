import { supabase } from './client';
import type { HolidayNotice } from '../engine/holidayNotice';

export interface Holiday {
  id: string;
  notice_from: string;
  closed_from: string;
  reopens_on: string;
  enabled: boolean;
  revision: number;
}
export type { HolidayNotice };

export async function loadHolidays() {
  if (!supabase) throw new Error('Connect to the salon to manage holidays.');
  const { data, error } = await supabase.rpc('get_staff_holidays');
  if (error) throw new Error('Could not load holidays. Please try again.');
  return data as Holiday[];
}
export async function saveHoliday(holiday: Holiday) {
  if (!supabase) throw new Error('Connect to the salon to manage holidays.');
  const { error } = await supabase.rpc('save_salon_holiday', {
    p_id: holiday.id, p_revision: holiday.revision, p_notice_from: holiday.notice_from,
    p_closed_from: holiday.closed_from, p_reopens_on: holiday.reopens_on, p_enabled: holiday.enabled,
  });
  if (error) {
    if (error.message.includes('reopening_must_be_open')) throw new Error('Your reopening date is closed in the diary. Pick a day you are open (a normal Mon–Wed), or open that date in Bookings first.');
    if (error.message.includes('reopening_must_be_future')) throw new Error('The reopening date must be in the future.');
    if (error.message.includes('overlaps')) throw new Error('These dates overlap another holiday or its reopening day.');
    if (error.message.includes('changed_reload')) throw new Error('This holiday changed elsewhere. Reload holidays before editing.');
    throw new Error('Could not save the holiday. Check your dates and try again. No partial changes were saved.');
  }
}
