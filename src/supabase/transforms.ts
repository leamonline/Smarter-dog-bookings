/**
 * Convert DB rows to the component-friendly shapes the app expects.
 * Components use name-keyed maps and camelCase; DB uses UUID FKs and snake_case.
 */

import type { Human, Dog, Booking, SalonConfig } from "../types/index.js";

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
  size: string | null;
  human_id: string | null;
  alerts: string[] | null;
  groom_notes: string | null;
  custom_price: number | undefined;
}

interface DbBookingRow {
  id: string;
  slot: string;
  size: string;
  service: string;
  status: string | null;
  addons: string[] | null;
  payment: string | null;
  confirmed: boolean | null;
  dog_id: string;
  pickup_by_id: string | null;
  booking_date: string;
  chain_id: string | null;
}

interface DbConfigRow {
  default_pickup_offset: number | null;
  pricing: Record<string, Record<string, string>> | null;
  enforce_capacity: boolean | null;
  large_dog_slots: Record<string, unknown> | null;
}

interface DbConfigOut {
  default_pickup_offset: number;
  pricing: Record<string, Record<string, string>>;
  enforce_capacity: boolean;
  large_dog_slots: Record<string, unknown>;
}

// ============================================================
// Helpers
// ============================================================

function buildHumanFullName(row: DbHumanRow): string {
  return `${row.name} ${row.surname}`;
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

export function dbHumansToMap(rows: DbHumanRow[], trustedMap: Record<string, string[]>): Record<string, Human> {
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
    map[row.name] = {
      id: row.id,
      name: row.name,
      breed: row.breed,
      age: row.age || "",
      dob: row.dob || null,
      size: (row.size as Dog["size"]) || null,
      humanId: owner ? owner.fullName : (row.human_id || ""),
      _humanId: row.human_id || null,
      alerts: row.alerts || [],
      groomNotes: row.groom_notes || "",
      customPrice: row.custom_price,
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

    return {
      id: row.id,
      slot: row.slot,
      dogName: dog.name || "Unknown",
      breed: dog.breed || "",
      size: row.size as Booking["size"],
      service: row.service as Booking["service"],
      owner: ownerHuman?.fullName || "Unknown",
      status: (row.status || "No-show") as Booking["status"],
      addons: row.addons || [],
      pickupBy: (pickupHuman as { fullName?: string } | null)?.fullName || ownerHuman?.fullName || "",
      payment: row.payment || "Due at Pick-up",
      confirmed: row.confirmed === true,
      _dogId: row.dog_id,
      _ownerId: dog.human_id || null,
      _pickupById: row.pickup_by_id,
      _bookingDate: row.booking_date,
      _chainId: row.chain_id || null,
    };
  });
}

// ============================================================
// Config transforms
// ============================================================

export function dbConfigToApp(row: DbConfigRow | null): SalonConfig | null {
  if (!row) return null;
  return {
    defaultPickupOffset: row.default_pickup_offset || 120,
    pricing: row.pricing || {},
    enforceCapacity: row.enforce_capacity !== false,
    largeDogSlots: (row.large_dog_slots || {}) as SalonConfig["largeDogSlots"],
  };
}

export function appConfigToDb(config: SalonConfig): DbConfigOut {
  return {
    default_pickup_offset: config.defaultPickupOffset,
    pricing: config.pricing,
    enforce_capacity: config.enforceCapacity,
    large_dog_slots: config.largeDogSlots,
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
