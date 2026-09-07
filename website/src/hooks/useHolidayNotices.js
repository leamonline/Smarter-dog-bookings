import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { scheduleHolidayNotices } from '../utils/holidayNotice';

// Unlike useSalonFacts there is deliberately NO fallback and NO module cache:
// a holiday claim must be re-verified against the live diary, and a failed
// read means "no verified notice", never "we're open" or a stale reopening.
const REFRESH_MS = 60_000;

async function fetchHolidayNotices() {
    if (!supabase) return [];
    try {
        const { data, error } = await supabase.rpc('get_public_holiday_notices');
        return error ? [] : (data || []);
    } catch {
        return [];
    }
}

export function useHolidayNotices() {
    const [notices, setNotices] = useState([]);

    useEffect(() => {
        if (!supabase) return undefined;
        let alive = true;
        let request = 0;
        const refresh = async () => {
            const current = ++request;
            const result = await fetchHolidayNotices();
            if (alive && current === request) setNotices(result);
        };
        refresh();
        const timer = window.setInterval(refresh, REFRESH_MS);
        const onFocus = () => { refresh(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            alive = false;
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, []);

    return scheduleHolidayNotices(notices);
}

export default useHolidayNotices;
