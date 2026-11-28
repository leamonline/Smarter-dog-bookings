import Foundation

// Legal staff status moves and field-scoped booking patches for Today.
// Pure Foundation, so Linux CI tests it and `StaffDayParityTests` checks
// `legalActions` and `reverseStatus` against `src/engine/salonBoard.ts`.
//
// Every move writes ONLY the columns it means to change (`StaffBookingPatch`),
// matching `columnsToWrite` / `_changedFields` in `src/supabase/hooks/useBookings.ts`,
// so a status tap on one device can never overwrite a payment, slot or date
// saved on another.

/// The staff-floor status and confirmation moves supported in Phase S2.
/// Payment and check-out ("Take payment" / "Mark collected") belong to Phase S3
/// so a dog is never recorded collected while money is owed (ST-9).
enum StaffBookingActionKind: String, CaseIterable, Equatable, Sendable {
    case checkIn
    case reconfirm
    case ready
    case confirm
    case unconfirm
    case didntShow
    case undoNoShow
}

/// One action shown for a dog on Today.
struct StaffBookingAction: Identifiable, Equatable, Sendable {
    enum Emphasis: String, Equatable, Sendable {
        /// The one obvious next move for this state (yellow capsule).
        case primary
        /// A normal, safe operation.
        case secondary
        /// Reversals and terminal exits; never competes for the eye.
        case quiet
    }

    let id: StaffBookingActionKind
    let label: String
    let emphasis: Emphasis
}

/// Three-state column value for a partial PATCH: omit the column, write SQL NULL,
/// or write a value. Standard Swift `Optional` omits `nil` on encode, which cannot
/// clear a column like `cancel_reason` or `reminder_confirmed_at`.
enum PatchField<Value: Equatable & Sendable & Encodable>: Equatable, Sendable {
    case unchanged
    case null
    case value(Value)

    var isChanged: Bool {
        if case .unchanged = self { return false }
        return true
    }
}

/// A minimal column update to `public.bookings`.
/// Deliberately contains ONLY status, cancellation reason and staff-confirmation
/// columns — never payment, slot, booking_date or price fields.
struct StaffBookingPatch: Equatable, Sendable, Encodable {
    var status: PatchField<String> = .unchanged
    var cancelReason: PatchField<String> = .unchanged
    var reminderConfirmedAt: PatchField<String> = .unchanged
    var reminderConfirmedSource: PatchField<String> = .unchanged

    var isEmpty: Bool {
        !status.isChanged && !cancelReason.isChanged && !reminderConfirmedAt.isChanged && !reminderConfirmedSource.isChanged
    }

    private enum CodingKeys: String, CodingKey {
        case status
        case cancel_reason
        case reminder_confirmed_at
        case reminder_confirmed_source
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try encodeField(status, forKey: .status, into: &container)
        try encodeField(cancelReason, forKey: .cancel_reason, into: &container)
        try encodeField(reminderConfirmedAt, forKey: .reminder_confirmed_at, into: &container)
        try encodeField(reminderConfirmedSource, forKey: .reminder_confirmed_source, into: &container)
    }

    private func encodeField<T: Encodable>(
        _ field: PatchField<T>,
        forKey key: CodingKeys,
        into container: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        switch field {
        case .unchanged:
            break
        case .null:
            try container.encodeNil(forKey: key)
        case .value(let value):
            try container.encode(value, forKey: key)
        }
    }
}

/// Server-side WHERE guards for concurrent-write safety, matching `useBookings.ts`.
struct StaffBookingWriteGuard: Equatable, Sendable {
    /// Filter `reminder_confirmed_source = 'staff'` so a customer's own
    /// confirmation that raced in is never wiped.
    var requireStaffConfirmationSource: Bool = false
    /// When set, require `status = requireStatus` on the first attempt.
    /// Used when undoing a staff Confirm that moved `Booked -> Reconfirmed` so
    /// a check-in from another device is never rolled back.
    var requireStatus: String? = nil
    /// If `requireStatus` matched 0 rows, retry once with this narrower patch
    /// (clearing only the staff confirmation, leaving the newer status intact).
    var fallbackPatchOnZeroRows: StaffBookingPatch? = nil

