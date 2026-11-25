import Foundation

// Cancelling a booking from the phone, with no screens and no network.
// Pure Foundation, so Linux CI tests it. Nothing here can send a cancellation by itself.
//
// The one write is `cancel_customer_booking(p_booking_id, p_reason)`. The database decides the
// rest: who owns the booking, which other dogs share the visit (they are cancelled together), and
// the salon's policy. Since ADR 015 a cancel made on the appointment's own London date is saved as
// a No-show by a database trigger. The app adds no rule of its own about that and shows no warning
// step (owner decision, 24 November 2026).
//
// The rules, the same as the confirm step:
//  - A refusal shows the website's words for its code, never the raw message.
//  - A reply that never arrives is an UNKNOWN outcome. The app reloads and reports what the server
//    holds. Sending the same cancel again is safe because the server replays the original receipt,
//    but only when the reason is the same, so a retry must reuse it.

/// Why the customer is cancelling. The same choices as the website (`BookingCard.jsx`).
enum CancelReason {
    static let other = "Other"
    static let choices = ["Changed plans", "Dog unwell", "Found another date", other]
    /// The database refuses a reason longer than this (`cancellation_reason_must_be_1_to_500_characters`).
    /// PostgreSQL's `char_length` counts Unicode code points, so that is what is counted here, not
    /// the characters Swift sees: one joined emoji such as 🐕‍🦺 is one character but three code points.
    static let maxLength = 500

    /// The reason to send, cleaned as the website cleans it: "Other" takes the typed words, any
    /// markup is removed, and it is cut to 500 characters. Nil when nothing usable is left, so the
    /// button stays off rather than the server refusing.
    static func text(choice: String?, other typed: String) -> String? {
        guard let choice, choices.contains(choice) else { return nil }
        let raw = choice == other ? typed.trimmingCharacters(in: .whitespacesAndNewlines) : choice
        let stripped = raw.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
        let cleaned = fitting(stripped.trimmingCharacters(in: .whitespacesAndNewlines))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    /// The longest start of `text` the database accepts, cut only between whole characters so an
    /// emoji is never split.
    static func fitting(_ text: String) -> String {
        var kept = ""
        var codePoints = 0
        for character in text {
            let size = character.unicodeScalars.count
            guard codePoints + size <= maxLength else { break }
            kept.append(character)
            codePoints += size
        }
        return kept
    }
}

/// The request body for `cancel_customer_booking`.
struct CancelRequest: Encodable, Equatable, Sendable {
    var p_booking_id: String
    var p_reason: String
}

/// What the server returns when a cancel succeeds (or is replayed).
struct CancelReceipt: Decodable, Equatable, Sendable {
    var target_booking_id: String
    var booking_group_id: String?
    var cancelled_booking_ids: [String]
    var cancelled_count: Int
    var cancelled_at: String

    /// The same checks as the website's `isValidCancellationRow`: the receipt is for the booking we
    /// asked about, names it among the cancelled ids, has no duplicates, and its count agrees.
    func isValid(for bookingId: String) -> Bool {
        let ids = cancelled_booking_ids
        return CancelWire.isUUID(target_booking_id)
            && target_booking_id.lowercased() == bookingId.lowercased()
            && (booking_group_id.map(CancelWire.isUUID) ?? true)
            && !ids.isEmpty
            && ids.allSatisfy(CancelWire.isUUID)
            && Set(ids.map { $0.lowercased() }).count == ids.count
            && ids.contains { $0.lowercased() == bookingId.lowercased() }
            && cancelled_count == ids.count
            && CancelWire.isTimestamp(cancelled_at)
    }
}

/// What the server said to the cancel, as the phone sees it.
enum CancelSendResult: Equatable, Sendable {
    /// Cancelled, with a receipt that passed the checks.
    case cancelled(CancelReceipt)
    /// The server answered and said no. The stable code (for example `SDC01`).
    case refused(code: String?)
    /// No usable answer. The booking may or may not be cancelled.
    case unknown
    /// It never left the phone. Nothing was sent.
    case notSent
}

/// Turns the HTTP answer to `cancel_customer_booking` into a result, in plain Swift.
///
/// - 2xx with exactly one receipt that passes the checks: cancelled.
/// - 4xx with a readable error body: refused. Nothing changed.
/// - Anything else (a receipt that does not check out, a 5xx, a gateway page): unknown.
enum CancelWire {
    static func sendResult(status: Int, body: Data, bookingId: String) -> CancelSendResult {
        switch status {
        case 200...299:
            guard let rows = try? JSONDecoder().decode([CancelReceipt].self, from: body),
                  rows.count == 1, rows[0].isValid(for: bookingId) else { return .unknown }
            return .cancelled(rows[0])
        case 400...499:
            guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return .unknown }
            let code = object["code"] as? String
            guard code != nil || object["message"] != nil else { return .unknown }
            return .refused(code: code)
        default:
            return .unknown
        }
    }

