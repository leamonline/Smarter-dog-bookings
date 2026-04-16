// Production-only banner that warns when Supabase isn't wired up.
// In dev, the offline-with-sample-data mode is intentional. In prod, it usually
// means the deploy is misconfigured (missing VITE_SUPABASE_* env vars).
export function OfflineDemoBanner({ isOnline }) {
  if (isOnline || !import.meta.env.PROD) return null;

  return (
    <div
      role="alert"
      className="bg-amber-100 border-y-2 border-amber-400 text-amber-900 px-4 py-2.5 text-sm font-semibold text-center font-sans"
    >
      Offline demo mode — changes won&apos;t save. The salon&apos;s database isn&apos;t connected.
    </div>
  );
}
