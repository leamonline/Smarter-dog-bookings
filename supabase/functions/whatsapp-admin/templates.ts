// Pure helpers for whatsapp-admin's template-management actions.
// Kept free of Deno/HTTP/Supabase imports so they run under `deno test`.

// The DB whatsapp_templates.status CHECK allows exactly these values.
export type TemplateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled";

// The DB whatsapp_templates.category CHECK allows exactly these values.
export const ALLOWED_CATEGORIES = new Set([
  "UTILITY",
  "MARKETING",
  "AUTHENTICATION",
]);

// Map Meta's UPPERCASE template status to our lowercase DB enum. Unknown /
// unset statuses fall back to 'pending' so the broadcast gate stays CLOSED
// (it only opens on exactly 'approved') — never fail open.
export function mapMetaStatus(metaStatus: string | null | undefined): TemplateStatus {
  switch ((metaStatus ?? "").toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "DISABLED":
    case "DELETED":
    case "PENDING_DELETION":
      return "disabled";
    case "PAUSED":
    case "LIMIT_EXCEEDED":
    case "FLAGGED":
    case "IN_APPEAL":
      return "paused";
    case "PENDING":
    default:
      return "pending";
  }
}

// Normalise a Meta category string to our allowed set, or null if it isn't one
// we store (so callers can skip writing an out-of-domain value that would trip
// the CHECK constraint).
export function normaliseCategory(category: string | null | undefined): string | null {
  const c = (category ?? "").toUpperCase();
  return ALLOWED_CATEGORIES.has(c) ? c : null;
}
