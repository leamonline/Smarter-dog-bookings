// Pure helpers for WhatsApp message-template state, shared by whatsapp-admin
// (which submits templates and reconciles them by polling Meta) and
// whatsapp-webhook (which applies Meta's push notifications of status changes).
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

// ── message_template_status_update webhook ───────────────────────────────────
//
// The webhook's `event` vocabulary is WIDER than the status vocabulary that
// GET /{waba-id}/message_templates returns: it also carries lifecycle signals
// (ARCHIVED, LOCKED, REINSTATED) the list endpoint never emits.
//
// It also needs the OPPOSITE default from mapMetaStatus. That function
// reconciles a full authoritative list, so every row it touches gets a fresh
// status and an unknown value can safely fail closed to 'pending'. A webhook is
// a *delta* — applying 'pending' to an event we don't recognise would DOWNGRADE
// an already-approved template and silently shut the broadcast gate the next
// time Meta invents an event name. So unknown events return null, meaning
// "no status information", and the caller leaves the row untouched.
export function mapTemplateStatusEvent(
  event: string | null | undefined,
): TemplateStatus | null {
  switch ((event ?? "").toUpperCase()) {
    case "APPROVED":
    // "No longer flagged or disabled and can be sent in template messages
    // again" — the one event that re-opens the gate on its own.
    case "REINSTATED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PENDING":
      return "pending";
    case "PAUSED":
    case "FLAGGED":
    case "LIMIT_EXCEEDED":
    case "IN_APPEAL":
      return "paused";
    case "DISABLED":
    case "DELETED":
    case "PENDING_DELETION":
    case "ARCHIVED":
      return "disabled";
    // LOCKED means "cannot be edited" — it says nothing about whether the
    // template can still be SENT, so it must not move `status`. Same for
    // anything Meta adds later.
    default:
      return null;
  }
}

// Meta writes template locales both ways — the webhook reference shows
// "en-US" while our rows (and Meta's own create API) use "en_GB". Normalise to
// the underscore form so name+language matching finds the row.
export function normaliseTemplateLanguage(language: string): string {
  return language.trim().replace(/-/g, "_");
}

// `reason` is an enum-ish code (INVALID_FORMAT, ABUSIVE_CONTENT…) and is the
// literal string "NONE" when nothing is wrong. `rejection_info.reason` is the
// human-readable explanation, present only on INVALID_FORMAT rejections —
// prefer it when Meta sends it.
function extractRejectionReason(value: Record<string, unknown>): string | null {
  const info = value.rejection_info;
  if (info && typeof info === "object") {
    const detail = (info as Record<string, unknown>).reason;
    if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 500);
  }
  const code = value.reason;
  if (typeof code === "string" && code.trim() && code.trim().toUpperCase() !== "NONE") {
    return code.trim().slice(0, 500);
  }
  return null;
}

export interface TemplateStatusUpdate {
  name: string;
  language: string;
  status: TemplateStatus;
  metaId: string | null;
  category: string | null;
  rejectionReason: string | null;
}

// Turn a `message_template_status_update` change's `value` object into the
// fields to write onto whatsapp_templates, or null when the payload carries
// nothing we can act on (missing name/language, or an event with no status
// meaning). Pure — the caller owns the DB write.
export function parseTemplateStatusEvent(value: unknown): TemplateStatusUpdate | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const name = typeof v.message_template_name === "string" ? v.message_template_name.trim() : "";
  const rawLanguage =
    typeof v.message_template_language === "string" ? v.message_template_language.trim() : "";
  if (!name || !rawLanguage) return null;

  const status = mapTemplateStatusEvent(typeof v.event === "string" ? v.event : null);
  if (!status) return null;

  // Meta sends message_template_id as a JSON number; the column is text.
  const rawId = v.message_template_id;
  const metaId =
    typeof rawId === "string" && rawId.trim()
      ? rawId.trim()
      : typeof rawId === "number" && Number.isFinite(rawId)
        ? String(rawId)
        : null;

  return {
    name,
    language: normaliseTemplateLanguage(rawLanguage),
    status,
    metaId,
    category: normaliseCategory(
      typeof v.message_template_category === "string" ? v.message_template_category : null,
    ),
    // Only a rejection carries a reason worth keeping; every other transition
    // clears the previous one so a stale rejection can't outlive an approval.
    rejectionReason: status === "rejected" ? extractRejectionReason(v) : null,
  };
}
