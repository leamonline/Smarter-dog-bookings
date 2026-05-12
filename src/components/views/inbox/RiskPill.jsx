// ============================================================
// src/components/views/inbox/RiskPill.jsx
//
// Risk-pill styling. Mirrors the deterministic risk values written by
// the agent (see supabase/functions/_shared/agentRisk.ts):
//   low    — neutral green; safe to auto-send when policy allows
//   medium — amber; staff approves as usual
//   high   — red; medical, complaint, or low-confidence — handle carefully
// ============================================================

const RISK_STYLES = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-red-100 text-red-800 border-red-200",
};

export function RiskPill({ risk }) {
  if (!risk) return null;
  const style = RISK_STYLES[risk] ?? RISK_STYLES.medium;
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${style}`}
      title={`Risk level: ${risk}`}
    >
      {risk} risk
    </span>
  );
}
