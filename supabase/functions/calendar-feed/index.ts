// calendar-feed/index.ts — Subscribable iCal feed endpoint
// Returns a multi-event VCALENDAR that calendar apps can subscribe to.
// Customer feeds include only their dogs' bookings; staff feeds include all.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateFeedToken } from "../_shared/calendar-auth.ts";
import { generateVEvent, wrapCalendar, type VEventInput } from "../_shared/ics-generator.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TZID = "Europe/London";
const DEFAULT_PICKUP_OFFSET = 120;
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 90;

/** Get a YYYY-MM-DD string offset from today */
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  try {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    // 1. Validate token
    const tokenInfo = await validateFeedToken(token, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (!tokenInfo) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Get pickup offset
    const { data: config } = await supabase
      .from("salon_config")
      .select("default_pickup_offset")
      .limit(1)
      .maybeSingle();

    const pickupOffset = config?.default_pickup_offset ?? DEFAULT_PICKUP_OFFSET;

    const startDate = dateOffset(-LOOKBACK_DAYS);
    const endDate = dateOffset(LOOKAHEAD_DAYS);

    // 3. Fetch bookings based on feed type
    let bookings: Array<{
      id: string;
      booking_date: string;
      slot: string;
      dog_id: string;
      service: string;
      status: string;
      updated_at: string;
    }>;

    if (tokenInfo.feedType === "customer") {
      // Customer: only their dogs' bookings
      const { data: dogs } = await supabase
        .from("dogs")
        .select("id")
        .eq("human_id", tokenInfo.humanId);

      if (!dogs || dogs.length === 0) {
        const ics = wrapCalendar([], "Smarter Dog Grooming", "PT15M");
        return new Response(ics, {
          status: 200,
          headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" },
        });
      }

      const dogIds = dogs.map((d: { id: string }) => d.id);

      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, dog_id, service, status, updated_at")
        .in("dog_id", dogIds)
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .order("booking_date", { ascending: true });

      if (error) throw error;
      bookings = data ?? [];
    } else {
      // Staff: all bookings in the window
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, dog_id, service, status, updated_at")
        .gte("booking_date", startDate)
        .lte("booking_date", endDate)
        .order("booking_date", { ascending: true });

      if (error) throw error;
      bookings = data ?? [];
    }

    // 4. Batch-fetch dog names and human names for all bookings
    const dogIds = [...new Set(bookings.map((b) => b.dog_id))];

    const { data: dogs } = await supabase
      .from("dogs")
      .select("id, name, human_id")
      .in("id", dogIds.length > 0 ? dogIds : ["__none__"]);

    const dogMap = new Map<string, { name: string; humanId: string }>();
    const humanIds = new Set<string>();
    for (const d of dogs ?? []) {
      dogMap.set(d.id, { name: d.name, humanId: d.human_id });
      if (d.human_id) humanIds.add(d.human_id);
    }

    // For staff feeds, include human names in the summary
    const humanMap = new Map<string, string>();
    if (tokenInfo.feedType === "staff" && humanIds.size > 0) {
      const { data: humans } = await supabase
        .from("humans")
        .select("id, name, surname")
        .in("id", [...humanIds]);

      for (const h of humans ?? []) {
        humanMap.set(h.id, `${h.name} ${h.surname}`.trim());
      }
    }

    // 5. Generate VEVENTs
    const events: string[] = [];
    for (const b of bookings) {
      const dogInfo = dogMap.get(b.dog_id);
      if (!dogInfo) continue;

      const humanName = tokenInfo.feedType === "staff"
        ? humanMap.get(dogInfo.humanId) || undefined
        : undefined;

      const input: VEventInput = {
        bookingId: b.id,
        bookingDate: b.booking_date,
        slot: b.slot,
        dogName: dogInfo.name,
        humanName,
        service: b.service,
        status: b.status,
        pickupOffsetMins: pickupOffset,
        updatedAt: b.updated_at,
      };

      events.push(generateVEvent(input, TZID));
    }

    // 6. Wrap and return
    const calName = tokenInfo.feedType === "staff"
      ? "Smarter Dog Grooming — All Bookings"
      : "Smarter Dog Grooming";

    const ics = wrapCalendar(events, calName, "PT15M");

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    console.error("calendar-feed error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
