// useTrustedContacts — trusted-contact loading/hydration bookkeeping and the
// replace-style linking logic for the humans directory. Extracted from
// useHumans (Debt #5).
//
// replaceTrustedLinks delegates to the replace_trusted_contacts RPC
// (migration 20260610150000), which deletes and re-inserts the link set in
// ONE transaction. The previous client-side DELETE-then-INSERT pair could
// permanently lose every link when the insert failed after the delete had
// committed.
import { useCallback, useRef } from "react";
import { supabase } from "../../client.js";
import { replaceTrustedContacts } from "../../rpc";
import { findHumanByIdOrName } from "../../transforms";
import { looksLikeUuid } from "../../../engine/bookingRules";
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

// Load the inverse side of the one-way trust relationship: the owners who
// selected this person as a trusted human. A row is stored as
// { human_id: owner, trusted_id: trusted person }; it must not be inferred
// from the viewed person's outgoing trustedContacts because that reverses
// the relationship and fails for legitimate one-way links.
export async function fetchTrustedOwnerIdsForHuman(
  humanId: string,
): Promise<string[]> {
  if (!supabase || !humanId) return [];

  const { data, error } = await supabase
    .from("human_trusted_contacts")
    .select("human_id")
    .eq("trusted_id", humanId);

  if (error) {
    logger.error("Failed to load owners for trusted human", error, {
      tags: { hook: "useHumans", op: "fetchTrustedOwnerIdsForHuman" },
    });
    return [];
  }

  const ownerRows = (data || []) as Array<{ human_id?: unknown }>;

  return Array.from(
    new Set(
      ownerRows
        .map((row) => row.human_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
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

      // Never drop a contact that already carries a real UUID just because it
      // isn't in the current (paginated) snapshot — the snapshot only holds the
      // 50-row page, but the replace RPC writes the WHOLE set, so a dropped id
      // silently unlinks that person. Fall back to the raw UUID when resolution
      // misses; only entries with no usable id are skipped.
      if (hasTrustedContactsUpdate) {
        for (const entry of updates.trustedContacts as any[]) {
          const rawId = entry?.id ?? entry;
          const resolved = findHumanByIdOrName(prevHumansById, prevHumans, rawId);
          const id = (resolved as any)?.id || (looksLikeUuid(rawId) ? rawId : null);
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
          const id = (resolved as any)?.id || (looksLikeUuid(value) ? value : null);
          if (!id) continue;
          nextPairs.push({
            id,
            relationship: existingRelationshipById.get(id) || "",
          });
        }
      }

      // Invariant: updateHuman only reaches this after its own !supabase
      // guard (offline returns the optimistic human before any write), so
      // the client is always present here — hence the assertion. The RPC
      // replaces the whole link set in one transaction, so a failure
      // leaves the human's previous links intact in the DB.
      const { error: replaceErr } = await replaceTrustedContacts(supabase!, {
        humanId,
        contacts: nextPairs.map((pair) => ({
          trustedId: pair.id,
          relationship: pair.relationship || null,
        })),
      });

      if (replaceErr) {
        logger.error("Failed to replace trusted contacts", replaceErr, {
          tags: { hook: "useHumans", op: "updateHuman.replaceTrusted" },
        });
        return { ok: false, error: replaceErr };
      }

      // Resolve display names from the snapshot first; for ids that live past
      // the paginated window (so they're not in the snapshot) fall back to a
      // single batched DB lookup. Without this a contact can save to the DB yet
      // render blank because its name couldn't be resolved locally.
      const nameById = new Map<string, string>();
      const missingIds: string[] = [];
      for (const pair of nextPairs) {
        const resolved = findHumanByIdOrName(prevHumansById, prevHumans, pair.id) as any;
        if (resolved?.fullName) nameById.set(pair.id, resolved.fullName);
        else missingIds.push(pair.id);
      }
      if (missingIds.length > 0) {
        const fetched = await fetchHumanNamesByIds(missingIds);
        for (const [id, fullName] of Object.entries(fetched)) {
          if (fullName) nameById.set(id, fullName);
        }
      }

      const trustedNames = nextPairs
        .map((pair) => nameById.get(pair.id))
        .filter(Boolean) as string[];

      const savedTrustedContacts = nextPairs
        .map((pair) => {
          const fullName = nameById.get(pair.id);
          if (!fullName) return null;
          return {
            id: pair.id,
            fullName,
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
