import Foundation

// Booking models for the iPhone app: the refusal-code mapping and its customer
// copy, the date window, the booking rules, and the payload for
// `create_customer_booking_group`. Pure Foundation: no UI, no Supabase and no
// network, so Linux CI can test it. Nothing in this file sends a booking.
//
// The website is the reference. Where this file mirrors it, a test fails if the
// two drift: `src/security/iosBookingDenials.test.ts` checks the codes and the
// customer copy, and `ios/AuthCoreTests/denial-cases.json` is read by both the
// Swift tests and that Node test, so one table decides what each message means.

// MARK: - Refusals

/// Why the database refused a booking, and what the customer is told.
/// Mirrors `mapDenialReason` and `friendlyDenialMessage` in `src/engine/denials.ts`.
/// The database is the authority. This only chooses words.
enum BookingDenial {
    /// Every reason code the website knows, `unknown` last.
    static let reasonCodes: [String] = ["capacity_2_2_1", "daily_cap", "slot_full", "seat_blocked", "large_dog_ineligible", "calendar_closed", "past_date", "past_cutoff", "pregnant", "customer_slot_blocked", "double_booked", "awaiting_approval", "profile_incomplete", "dog_size_unconfirmed", "dog_not_owned", "unavailable", "unknown"]

    /// Refusals about the customer's account, not the salon's capacity.
    static let accountRefusals: Set<String> = [
        "awaiting_approval", "profile_incomplete", "dog_size_unconfirmed", "dog_not_owned",
    ]

    /// The customer-facing sentence for each code. One entry per line, so the drift
    /// test can read them. Copied from `friendlyDenialMessage`; do not reword here.
    static let customerCopy: [String: String] = [
        "capacity_2_2_1": "That time’s just been taken. Please choose another slot — there’s usually one free close by.",
        "daily_cap": "That day’s now fully booked. Try another day, or join the waitlist and we’ll be in touch as soon as a space opens up.",
        "slot_full": "That time’s just been taken. Please choose another slot — there’s usually one free close by.",
        "seat_blocked": "That time’s just been taken. Please choose another slot — there’s usually one free close by.",
        "large_dog_ineligible": "That time isn’t available for a larger dog. Please pick another slot, or give us a call and we’ll find one that works.",
        "calendar_closed": "Sorry, the salon’s closed at that time. Please choose another day or slot.",
        "past_date": "That date has already passed. Please choose an upcoming day.",
        "past_cutoff": "That slot’s a bit too close to its start time to book online now — we need a little notice. Please pick a later time or another day.",
        "pregnant": "Pregnant dogs need a quick chat first — please message us on WhatsApp so we can look after her properly. 🐾",
        "customer_slot_blocked": "That time isn’t available for your account — please pick a different time, or message the salon and we’ll help.",
        "double_booked": "That dog’s already booked in for that time. Check “My appointments”, or pick a different slot.",
        "awaiting_approval": "Your account is still being approved, so online booking isn’t open to you yet. Please bear with us — we’ll message you as soon as you’re set up.",
        "profile_incomplete": "Please finish your profile (name, address and agreeing to our policies) before booking, then try again.",
        "dog_size_unconfirmed": "We need to confirm your dog’s size before it can be booked online. Please message the salon and we’ll sort it out.",
        "dog_not_owned": "We couldn’t match that dog to your account. Please check the dog you picked, or message the salon and we’ll help.",
        "unavailable": "That time’s just been taken. Please choose another slot — there’s usually one free close by.",
    ]

    /// Shown for `unknown`, and for any code this table does not have.
    /// Never the raw database message.
    static let genericCopy = "Sorry, that slot isn’t available anymore. Please choose another time, or message us if it keeps happening."

