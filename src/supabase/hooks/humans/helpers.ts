// Shared helpers and types for the useHumans surface. Extracted from the
// monolithic hook (Debt #5) so the smaller sub-hooks can reuse them without
// dragging the rest of the directory state along — same precedent as
// inbox/helpers.js.
import type { Dispatch, SetStateAction } from "react";
import { sanitiseFieldValue } from "../../../utils/sanitiseFieldValue";
import type { DbHumanRow } from "../../transforms";
import type { Human } from "../../../types/index";

export type TrustedContact = {
  id: string;
  fullName: string;
  relationship: string;
};

/**
 * A humans row as the hooks receive it: the full `select("*")` row, the
 * search_humans_directory projection (which omits the signup columns), or a
 * pseudo-row built offline. Only the id is guaranteed.
 */
export type HumanRowLike = Omit<{ [K in keyof DbHumanRow]?: DbHumanRow[K] | null }, "reminder_channels"> & {
  id: string;
  /** jsonb in the schema, so the generated row types it as Json; it is a string[] in practice. */
  reminder_channels?: unknown;
  archived_at?: string | null;
  heard_about_us?: string | null;
  approved_at?: string | null;
  signup_submitted_at?: string | null;
};

/** The app-shaped entry buildHumanMapEntry produces (a Human plus lifecycle fields). */
export interface HumanEntry extends Human {
  archivedAt?: string | null;
  heardAboutUs?: string | null;
  approvedAt?: string | null;
  signupSubmittedAt?: string | null;
}

/**
 * A raw row cached under its id with a display name attached. updateHuman
 * and addHuman write these into `humansById` so the next update can read
 * the row back without a round-trip; the lookup hooks write HumanEntry
 * objects into the same map. Both shapes carry `id` and `fullName`, which
 * is all the directory views and the owner lookups read.
 */
export type RawHumanCacheRow = HumanRowLike & { fullName: string };

export type HumanCacheEntry = HumanEntry | RawHumanCacheRow;

export function isRawHumanCacheRow(entry: HumanCacheEntry): entry is RawHumanCacheRow {
  // Only the app shape carries the camelCase lifecycle/reminder fields.
  return !("historyFlag" in entry);
}

// The `humans` map is fullName-keyed (HumansView iterates Object.values,
// buildSearchEntries/formatOwnerLabel look up by fullName) and always holds
// app-shaped entries. `humansById` is UUID-keyed and may hold either shape
// (see RawHumanCacheRow).
export type HumansMap = Record<string, HumanEntry>;
export type SetHumansMap = Dispatch<SetStateAction<HumansMap>>;
export type HumansByIdMap = Record<string, HumanCacheEntry>;
export type SetHumansByIdMap = Dispatch<SetStateAction<HumansByIdMap>>;

/** Patch accepted by updateHuman: any subset of the app shape plus the archive marker. */
export type HumanPatch = Partial<Omit<Human, "id" | "trustedContacts">> & {
  archivedAt?: string | null;
  /** Explicit contacts, or ids / names to resolve; objects may carry a relationship label. */
  trustedContacts?: Array<TrustedContact | { id: string; relationship?: string } | string>;
};

/** What the Add Human form and the New client wizard hand to addHuman. */
export interface NewHumanInput {
  name?: string | null;
  surname?: string | null;
  phone?: string | null;
  sms?: boolean | null;
  whatsapp?: boolean | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  reminderHours?: number | null;
  reminderChannels?: string[] | null;
}

/**
 * Map an app-shaped entry back to the row fields updateHuman reads when it
 * has nothing new from the database (a trusted-contacts-only save). Without
 * this a cache entry written by the lookup hooks would read as blank.
 */
export function humanEntryToRow(entry: HumanEntry): RawHumanCacheRow {
  return {
    id: entry.id,
    name: entry.name,
    surname: entry.surname,
    fullName: entry.fullName,
    phone: entry.phone,
    sms: entry.sms,
    whatsapp: entry.whatsapp,
    email: entry.email,
    fb: entry.fb,
    insta: entry.insta,
    tiktok: entry.tiktok,
    address: entry.address,
    notes: entry.notes,
    history_flag: entry.historyFlag,
    reminder_hours: entry.reminderHours,
    reminder_channels: entry.reminderChannels,
    preferred_slots: entry.preferredSlots ?? null,
    blocked_slots: entry.blockedSlots ?? null,
    deposit_required: entry.depositRequired ?? null,
    ai_whatsapp_allowed: entry.aiWhatsappAllowed ?? null,
    archived_at: entry.archivedAt ?? null,
  };
}

export function fullNameFromRow(row: {
  name?: string | null;
  surname?: string | null;
}): string {
  const name = sanitiseFieldValue(row.name);
  const surname = sanitiseFieldValue(row.surname);
  return name && surname ? `${name} ${surname}` : name || surname || "";
}

export function buildHumanMapEntry(row: HumanRowLike): HumanEntry {
  // Mirror buildHumanFullName() in transforms.ts. Strips placeholder
  // tokens ("Null", "Unknown", "None", etc.) via sanitiseFieldValue
  // rather than coercing to a literal "Andrea null" heading.
  const name = sanitiseFieldValue(row.name);
  const surname = sanitiseFieldValue(row.surname);
  const fullName = name && surname ? `${name} ${surname}` : name || surname;
  return {
    id: row.id,
    name: row.name ?? "",
    surname: row.surname ?? "",
    fullName,
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
    reminderChannels: (row.reminder_channels as string[] | null | undefined) || ["whatsapp"],
    // Booking rules (migration 20260714120000): staff-managed on the human
    // card; blocked slots are DB-enforced for non-staff, deposit_required
    // makes every booking await a bank-transfer deposit.
    preferredSlots: row.preferred_slots || [],
    blockedSlots: row.blocked_slots || [],
    depositRequired: row.deposit_required === true,
    archivedAt: row.archived_at || null,
    // "Where did you hear about us?" — captured at self-signup, read-only to
    // staff. Only on the full select("*") fetch (not the directory projection).
    heardAboutUs: row.heard_about_us || null,
    // "Join the Pack" self-signup state. approvedAt NULL + signupSubmittedAt
    // set = a pending signup awaiting staff approval (HumanHeader surfaces the
    // badge + approve/reject buttons). Both are absent on the directory RPC's
    // projection, so they only populate on the full select("*") fetch the
    // profile modal uses (fetchHumanById) — exactly where the UI needs them.
    approvedAt: row.approved_at ?? null,
    signupSubmittedAt: row.signup_submitted_at ?? null,
    trustedIds: [],
    trustedContacts: [],
  };
}
