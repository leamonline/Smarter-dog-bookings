// Shared helpers and types for the useHumans surface. Extracted from the
// monolithic hook (Debt #5) so the smaller sub-hooks can reuse them without
// dragging the rest of the directory state along — same precedent as
// inbox/helpers.js.
import type { Dispatch, SetStateAction } from "react";
import { sanitiseFieldValue } from "../../../utils/sanitiseFieldValue";

// The `humans` map is fullName-keyed (HumansView iterates Object.values,
// buildSearchEntries/formatOwnerLabel look up by fullName); `humansById` is
// UUID-keyed. Both hold the same entry objects.
export type HumansMap = Record<string, any>;
export type SetHumansMap = Dispatch<SetStateAction<HumansMap>>;

export type TrustedContact = {
  id: string;
  fullName: string;
  relationship: string;
};

export function fullNameFromRow(row: {
  name?: string | null;
  surname?: string | null;
}): string {
  const name = sanitiseFieldValue(row.name);
  const surname = sanitiseFieldValue(row.surname);
  return name && surname ? `${name} ${surname}` : name || surname || "";
}

export function buildHumanMapEntry(row: any) {
  // Mirror buildHumanFullName() in transforms.ts. Strips placeholder
  // tokens ("Null", "Unknown", "None", etc.) via sanitiseFieldValue
  // rather than coercing to a literal "Andrea null" heading.
  const name = sanitiseFieldValue(row.name);
  const surname = sanitiseFieldValue(row.surname);
  const fullName = name && surname ? `${name} ${surname}` : name || surname;
  return {
    id: row.id,
    name: row.name,
    surname: row.surname,
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
    reminderChannels: row.reminder_channels || ["whatsapp"],
    archivedAt: row.archived_at || null,
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
