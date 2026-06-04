import { LARGE_DOG_SLOTS, PRICING, SERVICES } from "./salon.js";
import type { SalonConfig, SalonSettings } from "../types/index.js";

export const DEFAULT_BUSINESS_NAME = "Smarter Dog Grooming";

export type PersistedSalonSettings = Partial<
  Omit<SalonSettings, "businessHours" | "customerPortal" | "notifications">
> & {
  businessHours?: Partial<Record<string, Partial<SalonSettings["businessHours"][string]>>>;
  customerPortal?: Partial<SalonSettings["customerPortal"]>;
  notifications?: Record<string, Partial<SalonSettings["notifications"][string]>>;
};

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
  showUpcoming: true,
  showHistory: true,
  allowRebooking: false,
  allowCancellations: true,
};

export const DEFAULT_NOTIFICATION_SETTINGS: SalonSettings["notifications"] = {
  bookingConfirmation: { enabled: true, channels: ["whatsapp", "email"] },
  dayBeforeReminder: { enabled: true, channels: ["whatsapp"] },
  readyForCollection: { enabled: true, channels: ["whatsapp", "sms"] },
  followUp: { enabled: false, channels: ["email"] },
};

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
    advanceBookingWeeks: 8,
    minCancellationHours: 24,
    autoConfirm: true,
    customerPortal: cloneJson(DEFAULT_CUSTOMER_PORTAL_SETTINGS),
    notifications: cloneJson(DEFAULT_NOTIFICATION_SETTINGS),
    services: SERVICES.map((service) => ({ ...service })),
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

  const notificationDefaults = defaults.notifications;
  const incomingNotifications = settings.notifications || {};
  const notificationKeys = new Set([
    ...Object.keys(notificationDefaults),
    ...Object.keys(incomingNotifications),
  ]);
  const notifications = Object.fromEntries(
    [...notificationKeys].map((key) => [
      key,
      {
        ...(notificationDefaults[key] || { enabled: false, channels: [] }),
        ...(incomingNotifications[key] || {}),
        channels: [
          ...((incomingNotifications[key]?.channels ||
            notificationDefaults[key]?.channels ||
            []) as string[]),
        ],
      },
    ]),
  );

  return {
    ...defaults,
    ...settings,
    businessHours,
    closures: Array.isArray(settings.closures) ? [...settings.closures] : defaults.closures,
    customerPortal: {
      ...defaults.customerPortal,
      ...(settings.customerPortal || {}),
    },
    notifications,
    services: Array.isArray(settings.services)
      ? settings.services.map((service) => ({ ...service }))
      : defaults.services,
  };
}

export function createDefaultSalonConfig(): SalonConfig {
  return {
    defaultPickupOffset: 120,
    pricing: cloneJson(PRICING),
    enforceCapacity: true,
    largeDogSlots: cloneJson(LARGE_DOG_SLOTS),
    ...createDefaultSalonSettings(),
  };
}