    /// A stable reason code. A code in `details` (the exception's DETAIL) beats
    /// guessing from the message, and only one of our own codes is trusted.
    static func reason(message: String?, details: String?) -> String {
        let emitted = (details ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !emitted.isEmpty, reasonCodes.contains(emitted) {
            return emitted
        }
        let m = (message ?? "").lowercased()
        if m.isEmpty { return "unknown" }
        if m.contains("pregnant") { return "pregnant" }
        if m.contains("awaiting approval") { return "awaiting_approval" }
        if m.contains("complete your profile") { return "profile_incomplete" }
        if m.contains("dog_size_unconfirmed") { return "dog_size_unconfirmed" }
        if m.contains("not on your account") { return "dog_not_owned" }
        if m.contains("for your account") { return "customer_slot_blocked" }
        if m.contains("2-2-1") { return "capacity_2_2_1" }
        if m.contains("fully booked") && m.contains("per day") { return "daily_cap" }
        if m.contains("slot is full") { return "slot_full" }
        let largeDogPhrases = [
            "large dog", "large dogs", "back-to-back", "small/medium dog can share",
            "early close", "conditional:",
        ]
        if largeDogPhrases.contains(where: { m.contains($0) }) { return "large_dog_ineligible" }
        if m.contains("same-day") || m.contains("too close to the start time") { return "past_cutoff" }
        if m.contains("in the past") { return "past_date" }
        if m.contains("blocked") { return "seat_blocked" }
        if m.contains("closed") { return "calendar_closed" }
        if m.contains("twice") || m.contains("already booked") || m.contains("duplicate") {
            return "double_booked"
        }
        if m.contains("invalid slot") { return "unavailable" }
        return "unknown"
    }

    /// What to show the customer for a refusal.
    static func customerMessage(message: String?, details: String?) -> String {
        customerCopy[reason(message: message, details: details)] ?? genericCopy
    }
}

// MARK: - Rules from the salon

/// The customer-visible slice of `current_customer_booking_rules()`.
/// Mirrors `parseCustomerPortalPolicy` in `src/supabase/customerBookingRules.ts`:
/// anything unreadable becomes "not established", never a guess.
struct BookingRules: Equatable, Sendable {
    static let legacyHorizonDays = 28

    /// How many days ahead a customer may book (tomorrow counts as day 1).
    var horizonDays: Int
    /// The salon's own sentence about when changes close, or nil if unreadable.
    var changeDeadlineDescription: String?
    var allowCancellations: Bool?

    static let unknown = BookingRules(horizonDays: legacyHorizonDays, changeDeadlineDescription: nil, allowCancellations: nil)

    /// Reads the JSON the RPC returns. A missing or odd payload gives `unknown`.
    static func parse(_ data: Data?) -> BookingRules {
        guard let data, let raw = try? JSONDecoder().decode(Raw.self, from: data) else {
            return .unknown
        }
        var horizon = legacyHorizonDays
        if let days = raw.bookingHorizonDays?.value, (1...730).contains(days) {
            horizon = days
        }
        var description: String?
        if let text = raw.changeDeadline?.value?.description?.value?.trimmingCharacters(in: .whitespacesAndNewlines),
           !text.isEmpty {
            description = text
        }
        return BookingRules(
            horizonDays: horizon,
            changeDeadlineDescription: description,
            allowCancellations: raw.customerPortal?.value?.allowCancellations?.value
        )
    }

    /// Decodes a field if it is the right type and quietly drops it if it is not, so
    /// one odd value cannot hide the rest. A JSON `true` is not a number here.
    private struct Lenient<Value: Decodable>: Decodable {
        let value: Value?
        init(from decoder: Decoder) throws {
            value = try? decoder.singleValueContainer().decode(Value.self)
        }
    }

    private struct Raw: Decodable {
        struct Deadline: Decodable { var description: Lenient<String>? }
        struct Portal: Decodable { var allowCancellations: Lenient<Bool>? }
        var bookingHorizonDays: Lenient<Int>?
        var changeDeadline: Lenient<Deadline>?
        var customerPortal: Lenient<Portal>?
    }
}

// MARK: - Dates and slots

enum BookingWindow {
    /// The dates a customer may pick, as `yyyy-MM-dd` in the salon's own time
    /// (Europe/London): tomorrow, then each day up to `horizonDays` ahead.
    /// Today is not in the window. Same-day "last minute" slots are a separate
    /// path that depends on what staff have flagged. Whether a day is open, or
    /// full, is decided by the salon's calendar, not by this list.
    static func dates(now: Date, horizonDays: Int) -> [String] {
        guard horizonDays >= 1 else { return [] }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = HomeSelector.london
        let startOfToday = calendar.startOfDay(for: now)
        return (1...horizonDays).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: startOfToday).map { HomeSelector.londonDate($0) }
        }
    }
}

