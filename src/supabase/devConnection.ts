// Which real Supabase project a dev server is connected to, if any (#875).
//
// `npm run dev` runs on sample data; `npm run dev:live` connects to whatever
// .env.local names, usually production. When that happens the app must say so
// on screen, all the time, because a staff action there sends real messages.
// Production builds and offline sessions return null and render nothing.

export interface DevConnectionInput {
  dev: boolean;
  forceOffline: boolean;
  supabaseUrl: string | null | undefined;
}

/** The connected project's ref (e.g. `nlzhllhkigmsvrzduefz`), or null when there is nothing to warn about. */
export function devConnectedProjectRef({ dev, forceOffline, supabaseUrl }: DevConnectionInput): string | null {
  if (!dev || forceOffline || !supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    // Hosted projects are <ref>.supabase.co; anything else (a local stack)
    // is still a real connection, so name it by host.
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  } catch {
    return supabaseUrl;
  }
}
