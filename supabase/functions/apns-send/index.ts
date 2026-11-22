// Entrypoint shim. Tests import handler.ts so this file's serve() does not start.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleApnsSend } from "./handler.ts";

serve(handleApnsSend);
