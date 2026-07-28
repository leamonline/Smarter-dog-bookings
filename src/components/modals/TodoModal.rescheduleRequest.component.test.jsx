import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decideRescheduleRequest: vi.fn(),
  showToast: vi.fn(),
  todoDone: false,
}));

vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: mocks.showToast }),
}));

vi.mock("../../supabase/hooks/useTodos.js", () => ({
  useTodos: () => ({
    todos: [
      {
        id: "todo-1",
        text: "Review Alex Taylor's request: Alfie from 15 June at 09:00 to 22 June at 10:00",
        kind: "reschedule_request",
        booking_change_request_id: "request-1",
        done: mocks.todoDone,
        sort_order: 0,
      },
    ],
    loading: false,
    error: null,
    addTodo: vi.fn(),
    toggleTodo: vi.fn(),
    removeTodo: vi.fn(),
    moveTodo: vi.fn(),
    decideRescheduleRequest: mocks.decideRescheduleRequest,
  }),
}));

import { TodoModal } from "./TodoModal.jsx";

describe("TodoModal override reschedule requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.todoDone = false;
    mocks.decideRescheduleRequest.mockResolvedValue({ ok: true });
  });

  it("lets staff approve the requested move", async () => {
    const user = userEvent.setup();
    render(<TodoModal onClose={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "Approve reschedule request" }),
    );

    expect(mocks.decideRescheduleRequest).toHaveBeenCalledWith(
      "request-1",
      "approve",
      "Approved by staff",
    );
  });

  it("lets staff deny the request with a reason", async () => {
    const user = userEvent.setup();
    render(<TodoModal onClose={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: "Deny reschedule request" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Reason for denying request" }),
      "That time is not workable",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm denial" }),
    );

    expect(mocks.decideRescheduleRequest).toHaveBeenCalledWith(
      "request-1",
      "deny",
      "That time is not workable",
    );
  });

  it("does not reopen a completed decision as an ordinary task", () => {
    mocks.todoDone = true;
    render(<TodoModal onClose={vi.fn()} />);

    expect(screen.getByText("Decision recorded")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve reschedule request" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark as not done" }),
    ).not.toBeInTheDocument();
  });
});
