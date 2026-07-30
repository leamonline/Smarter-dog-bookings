// Bank details + release window for the deposit panels (staff app).
// Thin data hook over getDepositSettings so components don't import the
// Supabase client directly (Debt #12). `enabled` gates the fetch — the
// booking detail modal only needs it while a booking is awaiting.
import { useEffect, useState } from "react";
import { supabase } from "../client";
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
