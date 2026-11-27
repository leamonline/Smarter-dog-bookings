import Foundation

// What happens when the customer taps the confirm button, with no screens and no network.
// Pure Foundation, so Linux CI tests it. The model (`BookingFlowModel.confirm()`) drives it; the
// app's Supabase client does the sending. Nothing here can send a booking by itself.
//
// The rules (from the plan, "Failure behaviour"):
//  - A refusal shows the website's warm copy for that code, never the raw message.
//  - A reply that never arrives (network lost, timed out, unreadable) is an UNKNOWN outcome.
//    The app does not say it worked and does not say it failed. It looks the booking up on the
//    server and reports what is there. It never sends again by itself.
//  - A deposit is reported from the booking read back after it was made, never from a pre-check,
//    because the database stamps it whichever route made the booking.

/// What the server said to the request, as the phone sees it.
enum BookingSendResult: Equatable, Sendable {
    /// The server created the booking. These are the new booking ids.
    case created(ids: [String])
    /// The server answered and said no. The raw words, so the phone can pick the customer copy.
    case refused(message: String?, details: String?)
    /// No usable answer: the network dropped, it timed out, or the reply could not be read.
    /// The booking may or may not exist.
    case unknown
    /// It never left the phone (no connection, no signed-in session, or the request could not be built).
    /// Nothing was sent, so it is safe to try again.
    case notSent
}

/// One booking as read back from the server after it was made, or looked up afterwards.
struct BookedRow: Decodable, Equatable, Sendable {
    var id: String
    var booking_date: String?
    var slot: String?
    var service: String?
    var status: String?
    var deposit_required: Bool?
    /// Pounds, for example 10. The database column is numeric, which JSON may send as a number or a string.
    var deposit_amount: Double?

    init(id: String, booking_date: String? = nil, slot: String? = nil, service: String? = nil,
         status: String? = nil, deposit_required: Bool? = nil, deposit_amount: Double? = nil) {
        self.id = id
        self.booking_date = booking_date
        self.slot = slot
        self.service = service
        self.status = status
        self.deposit_required = deposit_required
        self.deposit_amount = deposit_amount
    }

    /// Whether this row still holds its slot, as the website decides (`isActiveBooking`): everything
    /// except a cancelled booking or a no-show. A row with no status counts as live. A cancelled
    /// booking stays in the table, and the same dog may book the same slot again, so history must
    /// never be mistaken for the booking that was just made.
    var isLive: Bool {
        guard let status else { return true }
        return status != "Cancelled" && status != "No-show"
    }

    private enum CodingKeys: String, CodingKey {
        case id, booking_date, slot, service, status, deposit_required, deposit_amount
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        booking_date = try? container.decode(String.self, forKey: .booking_date)
        slot = try? container.decode(String.self, forKey: .slot)
        service = try? container.decode(String.self, forKey: .service)
        status = try? container.decode(String.self, forKey: .status)
        deposit_required = try? container.decode(Bool.self, forKey: .deposit_required)
        if let number = try? container.decode(Double.self, forKey: .deposit_amount) {
            deposit_amount = number
        } else if let text = try? container.decode(String.self, forKey: .deposit_amount) {
            deposit_amount = Double(text)
        } else {
            deposit_amount = nil
        }
    }
}

/// Whether a deposit is due, as read back from the booking itself.
enum DepositNote: Equatable, Sendable {
    /// Read back, and none is due.
    case none
    /// Read back, and one is due. The amount in pence when the row carried one.
    case due(amountPence: Int?)
    /// The booking could not be read back, so nothing can be said about a deposit.
    case unknown

    static func from(_ row: BookedRow?) -> DepositNote {
        guard let row, let required = row.deposit_required else { return .unknown }
        guard required else { return .none }
        let pence = row.deposit_amount.map { Int(($0 * 100).rounded()) }.flatMap { $0 > 0 ? $0 : nil }
        return .due(amountPence: pence)
    }

    /// The line for the booked screen, or nil when there is nothing to say. The app takes no
    /// payment and shows no bank details: the salon gets in touch.
    var text: String? {
        switch self {
        case .none:
            return nil
        case .due(let pence):
            let amount = pence.map { BookingService.formatPounds($0) + " " } ?? ""
            return "A \(amount)deposit is due to hold this booking. The salon will be in touch about paying."
        case .unknown:
            return "We couldn't check whether a deposit is due. The salon will tell you if one is."
        }
    }
}

