// Compile-time contract for the two real browser clients. This file deliberately
// has no runtime work: `npm run typecheck` is its test runner.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import { customerSupabase } from "./customerClient";
import type { Database } from "./database.types";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
        (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false;

type Assert<Condition extends true> = Condition;
type GeneratedClient = SupabaseClient<Database>;

type StaffClientIsGenerated = Assert<
  Equal<Exclude<typeof supabase, null>, GeneratedClient>
>;
type CustomerClientIsGenerated = Assert<
  Equal<Exclude<typeof customerSupabase, null>, GeneratedClient>
>;

declare const staffClient: Exclude<typeof supabase, null>;
declare const customerClient: Exclude<typeof customerSupabase, null>;

// @ts-expect-error Made-up tables are rejected by the generated schema.
staffClient.from("not_a_real_table");
// @ts-expect-error Made-up RPCs are rejected by the generated schema.
customerClient.rpc("not_a_real_rpc");

export type ClientTypeContract =
  | StaffClientIsGenerated
  | CustomerClientIsGenerated;
