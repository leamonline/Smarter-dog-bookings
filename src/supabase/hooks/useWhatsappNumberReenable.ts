// useWhatsappNumberReenable — the state behind "Switch WhatsApp back on?".
//
// Reads what a re-enable of one number would cover, holds the permission
// note, and submits exactly the scope staff are looking at. Nothing is ever
// retried automatically: when the number changed underneath them (someone
// else was switched off, it said STOP again, another write held the lock),
// the scope is read again and shown, and staff confirm again. When the
// request's outcome is unknown (the connection dropped), the scope is read
// again to find out what happened.
//
// Standalone on purpose: the dialog mounts it, so nothing is read until staff
// open the dialog, and never on a timer.
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../../lib/logger";
import { supabase } from "../client";
import {
  classifyReenableError,
  diffScopes,
  hasScopeChanges,
  isNewerStop,
  isPermissionNoteLongEnough,
  isScopeEmpty,
  type NumberOptOutScope,
  type ReenableErrorKind,
  type ScopeDiff,
} from "../../engine/whatsappReenable";
import {
  getNumberOptOutScope,
  reenableNumber,
  type RepoError,
} from "../repositories/whatsappOptOutRepo";

export type ReenableStatus =
  | "unavailable"
  | "loading"
  | "load_error"
  | "blocked"
  | "already_on"
  | "ready"
  | "submitting"
  | "verifying"
  | "done";

export type ReenableNotice =
  | { kind: "scope_changed"; diff: ScopeDiff }
  | { kind: "busy"; diff: ScopeDiff }
  | { kind: "new_stop"; at: string | null }
  | { kind: "unconfirmed" }
  | { kind: "not_applied" }
  | { kind: "submit_error"; error: "note_required" | "unknown" };

export interface ReenabledInfo {
  humanIds: string[];
  conversationIds: string[];
  auditId?: string;
}

/** "done": it went through. "already_on": someone else switched it back on first. */
export type ReenableOutcome = "done" | "already_on";

export interface UseWhatsappNumberReenableOptions {
  phone: string;
  context: "profile" | "inbox";
  /** The profile's own record, to spot one that is no longer in scope. */
  currentHumanId?: string | null;
  /** Inbox only: the realtime list row's latest STOP, to spot a newer one. */
  observedLastStopAt?: string | null;
  onReenabled?: (result: ReenabledInfo, outcome: ReenableOutcome) => void;
}

const BLOCKING: ReadonlySet<ReenableErrorKind> = new Set([
  "invalid_phone",
  "not_staff",
  "not_deployed",
]);
const MACHINE_CODE = /^[a-z][a-z0-9_]*$/;

type ScopeRead = Awaited<ReturnType<typeof getNumberOptOutScope>>;

function logFailure(op: "scope" | "reenable", error: RepoError) {
  // Rebuilt from the code and a machine-readable detail only. A free-form
  // detail can quote a row, and the phone, names and note must never reach
  // the error reporter.
  const details = error.details && MACHINE_CODE.test(error.details) ? error.details : "none";
  logger.error(
    op === "scope" ? "WhatsApp opt-out scope read failed" : "WhatsApp re-enable failed",
    new Error(`code=${error.code || "none"} details=${details} thrown=${error.thrown}`),
    { tags: { hook: "useWhatsappNumberReenable", op } },
  );
}

function classify(error: RepoError, op: "scope" | "reenable"): ReenableErrorKind {
  const kind = classifyReenableError(error, { thrown: error.thrown });
  if (kind === "network" || kind === "unknown") logFailure(op, error);
  return kind;
}

