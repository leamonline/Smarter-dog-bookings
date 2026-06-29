/**
 * Convert DB rows to the component-friendly shapes the app expects.
 * Components use name-keyed maps and camelCase; DB uses UUID FKs and snake_case.
 */

import type { Human, Dog, Booking, SalonConfig, SalonSettings, TrustedContact } from "../types/index";
import { sanitiseFieldValue } from "../utils/sanitiseFieldValue";
import { BOOKING_STATUS } from "../constants/salon";
import { createDefaultSalonConfig, mergeSalonSettings } from "../constants/salonSettings";
import type { PersistedSalonSettings } from "../constants/salonSettings";

// ============================================================
// Raw DB row interfaces (only used in this file)
// ============================================================

interface DbHumanRow {
  id: string;
  name: string;
  surname: string;
  phone: string | null;
  sms: boolean | null;
  whatsapp: boolean | null;
  email: string | null;
  fb: string | null;
  insta: string | null;
  tiktok: string | null;
  address: string | null;
  notes: string | null;
  history_flag: string | null;
  reminder_hours: number | null;
  reminder_channels: string[] | null;
}

interface DbDogRow {
  id: string;
  name: string;
  breed: string;
  age: string | null;
  dob: string | null;
  sex?: string | null;
  microchip?: string | null;
  neutered?: boolean | null;
  is_pregnant?: boolean | null;
  vet?: string | null;
  colour?: string | null;
  size: string | null;
  human_id: string | null;
  alerts: string[] | null;
  groom_notes: string | null;
  custom_price: number | undefined;
  last_groomed_date?: string | null;
}

interface DbBookingRow {
  id: string;
  slot: string;
  size: string;
  service: string;
  status: string | null;
  addons: string[] | null;
  payment: string | null;
  deposit_amount?: number | null;
  confirmed: boolean | null;
  dog_id: string;
  pickup_by_id: string | null;
  booking_date: string;
  group_id: string | null;
  dog_name_snapshot?: string | null;
  breed_snapshot?: string | null;
  owner_name_snapshot?: string | null;
  whatsapp_conversation_id?: string | null;
  whatsapp_message_id?: string | null;
  staff_capacity_override?: boolean | null;
  staff_capacity_override_by?: string | null;
  staff_capacity_override_at?: string | null;
  reminder_confirmed_at?: string | null;
  completed_at?: string | null;
  notification_log?: Array<{
    trigger_type: string;
    status: string;
    sent_at: string | null;
    channel: string | null;
  }>;
}

interface DbConfigRow {
  default_pickup_offset: number | null;
  pricing: Record<string, Record<string, string>> | null;
  enforce_capacity: boolean | null;
  daily_dog_cap?: number | null;
  large_dog_slots: Record<string, unknown> | null;
  settings?: PersistedSalonSettings | null;
}

interface DbConfigOut {
  default_pickup_offset: number;
  pricing: Record<string, Record<string, string>>;
  enforce_capacity: boolean;
  daily_dog_cap: number;
  large_dog_slots: Record<string, unknown>;
  settings: SalonSettings;
}

// ============================================================
// Helpers
// ============================================================

function buildHumanFullName(row: DbHumanRow): string {
  // Some legacy imports stored a literal placeholder surname — "Null"
  // from a faker pipeline, or "Unknown" / "N/A" / "None" from imports.
  // A CHECK constraint (migration 20260513150000_fix_null_surnames.sql)
  // now blocks new "Null" rows but doesn't backfill. Strip the token
  // so the fullName degrades to just the first name rather than a
  // confusing literal like "Mirek Null".
  const name = sanitiseFieldValue(row.name);
  const surname = sanitiseFieldValue(row.surname);
  if (name && surname) return `${name} ${surname}`;
  return name || surname;
}

// ============================================================
// Lookup functions
// ============================================================

