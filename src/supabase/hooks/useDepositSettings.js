// Bank details + release window for the deposit panels.
// Thin data hooks over getDepositSettings so components don't import the
// Supabase client directly (Debt #12). `enabled` gates the fetch — the
// deposit panels only need it while a booking is awaiting. Two variants,
// one per client: useDepositSettings (staff app) and
// useCustomerDepositSettings (customer portal); the clients stay separate
// so their auth sessions can't clobber each other.
import { useEffect, useState } from "react";
import { supabase } from "../client";
import { customerSupabase } from "../customerClient";
import { getDepositSettings } from "../repositories/bookingsRepo";

export function useDepositSettings(enabled = true) {
  const [bank, setBank] = useState(null);
  const [releaseHours, setReleaseHours] = useState(12);

  useEffect(() => {
    if (!enabled || !supabase) return undefined;
    let cancelled = false;
    getDepositSettings(supabase).then((s) => {
      if (cancelled) return;
      setBank(s.bank);
      setReleaseHours(s.releaseHours);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { bank, releaseHours };
}

export function useCustomerDepositSettings(enabled = true) {
  const [bank, setBank] = useState(null);
  const [releaseHours, setReleaseHours] = useState(12);

  useEffect(() => {
    if (!enabled || !customerSupabase) return undefined;
    let cancelled = false;
    getDepositSettings(customerSupabase).then((s) => {
      if (cancelled) return;
      setBank(s.bank);
      setReleaseHours(s.releaseHours);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { bank, releaseHours };
}
