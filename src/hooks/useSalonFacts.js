import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SALON_FACTS_FALLBACK } from '../constants/salonFacts';

// Module-level cache so every component calling this hook shares one fetch
// per page session instead of firing its own request.
let cachedFacts = null;
let fetchPromise = null;

function normaliseFacts(data) {
    if (!data) return null;
    return {
        businessName: data.business_name || SALON_FACTS_FALLBACK.businessName,
        businessPhone: data.business_phone || SALON_FACTS_FALLBACK.businessPhone,
        businessEmail: data.business_email || SALON_FACTS_FALLBACK.businessEmail,
        businessAddress: data.business_address || SALON_FACTS_FALLBACK.businessAddress,
        businessHours: data.business_hours && Object.keys(data.business_hours).length
            ? data.business_hours
            : SALON_FACTS_FALLBACK.businessHours,
        closures: Array.isArray(data.closures) ? data.closures : SALON_FACTS_FALLBACK.closures,
    };
}

function fetchSalonFacts() {
    if (!supabase) return Promise.resolve(null);
    if (!fetchPromise) {
        fetchPromise = supabase
            .rpc('get_public_salon_facts')
            .maybeSingle()
            .then(({ data, error }) => (error ? null : normaliseFacts(data)))
            .catch(() => null);
    }
    return fetchPromise;
}

// Renders the fallback immediately (no loading state, no layout shift) and
// swaps in live data only if/when the RPC resolves.
export function useSalonFacts() {
    const [facts, setFacts] = useState(cachedFacts || SALON_FACTS_FALLBACK);

    useEffect(() => {
        if (cachedFacts) return;
        let cancelled = false;
        fetchSalonFacts().then((result) => {
            if (cancelled || !result) return;
            cachedFacts = result;
            setFacts(result);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return facts;
}

export default useSalonFacts;
