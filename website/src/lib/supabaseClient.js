import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// The publishable key is the name we want everywhere. The legacy anon key is
// accepted as a fallback because this site does not always control the host
// that builds it: the combined Vercel build (scripts/build-combined.mjs) runs
// this build alongside the booking app, whose own client has read the legacy
// name as a fallback since before that merge. Reading only the modern name
// here made `supabase` null on that host, which is not a loud failure -- the
// bundler constant-folds the ternary, drops the whole @supabase import, and
// every live read (open days, holiday notices, salon facts) quietly serves its
// hardcoded fallback instead. A marketing site confidently showing the wrong
// opening days is worse than one that fails visibly, so accept both names.
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Anon reads only -- no auth session needed on the marketing site.
export const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    : null;