    static let none = StaffBookingWriteGuard()
}

struct StaffBookingWriteRequest: Equatable, Sendable {
    let bookingId: String
    let patch: StaffBookingPatch
    var guardCondition: StaffBookingWriteGuard = .none
}

enum StaffBookingWriteOutcome: Equatable, Sendable {
    case updated(StaffBookingRow)
    /// The guarded UPDATE matched zero rows (e.g. a customer confirmed before
    /// staff tapped Unconfirm).
    case notMatched
}

struct StaffUndoAction: Equatable, Sendable {
    let bookingId: String
    let request: StaffBookingWriteRequest
    let successMessage: String
    let failureMessage: String
    let notMatchedMessage: String?
}

struct StaffMovePlan: Equatable, Sendable {
    let action: StaffBookingActionKind
    let request: StaffBookingWriteRequest
    let successMessage: String
    let failureMessage: String
    let notMatchedMessage: String?
    let opensCollectionPrompt: Bool
}

enum StaffDayActions {
    static let noShowReason = "No-show"
    static let unconfirmNotMatchedMessage = "Couldn't undo — if the customer has just confirmed themselves, their confirmation stands."

    /// Legal S2 actions for a row, in the exact order and wording of `tokenActions`
    /// in `src/engine/salonBoard.ts` (filtered to the S2 status/confirmation moves).
    static func legalActions(for row: StaffDayRow) -> [StaffBookingAction] {
        let booking = row.booking
        if row.stage == .noShow {
            // Grouped bookings cannot be restored from No-show: the capacity trigger
            // refuses a grouped booking moving back onto a seat (SDC03).
            guard booking.groupId == nil else { return [] }
            return [StaffBookingAction(id: .undoNoShow, label: "They turned up", emphasis: .primary)]
        }

        switch booking.status {
        case StaffDayStack.booked, StaffDayStack.reconfirmed:
            var actions: [StaffBookingAction] = []
            if booking.status == StaffDayStack.booked {
                actions.append(StaffBookingAction(id: .reconfirm, label: "Reconfirmed", emphasis: .secondary))
            }
            actions.append(StaffBookingAction(id: .checkIn, label: "Check in", emphasis: .primary))
            if StaffDayStack.isUnconfirmed(booking) {
                actions.append(StaffBookingAction(id: .confirm, label: "Confirm booking", emphasis: .secondary))
            }
            if booking.reminderConfirmedBy == "staff" {
                actions.append(StaffBookingAction(id: .unconfirm, label: "Unconfirm booking", emphasis: .quiet))
            }
            actions.append(StaffBookingAction(id: .didntShow, label: "Didn't show", emphasis: .quiet))
            return actions

        case StaffDayStack.arrived:
            return [StaffBookingAction(id: .ready, label: "Mark ready", emphasis: .primary)]

        default:
            // Ready for collection check-out belongs to Phase S3 (ST-9: never collected unpaid).
            // Completed and Cancelled have no status moves here.
            return []
        }
    }

    /// Mirrors `reverseStatusFor` in `src/engine/salonBoard.ts`.
    static func reverseStatus(for action: StaffBookingActionKind, previousStatus: String) -> String? {
        switch action {
        case .checkIn:
            return (previousStatus == StaffDayStack.booked || previousStatus == StaffDayStack.reconfirmed)
                ? previousStatus
                : nil
        case .reconfirm:
            return previousStatus == StaffDayStack.booked ? StaffDayStack.booked : nil
        case .ready:
            return previousStatus == StaffDayStack.arrived ? StaffDayStack.arrived : nil
        case .confirm, .unconfirm, .didntShow, .undoNoShow:
            return nil
        }
    }

