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
// What happened is taken from the audit log (whatsapp_opt_out_reenables),
// never from absence. A record also leaves a number's scope when its phone
// changes while it stays opted out, so "no longer listed" is not "switched
// back on": only records an audit row proves are reported to the host, our
// own request is recognised by its row (who sent it, and its note), and a
// record that left without a row is named as still switched off. If the
// audit cannot be read, nothing is reported and staff check again.
//
// Standalone on purpose: the dialog mounts it, so nothing is read until staff
// open the dialog, and never on a timer. The number is fixed when the dialog
// opens: if the record's number changes underneath it, the dialog says so
// and holds confirm, rather than quietly reading a different number.
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "../../lib/logger";
import { supabase } from "../client";
import {
  attributeCleared,
  auditReadSince,
  classifyReenableError,
  diffScopes,
  hasScopeChanges,
  isNewerStop,
  isPermissionNoteLongEnough,
  isSameNumber,
  isScopeEmpty,
  type AuditRow,
  type ClearedAttribution,
  type NumberOptOutScope,
  type OptOutRecord,
  type ReenableErrorKind,
  type ScopeDiff,
} from "../../engine/whatsappReenable";
import {
  getNumberOptOutScope,
  getSignedInUserId,
  listNumberReenables,
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
  /** Our request went through, then the number said STOP again. */
  | { kind: "stopped_again"; at: string | null }
  /** Our request went through, then something else on the number changed. */
  | { kind: "changed_since" }
  | { kind: "unconfirmed" }
  | { kind: "not_applied" }
  | { kind: "submit_error"; error: "note_required" | "unknown" };

/**
 * Why nothing is left to switch back on (status "already_on"):
 *  - empty: nothing was switched off when staff looked;
 *  - switched_on: a re-enable that was not this request switched it back on;
 *  - ours: this request went through, but not everything it covered is
 *    proven back on (see leftNumber);
 *  - left_number: what staff saw left the number, and no re-enable did it.
 */
export type AlreadyOnReason = "empty" | "switched_on" | "ours" | "left_number";

export interface ReenabledInfo {
  humanIds: string[];
  conversationIds: string[];
  auditId?: string;
}

/**
 * "done": this request went through (the dialog toasts and closes).
 * "already_on": these records are proven back on, by an audit row, but not
 * as this request finishing (patch only; the dialog stays open).
 */
export type ReenableOutcome = "done" | "already_on";

export interface UseWhatsappNumberReenableOptions {
  /** The number to switch back on. Only its value when the dialog opens is used. */
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
type LogOp = "scope" | "reenable" | "audit";

const LOG_MESSAGES: Record<LogOp, string> = {
  scope: "WhatsApp opt-out scope read failed",
  reenable: "WhatsApp re-enable failed",
  audit: "WhatsApp re-enable audit read failed",
};

function logFailure(op: LogOp, error: RepoError) {
  // Rebuilt from the code and a machine-readable detail only. A free-form
  // detail can quote a row, and the phone, names and note must never reach
  // the error reporter.
  const details = error.details && MACHINE_CODE.test(error.details) ? error.details : "none";
  logger.error(
    LOG_MESSAGES[op],
    new Error(`code=${error.code || "none"} details=${details} thrown=${error.thrown}`),
    { tags: { hook: "useWhatsappNumberReenable", op } },
  );
}

/**
 * A re-read to settle: what happened to `previous`, the scope staff were
 * shown. "load": a reload. "recheck": after a refused submit (shown as
 * `changedKind`). "verify": after a submit whose outcome is unknown.
 */
interface SettleJob {
  previous: NumberOptOutScope;
  mode: "load" | "recheck" | "verify";
  changedKind: "scope_changed" | "busy" | null;
}

type AuditRead = { rows: AuditRow[]; me: string } | "failed";

/**
 * Attribute against every note this dialog sent whose outcome went unknown,
 * newest first: a dropped request can land after staff were told it did
 * not, or after they edited the note. With none, no row can be ours.
 */
function attributeForNotes(
  previous: NumberOptOutScope,
  next: NumberOptOutScope,
  audit: { rows: AuditRow[]; me: string },
  notes: readonly string[],
): ClearedAttribution {
  const input = { previous, next, rows: audit.rows };
  const tries = [...notes].reverse().map((submittedNote) => attributeCleared({ ...input, me: audit.me, submittedNote }));
  return tries.find((attribution) => attribution.ourRow) ?? tries[0] ?? attributeCleared({ ...input, me: null, submittedNote: null });
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
  const [pinnedPhone] = useState(phone);
  const [status, setStatus] = useState<ReenableStatus>(available ? "loading" : "unavailable");
  const [errorKind, setErrorKind] = useState<ReenableErrorKind | null>(null);
  const [alreadyOnReason, setAlreadyOnReason] = useState<AlreadyOnReason | null>(null);
  const [scope, setScope] = useState<NumberOptOutScope | null>(null);
  const [notice, setNotice] = useState<ReenableNotice | null>(null);
  // Records staff were shown that left the number with no audit row proving
  // they were switched back on: still switched off, wherever they are now.
  const [leftNumber, setLeftNumber] = useState<OptOutRecord[]>([]);
  const [note, setNoteValue] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);

  // A newer read makes every older one stale; unmounting makes all of them.
  const generation = useRef(0);
  const submitLock = useRef(false);
  const scopeRef = useRef<NumberOptOutScope | null>(null);
  // A re-read that could not be settled ("Check again"): any reload repeats
  // it, against the same scope, rather than reading afresh.
  const unsettled = useRef<SettleJob | null>(null);
  // The trimmed notes of requests whose outcome went unknown. Our own audit
  // row is recognised by one of them (and by who sent it).
  const ourNotes = useRef<string[]>([]);
  const onReenabledRef = useRef(onReenabled);
  useEffect(() => {
    onReenabledRef.current = onReenabled;
  }, [onReenabled]);

  /** Read the scope; null when a newer read (or an unmount) superseded it. */
  const readScope = useCallback(async (): Promise<ScopeRead | null> => {
    const client = supabase;
    if (!client) return null;
    const id = ++generation.current;
    const result = await getNumberOptOutScope(client, pinnedPhone);
    return id === generation.current ? result : null;
  }, [pinnedPhone]);

  /**
   * The audit rows that could settle `previous`, and who is signed in. Part
   * of the read that just finished: null when a newer read (or an unmount)
   * superseded it.
   */
  const readAudit = useCallback(async (previous: NumberOptOutScope): Promise<AuditRead | null> => {
    const client = supabase;
    if (!client) return null;
    const id = generation.current;
    const [rows, me] = await Promise.all([
      listNumberReenables(client, previous.phoneKey, auditReadSince(previous)),
      getSignedInUserId(client),
    ]);
    if (id !== generation.current) return null;
    if (rows.error) logFailure("audit", rows.error);
    if (me.error) logFailure("audit", me.error);
    return rows.error || me.error ? "failed" : { rows: rows.value, me: me.value };
  }, []);

  const failRead = useCallback((error: RepoError) => {
    const kind = classify(error, "scope");
    setErrorKind(kind);
    setStatus(BLOCKING.has(kind) ? "blocked" : "load_error");
  }, []);

  const adopt = useCallback((next: NumberOptOutScope) => {
    scopeRef.current = next;
    setScope(next);
    setErrorKind(null);
  }, []);

  const clearNote = useCallback(() => {
    setNoteValue("");
    setNoteTouched(false);
  }, []);

  /**
   * Show a freshly read scope that still has something switched off.
   * Against `previous`: a new STOP clears the note (the permission it records
   * predates that STOP), and any other change is shown as `changedKind` (or
   * scope_changed). `leftIds` are named on their own, not as "removed".
   */
  const showScope = useCallback(
    (
      next: NumberOptOutScope,
      previous: NumberOptOutScope | null,
      changedKind: "scope_changed" | "busy" | null = null,
      leftIds: readonly string[] = [],
    ) => {
      adopt(next);
      if (isScopeEmpty(next)) {
        setAlreadyOnReason("empty");
        setNotice(null);
        setStatus("already_on");
        return;
      }
      if (previous) {
        const diff = diffScopes(previous, next, leftIds);
        if (diff.newStop) {
          clearNote();
          setNotice({ kind: "new_stop", at: next.lastStopAt });
        } else if (changedKind) {
          setNotice({ kind: changedKind, diff });
        } else {
          setNotice(hasScopeChanges(diff) ? { kind: "scope_changed", diff } : null);
        }
      }
      setStatus("ready");
    },
    [adopt, clearNote],
  );

  /** Say what happened to `job.previous`, from the re-read and its audit. */
  const applyOutcome = useCallback(
    (job: SettleJob, next: NumberOptOutScope, attribution: ClearedAttribution | null) => {
      const { previous } = job;
      const ours = attribution?.ourRow ?? null;
      const proven = attribution ? [...attribution.byUs, ...attribution.byOthers] : [];
      const leftIds = attribution?.leftNumber ?? [];
      const left = previous.records.filter((record) => leftIds.includes(record.id));
      const newStop = diffScopes(previous, next).newStop;
      // Our request is accounted for: no later read should look for it.
      if (ours) ourNotes.current = [];

      if (ours && !newStop && previous.records.every((record) => attribution?.byUs.includes(record.id))) {
        // It went through, exactly as if the request had answered.
        adopt(next);
        setNotice(null);
        setLeftNumber([]);
        setStatus("done");
        onReenabledRef.current?.(
          { humanIds: proven, conversationIds: ours.conversationIds, auditId: ours.id },
          "done",
        );
        return;
      }
      if (proven.length > 0) onReenabledRef.current?.({ humanIds: proven, conversationIds: [] }, "already_on");
      setLeftNumber(left);

      if (isScopeEmpty(next)) {
        adopt(next);
        setNotice(null);
        setAlreadyOnReason(ours ? "ours" : proven.length > 0 ? "switched_on" : left.length > 0 ? "left_number" : "empty");
        setStatus("already_on");
        return;
      }
      if (ours) {
        // It went through, but the number has changed since: the records
        // shown now are switched off again, so nothing is reported for them.
        adopt(next);
        if (newStop) {
          clearNote();
          setNotice({ kind: "stopped_again", at: next.lastStopAt });
        } else {
          setNotice({ kind: "changed_since" });
        }
        setStatus("ready");
        return;
      }
      if (job.mode === "verify" && !hasScopeChanges(diffScopes(previous, next))) {
        adopt(next);
        setNotice({ kind: "not_applied" });
        setStatus("ready");
        return;
      }
      showScope(next, previous, job.mode === "verify" ? "scope_changed" : job.changedKind, leftIds);
    },
    [adopt, clearNote, showScope],
  );

  /**
   * Read the scope again and settle `job`. Until it is settled, any reload
   * repeats it: a read that fails during a verify, or an audit that cannot
   * be read, keeps what staff were shown, reports nothing, and holds confirm
   * behind "Check again".
   */
  const settle = useCallback(
    async (job: SettleJob) => {
      unsettled.current = job;
      if (job.mode === "verify") {
        setStatus("verifying");
        setNotice(null);
      }
      const read = await readScope();
      if (!read) return;
      if (read.error) {
        if (job.mode === "verify") {
          classify(read.error, "scope");
          setNotice({ kind: "unconfirmed" });
          setStatus("ready");
          return;
        }
        unsettled.current = null;
        failRead(read.error);
        return;
      }
      const next = read.value;
      const { previous } = job;
      const stillOff = new Set(next.records.map((record) => record.id));
      const needsAudit =
        job.mode === "verify" ||
        (!isScopeEmpty(previous) &&
          (ourNotes.current.length > 0 ||
            isScopeEmpty(next) ||
            previous.records.some((record) => !stillOff.has(record.id))));
      let attribution: ClearedAttribution | null = null;
      if (needsAudit) {
        const audit = await readAudit(previous);
        if (!audit) return;
        if (audit === "failed") {
          setLeftNumber([]);
          setNotice({ kind: "unconfirmed" });
          setStatus("ready");
          return;
        }
        attribution = attributeForNotes(previous, next, audit, ourNotes.current);
      }
      unsettled.current = null;
      applyOutcome(job, next, attribution);
    },
    [readScope, readAudit, failRead, applyOutcome],
  );

  const load = useCallback(
    async (diffAgainstPrevious: boolean) => {
      setStatus("loading");
      const previous = diffAgainstPrevious ? scopeRef.current : null;
      if (previous) {
        await settle({ previous, mode: "load", changedKind: null });
        return;
      }
      const read = await readScope();
      if (!read) return;
      if (read.error) {
        failRead(read.error);
        return;
      }
      showScope(read.value, null);
    },
    [readScope, failRead, showScope, settle],
  );

  useEffect(() => {
    if (!supabase) return undefined;
    void load(false);
    return () => {
      generation.current += 1;
    };
  }, [load]);

  /**
   * Read the scope again and show what changed. While a re-read is still
   * unsettled ("Check again"), this repeats it instead, so it is settled
   * against what staff were shown, not against a scope read since.
   */
  const reload = useCallback(() => {
    const job = unsettled.current;
    if (!job) return load(true);
    if (job.mode !== "verify") setStatus("loading");
    return settle(job);
  }, [load, settle]);

  const liveNewStop =
    status === "ready" && scope !== null && isNewerStop(observedLastStopAt, scope.lastStopAt);
  // The record's number moved after the dialog opened (another member of
  // staff, or the customer in the portal, changed it).
  const numberMoved = !isSameNumber(pinnedPhone, phone);
  const staleProfile =
    context === "profile" &&
    (numberMoved ||
      (Boolean(currentHumanId) &&
        scope !== null &&
        !isScopeEmpty(scope) &&
        !scope.records.some((record) => record.id === currentHumanId)));
  const canSubmit =
    status === "ready" &&
    !isScopeEmpty(scope) &&
    isPermissionNoteLongEnough(note) &&
    !liveNewStop &&
    !staleProfile &&
    !numberMoved &&
    notice?.kind !== "unconfirmed";

  const submit = useCallback(async () => {
    const client = supabase;
    const current = scopeRef.current;
    if (!client || !current || !canSubmit || submitLock.current) return;
    submitLock.current = true;
    setStatus("submitting");
    setNotice(null);
    setLeftNumber([]);
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
          await settle({ previous: current, mode: "recheck", changedKind: "scope_changed" });
          return;
        case "busy":
          await settle({ previous: current, mode: "recheck", changedKind: "busy" });
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
          // The request may still land, even after a check says it did not.
          ourNotes.current.push(note.trim());
          await settle({ previous: current, mode: "verify", changedKind: null });
          return;
        default:
          setNotice({ kind: "submit_error", error: "unknown" });
          setStatus("ready");
      }
    } finally {
      submitLock.current = false;
    }
  }, [canSubmit, note, settle]);

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
    leftNumber,
    liveNewStop,
    numberMoved,
    staleProfile,
    note,
    setNote,
    noteTouched,
    canSubmit,
    reload,
    submit,
  };
}
