/* push-sw.js — Staff Web Push handler.
 *
 * This file is pulled into the generated Workbox service worker via
 * `workbox.importScripts` in vite.config.js. It runs in the SAME service
 * worker scope that already precaches the SPA — it only ADDS `push` and
 * `notificationclick` listeners, and never touches fetch/precache.
 *
 * It is intentionally framework-free, dependency-free, and defensive:
 * a malformed or empty push payload must still render *some* notification
 * (iOS/Safari drops a subscription if a push event finishes without one).
 *
 * Payload contract (JSON, produced by the notify-staff edge function):
 *   { title: string, body: string, url?: string, tag?: string, icon?: string }
 *
 * Only STAFF devices ever hold a subscription to this SW, so there is no
 * customer-facing behaviour here.
 */

const PUSH_ICON = "/icons/icon-192.png";
const PUSH_BADGE = "/icons/icon-192.png";
const DEFAULT_URL = "/staff/";

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (_err) {
      // Fall back to treating the raw bytes as a plain-text body.
      try {
        payload = { body: event.data.text() };
      } catch (_err2) {
        payload = {};
      }
    }
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title
      : "Smarter Dog";
  const body =
    typeof payload.body === "string" ? payload.body : "";
  const url =
    typeof payload.url === "string" && payload.url ? payload.url : DEFAULT_URL;
  // Coalesce same-tag notifications (iOS replaces an existing one with the
  // same tag rather than stacking). The edge function sets a stable tag per
  // conversation/event so bursts don't pile up on the lock screen.
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : undefined;
  const icon =
    typeof payload.icon === "string" && payload.icon ? payload.icon : PUSH_ICON;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: PUSH_BADGE,
      tag,
      // Re-alert even when a tagged notification is replaced.
      renotify: tag ? true : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : DEFAULT_URL;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer an already-open STAFF window. This origin also serves the
      // customer portal under /customer/* (same SW scope), so without this
      // filter a notification click could yank a customer-portal tab over to
      // the staff inbox. Fall back to any focusable window only if no staff
      // window is open.
      const isStaffWindow = (c) => {
        try {
          return new URL(c.url).pathname.startsWith("/staff");
        } catch (_err) {
          return true;
        }
      };
      const target =
        allClients.find((c) => "focus" in c && isStaffWindow(c)) ||
        allClients.find((c) => "focus" in c);

      if (target) {
        // Soft client-side navigation: ask the focused staff window to route
        // via React Router (no full reload, so an unsaved compose draft or
        // scroll position survives). The old hard target.navigate() reload is
        // gone; a stale client without the message listener simply gets
        // focused, which self-heals on its next load.
        if (targetUrl) {
          try {
            target.postMessage({ type: "sw-navigate", url: targetUrl });
          } catch (_err) {
            // postMessage unsupported — focusing the window is the fallback.
          }
        }
        return target.focus();
      }

      // Nothing open — open a fresh window at the target.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })(),
  );
});