export function findHumanByIdOrName(
  humansById: Record<string, DbHumanRow & { fullName: string }>,
  humansOrValue: Record<string, Human> | string | null,
  maybeValue?: string | null,
): (DbHumanRow & { fullName: string }) | Human | { id: string; name: string; surname: string; phone: string; sms: boolean; whatsapp: boolean; email: string; fb: string; insta: string; tiktok: string; address: string; notes: string; history_flag: string; fullName: string } | null {
  const humans = maybeValue === undefined ? null : humansOrValue as Record<string, Human> | null;
  const value = maybeValue === undefined ? humansOrValue as string | null : maybeValue;

  if (!value) return null;
  if (humansById?.[value]) return humansById[value];

  if (humans?.[value]) {
    const human = humans[value];
    return {
      id: human.id,
      name: human.name,
      surname: human.surname,
      phone: human.phone || "",
      sms: human.sms || false,
      whatsapp: human.whatsapp || false,
      email: human.email || "",
      fb: human.fb || "",
      insta: human.insta || "",
      tiktok: human.tiktok || "",
      address: human.address || "",
      notes: human.notes || "",
      history_flag: human.historyFlag || "",
      fullName:
        human.fullName || `${human.name || ""} ${human.surname || ""}`.trim(),
    };
  }

  const fromById = Object.values(humansById || {}).find(
    (human) => human.id === value || human.fullName === value,
  );
  if (fromById) return fromById;

  const fromMap = Object.values(humans || {}).find(
    (human) =>
      human.id === value ||
      human.fullName === value ||
      `${human.name || ""} ${human.surname || ""}`.trim() === value,
  );

  if (!fromMap) return null;

  return {
    id: fromMap.id,
    name: fromMap.name,
    surname: fromMap.surname,
    phone: fromMap.phone || "",
    sms: fromMap.sms || false,
    whatsapp: fromMap.whatsapp || false,
    email: fromMap.email || "",
    fb: fromMap.fb || "",
    insta: fromMap.insta || "",
    tiktok: fromMap.tiktok || "",
    address: fromMap.address || "",
    notes: fromMap.notes || "",
    history_flag: fromMap.historyFlag || "",
    fullName:
      fromMap.fullName ||
      `${fromMap.name || ""} ${fromMap.surname || ""}`.trim(),
  };
}

export function findDogByIdOrName(
  dogsById: Record<string, DbDogRow>,
  dogs: Record<string, Dog>,
  value: string | null,
): DbDogRow | { id: string; name: string; breed: string; age: string; size: string | null; human_id: string | null; alerts: string[]; groom_notes: string; custom_price: number | undefined } | null {
  if (!value) return null;
  if (dogsById?.[value]) return dogsById[value];

  const fromMap = Object.values(dogs || {}).find(
    (dog) => dog.id === value || dog.name === value,
  );
  if (fromMap) {
    return {
      id: fromMap.id,
      name: fromMap.name,
      breed: fromMap.breed,
      age: fromMap.age || "",
      size: fromMap.size || null,
      human_id: fromMap._humanId || fromMap.humanId || null,
      alerts: fromMap.alerts || [],
      groom_notes: fromMap.groomNotes || "",
      custom_price: fromMap.customPrice,
    };
  }

  return (
    Object.values(dogsById || {}).find((dog) => dog.name === value) || null
  );
}

// ============================================================
// DB-to-app transforms
// ============================================================

export function dbHumansToMap(
  rows: DbHumanRow[],
  trustedMap: Record<string, string[]>,
  trustedContactsMap: Record<string, TrustedContact[]> = {},
): Record<string, Human> {
  const map: Record<string, Human> = {};
  for (const row of rows) {
    const key = buildHumanFullName(row);
    map[key] = {
      id: row.id,
      name: row.name,
      surname: row.surname,
      fullName: key,
      phone: row.phone || "",
      sms: row.sms || false,
      whatsapp: row.whatsapp || false,
      email: row.email || "",
      fb: row.fb || "",
      insta: row.insta || "",
      tiktok: row.tiktok || "",
      address: row.address || "",
      notes: row.notes || "",
      historyFlag: row.history_flag || "",
      reminderHours: row.reminder_hours ?? 24,
      reminderChannels: row.reminder_channels || ["whatsapp"],
      trustedIds: trustedMap[row.id] || [],
      trustedContacts: trustedContactsMap[row.id] || [],
    };
  }
  return map;
}

