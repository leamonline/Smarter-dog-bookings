// Deploy with --no-verify-jwt. Staff auth is auth.getUser() plus is_staff()
// inside handler.ts. There is no service-role caller.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleMessengerSendRequest } from "./handler.ts";

serve((req) => handleMessengerSendRequest(req));
