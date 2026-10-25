import { useOnlineStatus } from "../../hooks/useOnlineStatus.ts";

export function NetworkOfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="bg-feedback-warning-tint border-y-2 border-brand-mustard text-feedback-warning-ink px-4 py-2 text-sm font-semibold text-center font-sans"
    >
      You&apos;re offline — changes won&apos;t save until your connection comes back.
    </div>
  );
}
