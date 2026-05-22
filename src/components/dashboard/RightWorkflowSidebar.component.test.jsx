// Component test for the right-rail container. Mocks every hook so
// the sort + all-calm-collapse logic can be exercised without a
// running Supabase. We pin a small set of scenarios that the operator
// will hit in practice — all-calm, mixed, attention-first.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock context providers + heavy children so the test stays focused
// on the rail's own logic. BookingHistoryCard owns its own data hook
// — we render a stub.
vi.mock("./BookingHistoryCard.jsx", () => ({
  BookingHistoryCard: () => <div data-testid="activity-feed" />,
}));
vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

// Hooks return whatever the test sets up in inboxState / etc.
let inboxState;
let remindersState;
let waitlistState;
let todosState;

vi.mock("../../supabase/hooks/useWhatsAppSummary.js", () => ({
  useWhatsAppSummary: () => inboxState,
}));
vi.mock("../../supabase/hooks/useTomorrowReminders.js", () => ({
  useTomorrowReminders: () => remindersState,
}));
vi.mock("../../supabase/hooks/useWaitlistUpcoming.js", () => ({
  useWaitlistUpcoming: () => waitlistState,
}));
vi.mock("../../supabase/hooks/useTodos.js", () => ({
  useTodos: () => todosState,
}));

// supabase client is touched by the cards via the lifted hooks above;
// since we've mocked those hooks the client itself is unreachable, but
// the import still needs to resolve.
vi.mock("../../supabase/client.js", () => ({ supabase: null }));

import { RightWorkflowSidebar } from "./RightWorkflowSidebar.jsx";

function setupHooks({
  inbox = {},
  reminders = {},
  waitlist = {},
  todos = {},
} = {}) {
  inboxState = {
    awaitingReply: 0,
    oldestUnansweredAt: null,
    aiSummary: { text: "", loading: false, error: null },
    loading: false,
    ...inbox,
  };
  remindersState = {
    targetDate: "2026-05-25",
    rows: [],
    sentCount: 0,
    totalCount: 0,
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...reminders,
  };
  waitlistState = { entries: [], loading: false, ...waitlist };
  todosState = {
    todos: [],
    loading: false,
    addTodo: vi.fn(),
    addTodos: vi.fn(),
    toggleTodo: vi.fn(),
    removeTodo: vi.fn(),
    moveTodo: vi.fn(),
    ...todos,
  };
}

function renderRail(props = {}) {
  return render(
    <MemoryRouter>
      <RightWorkflowSidebar
        onOpenWaitlist={vi.fn()}
        onOpenTodos={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("RightWorkflowSidebar", () => {
  beforeEach(() => {
    setupHooks();
  });

  it("collapses to a single calm row when all four cards are calm", () => {
    setupHooks();
    renderRail();
    expect(
      screen.getByRole("status", { name: /right rail summary, all clear/i }),
    ).toBeInTheDocument();
    // No card-level aria-labels should be present.
    expect(screen.queryByLabelText(/WhatsApp inbox/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Waitlist/i)).not.toBeInTheDocument();
  });

  it("does not collapse while any hook is loading", () => {
    setupHooks({ todos: { loading: true } });
    renderRail();
    expect(
      screen.queryByRole("status", {
        name: /right rail summary, all clear/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/WhatsApp inbox/i)).toBeInTheDocument();
  });

  it("renders all four cards stacked when at least one is loud", () => {
    setupHooks({
      inbox: {
        awaitingReply: 2,
        oldestUnansweredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      },
    });
    renderRail();
    expect(screen.getByLabelText(/WhatsApp inbox/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reminders for/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Waitlist/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/To-do list/i)).toBeInTheDocument();
  });

  it("orders attention cards before active cards before calm cards", () => {
    setupHooks({
      // active: 2 messages, oldest 30 mins ago
      inbox: {
        awaitingReply: 2,
        oldestUnansweredAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      },
      // attention: 3 overdue todos
      todos: {
        todos: [
          { done: false, created_at: new Date(Date.now() - 14 * 86_400_000).toISOString() },
          { done: false, created_at: new Date(Date.now() - 14 * 86_400_000).toISOString() },
          { done: false, created_at: new Date(Date.now() - 14 * 86_400_000).toISOString() },
        ],
      },
      // calm: empty waitlist, no reminders
    });
    renderRail();

    const labels = screen
      .getAllByRole("region", { hidden: true })
      .map((el) => el.getAttribute("aria-label"))
      .filter(Boolean);
    const inboxIdx = labels.findIndex((l) => l?.startsWith("WhatsApp inbox"));
    const todoIdx = labels.findIndex((l) => l?.startsWith("To-do list"));
    const waitlistIdx = labels.findIndex((l) => l?.startsWith("Waitlist"));

    // To-do (attention) comes before Inbox (active) comes before Waitlist (calm).
    expect(todoIdx).toBeLessThan(inboxIdx);
    expect(inboxIdx).toBeLessThan(waitlistIdx);
  });
});
