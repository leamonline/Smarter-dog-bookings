import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MessageBubble } from "./MessageBubble.jsx";

const base = {
  id: "x",
  channel: "whatsapp",
  sent_at: "2026-06-01T09:32:00Z",
  status: "sent",
};

describe("MessageBubble — special message rendering", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a 'WhatsApp · day · time · status' meta line (not the old 'WA' chip)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
    const { container } = render(
      <MessageBubble
        message={{ ...base, direction: "outbound", content: "All booked in!", status: "delivered" }}
      />,
    );
    expect(container.textContent).toContain("WhatsApp");
    expect(container.textContent).toContain("Today");
    expect(container.textContent).toContain("delivered");
  });

  it("renders a flow/book_entry message as the customer-facing body, never the raw code", () => {
    const { container } = render(
      <MessageBubble
        message={{
          ...base,
          direction: "outbound",
          content: "[flow:1771222127176573] Lovely 🐾 here's the link",
        }}
      />,
    );
    expect(container.textContent).toContain("Lovely");
    expect(screen.getByText("Booking link")).toBeInTheDocument();
    expect(container.textContent).not.toContain("[flow:");
  });

  it("renders a template send as a friendly bubble, never the raw [template:…] string", () => {
    const { container } = render(
      <MessageBubble
        message={{
          ...base,
          direction: "outbound",
          content: "[template:ready_for_collection_v1] Cooper · 10",
        }}
      />,
    );

    // The "Template" marker + friendly label are shown…
    expect(screen.getByText("Template")).toBeInTheDocument();
    expect(screen.getByText("Ready for Collection")).toBeInTheDocument();
    // …and the body is the actual message the customer received…
    expect(container.textContent).toContain("ready for collection in 10 mins");
    // …with no internal placeholder syntax leaking through.
    expect(container.textContent).not.toContain("[template:");
  });

  it("renders an unknown template id with the tidy fallback label", () => {
    const { container } = render(
      <MessageBubble
        message={{ ...base, direction: "outbound", content: "[template:mystery_v9] A · B" }}
      />,
    );
    expect(screen.getByText("Template message")).toBeInTheDocument();
    expect(container.textContent).not.toContain("[template:");
  });

  it("renders a reaction as a muted 'Reacted' line, not the raw [reaction…] string", () => {
    const { container } = render(
      <MessageBubble
        message={{
          ...base,
          direction: "inbound",
          content: "[reaction message — no text content]",
        }}
      />,
    );
    expect(screen.getByText("Reacted")).toBeInTheDocument();
    expect(container.textContent).not.toContain("[reaction");
    expect(container.textContent).not.toContain("no text content");
  });

  it("shows the reaction emoji when the content carries one", () => {
    render(
      <MessageBubble
        message={{ ...base, direction: "inbound", content: "[reaction 👍]" }}
      />,
    );
    expect(screen.getByText("👍")).toBeInTheDocument();
  });

  it("renders from the reaction_emoji column (the post-ingestion shape)", () => {
    const { container } = render(
      <MessageBubble
        message={{
          ...base,
          direction: "inbound",
          content: "Reacted ❤️",
          reaction_emoji: "❤️",
        }}
      />,
    );
    expect(screen.getByText("Reacted")).toBeInTheDocument();
    expect(screen.getByText("❤️")).toBeInTheDocument();
    // It's the lightweight line, not a bubble — no channel chip.
    expect(container.textContent).not.toContain("WA");
  });

  it("prefers the reaction_emoji column over an emoji in the content string", () => {
    render(
      <MessageBubble
        message={{
          ...base,
          direction: "inbound",
          content: "[reaction 👍]",
          reaction_emoji: "❤️",
        }}
      />,
    );
    expect(screen.getByText("❤️")).toBeInTheDocument();
    expect(screen.queryByText("👍")).not.toBeInTheDocument();
  });

  it("leaves a plain text message exactly as-is", () => {
    render(
      <MessageBubble
        message={{ ...base, direction: "inbound", content: "Can I move Cooper to Tuesday?" }}
      />,
    );
    expect(screen.getByText("Can I move Cooper to Tuesday?")).toBeInTheDocument();
  });

  it("renders an inbound reminder 'Confirm' reply as a celebratory sticker", () => {
    const { container } = render(
      <MessageBubble message={{ ...base, direction: "inbound", content: "Confirm" }} />,
    );
    expect(screen.getByText(/I'll be there, see you soon!/i)).toBeInTheDocument();
    expect(container.textContent).toContain("Confirmed");
    // The bare "Confirm" text isn't shown as a plain bubble.
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
  });

  it("does not stickerise an OUTBOUND 'Confirm' (only inbound customer replies)", () => {
    render(
      <MessageBubble message={{ ...base, direction: "outbound", content: "Confirm" }} />,
    );
    expect(screen.queryByText(/see you soon/i)).not.toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("renders an inbound photo as a friendly chip, not the raw placeholder", () => {
    const { container } = render(
      <MessageBubble
        message={{
          ...base,
          direction: "inbound",
          content: "[image message — no text content]",
        }}
      />,
    );
    expect(screen.getByText("Photo")).toBeInTheDocument();
    expect(container.textContent).toContain("📷");
    expect(container.textContent).not.toContain("no text content");
    expect(container.textContent).not.toContain("[image");
  });

  it("makes failed outbound sends prominent and names the failure reason", () => {
    render(
      <MessageBubble
        message={{
          ...base,
          direction: "outbound",
          content: "Hi Sarah, Bella is booked in.",
          status: "failed",
          error_message: "Meta rejected this template",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Message failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Meta rejected this template");
  });
});
