// src/utils/formatOwnerLabel.js
//
// Single helper for owner display strings. Refuses to render a
// UUID-shaped value as customer-visible text — guards against the
// "humans map hasn't loaded yet" case that previously leaked raw
// `dogs.human_id` UUIDs into the DogsView card, the New Booking
// dog search dropdown, and a few other corners.
//
// Pair with resolveBookingDisplay() (engine/bookingRules.ts) for
// booking surfaces — that helper goes through this one for owner
// labels so the policy stays consistent.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Resolve an owner display label from a dog row + the humans map.
 *
 * Resolution order:
 *   1. The matching human's `fullName` (or name + surname).
 *   2. `dog.humanId` (the camelCase fullName, set by dbDogsToMap when
 *      it could match the human at fetch time).
 *   3. Fallback: "Unknown owner".
 *
 * Any value that resolves to a UUID-shaped string is rejected as if
 * the lookup had failed. In dev builds the helper also console.warns
 * so the leak is caught in review rather than in production.
 *
 * @param {object} dog — a dog row from the dogs map.
 * @param {Record<string, object>} humans — the humans map (key = fullName).
 * @returns {{ label: string, phone: string, missing: boolean }}
 */
export function formatOwnerLabel(dog, humans) {
  if (!dog) return { label: "Unknown owner", phone: "", missing: true };

  const humanId = dog._humanId || null;
  const humanKey = dog.humanId || "";

  // Prefer the id-keyed lookup; fall back to the name-keyed map.
  let human = null;
  if (humans) {
    if (humanId) {
      for (const h of Object.values(humans)) {
        if (h?.id === humanId) { human = h; break; }
      }
    }
    if (!human && humanKey && humans[humanKey]) {
      human = humans[humanKey];
    }
  }

  const candidateName =
    human?.fullName ||
    (human ? `${human.name || ""} ${human.surname || ""}`.trim() : "") ||
    (looksLikeUuid(humanKey) ? "" : humanKey);

  if (!candidateName || looksLikeUuid(candidateName)) {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV && looksLikeUuid(candidateName)) {
      console.warn("formatOwnerLabel: refused to render a UUID-shaped owner name", { dogId: dog.id });
    }
    return { label: "Unknown owner", phone: human?.phone || "", missing: !human };
  }

  return {
    label: candidateName,
    phone: human?.phone || "",
    missing: !human,
  };
}
