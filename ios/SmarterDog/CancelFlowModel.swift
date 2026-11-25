import Foundation
import Observation

// The cancel sheet's behaviour, with no screens and no network. The rules (`BookingCancel.swift`):
// one tap is one request; a refusal shows the website's words; a reply that never arrives is
// settled only by reading the booking again; and a retry after that reuses the same reason,
// because the server replays the original receipt only for the same reason.

/// What the cancel sheet asks the salon. The app sends through Supabase; tests use a stand-in.
protocol SalonCancelClient: Sendable {
    /// Send `cancel_customer_booking`. The only write this sheet makes.
    func cancelBooking(_ request: CancelRequest) async -> CancelSendResult
    /// The booking as the server holds it now. Nil when it was not found or the read failed.
    func reloadBooking(id: String) async -> BookingRow?
}

/// One visit the customer could cancel, as the sheet shows it.
struct CancelTarget: Identifiable, Equatable, Sendable {
    /// The booking the request names. The server cancels the rest of the visit with it.
    let id: String
    /// Every dog in the visit, because they are all cancelled together.
    let dogNames: [String]
    /// For example "Tuesday 1 December at 09:30".
    let whenText: String

    /// "Rex", "Rex and Bella", "Rex, Bella and Max".
    var namesText: String {
        switch dogNames.count {
        case 0: return "your dog"
        case 1: return dogNames[0]
        default: return dogNames.dropLast().joined(separator: ", ") + " and " + dogNames[dogNames.count - 1]
        }
    }

    /// The website's question (`BookingCard.jsx`), with the time added so the right visit is clear.
    var question: String { "Cancel the appointment for \(namesText)?" }

    /// Said only when more than one dog goes, so nobody is surprised.
    var togetherNote: String? {
        dogNames.count > 1 ? "\(namesText) are booked in together, so this cancels all of them." : nil
    }
}

@MainActor
@Observable
final class CancelFlowModel {
    enum State: Equatable {
        case choosing
        case sending
        case done(CancelOutcome)
    }

    let target: CancelTarget
    /// One of `CancelReason.choices`, or nil until the customer picks.
    var choice: String?
    /// The words typed when the choice is "Other".
    var otherText = ""
    private(set) var state: State = .choosing
    /// The reason last sent when its outcome is unknown. Held so that a retry sends the same words,
    /// which is what lets the server recognise it and replay the receipt instead of refusing it.
    private(set) var lockedReason: String?

    private let client: SalonCancelClient?

    init(target: CancelTarget, client: SalonCancelClient?) {
        self.target = target
        self.client = client
    }

    /// The reason that would be sent now.
    var reason: String? { lockedReason ?? CancelReason.text(choice: choice, other: otherText) }

    /// The reason can no longer be changed: a request with it may already have arrived.
    var isReasonLocked: Bool { lockedReason != nil }

    var isSending: Bool { state == .sending }

    var isCancelled: Bool {
        if case .done(.cancelled) = state { return true }
        return false
    }

    /// Whether the cancel button can be pressed.
    var canSend: Bool { client != nil && !isSending && !isCancelled && reason != nil }

    /// The words to show under the buttons, or nil.
    var message: String? {
        switch state {
        case .choosing, .sending: return nil
        case .done(.cancelled): return nil
        case .done(.refused(let message)): return message
        case .done(.notSent): return CancelCopy.notSent
        case .done(.unsure): return CancelCopy.unsure
        }
    }

    /// Send the cancel. While one is in flight a second tap does nothing.
    func send() async {
        guard canSend, let client, let reason else { return }
        state = .sending
        lockedReason = reason
        let result = await client.cancelBooking(CancelRequest(p_booking_id: target.id, p_reason: reason))
        let reread: BookingRow? = if case .unknown = result { await client.reloadBooking(id: target.id) } else { nil }
        finish(BookingCancel.outcome(result, reread: reread))
    }

    /// After an unknown outcome: read the booking again. Sends nothing.
    func checkAgain() async {
        guard case .done(.unsure) = state, let client else { return }
        state = .sending
        finish(BookingCancel.outcome(.unknown, reread: await client.reloadBooking(id: target.id)))
    }

    private func finish(_ outcome: CancelOutcome) {
        state = .done(outcome)
        // Only an unknown outcome keeps the reason: anything else is settled, so the next send
        // (if any) is a fresh request.
        if outcome != .unsure { lockedReason = nil }
    }
}
