import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

// ── Staff-callable resend ────────────────────────────────────────────────────
//
// Lets the booking-detail "delivery failed" card resend a customer
// notification after staff fix the number. It authenticates the STAFF JWT
// (browser call, with CORS), then dispatches SERVER-TO-SERVER to the existing
// notify-booking-* function with the webhook secret — i.e. their unchanged
// DB-trigger path. So the four live messaging functions need no changes, and
// the browser never sees the webhook secret.
//
// Body: { booking_id: string, trigger_type: 'confirmed'|'reminder'|'ready'|'cancelled' }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

// Per trigger: which function to call and how it expects the booking. The
// notify-booking-* trigger functions read payload.record / payload.old_record;
// notify-booking-reminder takes { booking_id } on its (webhook) single path.
const TARGET: Record<string, { fn: string; key: "record" | "old_record" | "booking_id" }> = {
  confirmed: { fn: "notify-booking-confirmed", key: "record" },
  ready: { fn: "notify-booking-ready", key: "record" },
  cancelled: { fn: "notify-booking-cancelled", key: "old_record" },
  reminder: { fn: "notify-booking-reminder", key: "booking_id" },
};

// Reuse the reminder function's allow-list so the staff dashboard origin that
// already calls notify-booking-reminder works here too.
const ALLOWED_ORIGINS = buildAllowedOrigins("NOTIFY_REMINDER_ALLOWED_ORIGINS");
const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    if (!WEBHOOK_SECRET) {
      return json({ error: "Server misconfiguration: WEBHOOK_SECRET not set" }, 500);
    }

    // 1. Staff-JWT auth (mirrors notify-booking-reminder's staff path).
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const { data: staffCheck } = await userClient.rpc("is_staff");
    if (!staffCheck) return json({ error: "Forbidden" }, 403);

    // 2. Validate body.
    let body: { booking_id?: string; trigger_type?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* fall through to validation */
    }
    const bookingId = typeof body.booking_id === "string" ? body.booking_id : null;
    const triggerType = typeof body.trigger_type === "string" ? body.trigger_type : null;
    const target = triggerType ? TARGET[triggerType] : null;
    if (!bookingId || !target) {
      return json(
        { error: "booking_id and a valid trigger_type (confirmed|reminder|ready|cancelled) are required" },
        400,
      );
    }

    // 3. Load the booking row server-side.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingErr || !booking) {
      return json({ error: "Booking not found" }, 404);
    }

    // 4. Dispatch to the target notify function on its existing trigger path,
    //    authenticated with the webhook secret (server-to-server).
    const payload =
      target.key === "booking_id"
        ? { booking_id: bookingId }
        : { [target.key]: booking };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/${target.fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify(payload),
    });
    let result: unknown = null;
    try {
      result = await res.json();
    } catch {
      result = await res.text().catch(() => null);
    }

    return json(
      { ok: res.ok, status: res.status, trigger_type: triggerType, result },
      res.ok ? 200 : 502,
    );
  } catch (err) {
    console.error("resend-booking-notification error:", err);
    return json({ error: "internal error" }, 500);
  }
});
