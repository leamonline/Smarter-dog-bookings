import { PRICING, SERVICES } from "../constants/index.js";
import type { Service, Human, Dog } from "../types/index.js";

export function isServiceSupportedForSize(serviceId: string, size: string): boolean {
  const pricing = PRICING as Record<string, Record<string, string>>;
  const value = pricing?.[serviceId]?.[size];
  return typeof value === "string" && value !== "N/A";
}

export function getAllowedServicesForSize(size: string): Service[] {
  return (SERVICES as Service[]).filter((service) => isServiceSupportedForSize(service.id, size));
}

export function normalizeServiceForSize(serviceId: string, size: string): string {
  if (isServiceSupportedForSize(serviceId, size)) return serviceId;
  const services = SERVICES as Service[];
  return getAllowedServicesForSize(size)[0]?.id || services[0]?.id || "";
}

export function getServicePriceLabel(serviceId: string, size: string): string {
  const pricing = PRICING as Record<string, Record<string, string>>;
  return pricing?.[serviceId]?.[size] || "N/A";
}

export function getNumericPrice(value: string | number): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const digits = value.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function toLocalDateStr(date: Date | string): string {
  if (typeof date === "string") return date;
  if (!(date instanceof Date)) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getHumanByIdOrName(humans: Record<string, Human>, idOrName: string): Human | null {
  if (!humans || !idOrName) return null;

  if (humans[idOrName]) return humans[idOrName];

  return Object.values(humans).find((human) => {
    const fullName = human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();
    return human.id === idOrName || fullName === idOrName;
  }) || null;
}

export function getDogByIdOrName(dogs: Record<string, Dog>, idOrName: string): Dog | null {
  if (!dogs || !idOrName) return null;

  if (dogs[idOrName]) return dogs[idOrName];

  return Object.values(dogs).find((dog) => dog.id === idOrName || dog.name === idOrName) || null;
}
