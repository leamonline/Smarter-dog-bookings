import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
    if (import.meta.env.DEV) {
        console.warn(
            'Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.',
        );
    }
}

export const supabase = createClient(
    url ?? 'https://placeholder.supabase.co',
    publishableKey ?? 'placeholder-key',
    {
        auth: {
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'sd-auth',
        },
    },
);

export const isSupabaseConfigured = Boolean(url && publishableKey);
