import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client.js";
import {
  dbHumansToMap,
  buildHumansById,
  findHumanByIdOrName,
} from "../transforms.js";

const PAGE_SIZE = 50;

function buildTrustedMaps(trustedRows: any[], humansById: Record<string, any>) {
  const trustedMap: Record<string, string[]> = {};
  const trustedContactsMap: Record<string, { id: string; fullName: string; relationship: string }[]> = {};

  for (const row of trustedRows || []) {
    const trustedHuman = humansById[row.trusted_id];
    if (!trustedHuman?.fullName) continue;

    if (!trustedMap[row.human_id]) trustedMap[row.human_id] = [];
    trustedMap[row.human_id].push(trustedHuman.fullName);

    if (!trustedContactsMap[row.human_id]) trustedContactsMap[row.human_id] = [];
    trustedContactsMap[row.human_id].push({
      id: row.trusted_id,
      fullName: trustedHuman.fullName,
      relationship: row.relationship || "",
    });
  }

  return { trustedMap, trustedContactsMap };
}

function buildHumanMapEntry(row: any) {
  const fullName = `${row.name} ${row.surname}`;
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

  useEffect(() => {
    if (!supabase) {
      setHumans({});
      setHumansById({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchHumans(limit = PAGE_SIZE) {
      setLoading(true);
      setError(null);

      const { count, error: countErr } = await supabase!
        .from("humans")
        .select("*", { count: "exact", head: true });

      if (cancelled) return;

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
        .limit(limit);

      if (cancelled) return;

      if (humanErr) {
        setError(humanErr.message);
        setHumans({});
        setHumansById({});
        setLoading(false);
        return;
      }

      const { data: trustedRows, error: trustedErr } = await supabase!
        .from("human_trusted_contacts")
        .select("human_id, trusted_id, relationship");

      if (cancelled) return;

      if (trustedErr) {
        setError(trustedErr.message);
        setHumans({});
        setHumansById({});
        setLoading(false);
        return;
      }

      const byId = buildHumansById(humanRows || []);
      const { trustedMap, trustedContactsMap } = buildTrustedMaps(trustedRows, byId);

      setHumansById(byId);
      setHumans(dbHumansToMap(humanRows || [], trustedMap, trustedContactsMap));
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
      cancelled = true;
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
      const maps = buildTrustedMaps(trustedRows || [], mergedById);
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
        const { trustedMap, trustedContactsMap } = buildTrustedMaps(trustedRows || [], byId);

        setHumansById(byId);
        setHumans(dbHumansToMap(humanRows || [], trustedMap, trustedContactsMap));
        setHasMore((humanRows || []).length >= PAGE_SIZE);
      }

      refetch();
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      if (!supabase) return;

      setIsSearching(true);

      const { data: humanRows, error: err } = await supabase
        .from("humans")
        .select("*")
        .or(`name.ilike.%${query}%,surname.ilike.%${query}%`)
        .order("name")
        .order("surname");

      setIsSearching(false);

      if (err) {
        setError(err.message);
        return;
      }

      const rows = humanRows || [];
      const byId = buildHumansById(rows);

      const ids = rows.map((r: any) => r.id);
      let trustedMap: Record<string, string[]> = {};
      let trustedContactsMap: Record<string, { id: string; fullName: string; relationship: string }[]> = {};

      if (ids.length > 0) {
        const { data: trustedRows } = await supabase
          .from("human_trusted_contacts")
          .select("human_id, trusted_id, relationship")
          .in("human_id", ids);

        const maps = buildTrustedMaps(trustedRows || [], byId);
        trustedMap = maps.trustedMap;
        trustedContactsMap = maps.trustedContactsMap;
      }

      setHumansById(byId);
      setHumans(dbHumansToMap(rows, trustedMap, trustedContactsMap));
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
          console.error("Failed to update human:", updateErr);
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
          console.error("Failed to clear trusted contacts:", deleteErr);
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
            console.error("Failed to save trusted contacts:", insertErr);
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
        console.error("Failed to add human:", insertErr);
        const msg = insertErr.code === "23505"
          ? `${fullName} already exists. Please use a different name.`
          : insertErr.message;
        setError(msg);
        return null;
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
      console.error("addHuman threw:", err);
      setError(err?.message || "Failed to add human. Please try again.");
      return null;
    }
  }, []);

  return {
    humans,
    humansById,
    loading,
    error,
    updateHuman,
    addHuman,
    hasMore,
    totalCount,
    loadMore,
    searchHumans,
    searchQuery,
    isSearching,
  };
}
