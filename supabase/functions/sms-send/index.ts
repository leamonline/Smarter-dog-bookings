// Entrypoint shim. The send function's implementation lives in handler.ts so
// its request contract is importable under `deno test` (importing this file
// would start the HTTP server). Same shape as whatsapp-send/index.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleSendRequest } from "./handler.ts";

serve(handleSendRequest);
