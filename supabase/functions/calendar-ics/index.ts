// calendar-ics/index.ts — serve() shim.
//
// The endpoint's logic lives in handler.ts so the auth and ownership gates can
// be driven directly by handler.test.ts: importing a module that calls serve()
// starts an HTTP server, so the handler cannot be exported from here. Same
// split as whatsapp-agent, apply-customer-confirm, calendar-feed and
// customer-phone-on-file.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCalendarIcs } from "./handler.ts";

serve(handleCalendarIcs);
