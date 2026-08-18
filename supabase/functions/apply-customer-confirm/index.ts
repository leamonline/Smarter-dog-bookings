// ============================================================
// supabase/functions/apply-customer-confirm/index.ts
//
// Thin serve() shim. The whole handler — including the x-internal-secret
// auth gate — lives in handler.ts so that handler.test.ts can import and
// drive it as a function; importing a module that calls serve() would start
// an HTTP server instead. Same pattern as whatsapp-agent/index.ts.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleApplyCustomerConfirm } from "./handler.ts";

serve(handleApplyCustomerConfirm);
