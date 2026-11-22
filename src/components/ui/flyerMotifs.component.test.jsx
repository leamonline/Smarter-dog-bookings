import { existsSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SERVICES } from "../../constants/index";
import { BrandStripe } from "./BrandStripe.jsx";
import { ScribbleUnderline } from "./ScribbleUnderline.jsx";
import { SERVICE_MASCOTS, ServiceMascot } from "./ServiceMascot.jsx";

// The flyer motifs are decoration. These tests hold the two promises that make
// that safe: assistive technology never meets them, and they never stand in
// for information.

describe("BrandStripe", () => {
  it("draws the flyer's nine segments in order: two yellow, one navy, two wide", () => {
    const { container } = render(<BrandStripe />);
    const segments = [...container.querySelectorAll(".brand-stripe__seg")];
    expect(segments).toHaveLength(9);
    const colour = (el) =>
      el.classList.contains("brand-stripe__seg--yellow") ? "Y" : el.classList.contains("brand-stripe__seg--navy") ? "N" : "B";
    expect(segments.map(colour).join("")).toBe("BBYBNBBBY");
    expect(segments.filter((el) => el.classList.contains("brand-stripe__seg--wide"))).toHaveLength(2);
  });

  it("is hidden from assistive technology and has no text", () => {
    const { container } = render(<BrandStripe size="hero" />);
    const stripe = container.firstElementChild;
    expect(stripe).toHaveAttribute("aria-hidden", "true");
    expect(stripe).toHaveAttribute("data-brand-stripe", "hero");
    expect(stripe.textContent).toBe("");
  });
});

describe("ServiceMascot", () => {
  it("has artwork for every bookable service, and the files exist", () => {
    const bookable = SERVICES.map((service) => service.id);
    expect(Object.keys(SERVICE_MASCOTS).sort()).toEqual([...bookable].sort());
    for (const src of Object.values(SERVICE_MASCOTS)) {
      expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
    }
  });

  it("is decorative: empty alt and hidden, because the service name sits beside it", () => {
    const { container } = render(<ServiceMascot serviceId="full-groom" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
  });

  it("renders nothing for a service without artwork", () => {
    const { container } = render(<ServiceMascot serviceId="nail-trim" />);
    expect(container.firstChild).toBeNull();
  });

  it("never asks a 250px file to draw larger than it stays sharp", () => {
    const { container } = render(<ServiceMascot serviceId="puppy-groom" size={200} />);
    expect(container.querySelector("img")).toHaveAttribute("width", "120");
  });

  it("bounces only when asked", () => {
    const still = render(<ServiceMascot serviceId="bath-and-brush" />).container.querySelector("img");
    const moving = render(<ServiceMascot serviceId="bath-and-brush" bounce />).container.querySelector("img");
    expect(still.className).not.toContain("service-mascot--bounce");
    expect(moving.className).toContain("service-mascot--bounce");
  });
});

describe("ScribbleUnderline", () => {
  it("draws in only when asked, and stays hidden from assistive technology", () => {
    const still = render(<ScribbleUnderline />).container.querySelector("svg");
    const drawn = render(<ScribbleUnderline draw />).container.querySelector("svg");
    expect(still).toHaveAttribute("aria-hidden", "true");
    expect(still.getAttribute("class")).not.toContain("scribble-underline--draw");
    expect(drawn.getAttribute("class")).toContain("scribble-underline--draw");
  });
});
