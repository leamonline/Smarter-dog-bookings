// ============================================================
// src/components/dashboard/DeliveryFailuresCard.jsx
//
// Right-rail card that surfaces customer notifications that FAILED to
// deliver (undeliverable number, etc.) so staff spot them without opening
// each day. Awareness only — the fix + resend lives on the booking itself
// (DeliveryFailureCard in the booking detail). Rose accent → red attention
// frame. Rendered by RightWorkflowSidebar only when count > 0.
// ============================================================

import { AlertTriangle } from "lucide-react";
import { RightRailCard } from "./RightRailCard.jsx";
import {
  useDeliveryFailures,
  triggerLabel,
} from "../../supabase/hooks/useDeliveryFailures.js";

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export function DeliveryFailuresCard({ bare = false, data, onSelectFailure }) {
  const fallback = useDeliveryFailures();
  const { failures, count, loading } = data ?? fallback;
  const tone = count > 0 ? "attention" : "calm";

  const rowClass =
    "text-[12px] bg-white/70 border border-red-100 rounded-lg px-2 py-1.5";

  const list = (
    <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
      {failures.map((f) => {
        const body = (
          <>
            <span className="font-semibold text-red-900">{f.customerName}</span>
            {f.dogName && <span className="text-red-700/70"> · {f.dogName}</span>}
            <span className="block text-[11px] text-red-600">
              {f.triggers.map(triggerLabel).join(", ")} failed
              {f.bookingDate ? ` · ${fmtDate(f.bookingDate)}` : ""}
            </span>
          </>
        );
        return (
          <li key={f.bookingId}>
            {onSelectFailure ? (
              // Each row jumps the calendar to that booking's day so staff can
              // open it and resend (the fix lives on the booking itself).
              <button
                type="button"
                onClick={() => onSelectFailure(f)}
                aria-label={`Open ${f.customerName}'s booking${f.bookingDate ? ` on ${fmtDate(f.bookingDate)}` : ""} to resend`}
                className={`${rowClass} w-full text-left cursor-pointer hover:bg-white hover:border-red-200 transition-colors`}
              >
                {body}
              </button>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <RightRailCard
      tone={tone}
      accent="rose"
      heading="Delivery issues"
      icon={AlertTriangle}
      primaryNumber={count}
      subtitle={count === 1 ? "message failed" : "messages failed"}
      primaryLine="All messages delivered"
      ariaLabel={`${count} customer ${count === 1 ? "message" : "messages"} failed to deliver`}
      loading={loading}
      bare={bare}
      loudChildren={count > 0 ? list : null}
    />
  );
}