enum BookingSlots {
    /// The standard grid, 08:30 to 13:00 in half-hour steps (`SALON_SLOTS`).
    /// Staff can add extra slots to a day; those are offered to customers only as
    /// same-day openings, so the caller passes the day's real grid when it differs.
    static let canonical: [String] = [
        "08:30", "09:00", "09:30", "10:00", "10:30",
        "11:00", "11:30", "12:00", "12:30", "13:00",
    ]
}

// MARK: - Services

/// The four services a customer can book, in the salon's words (`SERVICES`).
enum BookingService: String, CaseIterable, Sendable {
    case fullGroom = "Full Groom"
    case bathAndBrush = "Bath & Brush"
    case bathAndDeshed = "Bath & De-shed"
    case puppyGroom = "Puppy Groom"

    /// Puppy Groom is not offered for large dogs.
    func isOffered(forSize size: String) -> Bool {
        !(self == .puppyGroom && size.lowercased() == "large")
    }

    static let addOns: [String] = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"]
}

// MARK: - The booking request

/// One dog's choices for a visit.
struct BookingChoice: Equatable, Sendable {
    var dogId: String
    /// The salon-confirmed size, `small`, `medium` or `large`. Used only to check the
    /// service is offered. It is never sent: the database reads the size from the dog.
    var confirmedSize: String
    var service: BookingService
    var addOns: [String] = []
    var slot: String
}

enum BookingRequestError: Error, Equatable {
    case noDogs
    case tooManyDogs
    case sameDogTwice
    case badDate
    case slotNotOnTheGrid(String)
    case serviceNotOffered(dogId: String)
    case unknownAddOn(String)
}

/// The arguments for `create_customer_booking_group`: 1 to 4 dogs on one date.
/// The database takes each dog's size from `dogs.size`, runs the calendar, capacity
/// and pregnancy gates, and returns the new ids. This struct only shapes the call.
struct BookingRequest: Encodable, Equatable, Sendable {
    struct Row: Encodable, Equatable, Sendable {
        var dog_id: String
        var slot: String
        var service: String
        var addons: [String]
        var payment: String
    }

    var p_bookings: [Row]
    var p_booking_date: String

    static let defaultPayment = "Due at Pick-up"

    /// Checks what can be checked on the phone, so an obviously wrong request
    /// never leaves it. This is a preflight, not the rules: the database decides.
    static func make(date: String, choices: [BookingChoice], gridSlots: [String] = BookingSlots.canonical) throws -> BookingRequest {
        guard isISODate(date) else { throw BookingRequestError.badDate }
        guard !choices.isEmpty else { throw BookingRequestError.noDogs }
        guard choices.count <= 4 else { throw BookingRequestError.tooManyDogs }
        guard Set(choices.map(\.dogId)).count == choices.count else { throw BookingRequestError.sameDogTwice }
        let rows = try choices.map { choice -> Row in
            guard gridSlots.contains(choice.slot) else { throw BookingRequestError.slotNotOnTheGrid(choice.slot) }
            guard choice.service.isOffered(forSize: choice.confirmedSize) else {
                throw BookingRequestError.serviceNotOffered(dogId: choice.dogId)
            }
            if let odd = choice.addOns.first(where: { !BookingService.addOns.contains($0) }) {
                throw BookingRequestError.unknownAddOn(odd)
            }
            return Row(
                dog_id: choice.dogId,
                slot: choice.slot,
                service: choice.service.rawValue,
                addons: choice.addOns,
                payment: defaultPayment
            )
        }
        return BookingRequest(p_bookings: rows, p_booking_date: date)
    }

    private static func isISODate(_ text: String) -> Bool {
        let parts = text.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day)) else { return false }
        let back = calendar.dateComponents([.year, .month, .day], from: date)
        return back.year == year && back.month == month && back.day == day
    }
}
