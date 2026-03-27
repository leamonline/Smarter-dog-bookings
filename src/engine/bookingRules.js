import { PRICING, SERVICES } from "../constants/index.js";

export function isServiceSupportedForSize(serviceId, size) {
  const value = PRICING?.[serviceId]?.[size];
  return typeof value === "string" && value !== "N/A";
}

export function getAllowedServicesForSize(size) {
  return SERVICES.filter((service) => isServiceSupportedForSize(service.id, size));
}

export function normalizeServiceForSize(serviceId, size) {
  if (isServiceSupportedForSize(serviceId, size)) return serviceId;
  return getAllowedServicesForSize(size)[0]?.id || SERVICES[0]?.id || "";
}

export function getServicePriceLabel(serviceId, size) {
  return PRICING?.[serviceId]?.[size] || "N/A";
}

export function getNumericPrice(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const digits = value.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function toLocalDateStr(date) {
  if (typeof date === "string") return date;
  if (!(date instanceof Date)) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getHumanByIdOrName(humans, idOrName) {
  if (!humans || !idOrName) return null;

  if (humans[idOrName]) return humans[idOrName];

  return Object.values(humans).find((human) => {
    const fullName = human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();
    return human.id === idOrName || fullName === idOrName;
  }) || null;
}

export function getDogByIdOrName(dogs, idOrName) {
  if (!dogs || !idOrName) return null;

  if (dogs[idOrName]) return dogs[idOrName];

  return Object.values(dogs).find((dog) => dog.id === idOrName || dog.name === idOrName) || null;
}
