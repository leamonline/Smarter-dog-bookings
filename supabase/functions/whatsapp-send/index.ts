// Entrypoint shim. The send function's full implementation lives in
// handler.ts so the request contract is importable under `deno test`
// (importing this file would start the HTTP server). Same shape as
// whatsapp-agent/index.ts; Supabase deploys index.ts as the function entry
// and sibling-file imports are supported.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleSendRequest } from "./handler.ts";

serve(handleSendRequest);