    /// A PostgreSQL `timestamptz` as JSON sends it, for example "2026-11-25T09:00:00.123456+00:00".
    /// Anything else means the receipt cannot be trusted (the website's check needs a parseable date too).
    static func isTimestamp(_ text: String) -> Bool {
        let pattern = #"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}(:?\d{2})?)$"#
        guard text.range(of: pattern, options: .regularExpression) != nil else { return false }
        // The shape is right; now check it is a real moment (no 31 February, no 25:00).
        let digits = text.prefix(19).split(whereSeparator: { "-T :".contains($0) }).compactMap { Int($0) }
        guard digits.count == 6 else { return false }
        var parts = DateComponents()
        (parts.year, parts.month, parts.day) = (digits[0], digits[1], digits[2])
        (parts.hour, parts.minute, parts.second) = (digits[3], digits[4], digits[5])
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return parts.isValidDate(in: calendar)
    }

    static func isUUID(_ text: String) -> Bool {
        text.range(
            of: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }
}

/// How a tap on "Cancel booking" ended.
enum CancelOutcome: Equatable, Sendable {
    /// Cancelled. These are every booking in the visit that went with it.
    case cancelled(ids: [String])
    /// The server said no. Nothing changed.
    case refused(message: String)
    /// It never left the phone. Nothing changed, and it is safe to try again.
    case notSent
    /// No usable reply, and a fresh read did not show it cancelled. It may still have gone through.
    /// Trying again with the same reason is safe.
    case unsure
}

enum CancelCopy {
    // The website's words (`friendlyCancellationError` in `BookingCard.jsx`). A guard test keeps them equal.
    static let switchedOff = "Online cancellation is currently unavailable. Please contact us and we’ll help."
    static let tooClose = "It’s too close to your appointment to cancel online. Please contact us and we’ll help."
    static let generic = "We couldn’t cancel your booking. Please try again, or contact us if it keeps happening."

    // The phone's own cases, which the website does not have.
    static let notSent = "We couldn't reach the salon, so nothing was cancelled. Check your connection and try again."
    static let unsure = "We couldn't tell whether your cancellation went through. Check your appointments before trying again."

    /// The customer copy for a refusal, by the stable code. Never the raw message.
    static func refusal(code: String?) -> String {
        switch code {
        case "SDC01": switchedOff
        case "SDC02": tooClose
        default: generic
        }
    }
}

enum BookingCancel {
    /// The bookings that go with the target when it is cancelled: the server cancels every booking
    /// sharing its group on the same date (a group id is reused across dates by recurring staff
    /// bookings, so the date matters), or just the target when it has no group.
    static func visit(of target: BookingRow, in rows: [BookingRow]) -> [BookingRow] {
        guard let group = target.group_id, !group.isEmpty else { return [target] }
        let together = rows.filter { $0.group_id == group && $0.booking_date == target.booking_date }
        return together.contains { $0.id == target.id } ? together : [target] + together
    }

    /// Whether to offer Cancel at all. Matches what the server will accept, so the customer is not
    /// shown a button that can only fail:
    ///  - the salon has not switched online cancellation off (unknown counts as allowed; the server decides),
    ///  - every booking in the visit is exactly "Booked" (the server refuses Reconfirmed, Arrived and
    ///    the rest, and a row with no status),
    ///  - the visit has not started yet, in London time.
    static func canCancel(visit: [BookingRow], allowCancellations: Bool?, now: Date) -> Bool {
        guard allowCancellations != false, !visit.isEmpty else { return false }
        guard visit.allSatisfy({ $0.status == BookingStatusName.booked }) else { return false }
        guard let start = earliestStart(of: visit) else { return false }
        return now < start
    }

    /// The earliest drop-off in the visit as a moment in time, reading date and slot as London wall time.
    static func earliestStart(of visit: [BookingRow]) -> Date? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = HomeSelector.london
        let starts = visit.compactMap { row -> Date? in
            let day = row.booking_date.prefix(10).split(separator: "-").compactMap { Int($0) }
            let time = row.slot.prefix(5).split(separator: ":").compactMap { Int($0) }
            guard day.count == 3, time.count == 2 else { return nil }
            return calendar.date(from: DateComponents(
                year: day[0], month: day[1], day: day[2], hour: time[0], minute: time[1]
            ))
        }
        guard starts.count == visit.count else { return nil }
        return starts.min()
    }

    /// The outcome of a send. For an unknown reply, `reread` is the target as a fresh read of the
    /// customer's bookings found it (nil when it was not found or that read failed too).
    static func outcome(_ result: CancelSendResult, reread: BookingRow? = nil) -> CancelOutcome {
        switch result {
        case .cancelled(let receipt):
            return .cancelled(ids: receipt.cancelled_booking_ids)
        case .refused(let code):
            return .refused(message: CancelCopy.refusal(code: code))
        case .notSent:
            return .notSent
        case .unknown:
            // A row that now reads Cancelled or No-show (a same-day cancel) went through.
            if let row = reread,
               row.status == BookingStatusName.cancelled || row.status == BookingStatusName.noShow {
                return .cancelled(ids: [row.id])
            }
            return .unsure
        }
    }
}