export function buildHumansById(rows: DbHumanRow[]): Record<string, DbHumanRow & { fullName: string }> {
  const byId: Record<string, DbHumanRow & { fullName: string }> = {};
  for (const row of rows) {
    byId[row.id] = {
      ...row,
      fullName: buildHumanFullName(row),
    };
  }
  return byId;
}

export function dbDogsToMap(rows: DbDogRow[], humansById: Record<string, DbHumanRow & { fullName: string }>): Record<string, Dog> {
  const map: Record<string, Dog> = {};
  for (const row of rows) {
    const owner = humansById[row.human_id || ""];
    map[row.id] = {
      id: row.id,
      name: row.name,
      // Strip legacy placeholder breeds ("Unknown" / "N/A" / etc) so the
      // dogs directory shows the proper "No breed" hint and the
      // isIncompleteDogProfile filter flags the row for attention.
      breed: sanitiseFieldValue(row.breed),
      age: row.age || "",
      dob: row.dob || "",
      sex: row.sex || null,
      microchip: row.microchip || null,
      neutered: row.neutered ?? null,
      isPregnant: row.is_pregnant ?? null,
      vet: row.vet || null,
      colour: row.colour || null,
      size: (row.size as Dog["size"]) || null,
      humanId: owner ? owner.fullName : (row.human_id || ""),
      _humanId: row.human_id || null,
      alerts: row.alerts || [],
      groomNotes: row.groom_notes || "",
      customPrice: row.custom_price,
      lastGroomedDate: row.last_groomed_date || null,
    };
  }
  return map;
}

export function buildDogsById(rows: DbDogRow[]): Record<string, DbDogRow> {
  const byId: Record<string, DbDogRow> = {};
  for (const row of rows) {
    byId[row.id] = row;
  }
  return byId;
}

