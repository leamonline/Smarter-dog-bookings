// Which safety instructions a groomer reads first.
//
// Order comes only from what staff recorded: the `tone` each warning carries in
// ALERT_OPTIONS (behaviour, then caution, then information). Nothing is inferred
// from a breed, an age or a free-text label. Text that is not in the list is
// kept, never dropped, and sorts after the recorded behaviour warnings and
// before the softer ones, because an unrecognised warning is more likely to
// matter than a "needs breaks" note. The sort is stable, so equal ranks keep
// the order staff entered them in. "Pregnant" is a handling restriction staff
// ticked on the dog, so it leads.
import { ALERT_OPTIONS } from "../constants/salon";

const TONE_RANK: Record<string, number> = { behaviour: 1, caution: 3, information: 4 };
const UNRECOGNISED_RANK = 2;
const RESTRICTION_RANK = 0;

const toneByLabel = new Map<string, string>(ALERT_OPTIONS.map((option) => [option.label, option.tone]));

function rank(fact: string): number {
  if (fact === "Pregnant") return RESTRICTION_RANK;
  const tone = toneByLabel.get(fact);
  return tone ? (TONE_RANK[tone] ?? UNRECOGNISED_RANK) : UNRECOGNISED_RANK;
}

/** The same warnings, most important first. Never adds, rewrites or removes one. */
export function orderSafetyFacts(facts: readonly string[]): string[] {
  return facts
    .map((fact, index) => ({ fact, index, rank: rank(fact) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.fact);
}
