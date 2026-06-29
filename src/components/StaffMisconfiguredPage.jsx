import { CenteredScreen, PortalCard } from "./ui/PageShell.jsx";

export function StaffMisconfiguredPage() {
  return (
    <CenteredScreen>
      <PortalCard>
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-display font-bold text-slate-900">
            Booking system isn&apos;t set up yet
          </h1>
          <p className="text-slate-700 leading-relaxed">
            The booking system is missing a few settings, so it can&apos;t
            connect to the database right now.
          </p>
          <div className="bg-slate-100 rounded-lg p-3 text-sm font-mono text-slate-800 break-words">
            Missing: <code>VITE_SUPABASE_URL</code> and/or{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
          <p className="text-sm text-slate-600">
            Talk to your dev team — they need to set these up on the hosting
            provider and redeploy. Full error details in the browser console.
          </p>
        </div>
      </PortalCard>
    </CenteredScreen>
  );
}
