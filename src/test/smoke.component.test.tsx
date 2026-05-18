import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("component test harness", () => {
  it("renders a React element into jsdom", () => {
    render(<button type="button">Hello</button>);
    expect(screen.getByRole("button", { name: "Hello" })).toBeInTheDocument();
  });
});
