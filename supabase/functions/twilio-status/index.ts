// Entry point only. The handler lives in handler.ts so it can be exercised
// in Deno tests without starting a server.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleTwilioStatus } from "./handler.ts";

serve((req) => handleTwilioStatus(req));
