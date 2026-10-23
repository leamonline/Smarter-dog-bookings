// Data hook for the customer dashboard (Debt #12): owns every read/write the
// dashboard needs — dogs, the 180-day booking window, older pages, trusted
// contacts, contact-detail saves — so CustomerDashboard.jsx never touches the
// Supabase client or a snake_case row. Rows cross this boundary already
// app-shaped (CustomerDog / CustomerBookingSummary from the repositories).
import { useCallback, useEffect, useRef, useState } from "react";
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

type LoadedKey = "dogs" | "bookings" | "trustedHumans";

const NOTHING_LOADED: Record<LoadedKey, boolean> = {
  dogs: false,
  bookings: false,
  trustedHumans: false,
};

export function useCustomerDashboardData(
  humanRecord: DashboardHumanRecord | null | undefined,
) {
  // Every read depends only on who the customer is. The auth hook hands over
  // a fresh humanRecord object on session events, so keying on the object
  // would blank the whole page behind the loader for the same person.
  const humanId = humanRecord?.id ?? null;
  const [dogs, setDogs] = useState<CustomerDog[]>([]);
  const [bookings, setBookings] = useState<CustomerBookingSummary[]>([]);
  const [olderBookings, setOlderBookings] = useState<CustomerBookingSummary[]>([]);
  const [trustedHumans, setTrustedHumans] = useState<unknown[]>([]);
  // `loading` covers only the first dogs → bookings read: the booking card
  // needs both, and nothing else holds the page back. A retry after a
  // failure reports `retrying` instead, so the page stays on screen.
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [trustedHumansError, setTrustedHumansError] = useState<unknown>(null);
  // Each resource records its own success and consumers ask only about the
  // read that fills them: a trusted-humans outage must not suppress a
  // booking list that loaded perfectly well, and vice versa.
  const [loaded, setLoaded] = useState(NOTHING_LOADED);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped on every new read and on identity change or unmount. A response
  // whose run is no longer current belongs to a superseded read (or another
  // account) and is dropped instead of overwriting newer state.
  const bookingsRun = useRef(0);
  const trustedRun = useRef(0);

  const markLoaded = useCallback((key: LoadedKey) => {
    setLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const loadBookings = useCallback(
    async (id: string, mode: "initial" | "retry") => {
      if (!customerSupabase) return;
      const client = customerSupabase;
      const run = ++bookingsRun.current;
      const isCurrent = () => run === bookingsRun.current;
      const setBusy = mode === "initial" ? setLoading : setRetrying;
      setBusy(true);
      // A retry leaves the previous error standing until it settles: the
      // page alert holding the retry button is keyed on it.
      if (mode === "initial") setLoadError(null);
      try {
        const { dogs: dogRows, error: dogErr } = await listForHuman(client, {
          humanId: id,
        });
        if (dogErr) throw dogErr;
        if (!isCurrent()) return;
        setDogs(dogRows);
        markLoaded("dogs");

        const dogIds = dogRows.map((d) => d.id);
        if (dogIds.length === 0) {
          // No dogs on the account means there is nothing a booking could be
          // attached to. That is a known-empty diary, not an unknown one, so
          // the empty state is honest here.
          markLoaded("bookings");
          setLoadError(null);
          return;
        }
        const pastStr = pastWindowStart();
        const { bookings: bookingRows, error: bookErr } =
          await listCustomerBookings(client, { dogIds, sinceDate: pastStr });
        if (bookErr) throw bookErr;
        if (!isCurrent()) return;
        setBookings(bookingRows);
        markLoaded("bookings");
        setLoadError(null);

        // Only decides whether "Show older" is offered, so it never holds the
        // booking card back. It already answers false on a failed count.
        void hasCustomerBookingsBefore(client, { dogIds, beforeDate: pastStr })
          .then((more) => {
            if (isCurrent()) setHasMorePast(more);
          })
          .catch((err) => {
            logger.error("CustomerDashboard older-history check failed", err, {
              tags: { component: "CustomerDashboard", op: "hasMorePast" },
            });
          });
      } catch (err) {
        logger.error("CustomerDashboard fetch failed", err, {
          tags: { component: "CustomerDashboard", op: "fetchData" },
        });
        if (isCurrent()) setLoadError(err);
      } finally {
        if (isCurrent()) setBusy(false);
      }
    },
    [markLoaded],
  );

  const loadTrustedHumans = useCallback(async () => {
    if (!customerSupabase) return;
    const client = customerSupabase;
    const run = ++trustedRun.current;
    const isCurrent = () => run === trustedRun.current;
    setTrustedHumansError(null);
    try {
      const { data, error } = await listCustomerTrustedHumans(client);
      if (error) throw error;
      if (!isCurrent()) return;
      setTrustedHumans(Array.isArray(data) ? data : []);
      markLoaded("trustedHumans");
    } catch (err) {
      logger.error("CustomerDashboard trusted humans fetch failed", err, {
        tags: { component: "CustomerDashboard", op: "trustedHumans" },
      });
      if (isCurrent()) setTrustedHumansError(err);
    }
  }, [markLoaded]);

  useEffect(() => {
    // A different account starts from nothing, so no row of the previous
    // one can be shown under the new identity.
    setDogs([]);
    setBookings([]);
    setOlderBookings([]);
    setTrustedHumans([]);
    setHasMorePast(false);
    setLoaded(NOTHING_LOADED);
    setLoadError(null);
    setTrustedHumansError(null);
    setRetrying(false);
    if (!customerSupabase || !humanId) {
      setLoading(false);
      return undefined;
    }
    // Independent reads start together; the trusted-humans RPC is scoped by
    // the session, not by the dogs.
    void loadBookings(humanId, "initial");
    void loadTrustedHumans();
    return () => {
      bookingsRun.current += 1;
      trustedRun.current += 1;
    };
  }, [humanId, loadBookings, loadTrustedHumans]);

  const retryLoad = useCallback(async () => {
    if (!humanId) return;
    await loadBookings(humanId, "retry");
  }, [humanId, loadBookings]);

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
    retrying,
    loadError,
    trustedHumansError,
    loaded,
    hasMorePast,
    loadingMore,
    loadMore,
    refreshBookings,
    retryLoad,
    retryTrustedHumans: loadTrustedHumans,
    saveContactDetails,
    updateDog,
    addDog,
  };
}
