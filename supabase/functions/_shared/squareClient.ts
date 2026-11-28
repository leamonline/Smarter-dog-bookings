// Square Payments API, sandbox unless SQUARE_ENVIRONMENT is exactly "production".
//
// The iPhone app sends a nonce from the In-App Payments SDK (a card or Apple
// Pay). This server charges £10 with that nonce. The nonce is not a card
// number and is never stored. There is no App Store purchase: grooming is a
// physical service, and the money is a deposit for that appointment.

export const SQUARE_API_VERSION = "2024-12-18";
export const SQUARE_DEPOSIT_PENCE = 1000;
export const SQUARE_DEPOSIT_CURRENCY = "GBP";

const SANDBOX = "https://connect.squareupsandbox.com";
const PRODUCTION = "https://connect.squareup.com";

export function depositsEnabled(): boolean {
  return Deno.env.get("IOS_DEPOSITS_ENABLED") === "true";
}

/** Sandbox unless the environment is explicitly production. */
export function squareApiBase(): string {
  return Deno.env.get("SQUARE_ENVIRONMENT") === "production" ? PRODUCTION : SANDBOX;
}

export function squareConfigured(): boolean {
  return Boolean(Deno.env.get("SQUARE_ACCESS_TOKEN") && Deno.env.get("SQUARE_LOCATION_ID"));
}

export interface SquareCallResult {
  /** COMPLETED, FAILED, CANCELED, PENDING, or null when Square was not reached. */
  status: string | null;
  id: string | null;
  amountPence: number | null;
  currency: string | null;
  error: string | null;
}

interface MoneyBody {
  payment?: {
    id?: string;
    status?: string;
    amount_money?: { amount?: number; currency?: string };
  };
  refund?: {
    id?: string;
    status?: string;
    amount_money?: { amount?: number; currency?: string };
  };
  errors?: { detail?: string; code?: string }[];
}

function errorText(body: MoneyBody | null, fallback: string): string {
  const parts = (body?.errors ?? [])
    .map((error) => error.detail || error.code)
    .filter((part): part is string => Boolean(part));
  return (parts.join("; ") || fallback).slice(0, 500);
}

async function squarePost(
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<{ response: Response | null; parsed: MoneyBody | null; error: string | null }> {
  const token = Deno.env.get("SQUARE_ACCESS_TOKEN");
  if (!token || !Deno.env.get("SQUARE_LOCATION_ID")) {
    return { response: null, parsed: null, error: "square_not_configured" };
  }

  let lastError = "square_unreachable";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(`${squareApiBase()}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Square-Version": SQUARE_API_VERSION,
        },
        body: JSON.stringify(body),
      });
      const parsed = await response.json().catch(() => null) as MoneyBody | null;
      if (response.status >= 500 && attempt === 0) {
        lastError = errorText(parsed, `square_http_${response.status}`);
        continue;
      }
      return { response, parsed, error: response.ok ? null : errorText(parsed, `square_http_${response.status}`) };
    } catch {
      lastError = "square_unreachable";
    }
  }
  return { response: null, parsed: null, error: lastError };
}

/** Charge the deposit. sourceId is a Square nonce, never a PAN. */
export async function createSquarePayment(
  input: { sourceId: string; idempotencyKey: string; bookingId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SquareCallResult> {
  const locationId = Deno.env.get("SQUARE_LOCATION_ID");
  const { response, parsed, error } = await squarePost("/v2/payments", {
    source_id: input.sourceId,
    idempotency_key: input.idempotencyKey,
    amount_money: { amount: SQUARE_DEPOSIT_PENCE, currency: SQUARE_DEPOSIT_CURRENCY },
    location_id: locationId,
    reference_id: input.bookingId,
    note: "Smarter Dog grooming deposit",
    autocomplete: true,
  }, fetchImpl);

  if (!response) return { status: null, id: null, amountPence: null, currency: null, error };
  const payment = parsed?.payment;
  return {
    status: payment?.status ?? (response.ok ? null : "FAILED"),
    id: payment?.id ?? null,
    amountPence: payment?.amount_money?.amount ?? null,
    currency: payment?.amount_money?.currency ?? null,
    error,
  };
}

/** Refund a deposit Square has already captured. */
export async function refundSquarePayment(
  input: { paymentId: string; idempotencyKey: string; amountPence: number; reason: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SquareCallResult> {
  const { response, parsed, error } = await squarePost("/v2/refunds", {
    idempotency_key: input.idempotencyKey,
    payment_id: input.paymentId,
    amount_money: { amount: input.amountPence, currency: SQUARE_DEPOSIT_CURRENCY },
    reason: input.reason.slice(0, 192),
  }, fetchImpl);

  if (!response) return { status: null, id: null, amountPence: null, currency: null, error };
  const refund = parsed?.refund;
  return {
    status: refund?.status ?? (response.ok ? null : "FAILED"),
    id: refund?.id ?? null,
    amountPence: refund?.amount_money?.amount ?? null,
    currency: refund?.amount_money?.currency ?? null,
    error,
  };
}
