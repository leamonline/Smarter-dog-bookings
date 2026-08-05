// ============================================================
// src/components/views/inbox/hooks/useCustomerContext.js
//
// Fetches the "tell me about this customer" data for the inbox
// context panel:
//   - the matched humans row (name, phone, email, address, notes)
//   - all their dogs (size, breed, age, alerts, groom notes)
//   - the single most-recent past booking across all their dogs
//   - their trusted contacts (people allowed to pick up the dog)
//
// No realtime — refreshes whenever humanId changes. The data is
// low-churn within a single session, so the cheap "refetch on
// selection" model beats the cost of a third realtime channel.
//
// `humanId` may be null (the conversation isn't matched to a humans
// row yet); in that case the hook returns an empty shape with a
// short explanation the caller can surface verbatim.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../supabase/client";
import { registerResume } from "../../../../supabase/refreshOnResume.js";
import { SAMPLE_CUSTOMER_CONTEXT } from "../../../../data/sample.js";
import { logger } from "../../../../lib/logger";
import { buildCustomerSummary } from "./customerContextSummary.js";

const CUSTOMER_CONTEXT_TIMEOUT_MS = 10_000;

const EMPTY_RESULT = Object.freeze({
  human: null,
  dogs: [],
  lastBooking: null,
  lastServiceByDogId: {},
  trustedContacts: [],
  summary: "",
});

function todayDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function useCustomerContext(humanId) {
  const [data, setData] = useState(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => registerResume(() => setRefreshKey((key) => key + 1)), []);

  // Re-run the fetch on demand — used after the "Update notes" action
  // writes to humans.notes / dogs.groom_notes so the panel reflects it.
  const refetch = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CUSTOMER_CONTEXT_TIMEOUT_MS);

    const withSignal = (query) => query.abortSignal(controller.signal);

    const stopLoading = () => {
      window.clearTimeout(timeoutId);
      if (!cancelled) setLoading(false);
    };

    if (!humanId) {
      window.clearTimeout(timeoutId);
      setData(EMPTY_RESULT);
      setLoading(false);
      setError(null);
      return undefined;
    }

    if (!supabase) {
      // Offline / unconfigured client. Serve the shared fixture when there is
      // one so the Customer section renders populated for visual review;
      // otherwise fall back to the empty shape, which is what the panel's
      // "not connected" / no-match state expects.
      window.clearTimeout(timeoutId);
      setData(SAMPLE_CUSTOMER_CONTEXT[humanId] ?? EMPTY_RESULT);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);
    setData(EMPTY_RESULT);

    (async () => {
      try {
        const today = todayDateStr();
        const [humanRes, dogsRes, lastBookingRes, trustedRes] = await Promise.all([
          withSignal(supabase
            .from("humans")
            .select(
              "id, name, surname, phone, email, address, notes, sms, whatsapp, history_flag",
            )
            .eq("id", humanId))
            .maybeSingle(),
          withSignal(supabase
            .from("dogs")
            .select("id, name, breed, age, size, alerts, groom_notes")
            .eq("human_id", humanId)
            .order("name")),
          // Recent past bookings across all of this customer's dogs.
          // `dogs!inner` filters to bookings whose dog belongs to humanId.
          // Ordered newest-first: row 0 is the "last booking" shown on the
          // customer card, and the same rows give each dog its most recent
          // service, which prefills the booking pane's service selectors.
          // Bounded — a customer's recent history, not their whole life.
          withSignal(supabase
            .from("bookings")
            .select(
              "id, booking_date, slot, service, status, size, dog_id, dogs!inner(name, human_id)",
            )
            .eq("dogs.human_id", humanId)
            .lt("booking_date", today)
            .order("booking_date", { ascending: false })
            .order("slot", { ascending: false })
            .limit(40)),
          // Trusted contacts: join through humans on trusted_id so we
          // can display the contact's name + relationship without a
          // separate lookup. The "humans" alias on trusted_id is the
          // Supabase syntax for a named FK relationship.
          withSignal(supabase
            .from("human_trusted_contacts")
            .select(
              "trusted_id, relationship, trusted:humans!trusted_id(id, name, surname)",
            )
            .eq("human_id", humanId)),
        ]);

        if (cancelled) return;
        window.clearTimeout(timeoutId);

        // maybeSingle returns null data + null error when no row;
        // we only treat real errors as errors.
        if (humanRes.error) throw humanRes.error;
        if (dogsRes.error) throw dogsRes.error;
        if (lastBookingRes.error && lastBookingRes.error.code !== "PGRST116") {
          throw lastBookingRes.error;
        }
        if (trustedRes.error) throw trustedRes.error;

        const human = humanRes.data
          ? {
              id: humanRes.data.id,
              name: humanRes.data.name || "",
              surname: humanRes.data.surname || "",
              fullName: `${humanRes.data.name || ""} ${humanRes.data.surname || ""}`.trim(),
              phone: humanRes.data.phone || "",
              email: humanRes.data.email || "",
              address: humanRes.data.address || "",
              notes: humanRes.data.notes || "",
              sms: humanRes.data.sms === true,
              whatsapp: humanRes.data.whatsapp === true,
              historyFlag: humanRes.data.history_flag || "",
            }
          : null;

        const dogs = (dogsRes.data || []).map((d) => ({
          id: d.id,
          name: d.name || "",
          breed: d.breed || "",
          age: d.age || "",
          size: d.size || null,
          alerts: Array.isArray(d.alerts) ? d.alerts : [],
          groomNotes: d.groom_notes || "",
        }));

        const recentBookings = lastBookingRes.data || [];
        const mostRecent = recentBookings[0] || null;

        const lastBooking = mostRecent
          ? {
              id: mostRecent.id,
              date: mostRecent.booking_date,
              slot: mostRecent.slot,
              service: mostRecent.service,
              status: mostRecent.status,
              size: mostRecent.size,
              dogName: mostRecent.dogs?.name || "",
            }
          : null;

        // Rows are newest-first, so the first service seen for a dog is its
        // most recent one. Prefills the booking pane's per-dog service.
        const lastServiceByDogId = {};
        for (const row of recentBookings) {
          if (row?.dog_id && row.service && !lastServiceByDogId[row.dog_id]) {
            lastServiceByDogId[row.dog_id] = row.service;
          }
        }

        const trustedContacts = (trustedRes.data || [])
          .map((row) => {
            const t = row.trusted;
            if (!t) return null;
            const fullName = `${t.name || ""} ${t.surname || ""}`.trim();
            if (!fullName) return null;
            return {
              id: row.trusted_id,
              fullName,
              relationship: row.relationship || "",
            };
          })
          .filter(Boolean);

        const summary = buildCustomerSummary({ human, dogs, lastBooking });

        setData({ human, dogs, lastBooking, lastServiceByDogId, trustedContacts, summary });
      } catch (err) {
        if (cancelled) return;
        logger.error("useCustomerContext:", err);
        setError(
          timedOut || controller.signal.aborted
            ? "Timed out loading customer details. Please retry."
            : err instanceof Error ? err.message : String(err),
        );
        setData(EMPTY_RESULT);
      } finally {
        stopLoading();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [humanId, refreshKey]);

  return { ...data, loading, error, refetch };
}