export function useWhatsappNumberReenable({
  phone,
  context,
  currentHumanId = null,
  observedLastStopAt = null,
  onReenabled,
}: UseWhatsappNumberReenableOptions) {
  const available = Boolean(supabase);
  const [status, setStatus] = useState<ReenableStatus>(available ? "loading" : "unavailable");
  const [errorKind, setErrorKind] = useState<ReenableErrorKind | null>(null);
  const [alreadyOnReason, setAlreadyOnReason] = useState<"empty" | "someone_else" | null>(null);
  const [scope, setScope] = useState<NumberOptOutScope | null>(null);
  const [notice, setNotice] = useState<ReenableNotice | null>(null);
  const [note, setNoteValue] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);

  // A newer read makes every older one stale; unmounting makes all of them.
  const generation = useRef(0);
  const submitLock = useRef(false);
  const scopeRef = useRef<NumberOptOutScope | null>(null);
  const loadedOnce = useRef(false);
  const onReenabledRef = useRef(onReenabled);
  useEffect(() => {
    onReenabledRef.current = onReenabled;
  }, [onReenabled]);

  /** Read the scope; null when a newer read (or an unmount) superseded it. */
  const readScope = useCallback(async (): Promise<ScopeRead | null> => {
    const client = supabase;
    if (!client) return null;
    const id = ++generation.current;
    const result = await getNumberOptOutScope(client, phone);
    return id === generation.current ? result : null;
  }, [phone]);

  const failRead = useCallback((error: RepoError) => {
    const kind = classify(error, "scope");
    setErrorKind(kind);
    setStatus(BLOCKING.has(kind) ? "blocked" : "load_error");
  }, []);

  /**
   * Show a freshly read scope. Against `previous`: a new STOP clears the
   * note (the permission it records predates that STOP), and any other
   * change is shown as `changedKind` (or scope_changed).
   */
  const showScope = useCallback(
    (
      next: NumberOptOutScope,
      previous: NumberOptOutScope | null,
      changedKind: "scope_changed" | "busy" | null = null,
    ) => {
      scopeRef.current = next;
      setScope(next);
      setErrorKind(null);
      const firstLoad = !loadedOnce.current;
      loadedOnce.current = true;
      if (isScopeEmpty(next)) {
        setAlreadyOnReason(firstLoad ? "empty" : "someone_else");
        setNotice(null);
        setStatus("already_on");
        return;
      }
      if (previous) {
        const diff = diffScopes(previous, next);
        if (diff.newStop) {
          setNoteValue("");
          setNoteTouched(false);
          setNotice({ kind: "new_stop", at: next.lastStopAt });
        } else if (changedKind) {
          setNotice({ kind: changedKind, diff });
        } else {
          setNotice(hasScopeChanges(diff) ? { kind: "scope_changed", diff } : null);
        }
      }
      setStatus("ready");
    },
    [],
  );

  const load = useCallback(
    async (diffAgainstPrevious: boolean) => {
      const previous = diffAgainstPrevious ? scopeRef.current : null;
      setStatus("loading");
      const read = await readScope();
      if (!read) return;
      if (read.error) {
        failRead(read.error);
        return;
      }
      showScope(read.value, previous);
    },
    [readScope, failRead, showScope],
  );

  useEffect(() => {
    if (!supabase) return undefined;
    void load(false);
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  /** After a refused submit: read again and show what changed. Never resubmits. */
  const recheck = useCallback(
    async (previous: NumberOptOutScope, changedKind: "scope_changed" | "busy") => {
      const read = await readScope();
      if (!read) return;
      if (read.error) {
        failRead(read.error);
        return;
      }
      showScope(read.value, previous, changedKind);
      if (isScopeEmpty(read.value)) {
        onReenabledRef.current?.(
          { humanIds: previous.records.map((record) => record.id), conversationIds: [] },
          "already_on",
        );
      }
    },
    [readScope, failRead, showScope],
  );

  /** The request's outcome is unknown: read the scope to find out. */
  const verify = useCallback(
    async (previous: NumberOptOutScope) => {
      setStatus("verifying");
      const read = await readScope();
      if (!read) return;
      if (read.error) {
        classify(read.error, "scope");
        setNotice({ kind: "unconfirmed" });
        setStatus("ready");
        return;
      }
      const next = read.value;
      if (isScopeEmpty(next)) {
        scopeRef.current = next;
        setScope(next);
        setStatus("done");
        onReenabledRef.current?.(
          { humanIds: previous.records.map((record) => record.id), conversationIds: [] },
          "done",
        );
        return;
      }
      if (!hasScopeChanges(diffScopes(previous, next))) {
        setNotice({ kind: "not_applied" });
        setStatus("ready");
        return;
      }
      showScope(next, previous, "scope_changed");
    },
    [readScope, showScope],
  );

  const liveNewStop =
    status === "ready" && scope !== null && isNewerStop(observedLastStopAt, scope.lastStopAt);
  const canSubmit =
    status === "ready" &&
    !isScopeEmpty(scope) &&
    isPermissionNoteLongEnough(note) &&
    !liveNewStop;
  const staleProfile =
    context === "profile" &&
    Boolean(currentHumanId) &&
    scope !== null &&
    !isScopeEmpty(scope) &&
    !scope.records.some((record) => record.id === currentHumanId);

  const submit = useCallback(async () => {
    const client = supabase;
    const current = scopeRef.current;
    if (!client || !current || !canSubmit || submitLock.current) return;
    submitLock.current = true;
    setStatus("submitting");
    setNotice(null);
    try {
      const result = await reenableNumber(client, current, note);
      if (!result.error) {
        setStatus("done");
        onReenabledRef.current?.(
          {
            humanIds: result.value.humanIds,
            conversationIds: result.value.conversationIds,
            auditId: result.value.auditId,
          },
          "done",
        );
        return;
      }
      const kind = classify(result.error, "reenable");
      switch (kind) {
        case "scope_changed":
        case "nothing_to_reenable":
          await recheck(current, "scope_changed");
          return;
        case "busy":
          await recheck(current, "busy");
          return;
        case "note_required":
          setNotice({ kind: "submit_error", error: "note_required" });
          setStatus("ready");
          return;
        case "invalid_phone":
        case "not_staff":
        case "not_deployed":
          setErrorKind(kind);
          setStatus("blocked");
          return;
        case "network":
          await verify(current);
          return;
        default:
          setNotice({ kind: "submit_error", error: "unknown" });
          setStatus("ready");
      }
    } finally {
      submitLock.current = false;
    }
  }, [canSubmit, note, recheck, verify]);

  const setNote = useCallback((value: string) => {
    setNoteValue(value);
    setNoteTouched(true);
  }, []);

  return {
    available,
    status,
    errorKind,
    alreadyOnReason,
    scope,
    notice,
    liveNewStop,
    staleProfile,
    note,
    setNote,
    noteTouched,
    canSubmit,
    reload,
    submit,
  };
}
