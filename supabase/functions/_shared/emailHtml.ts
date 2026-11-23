// Branded HTML for the salon's emails: the flyer visual language, step 4
// (docs/plans/active/2026-11-22-flyer-visual-language.md). Every email keeps
// its plain-text body word for word; this wraps the same words in the flyer's
// look and is sent alongside the text, never instead of it.
//
// Pure: no Deno or network access, so it can be tested anywhere.
//
// Email clients are not browsers, so the rules here are deliberate:
// - Tables and inline styles only; no <style> block, no web fonts, no images.
//   Poppins and Montserrat show where the reader has them, Arial otherwise.
// - The stripe is coloured table cells, so it shows even with images blocked.
// - Colour-only meaning is never used; the button is a real link with words.
// - Every piece of customer text is escaped before it reaches the markup.

import { CUSTOMER_PORTAL_URL, SALON_LOCATION } from "./salonConstants.ts";

// The flyer palette (src/index.css in the booking app). Contrast on the pairs
// used: ink on white 16.5:1, ink on yellow 10.9:1, muted on paper 5.1:1,
// brand blue on white 6.2:1.
export const EMAIL_COLOURS = {
  paper: "#F7EFE6",
  card: "#FFFFFF",
  ink: "#1F1F1F",
  muted: "#57677C",
  flyerBlue: "#5595DC",
  navy: "#1F4E8C",
  yellow: "#FECC13",
  brandBlue: "#2A62A8",
} as const;

const HEADING_FONT = "Poppins, Montserrat, Arial, Helvetica, sans-serif";
const BODY_FONT = "Montserrat, Arial, Helvetica, sans-serif";

export const PORTAL_BUTTON_LABEL = "Book or manage online";

export interface EmailHtmlOptions {
  /** The email's subject, used as the document title. */
  subject: string;
  /**
   * Where the yellow button goes. Omit for emails that are not for customers
   * (the staff waitlist alert), which get no button.
   */
  portalUrl?: string | null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Finds web addresses in the raw text and escapes every piece separately, so
// a link and the words around it are both safe in the markup. Trailing
// sentence punctuation stays outside the link.
const URL_PATTERN = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)]/g;

function escapeAndLink(raw: string): string {
  let out = "";
  let last = 0;
  for (const match of raw.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    out += escapeHtml(raw.slice(last, start));
    const url = escapeHtml(match[0]);
    out += `<a href="${url}" style="color:${EMAIL_COLOURS.brandBlue};text-decoration:underline;">${url}</a>`;
    last = start + match[0].length;
  }
  return out + escapeHtml(raw.slice(last));
}

function paragraphs(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const body = escapeAndLink(block.trim()).replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;">${body}</p>`;
    })
    .join("\n");
}

// The flyer's segmented stripe: nine segments, two of them double width, as in
// the booking app's BrandStripe. Widths are percentages of the row, with 1%
// gaps: 7 x 8.2% + 2 x 17.3% + 8 x 1% = 100%.
const STRIPE: Array<[string, string]> = [
  [EMAIL_COLOURS.flyerBlue, "8.2%"],
  [EMAIL_COLOURS.flyerBlue, "17.3%"],
  [EMAIL_COLOURS.yellow, "8.2%"],
  [EMAIL_COLOURS.flyerBlue, "8.2%"],
  [EMAIL_COLOURS.navy, "8.2%"],
  [EMAIL_COLOURS.flyerBlue, "17.3%"],
  [EMAIL_COLOURS.flyerBlue, "8.2%"],
  [EMAIL_COLOURS.flyerBlue, "8.2%"],
  [EMAIL_COLOURS.yellow, "8.2%"],
];

function stripe(): string {
  const cells = STRIPE.map(([colour, width], index) => {
    const segment =
      `<td width="${width}" height="7" bgcolor="${colour}" ` +
      `style="background:${colour};height:7px;line-height:7px;font-size:0;border-radius:3px;">&nbsp;</td>`;
    const gap = index < STRIPE.length - 1
      ? `<td width="1%" style="font-size:0;line-height:0;">&nbsp;</td>`
      : "";
    return segment + gap;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" aria-hidden="true"><tr>${cells}</tr></table>`;
}

function portalButton(url: string): string {
  const href = escapeHtml(url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr>` +
    `<td bgcolor="${EMAIL_COLOURS.yellow}" style="background:${EMAIL_COLOURS.yellow};border-radius:999px;">` +
    `<a href="${href}" style="display:inline-block;padding:14px 26px;font-family:${BODY_FONT};font-size:16px;font-weight:700;` +
    `line-height:20px;color:${EMAIL_COLOURS.ink};text-decoration:none;border-radius:999px;">${PORTAL_BUTTON_LABEL}</a>` +
    `</td></tr></table>`
  );
}

// The inbox preview line: the start of the message, so it reads the same as
// the plain-text version.
function preheader(text: string): string {
  const firstLine = text.trim().split(/\n/)[0] ?? "";
  const short = firstLine.length > 110 ? `${firstLine.slice(0, 107)}...` : firstLine;
  return escapeHtml(short);
}

/** The HTML version of one plain-text email. */
export function renderEmailHtml(text: string, options: EmailHtmlOptions): string {
  const { subject, portalUrl } = options;
  const button = portalUrl ? portalButton(portalUrl) : "";
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLOURS.paper};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader(text)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLOURS.paper}" style="background:${EMAIL_COLOURS.paper};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 0 18px;">${stripe()}</td></tr>
<tr><td style="padding:0 4px 16px;font-family:${HEADING_FONT};font-size:22px;line-height:28px;font-weight:700;color:${EMAIL_COLOURS.ink};">Smarter Dog Grooming</td></tr>
<tr><td bgcolor="${EMAIL_COLOURS.card}" style="background:${EMAIL_COLOURS.card};border-radius:16px;padding:28px;font-family:${BODY_FONT};font-size:16px;line-height:25px;color:${EMAIL_COLOURS.ink};">
${paragraphs(text)}
${button}
</td></tr>
<tr><td style="padding:16px 4px 0;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${EMAIL_COLOURS.muted};">${escapeHtml(SALON_LOCATION.name)} &middot; ${escapeHtml(SALON_LOCATION.address)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The customer portal link the button uses, overridable per environment. */
export function portalUrlFrom(envValue: string | undefined | null): string {
  const trimmed = (envValue ?? "").trim();
  return trimmed || CUSTOMER_PORTAL_URL;
}
