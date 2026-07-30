// useStaffPush — per-device Web Push registration for the STAFF app.
//
// Wraps the browser Push APIs and the staffPushRepo. Notification permission
// and pushManager.subscribe() MUST be triggered from a real user gesture
// (the "Enable notifications" tap) — never on mount — so subscribe() is only
// ever called from the button handler.
//
// iOS only delivers push to a Home-Screen-installed PWA (display: standalone),
// so the UI gates the enable button on `isStandalone`.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { logger } from "../lib/logger";
import { urlBase64ToUint8Array } from "../lib/push/urlBase64";
import {
  DEFAULT_STAFF_ALERT_PREFS,
  deleteSubscriptionByEndpoint,
  getPrefs,
  saveSubscription,
  upsertPrefs,
  type StaffAlertPrefs,
} from "../supabase/repositories/staffPushRepo";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushPermission = "default" | "granted" | "denied";

export interface UseStaffPush {
  /** Browser exposes serviceWorker + PushManager + Notification. */
  isSupported: boolean;
  /** App is running as an installed PWA (required for iOS push). */
  isStandalone: boolean;
  /** A VITE_VAPID_PUBLIC_KEY is present in the build. */
  vapidConfigured: boolean;
  permission: PushPermission;
  isSubscribed: boolean;
  busy: boolean;
  prefs: StaffAlertPrefs;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  setPref: (key: keyof StaffAlertPrefs, value: boolean) => Promise<boolean>;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return media || iosStandalone;
}

function detectSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function useStaffPush(userId: string | null | undefined): UseStaffPush {
  const [isSupported] = useState(detectSupported);
  const [isStandalone] = useState(detectStandalone);
  const [permission, setPermission] = useState<PushPermission>(() =>
    isSupported ? (Notification.permission as PushPermission) : "default",
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<StaffAlertPrefs>(DEFAULT_STAFF_ALERT_PREFS);

  const vapidConfigured = !!VAPID_PUBLIC_KEY;

  // Reflect existing subscription + load prefs on mount (no permission prompt).
  useEffect(() => {
    let cancelled = false;
    if (!isSupported || !userId) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setIsSubscribed(!!sub);
      } catch (err) {
        logger.error("useStaffPush: failed to read existing subscription", err);
      }

      if (supabase) {
        const { prefs: loaded } = await getPrefs(supabase, userId);
        if (!cancelled && loaded) setPrefs(loaded);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSupported, userId]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !isStandalone || !userId || !supabase) return false;
    if (!VAPID_PUBLIC_KEY) {
      logger.error("useStaffPush: VITE_VAPID_PUBLIC_KEY is not set");
      return false;
    }
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== "granted") return false;

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const json = sub.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const authKey = json.keys?.auth;
      if (!endpoint || !p256dh || !authKey) {
        logger.error("useStaffPush: subscription missing endpoint/keys");
        return false;
      }

      const { error } = await saveSubscription(supabase, {
        userId,
        endpoint,
        p256dh,
        auth: authKey,
        userAgent: navigator.userAgent,
      });
      if (error) {
        logger.error("useStaffPush: saveSubscription failed", error);
        return false;
      }

      // Ensure a prefs row exists (defaults all-on) so the toggles persist.
      await upsertPrefs(supabase, userId, prefs);
      setIsSubscribed(true);
      return true;
    } catch (err) {
      logger.error("useStaffPush: subscribe failed", err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [isSupported, isStandalone, userId, prefs]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !supabase) return false;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await deleteSubscriptionByEndpoint(supabase, endpoint);
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      logger.error("useStaffPush: unsubscribe failed", err);
      return false;
    } finally {
      setBusy(false);
    }
  }, [isSupported]);

  const setPref = useCallback(
    async (key: keyof StaffAlertPrefs, value: boolean): Promise<boolean> => {
      if (!userId || !supabase) return false;
      const previous = prefs;
      const next = { ...prefs, [key]: value };
      setPrefs(next); // optimistic
      const { error } = await upsertPrefs(supabase, userId, next);
      if (error) {
        logger.error("useStaffPush: failed to save prefs", error);
        setPrefs(previous); // revert
        return false;
      }
      return true;
    },
    [userId, prefs],
  );

  return {
    isSupported,
    isStandalone,
    vapidConfigured,
    permission,
    isSubscribed,
    busy,
    prefs,
    subscribe,
    unsubscribe,
    setPref,
  };
}
