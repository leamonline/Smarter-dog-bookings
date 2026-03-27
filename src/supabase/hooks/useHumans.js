import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import {
  dbHumansToMap,
  buildHumansById,
  findHumanByIdOrName,
} from "../transforms.js";

function buildTrustedMap(trustedRows, humansById) {
  const trustedMap = {};

  for (const row of trustedRows || []) {
    if (!trustedMap[row.human_id]) trustedMap[row.human_id] = [];
    const trustedHuman = humansById[row.trusted_id];
    if (trustedHuman?.fullName) {
      trustedMap[row.human_id].push(trustedHuman.fullName);
    }
  }

  return trustedMap;
}

function buildHumanMapEntry(row) {
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
    trustedIds: [],
  };
}

export function useHumans() {
  const [humans, setHumans] = useState({});
  const [humansById, setHumansById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) {
      setHumans({});
      setHumansById({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchHumans() {
      setLoading(true);
      setError(null);

      const { data: humanRows, error: humanErr } = await supabase
        .from("humans")
        .select("*")
        .order("name")
        .order("surname");

      if (cancelled) return;

      if (humanErr) {
        setError(humanErr.message);
        setHumans({});
        setHumansById({});
        setLoading(false);
        return;
      }

      const { data: trustedRows, error: trustedErr } = await supabase
        .from("human_trusted_contacts")
        .select("human_id, trusted_id");

      if (cancelled) return;

      if (trustedErr) {
        setError(trustedErr.message);
        setHumans({});
        setHumansById({});
        setLoading(false);
        return;
      }

      const byId = buildHumansById(humanRows || []);
      const trustedMap = buildTrustedMap(trustedRows, byId);

      setHumansById(byId);
      setHumans(dbHumansToMap(humanRows || [], trustedMap));
      setLoading(false);
    }

    fetchHumans();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateHuman = useCallback(
    async (humanIdentifier, updates) => {
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

      const dbUpdates = {};
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

      let trustedNames =
        updates.trustedIds !== undefined
          ? updates.trustedIds
          : humans[currentFullName]?.trustedIds || [];

      if (updates.trustedIds !== undefined) {
        const trustedUuids = updates.trustedIds
          .map(
            (value) =>
              findHumanByIdOrName(prevHumansById, prevHumans, value)?.id,
          )
          .filter(Boolean);

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

        if (trustedUuids.length > 0) {
          const { error: insertErr } = await supabase
            .from("human_trusted_contacts")
            .insert(
              trustedUuids.map((trustedId) => ({
                human_id: existingHuman.id,
                trusted_id: trustedId,
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

        trustedNames = updates.trustedIds
          .map(
            (value) =>
              findHumanByIdOrName(prevHumansById, prevHumans, value)?.fullName,
          )
          .filter(Boolean);
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
        trustedIds: trustedNames,
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

  const addHuman = useCallback(async (humanData) => {
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
      trustedIds: [],
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
      setError(insertErr.message);
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
  }, []);

  return { humans, humansById, loading, error, updateHuman, addHuman };
}
