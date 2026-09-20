// ============================================================
// src/lib/iosFocusZoom.js
//
// Stops iOS Safari zooming the page when a text field is focused.
//
// Every input, select and textarea already computes at 16px on a phone
// (src/index.css, unlayered, width-based), which is the documented way to
// keep iOS from zooming a field into legibility — and Chromium confirms
// 16px. A real iPhone zoomed on focus regardless: two screenshots of the
// same thread, before and after tapping the reply box, show the page at
// ~1.18× with the keyboard up. Once zoomed, every viewport height the
// Inbox reads is in zoomed pixels and Safari pans the visual viewport to
// chase the field, so no arrangement of the layout keeps the composer on
// screen. Three layout fixes (#885, #886, #887) each passed a simulation
// and failed on the device for this reason.
//
// `maximum-scale=1` in the viewport meta suppresses that automatic focus
// zoom. On iOS 10 and later it does NOT stop people pinch-zooming — Safari
// ignores maximum-scale and user-scalable for user gestures, deliberately,
// for accessibility — so it costs iOS users nothing. Chrome on Android
// honours maximum-scale and WOULD lose pinch-zoom, so this is applied to
// iOS only, at boot, rather than written into index.html for everyone.
//
// The field-size rules stay as the first line of defence; this is the
// second. The viewport readout (?vvdebug=1) shows `vv scale`, which should
// now read 1 with the keyboard up.
// ============================================================

/** True on iPhone, iPod and iPad — including iPadOS 13+, whose Safari sends a Mac user agent but reports touch points. */
export function isIOS(nav = typeof navigator === "undefined" ? null : navigator) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1;
}

const MAXIMUM_SCALE = "maximum-scale=1";

/**
 * Append maximum-scale=1 to the viewport meta on iOS. Idempotent; a no-op
 * everywhere else and when there is no viewport meta to change. Returns
 * whether the meta was changed, for the caller's tests.
 */
export function suppressIOSFocusZoom(
  doc = typeof document === "undefined" ? null : document,
  nav = typeof navigator === "undefined" ? null : navigator,
) {
  if (!doc || !isIOS(nav)) return false;
  const meta = doc.querySelector('meta[name="viewport"]');
  if (!meta) return false;
  const content = meta.getAttribute("content") || "";
  if (/maximum-scale\s*=/.test(content)) return false;
  // Safari re-reads the viewport when the content attribute changes.
  meta.setAttribute("content", `${content.trim().replace(/,\s*$/, "")}, ${MAXIMUM_SCALE}`);
  return true;
}
