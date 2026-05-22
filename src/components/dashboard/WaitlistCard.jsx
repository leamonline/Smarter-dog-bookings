import { Clock3 } from "lucide-react";
import { RightRailCard } from "./RightRailCard.jsx";
import { resolveWaitlistTone } from "./tone/waitlist";

// Right-rail Waitlist card. Stateless / presentational — the parent
// passes either `entries` (the salon-wide upcoming window, used by the
// right rail) or `count` + an empty entries list (used by UtilityTabs
// where only the per-day count is known). The resolver makes both
// shapes work: with no entries it falls to calm only if `count === 0`;
// when count > 0 and entries is empty it still produces an "active"
// tone — see TODO note in `resolveWaitlistToneSafe`.
export function WaitlistCard({
  entries = [],
  count = null,
  onOpen,
  loading = false,
  bare = false,
}) {
  // When the caller only knows the count (UtilityTabs path), synthesise
  // a thin entries array so the resolver's calm/active branch still
  // works. We can't compute "imminent" attention without real dates,
  // so the UtilityTabs path tops out at active — acceptable since the
  // tablet rail isn't expected to ring alarm bells.
  const effectiveEntries =
    entries.length > 0
      ? entries
      : count && count > 0
        ? Array.from({ length: count }, () => ({ target_date: "9999-12-31" }))
        : [];

  const tone = resolveWaitlistTone({ entries: effectiveEntries });
  return (
    <RightRailCard
      tone={tone.tone}
      accent="sky"
      heading="Waitlist"
      icon={Clock3}
      pillLabel={tone.pillLabel}
      primaryNumber={tone.primaryNumber}
      primaryLine={tone.primaryLine}
      subtitle={tone.subtitle}
      ariaLabel={tone.ariaSummary}
      loading={loading}
      bare={bare}
      cta={onOpen ? { label: tone.tone === "calm" ? "View waitlist" : "Open waitlist", onClick: onOpen } : null}
    />
  );
}
