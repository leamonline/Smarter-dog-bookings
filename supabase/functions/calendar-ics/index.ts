// calendar-ics/index.ts — Single-booking .ics download endpoint
// Returns an ICS file for a specific booking, triggering the native
// "Add to Calendar" dialog on the user's device.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateFeedToken } from "../_shared/calendar-auth.ts";
import { generateVEvent, wrapCalendar, type VEventInput } from "../_shared/ics-generator.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TZID = "Europe/London";
const DEFAULT_PICKUP_OFFSET = 120; // minutes

serve(async (req) => {
  try {
    // Only allow GET
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(req.url);
    const bookingId = url.searchParams.get("booking_id");
    const token = url.searchParams.get("token");

    if (!bookingId || !token) {
      return new Response("Missing booking_id or token", { status: 400 });
    }

    // 1. Validate token
    const tokenInfo = await validateFeedToken(token, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (!tokenInfo) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Fetch booking with dog and human
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, booking_date, slot, dog_id, service, status, group_id, updated_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr || !booking) {
      return new Response("Booking not found", { status: 404 });
    }

    const { data: dog } = await supabase
      .from("dogs")
      .select("id, name, human_id")
      .eq("id", booking.dog_id)
      .single();

    if (!dog) {
      return new Response("Dog not found", { status: 404 });
    }

    // 3. Verify token owner has access to this booking
    if (tokenInfo.feedType === "customer") {
      const { data: human } = await supabase
        .from("humans")
        .select("id")
        .eq("id", dog.human_id)
        .maybeSingle();

      if (!human || human.id !== tokenInfo.humanId) {
        return new Response("Forbidden", { status: 403 });
      }
    }
    // Staff tokens can access any booking

    // 4. Get pickup offset from salon config
    const { data: config } = await supabase
      .from("salon_config")
      .select("default_pickup_offset")
      .limit(1)
      .maybeSingle();

    const pickupOffset = config?.default_pickup_offset ?? DEFAULT_PICKUP_OFFSET;

    // 5. Generate ICS
    const eventInput: VEventInput = {
      bookingId: booking.id,
      bookingDate: booking.booking_date,
      slot: booking.slot,
      dogName: dog.name,
      service: booking.service,
      status: booking.status,
      pickupOffsetMins: pickupOffset,
      updatedAt: booking.updated_at,
    };

    const vevent = generateVEvent(eventInput, TZID);
    const ics = wrapCalendar([vevent], "Smarter Dog Grooming");

    const safeName = dog.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const filename = `grooming-${safeName}-${booking.booking_date}.ics`;

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("calendar-ics error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
