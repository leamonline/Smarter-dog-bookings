import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupApprovalQueue } from "./SignupApprovalQueue";
import { listPendingSignups } from "../../../supabase/repositories/signupApprovalRepo";
vi.mock("../../../supabase/client", () => ({ supabase: { channel: () => { const q = { on: () => q, subscribe: () => q }; return q; }, removeChannel: vi.fn() } }));
vi.mock("../../../supabase/repositories/signupApprovalRepo", () => ({ SIGNUP_PAGE_SIZE: 5, listPendingSignups: vi.fn() }));
vi.mock("./SignupReviewPanel", () => ({ SignupReviewPanel: ({ humanId, onClose }: { humanId: string; onClose: () => void }) => <div role="dialog">Reviewing {humanId}<button onClick={onClose}>Close panel</button></div> }));
const list = vi.mocked(listPendingSignups);
const customer = { id: "h1", name: "Alex Taylor", phone: null, email: null, submittedAt: "2026-09-04T10:00:00Z", dogs: [{ id: "d1", name: "Luna" }] };
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ customers: [customer], total: 8 }); });
describe("approval queue", () => {
  it("shows full count, pages and opens the selected review", async () => {
    const user = userEvent.setup();
    render(<SignupApprovalQueue enabled onApprove={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Review Alex Taylor" })).toBeVisible();
    expect(screen.getByText("8")).toBeVisible();
    expect(screen.getByText("Luna")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.anything(), 1));
    await user.click(screen.getByRole("button", { name: "Review Alex Taylor" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Reviewing h1");
  });
  it("keeps errors distinct from an empty queue and supports retry", async () => {
    list.mockRejectedValueOnce(new Error("Couldn't load awaiting approvals."));
    const user = userEvent.setup();
    render(<SignupApprovalQueue enabled onApprove={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load");
    expect(screen.queryByText(/All caught up/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Review Alex Taylor" })).toBeVisible();
  });
  it("returns to an existing page after the last pending row on a page disappears", async () => {
    const user = userEvent.setup();
    render(<SignupApprovalQueue enabled onApprove={vi.fn()} />);
    await screen.findByText("8");
    list.mockResolvedValueOnce({ customers: [], total: 4 }).mockResolvedValueOnce({ customers: [customer], total: 4 });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.anything(), 0));
    expect(await screen.findByText("4")).toBeVisible();
  });
  it("shows a compact empty state and does not fetch while offline", async () => {
    render(<SignupApprovalQueue enabled={false} onApprove={vi.fn()} />);
    expect(screen.getByText(/available when connected/)).toBeVisible();
    expect(list).not.toHaveBeenCalled();
  });
});
