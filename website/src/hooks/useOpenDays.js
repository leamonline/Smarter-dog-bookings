import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildOverridesMap } from '../utils/openDays';

// Module-level cache, same reasoning as useSalonFacts: one request per page
// session shared across every component that asks.
let cachedOverrides = null;
let fetchPromise = null;

function fetchOpenDays() {
    if (!supabase) return Promise.resolve({});
    if (!fetchPromise) {
        fetchPromise = supabase
            .rpc('get_public_open_days')
            .then(({ data, error }) => (error ? {} : buildOverridesMap(data)))
            .catch(() => ({}));
    }
    return fetchPromise;
}

export function useOpenDays() {
    const [overrides, setOverrides] = useState(cachedOverrides || {});

    useEffect(() => {
        if (cachedOverrides) return;
        let cancelled = false;
        fetchOpenDays().then((result) => {
            if (cancelled) return;
            cachedOverrides = result;
            setOverrides(result);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return overrides;
}

export default useOpenDays;
