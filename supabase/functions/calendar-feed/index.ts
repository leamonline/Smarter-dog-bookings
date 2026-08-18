// ============================================================
// supabase/functions/calendar-feed/index.ts
//
// Thin serve() shim. The handler — including the feed-token gate — lives in
// handler.ts so handler.test.ts can import and drive it as a function.
// Same pattern as whatsapp-agent and apply-customer-confirm.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCalendarFeed } from "./handler.ts";

serve(handleCalendarFeed);
