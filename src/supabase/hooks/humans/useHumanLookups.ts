// useHumanLookups — on-demand lookups that hydrate the shared humans /
// humansById caches: by id, by (name, surname), by free-text term, and in
// bulk by id list. Extracted from useHumans (Debt #5). The directory load
// is paginated (PAGE_SIZE = 50 in useHumansData), so any view can reference
// a human whose row sits past the page boundary — these helpers fetch those
// rows directly and fold them into the caches so subsequent lookups are
// instant.
import { useCallback, useRef } from "react";
import { supabase } from "../../client";
import { logger } from "../../../lib/logger";
import { buildHumanMapEntry } from "./helpers";
import { fetchTrustedContactsForHuman } from "./useTrustedContacts";
import type { HumansMap, SetHumansMap } from "./helpers";

export function useHumanLookups({
  humans,
  humansById,
  setHumans,
  setHumansById,
  isTrustedHydrated,
  markTrustedHydrated,
}: {
  humans: HumansMap;
  humansById: HumansMap;
  setHumans: SetHumansMap;
  setHumansById: SetHumansMap;
  // From useTrustedContacts: which ids already have a full profile
  // (including trusted contacts) in the caches.
  isTrustedHydrated: (humanId: string) => boolean;
  markTrustedHydrated: (humanId: string) => void;
}) {
  /**
   * On-demand human fetch. The initial useHumans load is paginated
   * (PAGE_SIZE = 50, ordered alphabetically). When a booking or modal
   * needs a human whose row is past the page boundary, the local
   * `humans` map won't have them and the UI falls back to showing
   * the raw UUID. This helper fetches that human directly and folds
   * them into the local cache so subsequent lookups are instant.
   */
  const fetchHumanById = useCallback(
    async (humanId: string) => {
      if (!humanId) return null;

      // Once a full profile (including trusted contacts) is hydrated for
      // this id, serve it from the local maps. buildHumanMapEntry and the
      // owner-hydration paths (ensureHumansByIds, search) leave
      // trustedContacts empty, so we can't trust a cache hit alone — only
      // skip the round-trip once we've explicitly loaded the trusted side.
      if (isTrustedHydrated(humanId)) {
        return humans[humanId] || humansById[humanId] || null;
      }
      if (!supabase) return humans[humanId] || humansById[humanId] || null;

      const { data, error: err } = await supabase
        .from("humans")
        .select("*")
        .eq("id", humanId)
        .single();

      if (err || !data) return null;

      const entry: any = buildHumanMapEntry(data);
      // buildHumanMapEntry stubs trustedContacts to []; the human profile
      // modal reads them, so hydrate the trusted side here. Without this,
      // any customer past the first paginated page (PAGE_SIZE = 50) opened
      // their profile with an empty Trusted Humans panel even when links
      // existed.
      const { trustedContacts, trustedIds } = await fetchTrustedContactsForHuman(data.id);
      entry.trustedContacts = trustedContacts;
      entry.trustedIds = trustedIds;
      markTrustedHydrated(humanId);

      setHumansById((prev) => ({ ...prev, [data.id]: entry }));
      // humans is fullName-keyed (see ensureHumansByIds comment). Insert
      // under the name and remove any prior UUID-keyed copy of the same
      // row so HumansView doesn't render two cards with the same React key.
      setHumans((prev) => {
        const next: Record<string, any> = { ...prev };
        delete next[data.id];
        next[entry.fullName || data.id] = entry;
        return next;
      });
      return entry;
    },
    [humans, humansById, isTrustedHydrated, markTrustedHydrated, setHumans, setHumansById],
  );

  // Look a human up by their (name, surname) pair. Used as a fallback
  // when the trusted-human "+ Add new human" form hits the unique
  // constraint on (name, surname): the existing row may sit past the
  // paginated humans window, so the local search never surfaced it.
  // We need a direct DB lookup to find them and link them as trusted
  // without forcing the user to scroll a 200-row directory.
  //
  // Also hydrates their existing trustedContacts — updateHuman
  // replaces (not merges) the trusted-contacts join rows when called
  // with a `trustedContacts` payload, so callers need the full list
  // to add to, not an empty stub.
  const findHumanByFullName = useCallback(
    async (name: string, surname: string) => {
      const trimmedName = (name || "").trim();
      const trimmedSurname = (surname || "").trim();
      if (!trimmedName || !trimmedSurname || !supabase) return null;

      const { data, error: err } = await supabase
        .from("humans")
        .select("*")
        .ilike("name", trimmedName)
        .ilike("surname", trimmedSurname)
        .limit(1)
        .maybeSingle();

      if (err || !data) return null;

      const entry: any = buildHumanMapEntry(data);

      const { trustedContacts, trustedIds } = await fetchTrustedContactsForHuman(data.id);
      entry.trustedContacts = trustedContacts;
      entry.trustedIds = trustedIds;
      markTrustedHydrated(data.id);

      setHumansById((prev) => ({ ...prev, [data.id]: entry }));
      setHumans((prev) => {
        const next: Record<string, any> = { ...prev };
        delete next[data.id];
        next[entry.fullName || data.id] = entry;
        return next;
      });
      return entry;
    },
    [markTrustedHydrated, setHumans, setHumansById],
  );

  // Inline server-side search for the trusted-human pickers (the
  // "Search by name or phone…" inputs on the dog and human modals).
  // Those pickers previously filtered Object.values(humans) only, which
  // is paginated at PAGE_SIZE=50 — anyone past the page boundary was
  // invisible. We hydrate matches into the local map so the existing
  // memoised filter picks them up on the next render, and so the
  // subsequent `updateHuman` lookup can resolve them by id without
  // hitting the stale-closure miss in `findHumanByIdOrName`.
  const searchHumansByTerm = useCallback(
    async (query: string) => {
      const trimmed = (query || "").trim();
      if (!trimmed || !supabase) return [];

      const likeTerm = `%${trimmed}%`;
      const [nameResult, surnameResult, phoneResult] = await Promise.all([
        supabase.from("humans").select("*").is("archived_at", null).ilike("name", likeTerm).limit(10),
        supabase.from("humans").select("*").is("archived_at", null).ilike("surname", likeTerm).limit(10),
        supabase.from("humans").select("*").is("archived_at", null).ilike("phone", likeTerm).limit(10),
      ]);

      const seen = new Set<string>();
      const rows: any[] = [];
      for (const data of [nameResult.data, surnameResult.data, phoneResult.data]) {
        for (const row of data || []) {
          if (!row?.id || seen.has(row.id)) continue;
          seen.add(row.id);
          rows.push(row);
        }
      }
      if (rows.length === 0) return [];

      const additionsById: Record<string, any> = {};
      const additionsByName: Record<string, any> = {};
      const entries: any[] = [];
      for (const row of rows) {
        const entry = buildHumanMapEntry(row);
        entries.push(entry);
        additionsById[row.id] = entry;
        additionsByName[entry.fullName || row.id] = entry;
      }
      setHumansById((prev) => ({ ...prev, ...additionsById }));
      setHumans((prev) => {
        // Drop any stale UUID-keyed entries first — same pattern as
        // ensureHumansByIds, keeps the map name-keyed.
        const next: Record<string, any> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!additionsById[k]) next[k] = v;
        }
        return { ...next, ...additionsByName };
      });

      return entries;
    },
    [setHumans, setHumansById],
  );

  // Bulk-load any humans referenced by ids that aren't yet in the
  // local map. The /dogs and /bookings pages can show records owned
  // by humans whose row sits past the current humans pagination
  // window — without this, formatOwnerLabel collapses every such
  // owner to "Unknown owner" because dog.humanId is the raw UUID.
  //
  // The in-flight set deduplicates concurrent calls (one per visible
  // page) and the fetched set caches the resolution so we don't
  // re-hit Supabase after the first paint.
  const inflightHumanIdsRef = useRef<Set<string>>(new Set());
  const fetchedHumanIdsRef = useRef<Set<string>>(new Set());

  const ensureHumansByIds = useCallback(
    async (ids: (string | null | undefined)[]) => {
      if (!supabase || !ids?.length) return;
      const missing = Array.from(
        new Set(
          ids.filter(
            (id): id is string =>
              typeof id === "string" &&
              id.length > 0 &&
              !humansById[id] &&
              !humans[id] &&
              !inflightHumanIdsRef.current.has(id) &&
              !fetchedHumanIdsRef.current.has(id),
          ),
        ),
      );
      if (missing.length === 0) return;

      missing.forEach((id) => inflightHumanIdsRef.current.add(id));

      const { data, error: err } = await supabase
        .from("humans")
        .select("*")
        .in("id", missing);

      missing.forEach((id) => {
        inflightHumanIdsRef.current.delete(id);
        fetchedHumanIdsRef.current.add(id);
      });

      if (err) {
        logger.error("ensureHumansByIds failed", err, {
          tags: { hook: "useHumans", op: "ensureHumansByIds" },
        });
        return;
      }

      const rows = data || [];
      if (rows.length === 0) return;

      // humansById is UUID-keyed; humans is fullName-keyed (HumansView
      // iterates Object.values, but buildSearchEntries/formatOwnerLabel
      // also look up by fullName). Keying both off `row.id` here used to
      // double-insert every owner — once under the UUID and once under
      // the fullName from the main fetch — which surfaced as a React
      // duplicate-key warning on HumansView (same id rendered twice).
      const additionsById: Record<string, any> = {};
      const additionsByName: Record<string, any> = {};
      for (const row of rows) {
        const entry = buildHumanMapEntry(row);
        additionsById[row.id] = entry;
        additionsByName[entry.fullName || row.id] = entry;
      }
      setHumansById((prev) => ({ ...prev, ...additionsById }));
      setHumans((prev) => {
        // Drop any stale UUID-keyed entries we may have inserted before
        // this fix shipped — keeps the map name-keyed for the rest of
        // its lifetime.
        const next: Record<string, any> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!additionsById[k]) next[k] = v;
        }
        return { ...next, ...additionsByName };
      });
    },
    [humans, humansById, setHumans, setHumansById],
  );

  return { fetchHumanById, findHumanByFullName, searchHumansByTerm, ensureHumansByIds };
}
