// ─── helpers shared across NewBookingModal sub-components ─────────────────

export function getHumanPhone(humans, humanKey) {
  const h = humans?.[humanKey];
  return h?.phone || "";
}

/**
 * One entry per dog, with the owner and trusted humans grouped inside.
 * Shape: { dog, hasAlerts, humans: [{ key, phone, isTrusted }] }.
 * Owner is always first in the humans array; trusted follow in the order
 * they appear on the owner.
 */
export function buildSearchEntries(dogs, humans) {
  const entries = [];
  for (const dog of Object.values(dogs || {})) {
    const ownerKey = dog.humanId || "";
    const owner = ownerKey ? humans?.[ownerKey] : null;
    const hasAlerts = Boolean(dog.alerts?.length);

    const humansForDog = [];

    if (ownerKey) {
      humansForDog.push({
        key: ownerKey,
        phone: owner?.phone || "",
        isTrusted: false,
      });
    }

    if (owner?.trustedIds?.length) {
      for (const trustedKey of owner.trustedIds) {
        const trusted = humans?.[trustedKey];
        if (trusted) {
          humansForDog.push({
            key: trustedKey,
            phone: trusted.phone || "",
            isTrusted: true,
          });
        }
      }
    }

    entries.push({ dog, hasAlerts, humans: humansForDog });
  }
  return entries;
}

export { titleCase } from "../../../utils/text.js";
