import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  todo: null,
  completeClosureTask: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: mocks.showToast }),
}));

vi.mock("../../supabase/hooks/useTodos.js", () => ({
  useTodos: () => ({
    todos: [mocks.todo],
    loading: false,
    error: null,
    addTodo: vi.fn(),
    toggleTodo: vi.fn(),
    removeTodo: vi.fn(),
    moveTodo: vi.fn(),
    decideRescheduleRequest: vi.fn(),
    completeClosureTask: mocks.completeClosureTask,
  }),
}));

import { TodoModal } from "./TodoModal.jsx";

const closureTodo = {
  id: "todo-close-1",
  text: "Rearrange Alfie (Alex Taylor) — closed Mon 10 Aug at 09:00",
  kind: "closure_rearrangement",
  booking_visit_id: "visit-1",
  closure_date: "2026-08-10",
  done: false,
  sort_order: 0,
};

describe("TodoModal closure integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.todo = { ...closureTodo };
    mocks.completeClosureTask.mockResolvedValue({ ok: true });
  });

  it("routes a closure task to its appointment without exposing generic completion or deletion", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenClosureVisit = vi.fn().mockResolvedValue({ ok: true });

    render(
      <TodoModal
        onClose={onClose}
        onOpenClosureVisit={onOpenClosureVisit}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Mark as done" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Open appointment" }),
    );

    expect(onOpenClosureVisit).toHaveBeenCalledWith("visit-1");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("checks the diary through the guarded completion command", async () => {
    const user = userEvent.setup();

    render(
      <TodoModal
        onClose={vi.fn()}
        onOpenClosureVisit={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Check and complete" }),
    );

    expect(mocks.completeClosureTask).toHaveBeenCalledWith("todo-close-1");
  });

  it("keeps the task open and explains a failed completion check", async () => {
    const user = userEvent.setup();
    mocks.completeClosureTask.mockResolvedValue({
      ok: false,
      error: "This appointment is still booked on the closed day. Move or cancel it first.",
    });

    render(
      <TodoModal
        onClose={vi.fn()}
        onOpenClosureVisit={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Check and complete" }),
    );

    expect(mocks.showToast).toHaveBeenCalledWith(
      "This appointment is still booked on the closed day. Move or cancel it first.",
      "error",
    );
  });

  it("does not let an unrecognised typed task fall back to a generic checkbox", () => {
    mocks.todo = {
      id: "todo-future-1",
      text: "A future linked workflow",
      kind: "future_workflow",
      done: false,
      sort_order: 0,
    };

    render(<TodoModal onClose={vi.fn()} />);

    expect(
      screen.getByText("Complete this from its linked workflow."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark as done" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
