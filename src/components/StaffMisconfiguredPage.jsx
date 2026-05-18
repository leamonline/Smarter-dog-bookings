import { CenteredScreen, PortalCard } from "./ui/PageShell.jsx";

export function StaffMisconfiguredPage() {
  return (
    <CenteredScreen>
      <PortalCard>
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-display font-bold text-slate-900">
            Booking system not configured
          </h1>
          <p className="text-slate-700 leading-relaxed">
            This deployment is missing Supabase environment variables, so the
            app can&apos;t connect to the database.
          </p>
          <div className="bg-slate-100 rounded-lg p-3 text-sm font-mono text-slate-800 break-words">
            Missing: <code>VITE_SUPABASE_URL</code> and/or{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
          <p className="text-sm text-slate-600">
            Set them on the hosting provider (Vercel / Cloudflare) and
            redeploy. See the browser console for the full error.
          </p>
        </div>
      </PortalCard>
    </CenteredScreen>
  );
}