/// What the booked screen shows. Built from what was chosen, plus what the server confirmed.
struct BookedSummary: Equatable, Sendable {
    var dogName: String
    var service: String
    /// For example "Tuesday 1 December 2026 at 9:30am".
    var whenText: String
    var deposit: DepositNote
    var bookingIds: [String]
}

/// How a tap on confirm ended.
enum ConfirmOutcome: Equatable, Sendable {
    /// The server created it.
    case booked(BookedSummary)
    /// The server said no. Nothing was created. `reason` is the stable code, `message` the customer copy.
    case refused(reason: String, message: String)
    /// Checked just before sending: the time has gone. Nothing was sent.
    case slotTaken
    /// The request could not even be built from the choices. Nothing was sent.
    case incomplete
    /// It never left the phone, for example there was no connection. Nothing was sent.
    case notSent
    /// No usable reply, and a look at the server found no such booking. It may still exist.
    /// The customer is told to check their appointments, and nothing is sent again by itself.
    case unsure
}

enum ConfirmState: Equatable, Sendable {
    case idle
    /// Re-reading the day, just before sending.
    case checking
    case sending
    case done(ConfirmOutcome)
}

enum BookingConfirm {
    static let slotTakenMessage = "That time's just been taken. Go back and pick another."
    static let incompleteMessage = "Something is missing from your choices. Go back and check each step."
    static let notSentMessage = "We couldn't reach the salon, so nothing was booked. Check your connection and try again."
    static let unsureMessage = "We couldn't tell whether your booking went through. Please check your appointments before trying again, so you don't book twice."

    /// The customer copy for a refusal, by the stable code first and the message as a fallback.
    static func refusal(message: String?, details: String?) -> ConfirmOutcome {
        .refused(
            reason: BookingDenial.reason(message: message, details: details),
            message: BookingDenial.customerMessage(message: message, details: details)
        )
    }

    /// Pick the booking this request made out of a list of rows: the live one that matches the dog's
    /// date and slot. A cancelled booking or a no-show is history, never a match. Used when only a lookup, not a reply, tells us what happened.
    static func matching(_ rows: [BookedRow], date: String, slot: String) -> BookedRow? {
        rows.first {
            $0.isLive
                && ($0.booking_date.map { String($0.prefix(10)) } == date)
                && ($0.slot.map { String($0.prefix(5)) } == slot)
        }
    }
}

// MARK: - The wire

/// Turns the HTTP answer to `create_customer_booking_group` into a result, in plain Swift.
///
/// The app sends this one request itself rather than through the Supabase library, because the
/// refusal mapping depends on one exact field (the database's `details`, which carries the stable
/// reason code) and the library's error type changes between versions. Here the words that matter
/// are read straight from the body, and the rule is tested against real answers recorded from the
/// staging project.
///
/// - 2xx with at least one id: created.
/// - 4xx with a readable error body: the server said no. Nothing was created.
/// - Anything else (a 2xx that cannot be read, a 5xx, a gateway page, an unreadable body): unknown,
///   because the booking may exist. The app then looks the booking up.
enum BookingWire {
    static func sendResult(status: Int, body: Data) -> BookingSendResult {
        switch status {
        case 200...299:
            if let object = try? JSONSerialization.jsonObject(with: body) as? [[String: Any]] {
                let ids = object.compactMap { $0["id"] as? String }
                if !ids.isEmpty, ids.count == object.count { return .created(ids: ids) }
            }
            return .unknown
        case 400...499:
            guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return .unknown }
            let message = object["message"] as? String
            // `details` is usually text, but PostgREST can send other shapes for some errors.
            let details = object["details"] as? String
            let code = object["code"] as? String
            guard message != nil || details != nil || code != nil else { return .unknown }
            return .refused(message: message, details: details)
        default:
            return .unknown
        }
    }

    /// Whether a failed request certainly never reached the salon: the connection was never made.
    /// A timeout or a dropped connection is not here, because the request may have arrived.
    static func neverLeftThePhone(_ error: URLError.Code) -> Bool {
        switch error {
        case .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed,
             .internationalRoamingOff, .dataNotAllowed:
            return true
        default:
            return false
        }
    }
}

/// The Debug-only live booking switch may only ever run against the staging project. A mistake in
/// the app's configuration must not be able to point it at production.
enum LiveBookingGuard {
    static let stagingHost = "btjnxvgkpdbfrrqxvkfj.supabase.co"

    static func isStaging(_ urlString: String) -> Bool {
        URL(string: urlString)?.host?.lowercased() == stagingHost
    }
}
