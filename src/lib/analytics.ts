// ============================================================
// Product analytics (PostHog) — customer booking funnel only.
//
// A MIRROR of the booking-funnel telemetry, not a replacement for it.
// booking_funnel_events (src/lib/funnelSession.ts + the wizard's fireFunnel)
// stays the source of truth for the staff Funnel report. PostHog adds what a
// table cannot do cheaply: funnel charts, time-to-convert, breakdowns by
// device / browser / referring domain, and a feed for the weekly brief.
//
// Privacy design — why this needs no cookie banner:
//   - persistence "memory": nothing is written to cookies, localStorage or
//     sessionStorage, so PECR's storage-consent rule is not engaged. The
//     cost is that PostHog's own distinct id lives for one page load; funnels
//     aggregate by the `funnel_session_id` property instead, which is the
//     same per-attempt id the database uses.
//   - person_profiles "never", and identify() is never called: no customer
//     record, name, phone, email or humans.id is ever sent.
//   - autocapture, pageviews, session replay, surveys, feature flags and
//     external script loading are all off. Only the events we name go out.
//   - beforeSend trims URLs to origin + path and blanks UUIDs, and drops the
//     full referrer (it can carry a magic-link token); the referring DOMAIN
//     is kept for attribution.
//   - EU host by default, matching Sentry's EU region.
//
// Off unless VITE_POSTHOG_KEY is set, the build is production, and the app
// is not forced offline — so tests, `npm run dev` and E2E never load it.
// posthog-js is dynamically imported, keeping it out of the staff bundle
// and the customer portal's first paint.
//
// Every public function swallows its own failures: analytics must never
// surface into the booking wizard.
// ============================================================

type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

/** The slice of the posthog-js client this module uses. */
export interface AnalyticsClient {
  capture: (event: string, properties?: Record<string, unknown>) => unknown;
}

interface PostHogLike extends AnalyticsClient {
  init: (key: string, config: Record<string, unknown>) => unknown;
}

export interface AnalyticsEnv {
  key?: string;
  host?: string;
  prod: boolean;
  forceOffline?: string;
}

export const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

const UUID_RE = /\b[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi;

function readEnv(): AnalyticsEnv {
  const env = import.meta.env;
  return {
    key: env.VITE_POSTHOG_KEY,
    host: env.VITE_POSTHOG_HOST,
    prod: Boolean(env.PROD),
    forceOffline: env.VITE_FORCE_OFFLINE,
  };
}

export function isAnalyticsEnabled(env: AnalyticsEnv = readEnv()): boolean {
  return Boolean(env.key) && env.prod && env.forceOffline !== "1";
}

/**
 * Reduce a URL to origin + path with UUIDs blanked. Query strings and
 * hashes are dropped outright: they are where tokens and ids tend to ride.
 */
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(UUID_RE, ":id")}`;
  } catch {
    return value.split(/[?#]/)[0].replace(UUID_RE, ":id");
  }
}

interface CaptureResultLike {
  properties?: Record<string, unknown>;
  $set?: unknown;
  $set_once?: unknown;
}

/** PostHog before_send hook: strip anything URL-shaped that could identify. */
export function scrubEvent<T extends CaptureResultLike | null>(event: T): T {
  if (!event) return event;
  const props = event.properties;
  if (props) {
    for (const key of ["$current_url", "$pathname", "$initial_current_url"]) {
      if (key in props) props[key] = scrubUrl(props[key]);
    }
    delete props.$referrer;
    delete props.$initial_referrer;
  }
  // person_profiles "never" already stops these being processed; belt and braces.
  delete event.$set;
  delete event.$set_once;
  return event;
}

export function buildPostHogConfig(host: string, distinctId?: string): Record<string, unknown> {
  return {
    api_host: host,
    persistence: "memory",
    person_profiles: "never",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_performance: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    before_send: scrubEvent,
    ...(distinctId ? { bootstrap: { distinctID: distinctId } } : {}),
  };
}

let clientPromise: Promise<AnalyticsClient | null> | null = null;

type Loader = () => Promise<PostHogLike>;

const defaultLoader: Loader = async () => (await import("posthog-js")).default as unknown as PostHogLike;

/**
 * Lazily initialise the client on first use. `distinctId` seeds PostHog's
 * id with the current funnel attempt so per-person views line up with the
 * database's session_id for the first attempt on a page load.
 */
function getClient(distinctId: string | undefined, env: AnalyticsEnv, load: Loader): Promise<AnalyticsClient | null> {
  if (!isAnalyticsEnabled(env)) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = load()
      .then((posthog) => {
        posthog.init(env.key as string, buildPostHogConfig(env.host || DEFAULT_POSTHOG_HOST, distinctId));
        return posthog as AnalyticsClient;
      })
      .catch(() => null);
  }
  return clientPromise;
}

/** Drop undefined values so PostHog doesn't record empty keys. */
function compact(properties: AnalyticsProperties): Record<string, AnalyticsValue> {
  const out: Record<string, AnalyticsValue> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export interface FunnelAnalyticsEvent {
  sessionId: string;
  step: string;
  stepIndex: number;
  dogCount: number | null;
  blockedReason?: string;
  failureCode?: string;
}

/**
 * Mirror one booking-funnel row to PostHog as `booking_funnel_step`.
 *
 * Deliberately omits humanId and failureDetail: the first identifies the
 * customer, the second is free text that could carry anything.
 */
export function trackFunnelStep(
  event: FunnelAnalyticsEvent,
  env: AnalyticsEnv = readEnv(),
  load: Loader = defaultLoader,
): void {
  try {
    getClient(event.sessionId, env, load)
      .then((client) => {
        client?.capture(
          "booking_funnel_step",
          compact({
            funnel_session_id: event.sessionId,
            step: event.step,
            step_index: event.stepIndex,
            dog_count: event.dogCount,
            blocked_reason: event.blockedReason,
            failure_code: event.failureCode,
          }),
        );
      })
      .catch(() => {});
  } catch {
    /* analytics must never surface into the wizard */
  }
}

/** Test seam: forget the cached client. */
export function resetAnalyticsForTests(): void {
  clientPromise = null;
}
