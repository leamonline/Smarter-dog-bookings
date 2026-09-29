import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DevConnectionBanner } from "./DevConnectionBanner.jsx";

describe("DevConnectionBanner", () => {
  it("names the real project a dev:live session is connected to", () => {
    render(
      <DevConnectionBanner
        dev
        forceOffline={false}
        supabaseUrl="https://nlzhllhkigmsvrzduefz.supabase.co"
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("connected to nlzhllhkigmsvrzduefz");
  });

  it("renders nothing on sample data, which is every test and every default dev session", () => {
    const { container } = render(<DevConnectionBanner />);
    expect(container.querySelector("[data-dev-connection-banner]")).toBeNull();
  });
});