    /// Build the exact write request and staff feedback copy for a move,
    /// matching `useBookingActions.ts` and `useBookings.ts`.
    static func plan(action: StaffBookingActionKind, for booking: StaffBooking, now: Date) -> StaffMovePlan {
        let name = StaffDaySelector.dogName(booking)
        switch action {
        case .checkIn:
            return StaffMovePlan(
                action: action,
                request: StaffBookingWriteRequest(
                    bookingId: booking.id,
                    patch: StaffBookingPatch(status: .value(StaffDayStack.arrived))
                ),
                successMessage: "\(name) checked in — with us now",
                failureMessage: "Check-in could not be saved.",
                notMatchedMessage: nil,
                opensCollectionPrompt: false
            )

        case .reconfirm:
            return StaffMovePlan(
                action: action,
                request: StaffBookingWriteRequest(
                    bookingId: booking.id,
                    patch: StaffBookingPatch(status: .value(StaffDayStack.reconfirmed))
                ),
                successMessage: "\(name)'s booking reconfirmed",
                failureMessage: "Reconfirming this booking could not be saved.",
                notMatchedMessage: nil,
                opensCollectionPrompt: false
            )

        case .ready:
            return StaffMovePlan(
                action: action,
                request: StaffBookingWriteRequest(
                    bookingId: booking.id,
                    patch: StaffBookingPatch(status: .value(StaffDayStack.ready))
                ),
                successMessage: "\(name) is ready to go home",
                failureMessage: "Ready for collection could not be saved.",
                notMatchedMessage: nil,
                opensCollectionPrompt: true
            )

        case .confirm:
            let todayLondon = StaffDayStack.londonDate(now)
            let advancesToReconfirmed = booking.status == StaffDayStack.booked && booking.date >= todayLondon
            let isoNow = isoTimestamp(now)
            return StaffMovePlan(
                action: action,
                request: StaffBookingWriteRequest(
                    bookingId: booking.id,
                    patch: StaffBookingPatch(
                        status: advancesToReconfirmed ? .value(StaffDayStack.reconfirmed) : .unchanged,
                        reminderConfirmedAt: .value(isoNow),
                        reminderConfirmedSource: .value("staff")
                    )
                ),
                successMessage: "\(name)'s booking confirmed",
                failureMessage: "Confirming this booking could not be saved.",
                notMatchedMessage: nil,
                opensCollectionPrompt: false
            )

        case .unconfirm:
            return StaffMovePlan(
                action: action,
                request: StaffBookingWriteRequest(
                    bookingId: booking.id,
                    patch: StaffBookingPatch(
                        reminderConfirmedAt: .null,
                        reminderConfirmedSource: .null
                    ),
                    guardCondition: StaffBookingWriteGuard(requireStaffConfirmationSource: true)
                ),
                successMessage: "\(name)'s booking is unconfirmed again",
                failureMessage: unconfirmNotMatchedMessage,
                notMatchedMessage: unconfirmNotMatchedMessage,
                opensCollectionPrompt: false
            )

        case .didntShow:
            return StaffMovePlan(
                action: action,
                request: StaffBookingWriteRequest(
                    bookingId: booking.id,
                    patch: StaffBookingPatch(
                        status: .value(StaffDayStack.noShow),
                        cancelReason: .value(noShowReason)
                    )
                ),
                successMessage: "\(name) marked as a no-show",
                failureMessage: "Marking this booking as a no-show could not be saved.",
                notMatchedMessage: nil,
                opensCollectionPrompt: false
            )

        case .undoNoShow:
            return StaffMovePlan(
                action: action,
                request: StaffBookingWriteRequest(
                    bookingId: booking.id,
                    patch: StaffBookingPatch(
                        status: .value(StaffDayStack.booked),
                        cancelReason: .null
                    )
                ),
                successMessage: "\(name) is back in today's appointments",
                failureMessage: "Restoring this booking could not be saved.",
                notMatchedMessage: nil,
                opensCollectionPrompt: false
            )
        }
    }

