// ─── helpers shared across NewBookingModal sub-components ─────────────────

export function getHumanPhone(humans, humanKey) {
  const h = humans?.[humanKey];
  return h?.phone || "";
}

export function buildSearchEntries(dogs, humans) {
  // Returns an array of { dog, humanKey, humanPhone, isTrusted, trustedHumanKey, trustedHumanPhone }
  const entries = [];
  for (const dog of Object.values(dogs || {})) {
    const ownerKey = dog.humanId || "";
    const owner = humans?.[ownerKey];
    const ownerPhone = owner?.phone || "";
    const hasAlerts = dog.alerts && dog.alerts.length > 0;

    // Primary entry (owner)
    entries.push({
      dog,
      humanKey: ownerKey,
      humanPhone: ownerPhone,
      isTrusted: false,
      hasAlerts,
    });

    // Trusted human entries
    if (owner?.trustedIds?.length) {
      for (const trustedKey of owner.trustedIds) {
        const trusted = humans?.[trustedKey];
        if (trusted) {
          entries.push({
            dog,
            humanKey: trustedKey,
            humanPhone: trusted.phone || "",
            isTrusted: true,
            hasAlerts,
          });
        }
      }
    }
  }
  return entries;
}

export { titleCase } from "../../../utils/text.js";
