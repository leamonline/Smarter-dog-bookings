import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleSquareDepositStaff } from "./handler.ts";

serve(handleSquareDepositStaff);
