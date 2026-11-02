// Deploy with --no-verify-jwt. Meta does not send a Supabase JWT.
// The X-Hub-Signature-256 check in handler.ts is the authentication.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleMessengerWebhookRequest } from "./handler.ts";

serve((req) => handleMessengerWebhookRequest(req));
