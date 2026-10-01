/** Heuristic triage only: an unmatched message is not proof that no help is needed. */
export function isRequestText(text: string | null | undefined): boolean {
  const value = text?.trim() ?? "";
  if (!value || /^\[(?:reaction|book_entry|flow|reminder)/i.test(value)) return false;
  if (/^(?:reacted\b|thank(?:s| you)?(?:[.!\sx]|❤️|👍)*$|(?:ok(?:ay)?|great|perfect|lovely|yes|confirm|see you|on my way|i will be there)(?:[.!\sx]|❤️|👍)*$|(?:👍|❤️|[x\s])+$)/i.test(value)) return false;
  return /\?|\b(?:book(?:ing)?|rebook|appointment|availability|available|price|cancel|reschedule|slot|link|payment|pay)\b|\b(?:how much|can you|could you|do you)\b/i.test(value);
}

export interface RequestTail {
  closed_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  last_customer_text?: string | null;
  last_message_direction?: string | null;
  has_failed_message?: boolean;
}
export function unansweredRequestSince(c: RequestTail): string | null {
  if (c.closed_at || !c.last_inbound_at || !isRequestText(c.last_customer_text)) return null;
  const inbound = Date.parse(c.last_inbound_at);
  const outbound = c.last_outbound_at ? Date.parse(c.last_outbound_at) : -Infinity;
  if (!Number.isFinite(inbound) || (c.last_message_direction === "outbound" && !c.has_failed_message)) return null;
  if (outbound >= inbound && !c.has_failed_message) return null;
  return c.last_inbound_at;
}
