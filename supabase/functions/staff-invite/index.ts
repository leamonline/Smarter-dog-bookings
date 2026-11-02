// ============================================================
// supabase/functions/staff-invite/index.ts
//
// Thin serve() shim. The whole handler, including the owner-only auth gate,
// lives in handler.ts so handler.test.ts can drive it as a function (importing
// a module that calls serve() would start an HTTP server). Same pattern as
// apply-customer-confirm and whatsapp-agent.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleStaffInvite } from "./handler.ts";

serve(handleStaffInvite);
