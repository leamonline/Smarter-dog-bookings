import { PRICING, DAILY_DOG_CAP } from "./salon";
import type { BookingPolicyRules, SalonConfig, SalonSettings } from "../types/index";

export const DEFAULT_BUSINESS_NAME = "Smarter Dog Grooming";

export type PersistedSalonSettings = Partial<
  Omit<SalonSettings, "businessHours" | "customerPortal" | "depositBank">
> & {
  businessHours?: Partial<Record<string, Partial<SalonSettings["businessHours"][string]>>>;
  customerPortal?: Partial<SalonSettings["customerPortal"]>;
  depositBank?: Partial<SalonSettings["depositBank"]>;
};

/**
 * Keys older saves left in salon_config.settings that nothing reads any more
 * (#1000). mergeSalonSettings drops them, so the next save of any setting
 * removes them from the stored JSON instead of re-asserting them.
 */
export const RETIRED_SETTINGS_KEYS = [
  "advanceBookingWeeks",
  "autoConfirm",
  // Older saves passed the whole config through here, so a camelCase copy of
  // the large-dog slot rules sits in settings too (#1000 review).
  "largeDogSlots",
  "notifications",
  "services",
] as const;
const RETIRED_PORTAL_KEYS = ["showUpcoming", "allowRebooking"] as const;

export const DEFAULT_BUSINESS_HOURS: SalonSettings["businessHours"] = {
  Monday: { open: "08:00", close: "17:00", closed: false },
  Tuesday: { open: "08:00", close: "17:00", closed: false },
  Wednesday: { open: "08:00", close: "17:00", closed: false },
  Thursday: { open: "08:00", close: "17:00", closed: false },
  Friday: { open: "08:00", close: "17:00", closed: false },
  Saturday: { open: "09:00", close: "14:00", closed: false },
  Sunday: { open: "", close: "", closed: true },
};

export const DEFAULT_CUSTOMER_PORTAL_SETTINGS: SalonSettings["customerPortal"] = {
  showHistory: true,
  allowCancellations: true,
};

export const DEFAULT_DEPOSIT_BANK: SalonSettings["depositBank"] = {
  accountName: "",
  sortCode: "",
  accountNumber: "",
};

export const DEFAULT_DEPOSIT_RELEASE_HOURS = 12;

export const BOOKING_DEPOSIT_HOLD_HOURS = [6, 12, 24, 36, 48] as const;

export function createDefaultBookingRules(): BookingPolicyRules {
  return {
    bookingHorizonDays: 180,
    autoConfirm: true,
    depositHoldHours: 12,
    depositBank: {
      accountName: "",
      sortCode: "",
      accountNumber: "",
    },
    termsUrl: "https://smarterdog.co.uk/terms",
    depositTermsVersion: null,
    depositTermsContentHash: null,
    customerPortal: {
      allowCancellations: true,
      allowRescheduling: true,
      allowRepeatBooking: false,
      showHistory: true,
    },
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDefaultSalonSettings(): SalonSettings {
  return {
    businessName: DEFAULT_BUSINESS_NAME,
    businessPhone: "",
    businessEmail: "",
    businessAddress: "",
    businessHours: cloneJson(DEFAULT_BUSINESS_HOURS),
    closures: [],
    minCancellationHours: 24,
    depositBank: cloneJson(DEFAULT_DEPOSIT_BANK),
    depositReleaseHours: DEFAULT_DEPOSIT_RELEASE_HOURS,
    customerPortal: cloneJson(DEFAULT_CUSTOMER_PORTAL_SETTINGS),
  };
}

export function mergeSalonSettings(settings?: PersistedSalonSettings | null): SalonSettings {
  const defaults = createDefaultSalonSettings();
  if (!settings) return defaults;

  const incomingHours = settings.businessHours || {};
  const hourKeys = new Set([
    ...Object.keys(defaults.businessHours),
    ...Object.keys(incomingHours),
  ]);
  const businessHours = Object.fromEntries(
    [...hourKeys].map((day) => [
      day,
      {
        ...(defaults.businessHours[day] || { open: "", close: "", closed: true }),
        ...(incomingHours[day] || {}),
      },
    ]),
  );

  const kept: Record<string, unknown> = { ...settings };
  for (const key of RETIRED_SETTINGS_KEYS) delete kept[key];
  const portal: Record<string, unknown> = { ...(settings.customerPortal || {}) };
  for (const key of RETIRED_PORTAL_KEYS) delete portal[key];

  return {
    ...defaults,
    ...(kept as PersistedSalonSettings),
    businessHours,
    closures: Array.isArray(settings.closures) ? [...settings.closures] : defaults.closures,
    customerPortal: {
      ...defaults.customerPortal,
      ...portal,
    },
    depositBank: {
      ...defaults.depositBank,
      ...(settings.depositBank || {}),
    },
    depositReleaseHours:
      typeof settings.depositReleaseHours === "number" && settings.depositReleaseHours > 0
        ? settings.depositReleaseHours
        : defaults.depositReleaseHours,
  };
}

export function createDefaultSalonConfig(): SalonConfig {
  return {
    defaultPickupOffset: 120,
    pricing: cloneJson(PRICING),
    enforceCapacity: true,
    dailyDogCap: DAILY_DOG_CAP,
    ...createDefaultSalonSettings(),
  };
}
