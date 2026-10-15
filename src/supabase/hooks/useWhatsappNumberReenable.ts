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
// back on". And a row shows a re-enable that happened, not the record's
// state now (it can have been switched off again since, and moved): so a
// record is reported to the host only when an audit row proves it was
// switched back on AND it reads as on now. Our own request is recognised by
// its row (who sent it, its note, exactly the scope it sent), and is "done"
// only when the re-read is empty too. A record that left and reads as off is
// named as switched off now; one the read no longer returns, as gone
// (merged or deleted); one that left with nothing to prove it either way, as
// unconfirmed. If the audit or the records cannot be read, nothing is
// reported and staff check again.
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
  findOurRow,
  hasScopeChanges,
  isNewerStop,
  isPermissionNoteLongEnough,
  isSameNumber,
  isScopeEmpty,
  scopePredatesRow,
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
  getWhatsappOptOutNow,
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
 *    back on now (see leftNumber, unconfirmedRecords and goneRecords);
 *  - left_number: what staff saw left the number, and is not proven back on.
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
type LogOp = "scope" | "reenable" | "audit" | "state";

const LOG_MESSAGES: Record<LogOp, string> = {
  scope: "WhatsApp opt-out scope read failed",
  reenable: "WhatsApp re-enable failed",
  audit: "WhatsApp re-enable audit read failed",
  state: "WhatsApp opt-out state read failed",
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

type AuditRead = { rows: AuditRow[]; me: string };

/** A request of ours whose outcome went unknown: the note it carried and the scope it sent. */
interface InDoubtRequest {
  note: string;
  sent: NumberOptOutScope;
}

/**
 * Our row for any request whose outcome went unknown, newest first: a
 * dropped request can land after staff were told it did not, or after they
 * edited the note. With none in doubt, no row can be ours.
 */
function findOurRequest(
  audit: AuditRead,
  requests: readonly InDoubtRequest[],
): { row: AuditRow; request: InDoubtRequest } | null {
  for (const request of [...requests].reverse()) {
    const row = findOurRow({ rows: audit.rows, me: audit.me, submittedNote: request.note, sent: request.sent });
    if (row) return { row, request };
  }
  return null;
}

/** A settled re-read: the scope as read (again, if the first read predated our row) and what happened. */
type Attributed = { next: NumberOptOutScope; attribution: ClearedAttribution };

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
  // Records staff were shown that left the number and read as switched off
  // now, wherever they are (whatever the audit says).
  const [leftNumber, setLeftNumber] = useState<OptOutRecord[]>([]);
  // Records staff were shown that left the number with nothing to prove
  // either way: no row shows them switched back on, and they do not read as off.
  const [unconfirmedRecords, setUnconfirmedRecords] = useState<OptOutRecord[]>([]);
  // Records staff were shown that no longer exist (merged away, or deleted).
  const [goneRecords, setGoneRecords] = useState<OptOutRecord[]>([]);
  const [note, setNoteValue] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);

  // A newer read makes every older one stale; unmounting makes all of them.
  const generation = useRef(0);
  const submitLock = useRef(false);
  const scopeRef = useRef<NumberOptOutScope | null>(null);
  // A re-read that could not be settled ("Check again"): any reload repeats
  // it, against the same scope, rather than reading afresh.
  const unsettled = useRef<SettleJob | null>(null);
  // Requests whose outcome went unknown. Our own audit row is recognised by
  // one of them (its note and the scope it sent, and by who sent it).
  const inDoubt = useRef<InDoubtRequest[]>([]);
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
   * The audit rows that could settle `previous` (for its number, and for its
   * records under any number), and who is signed in. Part of the read that
   * just finished: null when a newer read (or an unmount) superseded it.
   */
  const readAudit = useCallback(async (previous: NumberOptOutScope): Promise<AuditRead | "failed" | null> => {
    const client = supabase;
    if (!client) return null;
    const id = generation.current;
    const [rows, me] = await Promise.all([
      listNumberReenables(
        client,
        previous.phoneKey,
        auditReadSince(previous),
        previous.records.map((record) => record.id),
      ),
      getSignedInUserId(client),
    ]);
    if (id !== generation.current) return null;
    if (rows.error) logFailure("audit", rows.error);
    if (me.error) logFailure("audit", me.error);
    return rows.error || me.error ? "failed" : { rows: rows.value, me: me.value };
  }, []);

  /** Each record's opt-out as it is now; null when superseded. */
  const readOptOutNow = useCallback(
    async (humanIds: string[]): Promise<Record<string, boolean> | "failed" | null> => {
      const client = supabase;
      if (!client) return null;
      const id = generation.current;
      const result = await getWhatsappOptOutNow(client, humanIds);
      if (id !== generation.current) return null;
      if (result.error) {
        logFailure("state", result.error);
        return "failed";
      }
      return result.value;
    },
    [],
  );

  /**
   * What happened to `previous`, given the scope as just read: the audit,
   * then each record that left as it is now. A scope read can be served
   * before our request commits and the audit read after it; then the scope
   * still shows what our row switched back on, so it is read once more.
   */
  const attribute = useCallback(
    async (previous: NumberOptOutScope, first: NumberOptOutScope): Promise<Attributed | "failed" | null> => {
      const audit = await readAudit(previous);
      if (audit === null || audit === "failed") return audit;
      const ours = findOurRequest(audit, inDoubt.current);
      let next = first;
      if (ours && scopePredatesRow(next, ours.row)) {
        const again = await readScope();
        if (!again) return null;
        if (again.error) {
          classify(again.error, "scope");
          return "failed";
        }
        next = again.value;
      }
      const listed = new Set(next.records.map((record) => record.id));
      const left = previous.records.filter((record) => !listed.has(record.id)).map((record) => record.id);
      const optedOutNow = await readOptOutNow(left);
      if (optedOutNow === null || optedOutNow === "failed") return optedOutNow;
      return {
        next,
        attribution: attributeCleared({
          previous,
          next,
          rows: audit.rows,
          me: ours ? audit.me : null,
          submittedNote: ours?.request.note ?? null,
          sent: ours?.request.sent,
          optedOutNow,
        }),
      };
    },
    [readAudit, readScope, readOptOutNow],
  );

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
      const unconfirmedIds = attribution?.unconfirmed ?? [];
      const goneIds = attribution?.gone ?? [];
      const movedIds = [...leftIds, ...unconfirmedIds, ...goneIds];
      const pick = (ids: readonly string[]) => previous.records.filter((record) => ids.includes(record.id));
      const newStop = diffScopes(previous, next).newStop;
      // Our request is accounted for: no later read should look for it.
      if (ours) inDoubt.current = [];

      if (ours && isScopeEmpty(next) && previous.records.every((record) => attribution?.byUs.includes(record.id))) {
        // It went through, exactly as if the request had answered: everything
        // it covered is on now, and nothing on the number is off since.
        adopt(next);
        setNotice(null);
        setLeftNumber([]);
        setUnconfirmedRecords([]);
        setGoneRecords([]);
        setStatus("done");
        onReenabledRef.current?.(
          { humanIds: proven, conversationIds: ours.conversationIds, auditId: ours.id },
          "done",
        );
        return;
      }
      if (proven.length > 0) onReenabledRef.current?.({ humanIds: proven, conversationIds: [] }, "already_on");
      setLeftNumber(pick(leftIds));
      setUnconfirmedRecords(pick(unconfirmedIds));
      setGoneRecords(pick(goneIds));

      if (isScopeEmpty(next)) {
        adopt(next);
        setNotice(null);
        setAlreadyOnReason(
          ours ? "ours" : proven.length > 0 ? "switched_on" : movedIds.length > 0 ? "left_number" : "empty",
        );
        setStatus("already_on");
        return;
      }
      if (ours) {
        // It went through, but the number has changed since: the records
        // shown now are switched off (again, or newly on this number), so
        // nothing is reported for them.
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
      showScope(next, previous, job.mode === "verify" ? "scope_changed" : job.changedKind, movedIds);
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
      let next = read.value;
      const { previous } = job;
      const stillOff = new Set(next.records.map((record) => record.id));
      const needsAudit =
        job.mode === "verify" ||
        (!isScopeEmpty(previous) &&
          (inDoubt.current.length > 0 ||
            isScopeEmpty(next) ||
            previous.records.some((record) => !stillOff.has(record.id))));
      let attribution: ClearedAttribution | null = null;
      if (needsAudit) {
        const attributed = await attribute(previous, next);
        if (!attributed) return;
        if (attributed === "failed") {
          setLeftNumber([]);
          setUnconfirmedRecords([]);
          setGoneRecords([]);
          setNotice({ kind: "unconfirmed" });
          setStatus("ready");
          return;
        }
        ({ next, attribution } = attributed);
      }
      unsettled.current = null;
      applyOutcome(job, next, attribution);
    },
    [readScope, attribute, failRead, applyOutcome],
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
    setUnconfirmedRecords([]);
    setGoneRecords([]);
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
          inDoubt.current.push({ note: note.trim(), sent: current });
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
    unconfirmedRecords,
    goneRecords,
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
