import { devConnectedProjectRef } from "../../supabase/devConnection";

// Shown only by `npm run dev:live` (#875): a dev server talking to a real
// project, where a staff action can reach a real customer. Never rendered in a
// production build or on sample data. pointer-events-none so it cannot block a
// control it happens to sit over.
export function DevConnectionBanner({
  dev = import.meta.env.DEV,
  forceOffline = import.meta.env.VITE_FORCE_OFFLINE === "1",
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
}) {
  const ref = devConnectedProjectRef({ dev, forceOffline, supabaseUrl });
  if (!ref) return null;
  return (
    <div
      role="status"
      data-dev-connection-banner
      className="pointer-events-none fixed bottom-2 left-2 z-[9999] rounded-md bg-red-700 px-3 py-1.5 text-[12px] font-bold text-white shadow-lg"
    >
      LIVE DATA · connected to {ref} · real customers, real messages
    </div>
  );
}
