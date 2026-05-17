// ─── helpers shared across NewBookingModal sub-components ─────────────────

import { looksLikeUuid } from "../../../utils/formatOwnerLabel.js";

export function getHumanPhone(humans, humanKey) {
  const h = humans?.[humanKey];
  return h?.phone || "";
}

/**
 * One entry per dog, with the owner and trusted humans grouped inside.
 * Shape: { dog, hasAlerts, humans: [{ key, phone, isTrusted, missing }] }.
 * Owner is always first in the humans array; trusted follow in the order
 * they appear on the owner.
 *
 * "Key" is the display string for the OWNER column in the dropdown.
 * Never a UUID — when the humans map hasn't loaded the owner row yet,
 * the entry is marked `missing` with key "Unknown owner".
 */
export function buildSearchEntries(dogs, humans) {
  const entries = [];
  const humansList = humans ? Object.values(humans) : [];

  for (const dog of Object.values(dogs || {})) {
    const ownerKey = dog.humanId || "";
    const ownerIsUuid = looksLikeUuid(ownerKey);

    // Resolve the owner record. Prefer `_humanId` (the UUID stamped at
    // fetch time) over `humanId` (which is the camelCase display key
    // when present, or a UUID fallback when the human row hadn't loaded).
    let owner = null;
    if (dog._humanId) {
      owner = humansList.find((h) => h?.id === dog._humanId) || null;
    }
    if (!owner && ownerKey && !ownerIsUuid) {
      owner = humans?.[ownerKey] || null;
    }
    if (!owner && ownerKey) {
      // Last resort: try matching the key against any human's id, in
      // case humanId itself is a UUID and _humanId wasn't populated.
      owner = humansList.find((h) => h?.id === ownerKey) || null;
    }

    const hasAlerts = Boolean(dog.alerts?.length);
    const humansForDog = [];

    if (owner) {
      const displayKey =
        owner.fullName ||
        `${owner.name || ""} ${owner.surname || ""}`.trim() ||
        // Fall back to the humanId string when the owner record has no name
        // fields (e.g. legacy records keyed by display name).
        (!ownerIsUuid ? ownerKey : "") ||
        "Unknown owner";
      humansForDog.push({
        key: displayKey,
        phone: owner.phone || "",
        isTrusted: false,
        missing: false,
      });
    } else if (ownerKey && !ownerIsUuid) {
      // Have a name-shaped key but no humans-map row yet — render the
      // name anyway, with a soft "missing" flag so callers can show a
      // "link owner" affordance if they want to.
      humansForDog.push({
        key: ownerKey,
        phone: "",
        isTrusted: false,
        missing: true,
      });
    } else if (ownerKey) {
      // UUID with no resolution at all.
      humansForDog.push({
        key: "Unknown owner",
        phone: "",
        isTrusted: false,
        missing: true,
      });
    }

    if (owner?.trustedIds?.length) {
      for (const trustedKey of owner.trustedIds) {
        if (looksLikeUuid(trustedKey)) continue;
        const trusted = humans?.[trustedKey];
        if (trusted) {
          humansForDog.push({
            key: trustedKey,
            phone: trusted.phone || "",
            isTrusted: true,
            missing: false,
          });
        }
      }
    }

    entries.push({ dog, hasAlerts, humans: humansForDog });
  }
  return entries;
}

export { titleCase } from "../../../utils/text.js";