export function dbBookingsToArray(
  rows: DbBookingRow[],
  dogsById: Record<string, DbDogRow>,
  humansById: Record<string, DbHumanRow & { fullName: string }>,
  humans: Record<string, Human> | null = null,
): Booking[] {
  return rows.map((row) => {
    const dog = dogsById[row.dog_id] || {} as Partial<DbDogRow>;
    const ownerHuman = dog.human_id ? humansById[dog.human_id] : null;
    const pickupHuman = row.pickup_by_id
      ? findHumanByIdOrName(humansById, humans, row.pickup_by_id)
      : null;

    // Single source of truth: prefer live joined values, fall back to the
    // snapshot columns (set at insert time by trg_bookings_set_snapshots)
    // only when the linked dog or owner row is missing. resolveBookingDisplay
    // in engine/bookingRules.ts mirrors this logic for downstream consumers.
    //
    // Leave these fields empty when nothing resolves — never bake "Unknown"
    // into the stored booking object. The dogs/humans maps paginate, so the
    // join often misses on first paint and only resolves after
    // ensureDogsByIds/ensureHumansByIds populate the cache. Storing "Unknown"
    // would (a) leak into the card UI as a literal name, and (b) defeat the
    // "Unknown owner" sentinel check downstream consumers rely on.
    const dogNameSnapshot = row.dog_name_snapshot ?? null;
    const breedSnapshot = row.breed_snapshot ?? null;
    const ownerSnapshot = row.owner_name_snapshot ?? null;
    const breed = dog.breed || breedSnapshot || "";
    const owner = ownerHuman?.fullName || ownerSnapshot || "";

    // Reminder lifecycle. `confirmed` (the customer tapped the WhatsApp
    // Confirm button, persisted on bookings.reminder_confirmed_at) always
    // wins; otherwise a successfully-sent reminder row gives `sent`; else
    // `none`. failed/pending rows don't count — failures live on the
    // Delivery Failure card.
    const reminderLog = row.notification_log ?? [];
    const sentReminder =
      reminderLog
        .filter((n) => n.trigger_type === "reminder" && n.status === "sent")
        .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0] ?? null;
    const reminderState = row.reminder_confirmed_at
      ? "confirmed"
      : sentReminder
        ? "sent"
        : "none";

    return {
      id: row.id,
      slot: row.slot,
      dogName: dog.name || dogNameSnapshot || "",
      breed,
      size: row.size as Booking["size"],
      service: row.service as Booking["service"],
      owner,
      status: (row.status || BOOKING_STATUS.BOOKED) as Booking["status"],
      addons: row.addons || [],
      pickupBy: (pickupHuman as { fullName?: string } | null)?.fullName || ownerHuman?.fullName || ownerSnapshot || "",
      payment: row.payment || "Due at Pick-up",
      depositAmount: row.deposit_amount ?? null,
      confirmed: row.confirmed === true,
      dogNameSnapshot,
      breedSnapshot,
      ownerNameSnapshot: ownerSnapshot,
      whatsappConversationId: row.whatsapp_conversation_id ?? null,
      whatsappMessageId: row.whatsapp_message_id ?? null,
      staffCapacityOverride: row.staff_capacity_override === true,
      staffCapacityOverrideBy: row.staff_capacity_override_by ?? null,
      staffCapacityOverrideAt: row.staff_capacity_override_at ?? null,
      reminderConfirmedAt: row.reminder_confirmed_at ?? null,
      completedAt: row.completed_at ?? null,
      // Lifecycle derived above from notification_log + reminder_confirmed_at.
      // "read" stays null (no WhatsApp read receipt is captured).
      reminderState,
      reminderSentAt: sentReminder?.sent_at ?? null,
      reminderReadAt: null,
      reminderChannel: sentReminder?.channel ?? null,
      reminderConfirmedBy: null,
      _dogId: row.dog_id,
      _ownerId: dog.human_id || null,
      _pickupById: row.pickup_by_id,
      _bookingDate: row.booking_date,
      _groupId: row.group_id || null,
    };
  });
}

// ============================================================
// Config transforms
// ============================================================

export function dbConfigToApp(row: DbConfigRow | null): SalonConfig | null {
  if (!row) return null;
  const defaults = createDefaultSalonConfig();
  const settings = mergeSalonSettings(row.settings);
  return {
    ...defaults,
    ...settings,
    defaultPickupOffset: row.default_pickup_offset ?? defaults.defaultPickupOffset,
    pricing: row.pricing || defaults.pricing,
    enforceCapacity: row.enforce_capacity ?? defaults.enforceCapacity,
    dailyDogCap: row.daily_dog_cap ?? defaults.dailyDogCap,
    largeDogSlots: (row.large_dog_slots || defaults.largeDogSlots) as SalonConfig["largeDogSlots"],
  };
}

export function appConfigToDb(config: SalonConfig): DbConfigOut {
  const defaults = createDefaultSalonConfig();
  const settings = mergeSalonSettings(config);
  return {
    default_pickup_offset: config.defaultPickupOffset ?? defaults.defaultPickupOffset,
    pricing: config.pricing || defaults.pricing,
    enforce_capacity: config.enforceCapacity ?? defaults.enforceCapacity,
    daily_dog_cap: config.dailyDogCap ?? defaults.dailyDogCap,
    large_dog_slots: config.largeDogSlots || defaults.largeDogSlots,
    settings,
  };
}

export function toDateStr(date: Date | string): string {
  if (typeof date === "string") return date;
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    if (import.meta.env?.DEV) console.warn("toDateStr received invalid date:", date);
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
