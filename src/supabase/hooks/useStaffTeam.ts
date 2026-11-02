// The Team settings tab's data: who is on the team, and the one write — invite
// a new member via the owner-only `staff-invite` Edge Function. The function
// does the real authorisation (a signed-in OWNER); this hook never decides who
// may invite, it only skips the work when the caller says they aren't one.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../client";
import { logger } from "../../lib/logger";
import { listStaffTeam } from "../repositories/staffTeamRepo";
import type { StaffMember, StaffRoleName } from "../repositories/staffTeamRepo";
import { invokeWithSessionRetry, parseSupabaseFunctionError } from "./inbox/helpers";

export interface InviteInput {
  email: string;
  displayName: string;
  role: StaffRoleName;
}

export type InviteResult = { ok: true } | { ok: false; message: string };

/** False in sample-data mode, where there is no backend to invite through. */
export function isTeamBackendAvailable(): boolean {
  return !!supabase;
}

export function useStaffTeam(enabled: boolean) {
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setLoadError("");
    const { data, error } = await listStaffTeam(supabase);
    if (error) {
      logger.error("Failed to load staff team", error, { tags: { hook: "useStaffTeam", op: "load" } });
      setLoadError("Couldn't load the team. Try again in a moment.");
    } else {
      setMembers(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const invite = useCallback(
    async (input: InviteInput): Promise<InviteResult> => {
      if (!supabase) return { ok: false, message: "Inviting staff isn't available with sample data." };
      const { error } = await invokeWithSessionRetry(supabase, "staff-invite", {
        body: { email: input.email, display_name: input.displayName, role: input.role },
      });
      if (error) {
        return { ok: false, message: await parseSupabaseFunctionError(error, "Couldn't send the invite.") };
      }
      // The new person now has a staff row: show them in the list straight away.
      await load();
      return { ok: true };
    },
    [load],
  );

  return { members, loading, loadError, reload: load, invite };
}
