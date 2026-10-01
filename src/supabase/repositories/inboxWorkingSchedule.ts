import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkingSchedule } from "../../engine/workingHoursSince";

/** Staff-authorised, bounded operational reads only; never reads message content. */
export async function fetchInboxWorkingSchedule(client: SupabaseClient, from: string, to: string): Promise<WorkingSchedule> {
  const [settings, holidays] = await Promise.all([
    client.from("day_settings").select("setting_date,is_open,closures").gte("setting_date", from).lte("setting_date", to).limit(1000),
    client.rpc("get_staff_holidays"),
  ]);
  if (settings.error || holidays.error || !settings.data || !holidays.data || settings.data.length >= 1000 || holidays.data.length >= 1000) throw new Error("Working schedule unavailable");
  const days: WorkingSchedule["days"] = {};
  for (const row of settings.data) {
    if (typeof row.is_open !== "boolean" || !Array.isArray(row.closures)) throw new Error("Invalid working schedule");
    const closures = row.closures as { from: string; to: string }[];
    if (closures.some((c) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.from) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.to) || c.to <= c.from)) throw new Error("Invalid closures");
    days[row.setting_date] = { isOpen: row.is_open, closures };
  }
  return { from, to, days, holidays: holidays.data.map((h: { closed_from: string; reopens_on: string; enabled: boolean }) => ({ closedFrom: h.closed_from, reopensOn: h.reopens_on, enabled: h.enabled })) };
}
