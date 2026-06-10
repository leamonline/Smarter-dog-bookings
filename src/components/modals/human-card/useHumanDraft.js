// Edit-mode lifecycle for the Human card: draft state, dirty tracking,
// validation, save, focus management, and the "E" keyboard shortcut.
// The orchestrator stays a layout shell; panels receive draft values and
// setters from here.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { normalisePhoneDigits } from "../dog-card/helpers.js";

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
export function useHumanDraft({ human, humanId, onUpdateHuman, shortcutPaused }) {
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
    if (trimmedPhone && normalisePhoneDigits(trimmedPhone).length < 10) {
      toast.show(
        "Please enter a valid phone number (at least 10 digits).",
        "error",
      );
      return;
    }
    setSaving(true);
    try {
      const updates = {
        name: draft.name.trim(),
        surname: draft.surname.trim(),
        fullName: `${draft.name.trim()} ${draft.surname.trim()}`.trim(),
        phone: trimmedPhone,
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
      await onUpdateHuman(human.id || humanId, updates);
      setMode("view");
      setEditFocusKey(null);
      toast.show("Profile saved", "success");
    } finally {
      setSaving(false);
    }
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
