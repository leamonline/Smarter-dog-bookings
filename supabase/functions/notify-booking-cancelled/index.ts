// Entry point only. The handler lives in handler.ts so it can be exercised
// in Deno tests without starting a server (see __tests__/).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleBookingCancelled } from "./handler.ts";

serve(handleBookingCancelled);