    /// Build the exact minimal Undo action from the pre-move booking and the
    /// persisted server row, matching `useBookingActions.ts`.
    static func undoAction(
        for action: StaffBookingActionKind,
        before: StaffBooking,
        persisted: StaffBookingRow
    ) -> StaffUndoAction? {
        let name = StaffDaySelector.dogName(before)
        if let previousStatus = reverseStatus(for: action, previousStatus: before.status) {
            return StaffUndoAction(
                bookingId: before.id,
                request: StaffBookingWriteRequest(
                    bookingId: before.id,
                    patch: StaffBookingPatch(status: .value(previousStatus))
                ),
                successMessage: "\(name) moved back to \(zoneTitle(for: previousStatus))",
                failureMessage: "That change could not be undone.",
                notMatchedMessage: nil
            )
        }

        switch action {
        case .confirm:
            let restoreBooked = before.status == StaffDayStack.booked
                && persisted.status == StaffDayStack.reconfirmed
            let confirmationOnly = StaffBookingPatch(
                reminderConfirmedAt: .null,
                reminderConfirmedSource: .null
            )
            let patch = StaffBookingPatch(
                status: restoreBooked ? .value(StaffDayStack.booked) : .unchanged,
                reminderConfirmedAt: .null,
                reminderConfirmedSource: .null
            )
            return StaffUndoAction(
                bookingId: before.id,
                request: StaffBookingWriteRequest(
                    bookingId: before.id,
                    patch: patch,
                    guardCondition: StaffBookingWriteGuard(
                        requireStaffConfirmationSource: true,
                        requireStatus: restoreBooked ? StaffDayStack.reconfirmed : nil,
                        fallbackPatchOnZeroRows: restoreBooked ? confirmationOnly : nil
                    )
                ),
                successMessage: "\(name)'s booking is unconfirmed again",
                failureMessage: unconfirmNotMatchedMessage,
                notMatchedMessage: unconfirmNotMatchedMessage
            )

        case .didntShow:
            let cancelField: PatchField<String> = before.cancelReason.map { .value($0) } ?? .null
            return StaffUndoAction(
                bookingId: before.id,
                request: StaffBookingWriteRequest(
                    bookingId: before.id,
                    patch: StaffBookingPatch(
                        status: .value(before.status),
                        cancelReason: cancelField
                    )
                ),
                successMessage: "\(name) is back in today's appointments",
                failureMessage: "That change could not be undone.",
                notMatchedMessage: nil
            )

        case .checkIn, .reconfirm, .ready, .unconfirm, .undoNoShow:
            return nil
        }
    }

    /// Translate raw PostgreSQL capacity/duplicate errors into plain staff copy.
    static func friendlyError(raw: String?, fallback: String) -> String {
        let lower = (raw ?? "").lowercased()
        if lower.contains("sdc03") || lower.contains("grouped") {
            return "This dog is part of a grouped booking. Restore it from the calendar on the website."
        }
        if lower.contains("23505") || lower.contains("duplicate key") || lower.contains("bookings_one_active_per_dog_slot") {
            return "That dog is already booked at that time — refresh to see the latest."
        }
        if lower.contains("slot") && (lower.contains("full") || lower.contains("capacity") || lower.contains("2-2-1") || lower.contains("blocked")) {
            return "That slot is now full — refresh or restore from the calendar on the website."
        }
        return fallback
    }

    private static func zoneTitle(for status: String) -> String {
        switch status {
        case StaffDayStack.booked, StaffDayStack.reconfirmed: "arriving"
        case StaffDayStack.arrived: "with us"
        case StaffDayStack.ready: "ready"
        case StaffDayStack.completed: "gone home"
        default: "its previous status"
        }
    }

    static func isoTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}
