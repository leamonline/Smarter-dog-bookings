import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupReviewPanel } from "./SignupReviewPanel";
import { getSignupReview, saveSignupDogSize, type SignupReview } from "../../../supabase/repositories/signupApprovalRepo";

vi.mock("../../../supabase/client", () => ({ supabase: {} }));
vi.mock("../../../supabase/repositories/signupApprovalRepo", () => ({ getSignupReview: vi.fn(), saveSignupDogSize: vi.fn() }));
const fixture: SignupReview = {
  id: "h1", name: "Alex Taylor", phone: "07700900123", email: "alex@example.test", submittedAt: "2026-09-04T10:00:00Z", dogs: [],
  activeDogs: [
    { id: "d1", name: "Milo", breed: "Cockapoo", size: "medium", reportedSize: null },
    { id: "d2", name: "Luna", breed: "Crossbreed", size: null, reportedSize: "small" },
  ],
};
const load = vi.mocked(getSignupReview);
const saveSize = vi.mocked(saveSignupDogSize);
function setup() {
  const approve = vi.fn().mockResolvedValue({ ok: true, welcomeStatus: "unconfirmed" });
  const close = vi.fn();
  render(<SignupReviewPanel humanId="h1" enabled onApprove={approve} onClose={close} />);
  return { user: userEvent.setup(), approve, close };
}
beforeEach(() => { vi.clearAllMocks(); load.mockResolvedValue(structuredClone(fixture)); saveSize.mockResolvedValue(undefined); });
describe("signup review", () => {
  it("shows all dogs, selects authoritative size only and explains the blocker", async () => {
    setup();
    expect(await screen.findByRole("radio", { name: "Milo: medium" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Luna: small" })).not.toBeChecked();
    expect(screen.getByText("Choose a size for Luna to approve.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save sizes and approve" })).toBeDisabled();
  });
  it("saves chosen sizes before approval and displays the separate welcome outcome", async () => {
    const { user, approve } = setup();
    await user.click(await screen.findByRole("radio", { name: "Luna: small" }));
    await user.click(screen.getByRole("button", { name: "Save sizes and approve" }));
    expect(await screen.findByText("Alex Taylor is approved")).toBeVisible();
    expect(saveSize).toHaveBeenCalledWith({}, "h1", fixture.activeDogs[1], "small");
    expect(saveSize.mock.invocationCallOrder[0]).toBeLessThan(approve.mock.invocationCallOrder[0]);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Welcome message status is unconfirmed/)).toBeVisible();
  });
  it("saves partial sizing for later without approving", async () => {
    const { user, approve } = setup();
    await user.click(await screen.findByRole("radio", { name: "Milo: large" }));
    await user.click(screen.getByRole("button", { name: "Save for later" }));
    expect(await screen.findByText(/Sizes saved. This customer is still awaiting approval/)).toBeVisible();
    expect(approve).not.toHaveBeenCalled();
  });
  it("stops on a failed second save and requires canonical reload", async () => {
    const { user, approve } = setup();
    saveSize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Couldn't save Luna's size. Reload the review."));
    await user.click(await screen.findByRole("radio", { name: "Milo: large" }));
    await user.click(screen.getByRole("radio", { name: "Luna: small" }));
    await user.click(screen.getByRole("button", { name: "Save sizes and approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save Luna");
    expect(approve).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save sizes and approve" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload review" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Milo: medium" })).toBeChecked());
  });
  it("detects a new dog or edited breed before writing", async () => {
    const { user, approve } = setup();
    await user.click(await screen.findByRole("radio", { name: "Luna: small" }));
    load.mockResolvedValue({ ...fixture, activeDogs: [...fixture.activeDogs, { ...fixture.activeDogs[0], id: "new" }] });
    await user.click(screen.getByRole("button", { name: "Save sizes and approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("details have changed");
    expect(saveSize).not.toHaveBeenCalled(); expect(approve).not.toHaveBeenCalled();
  });
  it("keeps the review open on server size rejection with actionable text", async () => {
    const { user, approve } = setup();
    approve.mockResolvedValue({ ok: false, error: "signup_dog_size_unconfirmed" });
    await user.click(await screen.findByRole("radio", { name: "Luna: small" }));
    await user.click(screen.getByRole("button", { name: "Save sizes and approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A dog still needs its size confirmed");
    expect(screen.queryByText("Alex Taylor is approved")).not.toBeInTheDocument();
  });
  it("retains choices when cancelling dismissal and allows explicit discard", async () => {
    const { user, close } = setup();
    await user.click(await screen.findByRole("radio", { name: "Luna: small" }));
    await user.keyboard("{Escape}");
    const alert = await screen.findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: "Keep reviewing" }));
    expect(screen.getByRole("radio", { name: "Luna: small" })).toBeChecked();
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close review" }));
    await user.click(screen.getByRole("button", { name: "Discard and close" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("cannot discard or dismiss while a size write is in flight", async () => {
    let finish!: () => void;
    saveSize.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const { user, close, approve } = setup();
    await user.click(await screen.findByRole("radio", { name: "Luna: small" }));
    await user.click(screen.getByRole("button", { name: "Close review" }));
    await user.click(screen.getByRole("button", { name: "Save sizes and approve" }));
    await waitFor(() => expect(saveSize).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Discard and close" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    finish();
    expect(await screen.findByText("Alex Taylor is approved")).toBeVisible();
  });
  it("shows read errors with retry and cannot approve missing data", async () => {
    load.mockRejectedValueOnce(new Error("Couldn't load all dogs."));
    const { user } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load all dogs");
    expect(screen.getByRole("button", { name: "Save sizes and approve" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload review" }));
    expect(await screen.findByRole("radio", { name: "Milo: medium" })).toBeChecked();
  });
});
