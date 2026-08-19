// ============================================================
// supabase/functions/customer-phone-on-file/index.ts
//
// Thin serve() shim. The handler — method gate, origin policy, two-tier
// rate limit and the phone-login-state lookup — lives in handler.ts so
// handler.test.ts can import and drive it as a function. Same pattern as
// whatsapp-agent, apply-customer-confirm and calendar-feed.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCustomerPhoneOnFile } from "./handler.ts";

serve(handleCustomerPhoneOnFile);
