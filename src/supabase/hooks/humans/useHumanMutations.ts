// useHumanMutations — optimistic add / update / delete for humans rows.
// Extracted from useHumans (Debt #5). Each mutation updates the shared
// humans / humansById caches first, then reconciles or rolls back once
// the write settles. Trusted-contact replacement is delegated to
// useTrustedContacts.replaceTrustedLinks; this hook still owns the
// optimistic state and the rollback on failure.
import { useCallback } from "react";
import { supabase } from "../../client.js";
import { findHumanByIdOrName } from "../../transforms";
import { stripFormatChars } from "../../../utils/phone.js";
import { isRealPersonName } from "../../../utils/text";
import { logger } from "../../../lib/logger";
import { buildHumanMapEntry } from "./helpers";
import type { HumansMap, SetHumansMap, TrustedContact } from "./helpers";
import type { ReplaceTrustedLinks } from "./useTrustedContacts";
import type { Dispatch, SetStateAction } from "react";

export function useHumanMutations({
  humans,
  humansById,
  setHumans,
  setHumansById,
  setError,
  setTotalCount,
  replaceTrustedLinks,
}: {
  humans: HumansMap;
  humansById: HumansMap;
  setHumans: SetHumansMap;
  setHumansById: SetHumansMap;
  setError: Dispatch<SetStateAction<string | null>>;
  setTotalCount: Dispatch<SetStateAction<number>>;
  replaceTrustedLinks: ReplaceTrustedLinks;
}) {
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
      if (updates.preferredSlots !== undefined)
        dbUpdates.preferred_slots = updates.preferredSlots;
      if (updates.blockedSlots !== undefined)
        dbUpdates.blocked_slots = updates.blockedSlots;
      if (updates.depositRequired !== undefined)
        dbUpdates.deposit_required = updates.depositRequired;
      if (updates.aiWhatsappAllowed !== undefined)
        dbUpdates.ai_whatsapp_allowed = updates.aiWhatsappAllowed;
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
      let savedTrustedContacts: TrustedContact[] =
        humans[currentFullName]?.trustedContacts || [];

      const hasTrustedContactsUpdate = updates.trustedContacts !== undefined;
      const hasTrustedIdsUpdate = updates.trustedIds !== undefined;

      if (hasTrustedContactsUpdate || hasTrustedIdsUpdate) {
        // Replace the join rows wholesale (see useTrustedContacts for the
        // normalisation rules and the documented non-atomicity). On failure
        // we roll back the optimistic maps, mirroring the humans-row path.
        const replaced = await replaceTrustedLinks({
          humanId: existingHuman.id,
          updates,
          prevHumans,
          prevHumansById,
          currentTrustedContacts: humans[currentFullName]?.trustedContacts || [],
        });

        if (!replaced.ok) {
          setError(replaced.error.message);
          setHumans(prevHumans);
          setHumansById(prevHumansById);
          return null;
        }

        trustedNames = replaced.trustedNames;
        savedTrustedContacts = replaced.savedTrustedContacts;
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
        preferredSlots: savedRow.preferred_slots || [],
        blockedSlots: savedRow.blocked_slots || [],
        depositRequired: savedRow.deposit_required === true,
        aiWhatsappAllowed: savedRow.ai_whatsapp_allowed !== false,
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
    [humans, humansById, setHumans, setHumansById, setError, replaceTrustedLinks],
  );

  const addHuman = useCallback(
    async (humanData: Record<string, any>) => {
      // Backstop for EVERY human-creation path (Add Human, New client wizard,
      // AddDogModal's inline new owner, trusted contacts): a record whose name
      // is blank or a placeholder ("?", "-", "n/a"…) is unfindable later and
      // blinds the owner/retention views. Forms validate inline first — this
      // just guarantees no path around them.
      const name = String(humanData.name ?? "").trim();
      const surname = String(humanData.surname ?? "").trim();
      if (!isRealPersonName(name)) {
        setError("We need the customer's real first name — a blank or '?' makes them impossible to find later.");
        return null;
      }

      const fullName = `${name} ${surname}`.trim();
      // Strip invisible Unicode format chars before they reach the DB — iOS
      // Contacts / WhatsApp wrap pasted numbers in bidi marks (see
      // stripFormatChars in utils/phone), which otherwise break number validation.
      const phone = stripFormatChars(humanData.phone || "");

      const optimisticHuman = {
        id: `temp-${Date.now()}`,
        name,
        surname,
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
            name,
            surname,
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
    },
    [setHumans, setHumansById, setError],
  );

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
    [humans, humansById, setHumans, setHumansById, setTotalCount],
  );

  return { updateHuman, addHuman, deleteHuman };
}
