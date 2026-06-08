import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client.js";
import { findHumanByIdOrName } from "../transforms.js";
import { sanitiseFieldValue } from "../../utils/sanitiseFieldValue.js";
import { stripFormatChars } from "../../utils/phone.js";
import { logger } from "../../lib/logger.js";

const PAGE_SIZE = 50;

function fullNameFromRow(row: { name?: string | null; surname?: string | null }): string {
  const name = sanitiseFieldValue(row.name);
  const surname = sanitiseFieldValue(row.surname);
  return name && surname ? `${name} ${surname}` : name || surname || "";
}

// Resolve { id -> fullName } for a set of human ids. Used to label
// trusted contacts whose row sits past the paginated humans window —
// the trusted human can easily live on a different page than the human
// who trusts them, so we can't rely on the current batch alone.
async function fetchHumanNamesByIds(ids: string[]): Promise<Record<string, string>> {
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
async function fetchTrustedContactsForHuman(
  humanId: string,
): Promise<{ trustedContacts: { id: string; fullName: string; relationship: string }[]; trustedIds: string[] }> {
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

  const trustedContacts: { id: string; fullName: string; relationship: string }[] = [];
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

function buildHumanMapEntry(row: any) {
  // Mirror buildHumanFullName() in transforms.ts. Strips placeholder
  // tokens ("Null", "Unknown", "None", etc.) via sanitiseFieldValue
  // rather than coercing to a literal "Andrea null" heading.
  const name = sanitiseFieldValue(row.name);
  const surname = sanitiseFieldValue(row.surname);
  const fullName = name && surname ? `${name} ${surname}` : name || surname;
  return {
    id: row.id,
    name: row.name,
    surname: row.surname,
    fullName,
    phone: row.phone || "",
    sms: row.sms || false,
    whatsapp: row.whatsapp || false,
    email: row.email || "",
    fb: row.fb || "",
    insta: row.insta || "",
    tiktok: row.tiktok || "",
    address: row.address || "",
    notes: row.notes || "",
    historyFlag: row.history_flag || "",
    reminderHours: row.reminder_hours ?? 24,
    reminderChannels: row.reminder_channels || ["whatsapp"],
    archivedAt: row.archived_at || null,
    trustedIds: [],
    trustedContacts: [],
  };
}

export function useHumans() {
  const [humans, setHumans] = useState<Record<string, any>>({});
  const [humansById, setHumansById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Server-driven directory state. directoryHumans is the ordered,
  // filtered list the directory grid renders (distinct from the humans /
  // humansById lookup caches, which other views inject owners into).
  // effectiveSearch is the debounced search term that actually drives the
  // fetch; searchQuery mirrors the input immediately.
  const [directoryHumans, setDirectoryHumans] = useState<any[]>([]);
  const [availableLetters, setAvailableLetters] = useState<string[]>([]);
  const [effectiveSearch, setEffectiveSearch] = useState("");
  const [dirSort, setDirSortState] = useState<"first" | "last">(() =>
    typeof localStorage !== "undefined" &&
    localStorage.getItem("humansDirSort") === "last"
      ? "last"
      : "first",
  );
  const [dirFilters, setDirFilters] = useState({
    flagged: false,
    noDogs: false,
    noPhone: false,
    whatsapp: false,
  });
  const [dirLetter, setDirLetterState] = useState<string | null>(null);

  const directoryRef = useRef<any[]>([]);
  const queryRef = useRef<{
    search: string;
    filters: { flagged: boolean; noDogs: boolean; noPhone: boolean; whatsapp: boolean };
    sort: "first" | "last";
    letter: string | null;
  }>({
    search: "",
    filters: { flagged: false, noDogs: false, noPhone: false, whatsapp: false },
    sort: "first",
    letter: null,
  });

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which humans we've loaded a full profile for (including their
  // trusted contacts). fetchHumanById serves those from cache so the
  // modal's effect — which re-runs every time the humans map changes —
  // doesn't re-query in a loop.
  const trustedHydratedIdsRef = useRef<Set<string>>(new Set());

  // Keep refs of the loaded list (for load-more's offset) and the active
  // query (so realtime refetches and load-more reuse the current
  // search / filters / sort / letter).
  useEffect(() => {
    directoryRef.current = directoryHumans;
  }, [directoryHumans]);

  // One server-side directory page via the search_humans_directory RPC,
  // which returns { rows, total, letters } already filtered, sorted and
  // paginated — the client never holds or re-sorts the full ~800-row set.
  // Reset replaces the ordered list; append (load-more) extends it. Rows
  // always merge into the humans / humansById caches (never evict) so owner
  // lookups elsewhere keep resolving. Trusted contacts aren't hydrated here;
  // the profile modal does that on open via fetchHumanById.
  const fetchDirectory = useCallback(
    async (
      params: {
        search: string;
        filters: { flagged: boolean; noDogs: boolean; noPhone: boolean; whatsapp: boolean };
        sort: "first" | "last";
        letter: string | null;
      },
      { append = false }: { append?: boolean } = {},
    ) => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      queryRef.current = params;
      const offset = append ? directoryRef.current.length : 0;
      setError(null);
      if (!append) setLoading(true);

      const { data, error: err } = await supabase.rpc("search_humans_directory", {
        p_search: params.search || null,
        p_flagged: !!params.filters.flagged,
        p_no_dogs: !!params.filters.noDogs,
        p_no_phone: !!params.filters.noPhone,
        p_whatsapp: !!params.filters.whatsapp,
        p_letter: params.letter || null,
        p_sort: params.sort || "first",
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });

      setIsSearching(false);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const result = (data || {}) as { rows?: any[]; total?: number; letters?: string[] };
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const entries = rows.map((row) => buildHumanMapEntry(row));

      const byId: Record<string, any> = {};
      const byName: Record<string, any> = {};
      for (const e of entries) {
        byId[e.id] = e;
        byName[e.fullName || e.id] = e;
      }
      setHumansById((prev) => ({ ...prev, ...byId }));
      setHumans((prev) => {
        // Keep the map name-keyed; drop any stale UUID-keyed copies of these
        // ids so HumansView never renders the same human twice.
        const next: Record<string, any> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!byId[k]) next[k] = v;
        }
        return { ...next, ...byName };
      });
      setDirectoryHumans((prev) => (append ? [...prev, ...entries] : entries));
      setTotalCount(result.total ?? 0);
      setAvailableLetters(result.letters || []);
      setHasMore(offset + rows.length < (result.total ?? 0));
      setLoading(false);
    },
    [],
  );

  // Refetch page 0 whenever the active query changes. effectiveSearch is the
  // debounced search term (see searchHumans); filters / sort / letter apply
  // immediately. Also performs the initial load on mount.
  useEffect(() => {
    fetchDirectory(
      { search: effectiveSearch, filters: dirFilters, sort: dirSort, letter: dirLetter },
      { append: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSearch, dirFilters, dirSort, dirLetter]);

  // Real-time subscription for humans. Insert/update refetch the current
  // page set; delete drops the row from the caches and the visible list.
  useEffect(() => {
    if (!supabase) {
      setHumans({});
      setHumansById({});
      setLoading(false);
      return;
    }

    const channel = supabase
      .channel(`humans-realtime-${Date.now()}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "humans" },
        (payload: any) => {
          const oldRow = payload.old;
          if (!oldRow?.id) return;
          setHumansById((prev) => {
            const next = { ...prev };
            delete next[oldRow.id];
            return next;
          });
          setHumans((prev) => {
            const next = { ...prev };
            const entry = Object.entries(next).find(
              ([, human]: [string, any]) => human.id === oldRow.id,
            );
            if (entry) delete next[entry[0]];
            return next;
          });
          setDirectoryHumans((prev) => prev.filter((h) => h.id !== oldRow.id));
          setTotalCount((c) => Math.max(0, c - 1));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "humans" },
        () => {
          fetchDirectory(queryRef.current, { append: false });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "humans" },
        () => {
          fetchDirectory(queryRef.current, { append: false });
        },
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Append the next page of the current directory query.
  const loadMore = useCallback(async () => {
    await fetchDirectory(queryRef.current, { append: true });
  }, [fetchDirectory]);

  // Update the search box immediately, but debounce the term that actually
  // drives the fetch so typing doesn't fire a request per keystroke. The
  // fetch effect above re-runs when effectiveSearch changes.
  const searchHumans = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setEffectiveSearch(query.trim());
    }, 300);
  }, []);

  // Sort toggle (first-name vs surname). Persisted so it sticks across
  // reloads; changing it re-runs the fetch effect.
  const setDirSort = useCallback((mode: "first" | "last") => {
    setDirSortState(mode);
    try {
      localStorage.setItem("humansDirSort", mode);
    } catch {
      /* localStorage unavailable (private mode) — non-fatal */
    }
  }, []);

  // Filter chips combine with each other and with search; each toggle
  // re-runs the fetch effect with the new flags.
  const toggleDirFilter = useCallback(
    (key: "flagged" | "noDogs" | "noPhone" | "whatsapp") => {
      setDirFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [],
  );

  // A–Z jump. Clicking the active letter again clears it (back to the full
  // alphabetical list).
  const setDirLetter = useCallback((letter: string | null) => {
    setDirLetterState((prev) => (prev === letter ? null : letter));
  }, []);

  const updateHuman = useCallback(
    async (humanIdentifier: string, updates: Record<string, any>) => {
      const existingHuman = findHumanByIdOrName(
        humansById,
        humans,
        humanIdentifier,
      );
      if (!existingHuman?.id) return null;

      const currentFullName =
        existingHuman.fullName ||
        `${existingHuman.name} ${existingHuman.surname}`.trim();
      const prevHumans = humans;
      const prevHumansById = humansById;

      const optimisticHuman = {
        ...(humans[currentFullName] || {}),
        ...existingHuman,
        ...updates,
        fullName:
          updates.name !== undefined || updates.surname !== undefined
            ? `${updates.name ?? existingHuman.name} ${updates.surname ?? existingHuman.surname}`.trim()
            : currentFullName,
      };

      setHumans((prev) => {
        const next = { ...prev };
        const nextKey = optimisticHuman.fullName;

        if (nextKey !== currentFullName) {
          delete next[currentFullName];
        }

        next[nextKey] = {
          ...(next[currentFullName] || prev[currentFullName] || {}),
          ...optimisticHuman,
        };

        return next;
      });

      setHumansById((prev) => ({
        ...prev,
        [existingHuman.id]: {
          ...(prev[existingHuman.id] || {}),
          ...updates,
          fullName: optimisticHuman.fullName,
        },
      }));

      if (!supabase) {
        return optimisticHuman;
      }

      setError(null);

      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.surname !== undefined) dbUpdates.surname = updates.surname;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      if (updates.phone !== undefined) dbUpdates.phone = stripFormatChars(updates.phone);
      if (updates.sms !== undefined) dbUpdates.sms = updates.sms;
      if (updates.whatsapp !== undefined) dbUpdates.whatsapp = updates.whatsapp;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.address !== undefined) dbUpdates.address = updates.address;
      if (updates.historyFlag !== undefined)
        dbUpdates.history_flag = updates.historyFlag;
      if (updates.reminderHours !== undefined)
        dbUpdates.reminder_hours = updates.reminderHours;
      if (updates.reminderChannels !== undefined)
        dbUpdates.reminder_channels = updates.reminderChannels;
      if (updates.archivedAt !== undefined)
        dbUpdates.archived_at = updates.archivedAt;

      let savedRow = prevHumansById[existingHuman.id] || {
        id: existingHuman.id,
        name: existingHuman.name,
        surname: existingHuman.surname,
      };

      if (Object.keys(dbUpdates).length > 0) {
        const { data, error: updateErr } = await supabase
          .from("humans")
          .update(dbUpdates)
          .eq("id", existingHuman.id)
          .select("*")
          .single();

        if (updateErr) {
          logger.error("Failed to update human", updateErr, {
            tags: { hook: "useHumans", op: "updateHuman" },
          });
          setError(updateErr.message);
          setHumans(prevHumans);
          setHumansById(prevHumansById);
          return null;
        }

        savedRow = data || savedRow;
      }

      let trustedNames: string[] =
        updates.trustedIds !== undefined
          ? updates.trustedIds
          : humans[currentFullName]?.trustedIds || [];
      let savedTrustedContacts: { id: string; fullName: string; relationship: string }[] =
        humans[currentFullName]?.trustedContacts || [];

      const hasTrustedContactsUpdate = updates.trustedContacts !== undefined;
      const hasTrustedIdsUpdate = updates.trustedIds !== undefined;

      if (hasTrustedContactsUpdate || hasTrustedIdsUpdate) {
        // Build a normalised list of { id, relationship } for the new state.
        // Prefer explicit trustedContacts; fall back to trustedIds (preserving any
        // existing relationship labels we already have for those pairs).
        const existingRelationshipById = new Map<string, string>(
          (humans[currentFullName]?.trustedContacts || []).map((c: any) => [c.id, c.relationship || ""]),
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

        const { error: deleteErr } = await supabase
          .from("human_trusted_contacts")
          .delete()
          .eq("human_id", existingHuman.id);

        if (deleteErr) {
          logger.error("Failed to clear trusted contacts", deleteErr, {
            tags: { hook: "useHumans", op: "updateHuman.clearTrusted" },
          });
          setError(deleteErr.message);
          setHumans(prevHumans);
          setHumansById(prevHumansById);
          return null;
        }

        if (nextPairs.length > 0) {
          const { error: insertErr } = await supabase
            .from("human_trusted_contacts")
            .insert(
              nextPairs.map((pair) => ({
                human_id: existingHuman.id,
                trusted_id: pair.id,
                relationship: pair.relationship || null,
              })),
            );

          if (insertErr) {
            logger.error("Failed to save trusted contacts", insertErr, {
              tags: { hook: "useHumans", op: "updateHuman.saveTrusted" },
            });
            setError(insertErr.message);
            setHumans(prevHumans);
            setHumansById(prevHumansById);
            return null;
          }
        }

        trustedNames = nextPairs
          .map(
            (pair) =>
              (findHumanByIdOrName(prevHumansById, prevHumans, pair.id) as any)?.fullName,
          )
          .filter(Boolean);

        savedTrustedContacts = nextPairs
          .map((pair) => {
            const resolved = findHumanByIdOrName(prevHumansById, prevHumans, pair.id) as any;
            if (!resolved?.fullName) return null;
            return {
              id: pair.id,
              fullName: resolved.fullName,
              relationship: pair.relationship,
            };
          })
          .filter(Boolean) as { id: string; fullName: string; relationship: string }[];
      }

      const savedFullName = `${savedRow.name} ${savedRow.surname}`;
      const savedHuman = {
        id: savedRow.id,
        name: savedRow.name,
        surname: savedRow.surname,
        fullName: savedFullName,
        phone: savedRow.phone || "",
        sms: savedRow.sms || false,
        whatsapp: savedRow.whatsapp || false,
        email: savedRow.email || "",
        fb: savedRow.fb || "",
        insta: savedRow.insta || "",
        tiktok: savedRow.tiktok || "",
        address: savedRow.address || "",
        notes: savedRow.notes || "",
        historyFlag: savedRow.history_flag || "",
        reminderHours: savedRow.reminder_hours ?? 24,
        reminderChannels: savedRow.reminder_channels || ["whatsapp"],
        archivedAt: savedRow.archived_at || null,
        trustedIds: trustedNames,
        trustedContacts: savedTrustedContacts,
      };

      setHumansById((prev) => ({
        ...prev,
        [savedRow.id]: {
          ...savedRow,
          fullName: savedFullName,
        },
      }));

      setHumans((prev) => {
        const next = { ...prev };
        delete next[currentFullName];
        next[savedFullName] = savedHuman;
        return next;
      });

      return savedHuman;
    },
    [humans, humansById],
  );

  const addHuman = useCallback(async (humanData: Record<string, any>) => {
    const fullName = `${humanData.name} ${humanData.surname}`.trim();
    // Strip invisible Unicode format chars before they reach the DB — iOS
    // Contacts / WhatsApp wrap pasted numbers in bidi marks (see
    // stripFormatChars in utils/phone), which otherwise break number validation.
    const phone = stripFormatChars(humanData.phone || "");

    const optimisticHuman = {
      id: `temp-${Date.now()}`,
      name: humanData.name,
      surname: humanData.surname,
      fullName,
      phone,
      sms: humanData.sms || false,
      whatsapp: humanData.whatsapp || false,
      email: humanData.email || "",
      fb: "",
      insta: "",
      tiktok: "",
      address: humanData.address || "",
      notes: humanData.notes || "",
      historyFlag: "",
      reminderHours: humanData.reminderHours ?? 24,
      reminderChannels: humanData.reminderChannels || ["whatsapp"],
      trustedIds: [],
      trustedContacts: [],
    };

    if (!supabase) {
      setHumans((prev) => ({ ...prev, [fullName]: optimisticHuman }));
      setHumansById((prev) => ({
        ...prev,
        [optimisticHuman.id]: {
          id: optimisticHuman.id,
          name: optimisticHuman.name,
          surname: optimisticHuman.surname,
          fullName,
          phone: optimisticHuman.phone,
          sms: optimisticHuman.sms,
          whatsapp: optimisticHuman.whatsapp,
          email: optimisticHuman.email,
          address: optimisticHuman.address,
          notes: optimisticHuman.notes,
          history_flag: "",
        },
      }));
      return optimisticHuman;
    }

    setError(null);

    try {
      const { data, error: insertErr } = await supabase
        .from("humans")
        .insert({
          name: humanData.name,
          surname: humanData.surname,
          phone,
          sms: humanData.sms || false,
          whatsapp: humanData.whatsapp || false,
          email: humanData.email || "",
          address: humanData.address || "",
          notes: humanData.notes || "",
        })
        .select("*")
        .single();

      if (insertErr) {
        logger.error("Failed to add human", insertErr, {
          tags: { hook: "useHumans", op: "addHuman" },
        });
        const msg = insertErr.code === "23505"
          ? `${fullName} already exists. Please use a different name.`
          : insertErr.message;
        setError(msg);
        throw new Error(msg);
      }

      const savedHuman = buildHumanMapEntry(data);

      setHumans((prev) => ({ ...prev, [savedHuman.fullName]: savedHuman }));
      setHumansById((prev) => ({
        ...prev,
        [data.id]: {
          ...data,
          fullName: savedHuman.fullName,
        },
      }));

      return savedHuman;
    } catch (err: any) {
      logger.error("addHuman threw", err, {
        tags: { hook: "useHumans", op: "addHuman" },
      });
      const msg = err?.message || "Failed to add human. Please try again.";
      setError((prev) => prev || msg);
      throw err instanceof Error ? err : new Error(msg);
    }
  }, []);

  const deleteHuman = useCallback(
    async (humanId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!humanId) return { ok: false, error: "Missing human id" };

      const existing = humansById[humanId];
      if (!existing) return { ok: false, error: "Human not found" };

      const prevHumans = humans;
      const prevHumansById = humansById;

      // Optimistic remove
      setHumansById((prev) => {
        const next = { ...prev };
        delete next[humanId];
        return next;
      });
      setHumans((prev) => {
        const next = { ...prev };
        const entry = Object.entries(next).find(
          ([, human]: [string, any]) => human.id === humanId,
        );
        if (entry) delete next[entry[0]];
        return next;
      });

      if (!supabase) return { ok: true };

      const { error: err } = await supabase.from("humans").delete().eq("id", humanId);

      if (err) {
        // Rollback on failure
        setHumans(prevHumans);
        setHumansById(prevHumansById);
        const friendly =
          err.code === "23503"
            ? "This person can't be deleted — they're listed as the pickup contact on at least one booking. Reassign those bookings first."
            : err.message || "Failed to delete human";
        return { ok: false, error: friendly };
      }

      setTotalCount((c) => Math.max(0, c - 1));
      return { ok: true };
    },
    [humans, humansById],
  );

  /**
   * Merge the "loser" human into the "winner" via the merge_humans RPC,
   * which reassigns dogs / booking pickups / trusted contacts / waitlist /
   * conversations to the winner, backfills the winner's blank fields, and
   * deletes the loser — atomically server-side. We optimistically drop the
   * loser from the local maps; the winner's reassigned dogs and backfilled
   * fields arrive via the realtime subscriptions.
   */
  const mergeHumans = useCallback(
    async (
      winnerId: string,
      loserId: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!winnerId || !loserId) return { ok: false, error: "Missing human id" };
      if (winnerId === loserId)
        return { ok: false, error: "Cannot merge a record into itself" };
      if (!supabase)
        return { ok: false, error: "Merge needs a connection — you're offline." };

      const { error: err } = await supabase.rpc("merge_humans", {
        p_winner: winnerId,
        p_loser: loserId,
      });
      if (err) {
        return { ok: false, error: err.message || "Failed to merge records" };
      }

      // Drop the loser from the local maps so it vanishes from the directory
      // immediately; realtime refreshes the winner + reassigned dogs.
      setHumansById((prev) => {
        const next = { ...prev };
        delete next[loserId];
        return next;
      });
      setHumans((prev) => {
        const next = { ...prev };
        const entry = Object.entries(next).find(
          ([, h]: [string, any]) => h.id === loserId,
        );
        if (entry) delete next[entry[0]];
        return next;
      });
      setTotalCount((c) => Math.max(0, c - 1));
      return { ok: true };
    },
    [],
  );

  /**
   * Fetch the archived humans for the directory's "Show archived" view.
   * Returned as a plain list (not merged into the active maps) so archived
   * records never leak into the directory grid or search; the archived set
   * is small, so a single unpaginated read is fine.
   */
  const fetchArchivedHumans = useCallback(async (): Promise<any[]> => {
    if (!supabase) return [];
    const { data, error: err } = await supabase
      .from("humans")
      .select("*")
      .not("archived_at", "is", null)
      .order("name")
      .order("surname")
      .limit(200);
    if (err) {
      console.error("fetchArchivedHumans failed:", err);
      return [];
    }
    return (data || []).map((row) => buildHumanMapEntry(row));
  }, []);

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
      if (trustedHydratedIdsRef.current.has(humanId)) {
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
      trustedHydratedIdsRef.current.add(humanId);

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
    [humans, humansById],
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
      trustedHydratedIdsRef.current.add(data.id);

      setHumansById((prev) => ({ ...prev, [data.id]: entry }));
      setHumans((prev) => {
        const next: Record<string, any> = { ...prev };
        delete next[data.id];
        next[entry.fullName || data.id] = entry;
        return next;
      });
      return entry;
    },
    [],
  );

  // Inline server-side search for the trusted-human pickers (the
  // "Search by name or phone…" inputs on the dog and human modals).
  // Those pickers previously filtered Object.values(humans) only, which
  // is paginated at PAGE_SIZE=50 — anyone past the page boundary was
  // invisible. We hydrate matches into the local map so the existing
  // memoised filter picks them up on the next render, and so the
  // subsequent `updateHuman` lookup can resolve them by id without
  // hitting the stale-closure miss in `findHumanByIdOrName`.
  const searchHumansByTerm = useCallback(async (query: string) => {
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
  }, []);

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
    [humans, humansById],
  );

  return {
    humans,
    humansById,
    loading,
    error,
    updateHuman,
    addHuman,
    deleteHuman,
    mergeHumans,
    fetchArchivedHumans,
    fetchHumanById,
    findHumanByFullName,
    searchHumansByTerm,
    ensureHumansByIds,
    hasMore,
    totalCount,
    loadMore,
    searchHumans,
    searchQuery,
    isSearching,
    // Server-driven directory list + controls
    directoryHumans,
    availableLetters,
    dirSort,
    setDirSort,
    dirFilters,
    toggleDirFilter,
    dirLetter,
    setDirLetter,
  };
}
