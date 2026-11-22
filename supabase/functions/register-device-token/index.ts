// Entrypoint shim. Importing this file starts the HTTP server, so tests
// import handler.ts instead.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleRegisterDeviceToken } from "./handler.ts";

serve(handleRegisterDeviceToken);
