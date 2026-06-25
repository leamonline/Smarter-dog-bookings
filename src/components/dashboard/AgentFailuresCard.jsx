// ============================================================
// src/components/dashboard/AgentFailuresCard.jsx
//
// Right-rail card that surfaces WhatsApp agent failures — events where
// processing_status='failed' (the agent swallows post-validation throws into
// an HTTP 200, so error_message here is the only visible signal). Rose
// accent → red attention frame, matching DeliveryFailuresCard's treatment.
// Renders nothing when count === 0 so it stays calm and invisible. Staff
// can follow the link to /inbox to locate the conversation.
// ============================================================

import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { RightRailCard } from "./RightRailCard.jsx";
import { useAgentFailures } from "../../supabase/hooks/useAgentFailures.js";

/** Show last 5 digits of the phone number, masked. */
function maskPhone(phone) {
  if (!phone) return "Unknown";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 5 ? `···${digits.slice(-5)}` : phone;
}

function fmtRelative(iso) {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMins = Math.round(diffMs / 60_000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.round(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.round(diffHrs / 24)}d ago`;
  } catch {
    return "";
  }
}

export function AgentFailuresCard({ bare = false, data }) {
  const fallback = useAgentFailures();
  const { failures, count, loading } = data ?? fallback;

  // Render nothing when there's nothing to flag — stays calm, takes up no space.
  if (!loading && count === 0) return null;

  const tone = count > 0 ? "attention" : "calm";

  const rowClass =
    "text-[12px] bg-white/70 border border-red-100 rounded-lg px-2 py-1.5";

  const list = (
    <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
      {failures.map((f) => (
        <li key={f.id}>
          <Link
            to="/inbox"
            className={`${rowClass} block hover:bg-white hover:border-red-200 transition-colors`}
            aria-label={`View inbox — agent error for ${maskPhone(f.phone)}`}
          >
            <span className="font-semibold text-red-900">{maskPhone(f.phone)}</span>
            {f.eventType && (
              <span className="text-red-700/70"> · {f.eventType}</span>
            )}
            <span className="block text-[11px] text-red-600 truncate" title={f.error}>
              {f.error}
            </span>
            {f.at && (
              <span className="block text-[10px] text-red-400 mt-0.5">
                {fmtRelative(f.at)}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <RightRailCard
      tone={tone}
      accent="rose"
      heading="AI agent issues"
      icon={AlertCircle}
      primaryNumber={count}
      subtitle={count === 1 ? "agent failure" : "agent failures"}
      primaryLine="Agent running smoothly"
      ariaLabel={`${count} AI agent ${count === 1 ? "failure" : "failures"} in the last 7 days`}
      loading={loading}
      bare={bare}
      loudChildren={count > 0 ? list : null}
    />
  );
}
