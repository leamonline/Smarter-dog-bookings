// Edit-mode lifecycle for the Human card: draft state, dirty tracking,
// validation, save, focus management, and the "E" keyboard shortcut.
// The orchestrator stays a layout shell; panels receive draft values and
// setters from here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { validateContactPhone } from "../dog-card/helpers.js";
import { isHumanPhoneTakenError } from "../../../supabase/hooks/humans/phoneTaken";

const DRAFT_KEYS = [
  "name",
  "surname",
  "phone",
  "email",
  "address",
  "fb",
  "insta",
  "tiktok",
  "notes",
  "sms",
  "whatsapp",
  "historyFlag",
];

function makeDraftFromHuman(h) {
  return {
    name: h.name || "",
    surname: h.surname || "",
    phone: h.phone || "",
    email: h.email || "",
    address: h.address || "",
    fb: h.fb || "",
    insta: h.insta || "",
    tiktok: h.tiktok || "",
    notes: h.notes || "",
    sms: !!h.sms,
    whatsapp: !!h.whatsapp,
    historyFlag: h.historyFlag || "",
  };
}

function draftsEqual(a, b) {
  if (a === b) return true;
  for (const k of DRAFT_KEYS) if (a[k] !== b[k]) return false;
  return true;
}

// `shortcutPaused` suspends the "E" edit toggle while a confirm dialog
// owns the keyboard (delete / discard-changes).
//
// `onPhoneTaken(phone, updates)` is the card's hand-off when a number save
// loses to humans_phone_unique: it resolves true once the card has dealt
// with it (linked a pending portal signup and saved), false if the staff
// member backed out — the draft stays open for them either way.
export function useHumanDraft({
  human,
  humanId,
  onUpdateHuman,
  onPhoneTaken,
  shortcutPaused,
}) {
  const toast = useToast();

  const [mode, setMode] = useState("view");
  const [draft, setDraft] = useState(() => makeDraftFromHuman(human));
  const [saving, setSaving] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [editFocusKey, setEditFocusKey] = useState(null);

  const nameInputRef = useRef(null);
  const addressInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const notesInputRef = useRef(null);

  // Reseed when a different human is selected. Live edits and edit-mode
  // transitions never overwrite the user's typing — so we deliberately
  // depend on `human.id` rather than the whole `human` reference.
  useEffect(() => {
    setDraft(makeDraftFromHuman(human));
    setMode("view");
    setNotesExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [human.id]);

  // Focus the right input when the modal enters edit mode.
  useEffect(() => {
    if (mode !== "edit") return;
    const ref =
      editFocusKey === "address"
        ? addressInputRef
        : editFocusKey === "email"
          ? emailInputRef
          : editFocusKey === "notes"
            ? notesInputRef
            : nameInputRef;
    const t = setTimeout(() => {
      ref.current?.focus();
      if (ref.current?.select) {
        try {
          ref.current.select();
        } catch {
          /* not all input types support select() */
        }
      }
    }, 0);
    return () => clearTimeout(t);
  }, [mode, editFocusKey]);

  const setDraftField = useCallback((key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const dirty = useMemo(
    () => !draftsEqual(draft, makeDraftFromHuman(human)),
    [draft, human],
  );

  const startEdit = useCallback((focusKey = "name") => {
    setEditFocusKey(focusKey);
    setMode("edit");
  }, []);

  const cancelEdit = useCallback(() => {
    setDraft(makeDraftFromHuman(human));
    setMode("view");
    setEditFocusKey(null);
  }, [human]);

  const saveHuman = async () => {
    if (!dirty || saving) return;
    const trimmedPhone = draft.phone.trim();
    // Only re-validate the phone when it actually changed, so editing other
    // fields on a record with a legacy/landline number is never blocked. When
    // it has changed, a UK mobile is normalised to E.164 and a mobile-shaped
    // number with the wrong digit count is rejected (the "131026 undeliverable"
    // class) before it can be stored.
    const phoneChanged = trimmedPhone !== (human.phone || "").trim();
    let phoneToSave = trimmedPhone;
    if (phoneChanged) {
      const { value, error } = validateContactPhone(trimmedPhone);
      if (error) {
        toast.show(error, "error");
        return;
      }
      phoneToSave = value;
    }
    const updates = {
      name: draft.name.trim(),
      surname: draft.surname.trim(),
      fullName: `${draft.name.trim()} ${draft.surname.trim()}`.trim(),
      phone: phoneToSave,
      email: draft.email.trim(),
      address: draft.address.trim(),
      fb: draft.fb.trim(),
      insta: draft.insta.trim(),
      tiktok: draft.tiktok.trim(),
      notes: draft.notes.trim(),
      sms: draft.sms,
      whatsapp: draft.whatsapp,
      historyFlag: draft.historyFlag.trim(),
    };
    const finishEdit = () => {
      setMode("view");
      setEditFocusKey(null);
    };

    setSaving(true);
    let saved;
    try {
      saved = await onUpdateHuman(human.id || humanId, updates);
    } catch (err) {
      setSaving(false);
      if (isHumanPhoneTakenError(err)) {
        // The number belongs to another record. Hand over to the card,
        // which can link a pending portal signup or name the other
        // customer; the draft stays open so nothing typed is lost.
        if (onPhoneTaken) {
          const handled = await onPhoneTaken(err.phone, updates);
          if (handled) finishEdit();
          return;
        }
        toast.show(err.message, "error");
        return;
      }
      toast.show("Couldn't save those changes — give it another go", "error");
      return;
    }
    setSaving(false);
    // updateHuman reports a failed write as an explicit null (it has already
    // rolled the optimistic maps back). Saying "saved" here was how a
    // rejected phone change used to pass unnoticed.
    if (saved === null) {
      toast.show("Couldn't save those changes — give it another go", "error");
      return;
    }
    finishEdit();
    toast.show("Profile saved", "success");
  };

  // "E" toggles edit mode when no input is focused. Skipped while the
  // overflow / confirm dialogs are open so it doesn't clash.
  useEffect(() => {
    if (!onUpdateHuman) return;
    const handler = (e) => {
      if (e.key !== "e" && e.key !== "E") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (shortcutPaused) return;
      e.preventDefault();
      if (mode === "view") startEdit("name");
      else if (!dirty) cancelEdit();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mode, dirty, onUpdateHuman, shortcutPaused, startEdit, cancelEdit]);

  return {
    isEditing: mode === "edit",
    draft,
    setDraftField,
    dirty,
    saving,
    notesExpanded,
    setNotesExpanded,
    startEdit,
    cancelEdit,
    saveHuman,
    nameInputRef,
    addressInputRef,
    emailInputRef,
    notesInputRef,
  };
}
