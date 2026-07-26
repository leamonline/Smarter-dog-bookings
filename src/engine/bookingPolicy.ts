// Presentation-only selectors for the visit-level booking policy.
//
// These map SERVER decisions onto labels and grouping. They never recalculate
// a deadline and never decide whether an action is permitted: there is
// deliberately no `canCancel`/`canReschedule` helper here, because a client
// that re-derives a deadline will eventually disagree with the database that
// actually enforces it.
import type {
  BookingVisit,
  DepositState,
  StaffBookingPolicyIncident,
  VisitActionability,
} from "../types/bookingPolicy";

export type VisitAttentionGroup =
  | "waiting_approval"
  | "awaiting_terms"
  | "awaiting_deposit"
  | "deposit_check_due"
  | "confirmed"
  | "finished"
  | "not_proceeding";

export interface VisitStatusView {
  group: VisitAttentionGroup;
  label: string;
  /** True when staff should act now; drives the attention queues. */
  needsStaffAttention: boolean;
}

/**
 * `Deposit check due` is derived, never stored and never a timer: a visit is
 * overdue purely because the clock has passed its due time. Exactly the due
 * instant is not yet due.
 */
export function isDepositCheckDue(
  visit: Pick<BookingVisit, "deposit">,
  now: Date,
): boolean {
  const deposit = visit.deposit;
  if (!deposit || !deposit.dueAt) return false;
  if (deposit.state !== "awaiting_terms" && deposit.state !== "awaiting_payment") {
    return false;
  }
  return new Date(deposit.dueAt).getTime() < now.getTime();
}

const DEPOSIT_LABELS: Record<DepositState, string> = {
  not_required: "No deposit needed",
  awaiting_terms: "Waiting for terms",
  awaiting_payment: "Waiting for deposit",
  received: "Deposit received",
  received_liability: "Deposit to sort out",
  not_received: "Deposit not received",
  reconciliation_required: "Needs checking",
};

export function depositLabel(state: DepositState): string {
  return DEPOSIT_LABELS[state];
}

export function visitStatusView(
  visit: BookingVisit,
  now: Date,
): VisitStatusView {
  if (visit.lifecycleState === "completed") {
    return { group: "finished", label: "Finished", needsStaffAttention: false };
  }
  if (
    visit.lifecycleState === "cancelled" ||
    visit.lifecycleState === "withdrawn" ||
    visit.lifecycleState === "declined"
  ) {
    const label =
      visit.lifecycleState === "cancelled"
        ? "Cancelled"
        : visit.lifecycleState === "withdrawn"
          ? "Withdrawn"
          : "Not confirmed";
    return { group: "not_proceeding", label, needsStaffAttention: false };
  }
  if (visit.lifecycleState === "superseded") {
    return { group: "finished", label: "Moved", needsStaffAttention: false };
  }

  if (isDepositCheckDue(visit, now)) {
    return {
      group: "deposit_check_due",
      label: "Deposit check due",
      needsStaffAttention: true,
    };
  }
  if (visit.deposit?.state === "awaiting_terms") {
    return {
      group: "awaiting_terms",
      label: "Waiting for terms",
      needsStaffAttention: false,
    };
  }
  if (visit.deposit?.state === "awaiting_payment") {
    return {
      group: "awaiting_deposit",
      label: "Waiting for deposit",
      needsStaffAttention: false,
    };
  }
  if (visit.approvalState === "waiting_staff") {
    return {
      group: "waiting_approval",
      label: "Waiting approval by staff",
      needsStaffAttention: true,
    };
  }
  if (visit.approvalState === "alternative_pending") {
    return {
      group: "waiting_approval",
      label: "Waiting for the customer",
      needsStaffAttention: false,
    };
  }
  return {
    group: "confirmed",
    label: visit.isLastMinute ? "Booked — last minute" : "Booked",
    needsStaffAttention: false,
  };
}

/**
 * The customer-facing explanation for a refused self-service action.
 *
 * Deadline always wins: an after-cutoff intent must read as "past the
 * deadline" even when the switch is also off, so the copy never invites a
 * customer to retry something the salon has already closed.
 */
export function actionRefusalCopy(action: VisitActionability): string | null {
  if (action.allowed) return null;
  if (action.deadlinePassed) {
    return "Changes for this appointment closed at 3:00 pm the day before. Your appointment is still booked — message the team and we'll sort it out.";
  }
  if (!action.stateEligible) {
    return "This appointment can't be changed online.";
  }
  if (!action.switchEnabled) {
    return "Online changes aren't available at the moment. Message the team and we'll help.";
  }
  if (action.moveLimitReached) {
    return "You've moved this appointment three times. Message the team and we'll find you a slot.";
  }
  if (!action.processingStateSafe) {
    return "This appointment has already started. Message the team and we'll help.";
  }
  return "Message the team and we'll help.";
}

export function remainingReschedulesLabel(remaining: number): string {
  if (remaining <= 0) return "No online moves left";
  if (remaining === 1) return "1 online move left";
  return `${remaining} online moves left`;
}

/** Incidents and their counts are staff-only; customers never see a tally. */
export function countableIncidents(
  incidents: StaffBookingPolicyIncident[],
): StaffBookingPolicyIncident[] {
  return incidents.filter((incident) => incident.waivedAt === null);
}

export function incidentsInRollingYear(
  incidents: StaffBookingPolicyIncident[],
  asOf: Date,
): number {
  const cutoff = new Date(asOf);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return countableIncidents(incidents).filter(
    (incident) => new Date(incident.appointmentDate).getTime() >= cutoff.getTime(),
  ).length;
}
