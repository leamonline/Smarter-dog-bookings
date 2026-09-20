import { afterEach, describe, expect, it } from "vitest";
import { isIOS, suppressIOSFocusZoom } from "./iosFocusZoom.js";

const VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content";

const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
const IPADOS = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };
const MAC = { userAgent: IPADOS.userAgent, platform: "MacIntel", maxTouchPoints: 0 };
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", platform: "Linux armv8l", maxTouchPoints: 5 };

function withMeta(content = VIEWPORT) {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "viewport");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
  return meta;
}

afterEach(() => {
  document.querySelectorAll('meta[name="viewport"]').forEach((m) => m.remove());
});

describe("isIOS", () => {
  it("recognises iPhone, and iPadOS behind its Mac user agent", () => {
    expect(isIOS(IPHONE)).toBe(true);
    expect(isIOS(IPADOS)).toBe(true);
  });
  it("leaves Android and a real Mac alone", () => {
    expect(isIOS(ANDROID)).toBe(false);
    expect(isIOS(MAC)).toBe(false);
    expect(isIOS(null)).toBe(false);
  });
});

describe("suppressIOSFocusZoom", () => {
  it("adds maximum-scale=1 to the viewport on an iPhone, keeping everything already there", () => {
    const meta = withMeta();
    expect(suppressIOSFocusZoom(document, IPHONE)).toBe(true);
    expect(meta.getAttribute("content")).toBe(`${VIEWPORT}, maximum-scale=1`);
  });

  it("is idempotent", () => {
    const meta = withMeta();
    suppressIOSFocusZoom(document, IPHONE);
    expect(suppressIOSFocusZoom(document, IPHONE)).toBe(false);
    expect(meta.getAttribute("content").match(/maximum-scale/g)).toHaveLength(1);
  });

  it("changes nothing on Android, where maximum-scale would remove pinch-zoom", () => {
    const meta = withMeta();
    expect(suppressIOSFocusZoom(document, ANDROID)).toBe(false);
    expect(meta.getAttribute("content")).toBe(VIEWPORT);
  });

  it("changes nothing on a desktop Mac", () => {
    const meta = withMeta();
    expect(suppressIOSFocusZoom(document, MAC)).toBe(false);
    expect(meta.getAttribute("content")).toBe(VIEWPORT);
  });

  it("copes with no viewport meta at all", () => {
    expect(suppressIOSFocusZoom(document, IPHONE)).toBe(false);
  });
});
