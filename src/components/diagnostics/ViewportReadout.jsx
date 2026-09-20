// ============================================================
// src/components/diagnostics/ViewportReadout.jsx
//
// An on-screen readout of the numbers that decide where the Inbox
// composer lands under a phone keyboard — for the one case no simulator
// here reproduces: a real iPhone. Three fixes (#885, #886, #887) each
// passed a Chromium replay and failed on the device, because the replay
// could only model what we guessed iOS does. This shows what it did.
//
// Off unless the page is opened with ?vvdebug=1 (kept for the tab in
// sessionStorage; ?vvdebug=0 clears it), so it never renders for staff who
// did not ask for it, and it mounts inside the staff shell only, so never
// for customers. It shows geometry and nothing else: no message text, no
// names, no phone numbers. While it is on, a second after a text field
// gains or loses focus the same numbers go to Sentry as an info event, so
// they can be read back without a screenshot.
//
// Pinned to the VISUAL viewport, not the layout viewport: on iOS a
// position:fixed element sits in the layout viewport and can be panned
// off screen by the keyboard, which is the very behaviour being measured,
// so the box translates itself by visualViewport.offsetTop.
// ============================================================

import { useEffect, useState } from "react";
import { safeGet, safeSet } from "../../lib/storage";
import { captureMessage } from "../../lib/sentry.js";
import { KEYBOARD_OPEN_ATTR, isTextEntryElement } from "../../hooks/useKeyboardOpen";

const FLAG_KEY = "sd:vvdebug";
// Late enough for the keyboard to have finished landing and every settled
// re-measure (viewportSettle.js, last at 900ms) to have run.
const REPORT_DELAY_MS = 1200;
// Catches geometry that changes without firing any event — the exact
// failure mode being diagnosed.
const POLL_MS = 500;

export function readoutEnabled() {
  if (typeof window === "undefined") return false;
  const param = new URLSearchParams(window.location.search).get("vvdebug");
  if (param === "1") {
    safeSet("session", FLAG_KEY, "1");
    return true;
  }
  if (param === "0") {
    safeSet("session", FLAG_KEY, "0");
    return false;
  }
  return safeGet("session", FLAG_KEY) === "1";
}

const round = (value) => (Number.isFinite(value) ? Math.round(value) : null);

function rect(element) {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return { top: round(box.top), bottom: round(box.bottom), left: round(box.left), right: round(box.right) };
}

export function snapshot() {
  const viewport = window.visualViewport;
  const doc = document.documentElement;
  const main = document.getElementById("main-content");
  const shell = document.querySelector('[style*="--fill-visible-height"]');
  const textarea = document.querySelector('textarea[aria-label="Write a reply"]');
  const send = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send");
  const active = document.activeElement;
  const standalone =
    (window.matchMedia?.("(display-mode: standalone)").matches ?? false) ||
    window.navigator.standalone === true;
  return {
    build: import.meta.env.VITE_BUILD_SHA || "local",
    standalone,
    viewport: viewport
      ? {
          scale: Number(viewport.scale.toFixed(3)),
          height: round(viewport.height),
          width: round(viewport.width),
          offsetTop: round(viewport.offsetTop),
          offsetLeft: round(viewport.offsetLeft),
          pageTop: round(viewport.pageTop),
        }
      : null,
    window: {
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollY: round(window.scrollY),
      scrollX: round(window.scrollX),
    },
    document: {
      scrollTop: round(doc.scrollTop),
      scrollHeight: doc.scrollHeight,
      clientHeight: doc.clientHeight,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    },
    main: main
      ? { scrollTop: round(main.scrollTop), scrollHeight: main.scrollHeight, clientHeight: main.clientHeight }
      : null,
    keyboardAttr: doc.hasAttribute(KEYBOARD_OPEN_ATTR),
    fillTop: shell?.style.getPropertyValue("--fill-top") || null,
    fillVisible: shell?.style.getPropertyValue("--fill-visible-height") || null,
    shell: rect(shell),
    textarea: textarea
      ? { ...rect(textarea), fontSize: getComputedStyle(textarea).fontSize }
      : null,
    send: rect(send),
    active: active && active !== document.body
      ? `${active.tagName.toLowerCase()}${active.getAttribute("aria-label") ? `[${active.getAttribute("aria-label")}]` : ""}`
      : null,
  };
}

const span = (r) => (r ? `${r.top}..${r.bottom}` : "—");

export function formatSnapshot(s) {
  const v = s.viewport;
  return [
    `build ${s.build} · ${s.standalone ? "home-screen app" : "browser tab"}`,
    v
      ? `vv scale ${v.scale} h ${v.height} w ${v.width} top ${v.offsetTop} left ${v.offsetLeft} pageTop ${v.pageTop}`
      : "vv —",
    `win ${s.window.innerWidth}×${s.window.innerHeight} scroll ${s.window.scrollX},${s.window.scrollY}`,
    `doc scroll ${s.document.scrollTop}/${s.document.scrollHeight} client ${s.document.clientHeight} · width ${s.document.scrollWidth}/${s.document.clientWidth}`,
    s.main ? `main scroll ${s.main.scrollTop}/${s.main.scrollHeight} client ${s.main.clientHeight}` : "main —",
    `keyboard ${s.keyboardAttr} · fill-top ${s.fillTop ?? "—"} · fill-visible ${s.fillVisible ?? "—"}`,
    `shell ${span(s.shell)} · textarea ${span(s.textarea)}${s.textarea ? ` (${s.textarea.fontSize})` : ""} · send ${span(s.send)}`,
    `active ${s.active ?? "—"}`,
  ].join("\n");
}

export function ViewportReadout() {
  const [enabled] = useState(readoutEnabled);
  const [snap, setSnap] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const viewport = window.visualViewport;
    let frame = null;
    const timers = new Set();

    const update = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        setSnap(snapshot());
      });
    };
    const report = (phase) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        captureMessage(`viewport-readout ${phase}`, { extra: snapshot() });
      }, REPORT_DELAY_MS);
      timers.add(id);
    };
    const onFocusIn = (event) => {
      update();
      if (isTextEntryElement(event.target)) report("focus");
    };
    const onFocusOut = (event) => {
      update();
      if (isTextEntryElement(event.target)) report("blur");
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    const poll = window.setInterval(update, POLL_MS);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.clearInterval(poll);
      for (const id of timers) window.clearTimeout(id);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled || !snap) return null;

  return (
    <pre
      data-testid="viewport-readout"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 9999,
        margin: 0,
        padding: "4px 6px",
        maxWidth: "100vw",
        whiteSpace: "pre-wrap",
        font: "10px/1.35 ui-monospace, Menlo, monospace",
        color: "#7CFC00",
        background: "rgba(0, 0, 0, 0.82)",
        pointerEvents: "none",
        transform: `translateY(${snap.viewport?.offsetTop ?? 0}px)`,
      }}
    >
      {formatSnapshot(snap)}
    </pre>
  );
}
