// Shared email sender for SendGrid. Used by all notify-* functions.
// Reads SENDGRID_API_KEY and SENDGRID_FROM_EMAIL at module load.

const SENDGRID_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const SENDGRID_FROM = Deno.env.get("SENDGRID_FROM_EMAIL")!;

export interface EmailSendResult {
  ok: boolean;
  status: number;
  /** Provider reason when the send was not accepted. Null on success. */
  errorMessage: string | null;
}

function boundProviderText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed;
}

/**
 * Send one plain-text email. `ok` is true only when SendGrid accepts it
 * (HTTP 2xx). A rejection carries SendGrid's message so notification_log
 * can record the real reason rather than a generic failure.
 */
export async function sendEmailDetailed(
  to: string,
  subject: string,
  text: string,
): Promise<EmailSendResult> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SENDGRID_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM, name: "Smarter Dog Grooming" },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });
  const ok = res.status >= 200 && res.status < 300;
  if (ok) return { ok: true, status: res.status, errorMessage: null };

  let errorMessage = `SendGrid HTTP ${res.status}`;
  try {
    const body = await res.json();
    const first = body?.errors?.[0]?.message;
    if (typeof first === "string" && first.trim()) {
      errorMessage = `SendGrid HTTP ${res.status}: ${boundProviderText(first)}`;
    }
  } catch {
    // Non-JSON error body — the status line is the error we can record.
  }
  return { ok: false, status: res.status, errorMessage };
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  return (await sendEmailDetailed(to, subject, text)).ok;
}
