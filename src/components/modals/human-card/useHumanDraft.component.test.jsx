// Focused tests for the Human card edit-mode hook, extracted from
// HumanCardModal (Debt #7). Locks the draft lifecycle the anchor suite
// only exercises end-to-end: dirty tracking, phone validation, trimmed
// save payload, and reseeding when the card switches human.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, screen } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { useHumanDraft } from "./useHumanDraft.js";
import { HumanPhoneTakenError } from "../../../supabase/hooks/humans/phoneTaken";

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

  it("saveHuman rejects a mobile-shaped number with the wrong digit count and stays in edit mode", async () => {
    const { result, onUpdateHuman } = renderDraft();
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("phone", "0770 123"));

    await act(async () => {
      await result.current.saveHuman();
    });
    expect(onUpdateHuman).not.toHaveBeenCalled();
    expect(result.current.isEditing).toBe(true);
    expect(
      screen.getByText(/the digits don't add up/i),
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

  it("saveHuman reports a failed write instead of claiming the profile saved", async () => {
    const onUpdateHuman = vi.fn().mockResolvedValue(null);
    const { result } = renderDraft({ onUpdateHuman });
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("notes", "unsaved"));

    await act(async () => {
      await result.current.saveHuman();
    });
    expect(result.current.isEditing).toBe(true);
    expect(screen.getByText(/couldn't save those changes/i)).toBeInTheDocument();
    expect(screen.queryByText(/profile saved/i)).not.toBeInTheDocument();
  });

  it("hands a taken phone number to onPhoneTaken and leaves edit mode once it is handled", async () => {
    const onUpdateHuman = vi
      .fn()
      .mockRejectedValue(new HumanPhoneTakenError("+447700900222"));
    const onPhoneTaken = vi.fn().mockResolvedValue(true);
    const { result } = renderDraft({ onUpdateHuman, onPhoneTaken });
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("phone", "07700 900222"));

    await act(async () => {
      await result.current.saveHuman();
    });
    expect(onPhoneTaken).toHaveBeenCalledWith(
      "+447700900222",
      expect.objectContaining({ phone: "+447700900222", name: "Sarah" }),
    );
    expect(result.current.isEditing).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("keeps the draft open when onPhoneTaken backs out", async () => {
    const onUpdateHuman = vi
      .fn()
      .mockRejectedValue(new HumanPhoneTakenError("+447700900222"));
    const onPhoneTaken = vi.fn().mockResolvedValue(false);
    const { result } = renderDraft({ onUpdateHuman, onPhoneTaken });
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("phone", "07700 900222"));

    await act(async () => {
      await result.current.saveHuman();
    });
    expect(result.current.isEditing).toBe(true);
    expect(result.current.draft.phone).toBe("07700 900222");
  });

  it("falls back to a toast for a taken phone when no onPhoneTaken is wired", async () => {
    const onUpdateHuman = vi
      .fn()
      .mockRejectedValue(new HumanPhoneTakenError("+447700900222"));
    const { result } = renderDraft({ onUpdateHuman });
    act(() => result.current.startEdit("name"));
    act(() => result.current.setDraftField("phone", "07700 900222"));

    await act(async () => {
      await result.current.saveHuman();
    });
    expect(result.current.isEditing).toBe(true);
    expect(
      screen.getByText(/already on another customer's record/i),
    ).toBeInTheDocument();
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
