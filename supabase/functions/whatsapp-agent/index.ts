// Entrypoint shim. The agent's full implementation lives in handler.ts so
// the dispatch contract is importable under `deno test` (importing this
// file would start the HTTP server). Supabase deploys index.ts as the
// function entry; sibling-file imports are supported (see
// whatsapp-flow-endpoint/db.ts for the existing precedent).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleAgentRequest } from "./handler.ts";

serve(handleAgentRequest);
