// Data hook for the customer dashboard (Debt #12): owns every read/write the
// dashboard needs — dogs, the 180-day booking window, older pages, trusted
// contacts, contact-detail saves — so CustomerDashboard.jsx never touches the
// Supabase client or a snake_case row. Rows cross this boundary already
// app-shaped (CustomerDog / CustomerBookingSummary from the repositories).
import { useCallback, useEffect, useState } from "react";
import { customerSupabase } from "../customerClient";
import { listForHuman, type CustomerDog } from "../repositories/dogsRepo";
import {
  hasCustomerBookingsBefore,
  listCustomerBookings,
  listOlderCustomerBookings,
  type CustomerBookingSummary,
} from "../repositories/bookingsRepo";
import {
  listCustomerTrustedHumans,
  updateCustomerContactDetails,
  type CustomerContactDetailsInput,
} from "../rpc";
import { toDateStr } from "../transforms";
import { logger } from "../../lib/logger";

// How far back the initial bookings window reaches, and the older-page size.
const PAST_WINDOW_DAYS = 180;
const OLDER_PAGE_SIZE = 20;

interface DashboardHumanRecord {
  id?: string | null;
}

function pastWindowStart(): string {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - PAST_WINDOW_DAYS);
  return toDateStr(pastDate);
}

export function useCustomerDashboardData(
  humanRecord: DashboardHumanRecord | null | undefined,
) {
  const [dogs, setDogs] = useState<CustomerDog[]>([]);
  const [bookings, setBookings] = useState<CustomerBookingSummary[]>([]);
  const [olderBookings, setOlderBookings] = useState<CustomerBookingSummary[]>([]);
  const [trustedHumans, setTrustedHumans] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!customerSupabase || !humanRecord?.id) {
      setLoading(false);
      return undefined;
    }
    const client = customerSupabase;
    const humanId = humanRecord.id;
    let cancelled = false;

    async function fetchData() {
      try {
        const { dogs: dogRows, error: dogErr } = await listForHuman(client, {
          humanId,
        });
        if (dogErr) throw dogErr;
        if (cancelled) return;
        setDogs(dogRows);

        const dogIds = dogRows.map((d) => d.id);
        if (dogIds.length > 0) {
          const pastStr = pastWindowStart();
          const { bookings: bookingRows, error: bookErr } =
            await listCustomerBookings(client, { dogIds, sinceDate: pastStr });
          if (bookErr) throw bookErr;
          if (cancelled) return;
          setBookings(bookingRows);

          const more = await hasCustomerBookingsBefore(client, {
            dogIds,
            beforeDate: pastStr,
          });
          if (!cancelled) setHasMorePast(more);
        }

        const { data: trustedLinks, error: trustedErr } =
          await listCustomerTrustedHumans(client);
        if (trustedErr) throw trustedErr;

        if (!cancelled) {
          setTrustedHumans(Array.isArray(trustedLinks) ? trustedLinks : []);
        }
      } catch (err) {
        logger.error("CustomerDashboard fetch failed", err, {
          tags: { component: "CustomerDashboard", op: "fetchData" },
        });
        if (!cancelled) setLoadError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [humanRecord]);

  const loadMore = useCallback(async () => {
    if (!customerSupabase) return;
    const dogIds = dogs.map((d) => d.id);
    if (dogIds.length === 0) return;
    setLoadingMore(true);
    const alreadyLoaded = [...bookings, ...olderBookings];
    const oldestDate = alreadyLoaded.reduce(
      (min, b) => (b.bookingDate < min ? b.bookingDate : min),
      alreadyLoaded[0]?.bookingDate || toDateStr(new Date()),
    );
    const { bookings: moreRows } = await listOlderCustomerBookings(
      customerSupabase,
      { dogIds, beforeDate: oldestDate, limit: OLDER_PAGE_SIZE },
    );
    setOlderBookings((prev) => [...prev, ...moreRows]);
    if (moreRows.length < OLDER_PAGE_SIZE) setHasMorePast(false);
    setLoadingMore(false);
  }, [dogs, bookings, olderBookings]);

  const refreshBookings = useCallback(async () => {
    if (!customerSupabase) throw new Error("Customer bookings are unavailable");
    const dogIds = dogs.map((dog) => dog.id);
    if (dogIds.length === 0) {
      setBookings([]);
      return;
    }
    const { bookings: rows, error } = await listCustomerBookings(
      customerSupabase,
      { dogIds, sinceDate: pastWindowStart() },
    );
    if (error) throw error;
    setBookings(rows);
  }, [dogs]);

  const saveContactDetails = useCallback(
    async (input: CustomerContactDetailsInput) => {
      if (!customerSupabase || !humanRecord?.id) {
        return { error: null as { message?: string } | null, saved: false };
      }
      const { error } = await updateCustomerContactDetails(
        customerSupabase,
        input,
      );
      return { error, saved: !error };
    },
    [humanRecord],
  );

  const updateDog = useCallback((row: Partial<CustomerDog> & { id: string }) => {
    setDogs((prev) => prev.map((d) => (d.id === row.id ? { ...d, ...row } : d)));
  }, []);

  const addDog = useCallback((row: CustomerDog) => {
    setDogs((prev) => (prev.some((d) => d.id === row.id) ? prev : [...prev, row]));
  }, []);

  return {
    dogs,
    bookings,
    olderBookings,
    trustedHumans,
    loading,
    loadError,
    hasMorePast,
    loadingMore,
    loadMore,
    refreshBookings,
    saveContactDetails,
    updateDog,
    addDog,
  };
}
