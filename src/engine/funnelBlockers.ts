// Why a customer could not get past a booking-wizard step — pure TS, zero React.
//
// WHY THIS EXISTS
//
// booking_funnel_events records which step a wizard attempt REACHED. Measured
// on 30 August 2026 against the clean post-telemetry-fix window, the two
// largest losses are both at the front of the wizard, before anyone sees a
// price or a slot:
//
//   started      -> select_dogs   the largest single drop
//   select_dogs  -> select_date   the second largest
//
// The funnel cannot say why. This module supplies the half of the answer that
// is actually observable.
//
// THE DISTINCTION THIS MODULE EXISTS TO DRAW
//
// A customer who leaves a step did one of two things, and they need opposite
// responses:
//
//   COULD NOT PROCEED — the interface had nothing for them to pick. No dogs on
//   file; every dog ineligible; a calendar page with no open day. This is a
//   product failure and it is observable from state we already hold.
//
//   CHOSE NOT TO PROCEED — they had options and left anyway. Price, timing,
//   second thoughts, a closed tab. This is NOT observable, and this module
//   never guesses at it.
//
// So a null return means "not blocked", never "left for no reason". Absence of
// a blocker on an abandoned attempt is itself the finding: the customer had a
// usable choice in front of them and still went away.
import { DOG_SIZES } from "../constants/salon";

/**
 * The governed vocabulary. Every value is a state the wizard can actually
 * observe at the moment it is logged — never an inference about intent.
 *
 * Mirrored by the CHECK constraint on booking_funnel_events.blocked_reason;
 * adding a value here means adding it there in the same change.
 */
export const FUNNEL_BLOCKED_REASONS = [
  /** The customer has no dogs at all — the dog step has nothing to offer. */
  "no_dogs_on_file",
  /** Dogs exist, but every one is ineligible (size unknown, or pregnant). */
  "no_eligible_dogs",
  /** The first calendar page the customer saw held no open day. */
  "no_open_days_in_first_page",
] as const;

export type FunnelBlockedReason = (typeof FUNNEL_BLOCKED_REASONS)[number];

/** A dog as the wizard's dog step sees it. */
export interface BlockerDog {
  size?: string | null;
  isPregnant?: boolean | null;
}

/**
 * Whether the dog step can offer this dog at all.
 *
 * Mirrors DogSelection's own `disabled` rule, minus the 4-dog cap: the cap
 * limits a selection that is already under way, it never leaves a customer
 * with nothing to pick.
 */
export function isSelectableDog(dog: BlockerDog): boolean {
  const sizeKnown = (DOG_SIZES as readonly string[]).includes(dog.size as string);
  return sizeKnown && !dog.isPregnant;
}

/**
 * Why the dog step could not be completed, or null when it could.
 *
 * `loading` returns null on purpose: a customer who is still waiting has not
 * been blocked by anything, and logging one would turn slow network into a
 * fake product problem.
 */
export function dogStepBlocker(
  dogs: readonly BlockerDog[] | null | undefined,
  loading: boolean,
): FunnelBlockedReason | null {
  if (loading) return null;
  if (!dogs) return null;
  if (dogs.length === 0) return "no_dogs_on_file";
  if (!dogs.some(isSelectableDog)) return "no_eligible_dogs";
  return null;
}

/**
 * Why the date step could not be completed, or null when it could.
 *
 * Scoped to the FIRST page deliberately. The calendar pages 28 days at a time
 * up to six months, so a later empty page is a customer browsing past the
 * horizon, not a wall. An empty first page is the one that reads as "there is
 * nothing here" and sends people away.
 *
 * `complete` guards the same way `loading` does above: a page still resolving
 * its availability has not blocked anyone yet.
 */
export function dateStepBlocker(input: {
  pageIndex: number;
  openDayCount: number;
  complete: boolean;
}): FunnelBlockedReason | null {
  if (input.pageIndex !== 0) return null;
  if (!input.complete) return null;
  if (input.openDayCount > 0) return null;
  return "no_open_days_in_first_page";
}
