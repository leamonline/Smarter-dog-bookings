import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client.js";
import {
  dbHumansToMap,
  buildHumansById,
  findHumanByIdOrName,
} from "../transforms.js";
import { sanitiseFieldValue } from "../../utils/sanitiseFieldValue.js";
import { logger } from "../../lib/logger.js";

const PAGE_SIZE = 50;

function mergeRowsById(rows: any[][]) {
  const map = new Map<string, any>();
  rows.flat().forEach((row) => {
    if (row?.id) map.set(row.id, row);
  });
  return Array.from(map.values());
}

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

async function buildTrustedMaps(trustedRows: any[], humansById: Record<string, any>) {
  const trustedMap: Record<string, string[]> = {};
  const trustedContactsMap: Record<string, { id: string; fullName: string; relationship: string }[]> = {};

  // Only this batch's humans end up in the resulting maps, so ignore
  // rows owned by anyone outside it (the main mount loads the whole
  // trusted table). The per-human callers already scope their query.
  const relevantRows = (trustedRows || []).filter(
    (row) => row.human_id && humansById[row.human_id],
  );

  // Resolve a display name for every trusted_id up front. Names already
  // in this batch come from humansById; anyone past the paginated window
  // is fetched on demand. Without this, a trusted contact whose human row
  // wasn't in the current batch (the common case for a targeted search
  // result) was silently dropped, so the Trusted Humans panel rendered
  // empty even though the link exists.
  const nameById: Record<string, string> = {};
  for (const row of relevantRows) {
    const id = row.trusted_id;
    if (!id || nameById[id]) continue;
    const loaded = humansById[id];
    if (loaded?.fullName) nameById[id] = loaded.fullName;
  }
  const missingIds = Array.from(
    new Set(
      relevantRows
        .map((row) => row.trusted_id)
        .filter((id) => id && !nameById[id]),
    ),
  );
  if (missingIds.length > 0) {
    Object.assign(nameById, await fetchHumanNamesByIds(missingIds));
  }

  for (const row of relevantRows) {
    const fullName = nameById[row.trusted_id];
    if (!fullName) continue;

    if (!trustedMap[row.human_id]) trustedMap[row.human_id] = [];
    trustedMap[row.human_id].push(fullName);

    if (!trustedContactsMap[row.human_id]) trustedContactsMap[row.human_id] = [];
    trustedContactsMap[row.human_id].push({
      id: row.trusted_id,
      fullName,
      relationship: row.relationship || "",
    });
  }

  return { trustedMap, trustedContactsMap };
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

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which humans we've loaded a full profile for (including their
  // trusted contacts). fetchHumanById serves those from cache so the
  // modal's effect — which re-runs every time the humans map changes —
  // doesn't re-query in a loop.
  const trustedHydratedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!supabase) {
      setHumans({});
      setHumansById({});
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function fetchHumans(limit = PAGE_SIZE) {
      setLoading(true);
      setError(null);

      const { count, error: countErr } = await supabase!
        .from("humans")
        .select("*", { count: "exact", head: true })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (countErr) {
        setError(countErr.message);
        setLoading(false);
        return;
      }

      setTotalCount(count ?? 0);

      const { data: humanRows, error: humanErr } = await supabase!
        .from("humans")
        .select("*")
        .order("name")
        .order("surname")
        .limit(limit)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (humanErr) {
        setError(humanErr.message);
        setHumans({});
        setHumansById({});
        setLoading(false);
        return;
      }

      const { data: trustedRows, error: trustedErr } = await supabase!
        .from("human_trusted_contacts")
        .select("human_id, trusted_id, relationship")
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (trustedErr) {
        setError(trustedErr.message);
        setHumans({});
        setHumansById({});
        setLoading(false);
        return;
      }

      const byId = buildHumansById(humanRows || []);
      const { trustedMap, trustedContactsMap } = await buildTrustedMaps(trustedRows, byId);

      // Merge instead of replacing — see the matching comment in useDogs.
      // Previous calls to ensureHumansByIds may have populated humans past
      // the paginated window so dogs and bookings can resolve owner names.
      // The real-time INSERT/UPDATE handlers below also call fetchHumans(),
      // and a destructive replace there would lose every ensured owner.
      const mapAdditions = dbHumansToMap(humanRows || [], trustedMap, trustedContactsMap);
      setHumansById((prev) => ({ ...prev, ...byId }));
      setHumans((prev) => ({ ...prev, ...mapAdditions }));
      // Merge rather than replace: humans added by ensureHumansByIds
      // (rows past the first paginated page, hydrated for a deep-linked
      // dog or booking owner) would otherwise be wiped out when a
      // realtime INSERT/UPDATE triggers a refetch, and then never
      // re-added because fetchedHumanIdsRef has already marked them as
      // resolved. Same fix pattern as useDogs.ts.
      const nextMap = dbHumansToMap(humanRows || [], trustedMap, trustedContactsMap);
      setHumansById((prev) => ({ ...prev, ...byId }));
      setHumans((prev) => ({ ...prev, ...nextMap }));
      setHasMore((humanRows || []).length >= limit);
      setLoading(false);
    }

    fetchHumans();

    // Real-time subscription for humans
    const channel = supabase!
      .channel(`humans-realtime-${Date.now()}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "humans" },
        (payload: any) => {
          const oldRow = payload.old;
          if (!oldRow.id) return;
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
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "humans" },
        () => {
          fetchHumans();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "humans" },
        () => {
          fetchHumans();
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      supabase!.removeChannel(channel);
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!supabase) return;

    const currentCount = Object.keys(humansById).length;

    const { data: humanRows, error: err } = await supabase
      .from("humans")
      .select("*")
      .order("name")
      .order("surname")
      .range(currentCount, currentCount + PAGE_SIZE - 1);

    if (err) {
      setError(err.message);
      return;
    }

    const rows = humanRows || [];
    const newHumansById = buildHumansById(rows);

    // Fetch trusted contacts for the new batch
    const newIds = rows.map((r: any) => r.id);
    let trustedMap: Record<string, string[]> = {};

    let trustedContactsMap: Record<string, { id: string; fullName: string; relationship: string }[]> = {};

    if (newIds.length > 0) {
      const { data: trustedRows } = await supabase
        .from("human_trusted_contacts")
        .select("human_id, trusted_id, relationship")
        .in("human_id", newIds);

      const mergedById = { ...humansById, ...newHumansById };
      const maps = await buildTrustedMaps(trustedRows || [], mergedById);
      trustedMap = maps.trustedMap;
      trustedContactsMap = maps.trustedContactsMap;
    }

    const newHumans = dbHumansToMap(rows, trustedMap, trustedContactsMap);

    setHumansById((prev) => ({ ...prev, ...newHumansById }));
    setHumans((prev) => ({ ...prev, ...newHumans }));
    setHasMore(rows.length >= PAGE_SIZE);
  }, [humansById]);

  const searchHumans = useCallback((query: string) => {
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      // Clear search — re-fetch first page
      if (!supabase) return;

      setIsSearching(false);

      async function refetch() {
        const { count } = await supabase!
          .from("humans")
          .select("*", { count: "exact", head: true });

        setTotalCount(count ?? 0);

        const { data: humanRows, error: humanErr } = await supabase!
          .from("humans")
          .select("*")
          .order("name")
          .order("surname")
          .limit(PAGE_SIZE);

        if (humanErr) {
          setError(humanErr.message);
          return;
        }

        const { data: trustedRows } = await supabase!
          .from("human_trusted_contacts")
          .select("human_id, trusted_id, relationship");

        const byId = buildHumansById(humanRows || []);
        const { trustedMap, trustedContactsMap } = await buildTrustedMaps(trustedRows || [], byId);

        // Merge into humansById — it doubles as the booking/dog lookup cache,
        // and a paginated refetch must not evict owners loaded via
        // ensureHumansByIds, or booking cards/dog modals fall back to
        // "Unknown owner" until the next hard reload.
        setHumansById((prev) => ({ ...prev, ...byId }));
        setHumans(dbHumansToMap(humanRows || [], trustedMap, trustedContactsMap));
        setHasMore((humanRows || []).length >= PAGE_SIZE);
      }

      refetch();
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      if (!supabase) return;

      setIsSearching(true);

      const term = query.trim();
      const likeTerm = `%${term}%`;
      const [
        nameResult,
        surnameResult,
        phoneResult,
        emailResult,
        dogNameResult,
        dogBreedResult,
      ] = await Promise.all([
        supabase.from("humans").select("*").ilike("name", likeTerm).order("surname").order("name").limit(50),
        supabase.from("humans").select("*").ilike("surname", likeTerm).order("surname").order("name").limit(50),
        supabase.from("humans").select("*").ilike("phone", likeTerm).order("surname").order("name").limit(50),
        supabase.from("humans").select("*").ilike("email", likeTerm).order("surname").order("name").limit(50),
        supabase.from("dogs").select("human_id").ilike("name", likeTerm).limit(100),
        supabase.from("dogs").select("human_id").ilike("breed", likeTerm).limit(100),
      ]);

      const firstError =
        nameResult.error ||
        surnameResult.error ||
        phoneResult.error ||
        emailResult.error ||
        dogNameResult.error ||
        dogBreedResult.error;

      if (firstError) {
        setIsSearching(false);
        setError(firstError.message);
        return;
      }

      const dogHumanIds = Array.from(
        new Set(
          [...(dogNameResult.data || []), ...(dogBreedResult.data || [])]
            .map((row: any) => row.human_id)
            .filter(Boolean),
        ),
      );
      let dogOwnerRows: any[] = [];

      if (dogHumanIds.length > 0) {
        const { data, error: dogOwnerErr } = await supabase
          .from("humans")
          .select("*")
          .in("id", dogHumanIds);

        if (dogOwnerErr) {
          setIsSearching(false);
          setError(dogOwnerErr.message);
          return;
        }

        dogOwnerRows = data || [];
      }

      setIsSearching(false);

      const rows = mergeRowsById([
        nameResult.data || [],
        surnameResult.data || [],
        phoneResult.data || [],
        emailResult.data || [],
        dogOwnerRows,
      ]).sort((a, b) => {
        const nameCompare = (a.name || "").localeCompare(b.name || "");
        return nameCompare || (a.surname || "").localeCompare(b.surname || "");
      });
      const byId = buildHumansById(rows);

      const ids = rows.map((r: any) => r.id);
      let trustedMap: Record<string, string[]> = {};
      let trustedContactsMap: Record<string, { id: string; fullName: string; relationship: string }[]> = {};

      if (ids.length > 0) {
        const { data: trustedRows } = await supabase
          .from("human_trusted_contacts")
          .select("human_id, trusted_id, relationship")
          .in("human_id", ids);

        const maps = await buildTrustedMaps(trustedRows || [], byId);
        trustedMap = maps.trustedMap;
        trustedContactsMap = maps.trustedContactsMap;
      }

      // Merge into the lookup cache — see refetch() comment for the reason.
      setHumansById((prev) => ({ ...prev, ...byId }));
      setHumans(dbHumansToMap(rows, trustedMap, trustedContactsMap));
      setTotalCount(rows.length);
      setHasMore(false);
    }, 300);
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
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
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

    const optimisticHuman = {
      id: `temp-${Date.now()}`,
      name: humanData.name,
      surname: humanData.surname,
      fullName,
      phone: humanData.phone || "",
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
          phone: humanData.phone || "",
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
      supabase.from("humans").select("*").ilike("name", likeTerm).limit(10),
      supabase.from("humans").select("*").ilike("surname", likeTerm).limit(10),
      supabase.from("humans").select("*").ilike("phone", likeTerm).limit(10),
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
  };
}
