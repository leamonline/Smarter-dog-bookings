// Focused tests for the Human card edit-mode hook, extracted from
// HumanCardModal (Debt #7). Locks the draft lifecycle the anchor suite
// only exercises end-to-end: dirty tracking, phone validation, trimmed
// save payload, and reseeding when the card switches human.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, screen } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { useHumanDraft } from "./useHumanDraft.js";

const human = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700 900111",
  sms: true,
  whatsapp: true,
  email: "sarah@example.com",
  fb: "",
  insta: "",
  tiktok: "",
  address: "",
  notes: "",
  historyFlag: "",
};

const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;

function renderDraft(props = {}) {
  const onUpdateHuman = vi.fn().mockResolvedValue(undefined);
  const initialProps = {
    human,
    humanId: "human-1",
    onUpdateHuman,
    shortcutPaused: false,
    ...props,
  };
  const result = renderHook((p) => useHumanDraft(p), {
    wrapper,
    initialProps,
  });
  return { ...result, onUpdateHuman, initialProps };
}

describe("useHumanDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in view mode with the draft seeded from the human", () => {
    const { result } = renderDraft();
    expect(result.current.isEditing).toBe(false);
    expect(result.current.dirty).toBe(false);
    expect(result.current.draft.name).toBe("Sarah");
    expect(result.current.draft.surname).toBe("Jones");
  });

  it("setDraftField marks the draft dirty; cancelEdit reverts and exits edit mode", () => {
    const { result } = renderDraft();
    act(() => result.current.startEdit("name"));
    expect(result.current.isEditing).toBe(true);

    act(() => result.current.setDraftField("name", "Sara"));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.cancelEdit());
    expect(result.current.isEditing).toBe(false);
    expect(result.current.dirty).toBe(false);
    expect(result.current.draft.name).toBe("Sarah");
  });

  it("saveHuman rejects a phone under 10 digits and stays in edit mode", async () => {
    const { result, onUpdateHuman } = renderDraft();
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("phone", "0770 123"));

    await act(async () => {
      await result.current.saveHuman();
    });
    expect(onUpdateHuman).not.toHaveBeenCalled();
    expect(result.current.isEditing).toBe(true);
    expect(
      screen.getByText("Please enter a valid phone number (at least 10 digits)."),
    ).toBeInTheDocument();
  });

  it("saveHuman trims fields, composes fullName, and returns to view mode", async () => {
    const { result, onUpdateHuman } = renderDraft();
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("name", "  Sara "));
    act(() => result.current.setDraftField("notes", " Likes towels "));

    await act(async () => {
      await result.current.saveHuman();
    });
    expect(onUpdateHuman).toHaveBeenCalledWith(
      "human-1",
      expect.objectContaining({
        name: "Sara",
        surname: "Jones",
        fullName: "Sara Jones",
        notes: "Likes towels",
      }),
    );
    expect(result.current.isEditing).toBe(false);
  });

  it("saveHuman is a no-op when the draft is clean", async () => {
    const { result, onUpdateHuman } = renderDraft();
    await act(async () => {
      await result.current.saveHuman();
    });
    expect(onUpdateHuman).not.toHaveBeenCalled();
  });

  it("reseeds the draft and drops back to view mode when the human changes", () => {
    const { result, rerender, initialProps } = renderDraft();
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("name", "Typed"));

    rerender({
      ...initialProps,
      human: { ...human, id: "human-2", name: "Bea", surname: "Smith" },
      humanId: "human-2",
    });
    expect(result.current.isEditing).toBe(false);
    expect(result.current.draft.name).toBe("Bea");
    expect(result.current.dirty).toBe(false);
  });

  it("the E shortcut enters edit mode, but not while paused", () => {
    const { result, rerender, initialProps } = renderDraft();
    const press = () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "e", bubbles: true }),
      );

    rerender({ ...initialProps, shortcutPaused: true });
    act(press);
    expect(result.current.isEditing).toBe(false);

    rerender({ ...initialProps, shortcutPaused: false });
    act(press);
    expect(result.current.isEditing).toBe(true);
  });
});
