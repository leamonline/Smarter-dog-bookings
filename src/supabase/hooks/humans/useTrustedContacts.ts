// useTrustedContacts — trusted-contact loading/hydration bookkeeping and the
// replace-style linking logic for the humans directory. Extracted from
// useHumans (Debt #5).
//
// KNOWN BUG (moved as-is, tracked separately — do not fix here):
// replaceTrustedLinks is non-atomic. The clearing DELETE commits before the
// replacement INSERT, so if the insert fails the human's existing links are
// already gone from the DB while the caller's rollback restores them in the
// UI. The proper fix is a server-side RPC + migration with its own task.
import { useCallback, useRef } from "react";
import { supabase } from "../../client.js";
import { findHumanByIdOrName } from "../../transforms";
import { logger } from "../../../lib/logger";
import { fullNameFromRow } from "./helpers";
import type { HumansMap, TrustedContact } from "./helpers";

// Resolve { id -> fullName } for a set of human ids. Used to label
// trusted contacts whose row sits past the paginated humans window —
// the trusted human can easily live on a different page than the human
// who trusts them, so we can't rely on the current batch alone.
async function fetchHumanNamesByIds(
  ids: string[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  if (!supabase || ids.length === 0) return names;

  const { data } = await supabase
    .from("humans")
    .select("id, name, surname")
    .in("id", ids);

  for (const row of data || []) {
    names[row.id] = fullNameFromRow(row);
  }
  return names;
}

// Load a single human's trusted contacts, fully resolving each trusted
// human's display name. buildHumanMapEntry leaves trustedContacts empty,
// so any on-demand human fetch (fetchHumanById / findHumanByFullName)
// must hydrate them separately or the Trusted Humans panel renders blank.
export async function fetchTrustedContactsForHuman(
  humanId: string,
): Promise<{ trustedContacts: TrustedContact[]; trustedIds: string[] }> {
  const empty = { trustedContacts: [], trustedIds: [] };
  if (!supabase || !humanId) return empty;

  const { data: trustedRows } = await supabase
    .from("human_trusted_contacts")
    .select("trusted_id, relationship")
    .eq("human_id", humanId);

  if (!trustedRows || trustedRows.length === 0) return empty;

  const names = await fetchHumanNamesByIds(
    trustedRows.map((row: any) => row.trusted_id).filter(Boolean),
  );

  const trustedContacts: TrustedContact[] = [];
  for (const row of trustedRows) {
    const fullName = names[row.trusted_id];
    if (!fullName) continue;
    trustedContacts.push({
      id: row.trusted_id,
      fullName,
      relationship: row.relationship || "",
    });
  }

  return { trustedContacts, trustedIds: trustedContacts.map((c) => c.fullName) };
}

export type ReplaceTrustedLinksResult =
  | { ok: true; trustedNames: string[]; savedTrustedContacts: TrustedContact[] }
  | { ok: false; error: { message: string } };

export type ReplaceTrustedLinks = (args: {
  humanId: string;
  updates: Record<string, any>;
  prevHumans: HumansMap;
  prevHumansById: HumansMap;
  currentTrustedContacts: TrustedContact[];
}) => Promise<ReplaceTrustedLinksResult>;

export function useTrustedContacts() {
  // Tracks which humans we've loaded a full profile for (including their
  // trusted contacts). fetchHumanById serves those from cache so the
  // modal's effect — which re-runs every time the humans map changes —
  // doesn't re-query in a loop.
  const trustedHydratedIdsRef = useRef<Set<string>>(new Set());

  const isTrustedHydrated = useCallback(
    (humanId: string) => trustedHydratedIdsRef.current.has(humanId),
    [],
  );

  const markTrustedHydrated = useCallback((humanId: string) => {
    trustedHydratedIdsRef.current.add(humanId);
  }, []);

  // Replace a human's trusted-contact join rows with the set described by
  // `updates` (trustedContacts takes precedence over trustedIds). The caller
  // (updateHuman) owns the optimistic local state and rolls it back when this
  // returns { ok: false }. prevHumans / prevHumansById are the caller's
  // pre-update snapshots so name/id resolution can't hit a stale closure.
  const replaceTrustedLinks: ReplaceTrustedLinks = useCallback(
    async ({ humanId, updates, prevHumans, prevHumansById, currentTrustedContacts }) => {
      const hasTrustedContactsUpdate = updates.trustedContacts !== undefined;

      // Build a normalised list of { id, relationship } for the new state.
      // Prefer explicit trustedContacts; fall back to trustedIds (preserving any
      // existing relationship labels we already have for those pairs).
      const existingRelationshipById = new Map<string, string>(
        currentTrustedContacts.map((c): [string, string] => [
          c.id,
          c.relationship || "",
        ]),
      );

      const nextPairs: { id: string; relationship: string }[] = [];

      if (hasTrustedContactsUpdate) {
        for (const entry of updates.trustedContacts as any[]) {
          const resolved = findHumanByIdOrName(prevHumansById, prevHumans, entry?.id ?? entry);
          const id = (resolved as any)?.id;
          if (!id) continue;
          nextPairs.push({
            id,
            relationship:
              typeof entry?.relationship === "string"
                ? entry.relationship.trim()
                : existingRelationshipById.get(id) || "",
          });
        }
      } else {
        for (const value of updates.trustedIds as any[]) {
          const resolved = findHumanByIdOrName(prevHumansById, prevHumans, value);
          const id = (resolved as any)?.id;
          if (!id) continue;
          nextPairs.push({
            id,
            relationship: existingRelationshipById.get(id) || "",
          });
        }
      }

      // Invariant: updateHuman only reaches this after its own !supabase
      // guard (offline returns the optimistic human before any write), so
      // the client is always present here — hence the assertions.
      const { error: deleteErr } = await supabase!
        .from("human_trusted_contacts")
        .delete()
        .eq("human_id", humanId);

      if (deleteErr) {
        logger.error("Failed to clear trusted contacts", deleteErr, {
          tags: { hook: "useHumans", op: "updateHuman.clearTrusted" },
        });
        return { ok: false, error: deleteErr };
      }

      if (nextPairs.length > 0) {
        const { error: insertErr } = await supabase!
          .from("human_trusted_contacts")
          .insert(
            nextPairs.map((pair) => ({
              human_id: humanId,
              trusted_id: pair.id,
              relationship: pair.relationship || null,
            })),
          );

        if (insertErr) {
          logger.error("Failed to save trusted contacts", insertErr, {
            tags: { hook: "useHumans", op: "updateHuman.saveTrusted" },
          });
          return { ok: false, error: insertErr };
        }
      }

      const trustedNames = nextPairs
        .map(
          (pair) =>
            (findHumanByIdOrName(prevHumansById, prevHumans, pair.id) as any)?.fullName,
        )
        .filter(Boolean);

      const savedTrustedContacts = nextPairs
        .map((pair) => {
          const resolved = findHumanByIdOrName(prevHumansById, prevHumans, pair.id) as any;
          if (!resolved?.fullName) return null;
          return {
            id: pair.id,
            fullName: resolved.fullName,
            relationship: pair.relationship,
          };
        })
        .filter(Boolean) as TrustedContact[];

      return { ok: true, trustedNames, savedTrustedContacts };
    },
    [],
  );

  return { isTrustedHydrated, markTrustedHydrated, replaceTrustedLinks };
}
