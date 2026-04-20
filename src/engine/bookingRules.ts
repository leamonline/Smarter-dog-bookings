import { PRICING, SERVICES } from "../constants/index.js";
import { getAddonsTotal } from "../constants/salon.js";
import type { Service, Human, Dog } from "../types/index.js";

export const DEFAULT_DEPOSIT_AMOUNT = 10;

export interface BookingPricingInput {
  service: string;
  size: string;
  addons?: string[] | null;
  payment?: string | null;
  depositAmount?: number | null;
  customPrice?: number | null;
}

export interface BookingPricing {
  basePrice: number;
  addonsTotal: number;
  subtotal: number;
  depositPaid: number;
  amountDue: number;
  isPaidInFull: boolean;
  isDepositPaid: boolean;
}

export function computeBookingPricing(input: BookingPricingInput): BookingPricing {
  let basePrice: number;
  const customPrice = input.customPrice;
  if (customPrice != null && !isNaN(Number(customPrice))) {
    basePrice = Number(customPrice);
  } else {
    const normalizedService = normalizeServiceForSize(input.service, input.size);
    basePrice = getNumericPrice(getServicePriceLabel(normalizedService, input.size));
  }

  const addonsTotal = getAddonsTotal(input.addons ?? null);
  const subtotal = basePrice + addonsTotal;

  const payment = input.payment || "Due at Pick-up";
  const depositAmount = input.depositAmount ?? DEFAULT_DEPOSIT_AMOUNT;

  const isPaidInFull = payment === "Paid in Full";
  const isDepositPaid = payment === "Deposit Paid";

  let amountDue: number;
  if (isPaidInFull) amountDue = 0;
  else if (isDepositPaid) amountDue = Math.max(0, subtotal - depositAmount);
  else amountDue = subtotal;

  return {
    basePrice,
    addonsTotal,
    subtotal,
    depositPaid: isDepositPaid ? depositAmount : 0,
    amountDue,
    isPaidInFull,
    isDepositPaid,
  };
}

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
