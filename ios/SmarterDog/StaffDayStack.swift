import Foundation

// The staff Today stack: one dog per row, in strict appointment order, saying how
// long each dog has been where it is. A Swift copy of the website's day stack
// (`src/engine/dayStack.ts`, with the feed rules from `today.ts` and
// `dailyBrief.ts`, `orderSafetyFacts` and `resolveDayStatus`).
//
// Pure Foundation, so Linux CI tests it. `ios/AuthCoreTests/staff-day-parity.json`
// holds the website's own answers for a governed list of days, and
// `StaffDayParityTests` checks this file against them. If the website changes a
// rule, `src/engine/staffDayParity.ios.test.ts` fails until the file is refreshed,
// and then these tests fail until this copy follows.
//
// Read only. Nothing here decides what a member of staff may do to a booking.

/// One booking as the stack reads it: a `bookings` row joined with its dog and
/// owner, the same shape the website's row transform produces.
struct StaffBooking: Equatable, Sendable {
    var id: String
    /// `booking_date`, London, `yyyy-MM-dd`.
    var date: String
    /// As stored: "09:30" or "09:30:00". Empty when missing.
    var slot: String
    /// A service id such as "full-groom". Older rows may hold something else.
    var service: String
    /// Never empty: a missing status reads as Booked, as on the website.
    var status: String
    var cancelReason: String?
    var checkedInAt: String?
    var readyAt: String?
    var completedAt: String?
    /// "confirmed", "sent" or "none", derived like the website's transform.
    var reminderState: String
    var confirmationChannel: String?
    var dogName: String
    var breed: String
    /// The owner's full name, or "" when it cannot be found.
    var ownerName: String
    /// Warnings as recorded, not yet ordered: "Pregnant" first if ticked, then the dog's alerts.
    var safetyFacts: [String]
    var notes: String
    var groupId: String?
}

/// Where a dog is in its day. Mirrors the website's `FeedStage`.
enum StaffStage: String, Equatable, Sendable {
    case booked, inSalon, ready, collected, noShow
}

/// One row of the stack, already worded.
struct StaffDayRow: Identifiable, Equatable, Sendable {
    let id: String
    let booking: StaffBooking
    let stage: StaffStage
    /// The slot as stored, or nil when the booking has none.
    let time: String?
    /// "Cockapoo · Full Groom", either half left out when unknown.
    let subtitle: String
    /// The one timing line, or nil when there is nothing truthful to say.
    let timing: String?
    /// The timing should read as urgent (weight, not colour).
    let urgent: Bool
    /// Ready past `StaffDayStack.readyOverdueMinutes`.
    let readyOverdue: Bool
    /// This row carries the day's one countdown.
    let countdown: Bool
    let tone: StaffStatusTone
    /// Warnings in the order a groomer reads them.
    let safety: [String]
}

enum StaffDayStack {
    static let london = TimeZone(identifier: "Europe/London")!

    // The website's thresholds, word for word.
    static let lateArrivalGraceMinutes = 5            // LATE_ARRIVAL_GRACE_MINUTES
    static let noArrivalMinutes = 120                 // NO_ARRIVAL_MINUTES
    static let inSalonLongMinutes = 180               // IN_SALON_LONG_MINUTES
    static let readyOverdueMinutes = 45               // READY_OVERDUE_MINUTES

    static let booked = "Booked"
    static let reconfirmed = "Reconfirmed"
    static let arrived = "Arrived"
    static let ready = "Ready for collection"
    static let completed = "Completed"
    static let cancelled = "Cancelled"
    static let noShow = "No-show"

    /// The four statuses that sit on the stack. An allow-list: a status added
    /// later stays off the stack until someone decides it belongs.
    static let stackStatuses: Set<String> = [booked, reconfirmed, arrived, ready]

    static let serviceNames: [String: String] = [
        "full-groom": "Full Groom",
        "bath-and-brush": "Bath & Brush",
        "bath-and-deshed": "Bath & De-shed",
        "puppy-groom": "Puppy Groom",
    ]

    // MARK: - The London clock

    /// Minutes since London midnight, and the London date.
    static func londonClock(_ now: Date) -> (minutesOfDay: Int, date: String) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = london
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: now)
        let date = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        return ((parts.hour ?? 0) * 60 + (parts.minute ?? 0), date)
    }

    static func londonDate(_ now: Date) -> String {
        londonClock(now).date
    }

    /// "09:30" or "09:30:00" to minutes of the day; nil when it cannot be read.
    static func slotMinutes(_ slot: String) -> Int? {
        let parts = slot.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count >= 2, let hours = Int(parts[0]), let minutes = Int(parts[1]) else { return nil }
        return hours * 60 + minutes
    }

    // MARK: - Words

    /// "45 min", "1 hr", "1 hr 13 min", "2 hrs 5 min". Minutes never pluralise.
    static func formatDuration(_ minutes: Int) -> String {
        let whole = max(0, minutes)
        if whole < 60 { return "\(whole) min" }
        let hours = whole / 60
        let remainder = whole % 60
        let hourLabel = "\(hours) \(hours == 1 ? "hr" : "hrs")"
        return remainder > 0 ? "\(hourLabel) \(remainder) min" : hourLabel
    }

    /// The last word of the owner's name: the word that tells two Bellas apart.
    static func ownerSurname(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).last.map(String.init) ?? ""
    }

    static func serviceLabel(_ service: String) -> String {
        serviceNames[service] ?? ""
    }

    static func subtitle(breed: String, service: String) -> String {
        [breed, serviceLabel(service)].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    // MARK: - Safety order

    /// The tone staff recorded for each listed warning: behaviour, caution, information.
    static let alertTones: [String: String] = [
        "Bites / Nips": "behaviour",
        "Reactive to dogs": "behaviour",
        "Kennel aggressive": "behaviour",
        "Nervous / Anxious": "caution",
        "Fear of dryer": "caution",
        "Sensitive paws": "caution",
        "Senior (Needs breaks)": "information",
    ]

    /// The same warnings, most important first. Never adds, rewrites or removes one.
    /// Pregnant leads; then behaviour; then anything staff typed that is not in the
    /// list; then caution; then information. Equal ranks keep the order entered.
    static func orderSafetyFacts(_ facts: [String]) -> [String] {
        func rank(_ fact: String) -> Int {
            if fact == "Pregnant" { return 0 }
            switch alertTones[fact] {
            case "behaviour": return 1
            case "caution": return 3
            case "information": return 4
            default: return 2
            }
        }
        return facts.enumerated()
            .sorted { lhs, rhs in
                let (a, b) = (rank(lhs.element), rank(rhs.element))
                return a != b ? a < b : lhs.offset < rhs.offset
            }
            .map(\.element)
    }

    // MARK: - Time since a stamp

    /// Whole minutes since an ISO timestamp, never negative; nil when absent or unreadable.
    static func minutesSince(_ iso: String?, now: Date) -> Int? {
        guard let iso, let date = parseTimestamp(iso) else { return nil }
        return max(0, Int((now.timeIntervalSince(date) / 60).rounded(.down)))
    }

    /// Reads "2026-11-24T09:12:33Z", "...33.123Z", "...33.123456+00:00" and the
    /// space-separated form, to the millisecond, as a browser does.
    static func parseTimestamp(_ text: String) -> Date? {
        let value = text.trimmingCharacters(in: .whitespaces)
        let chars = Array(value)
        guard chars.count >= 19 else { return nil }
        func number(_ range: Range<Int>) -> Int? {
            guard range.upperBound <= chars.count else { return nil }
            return Int(String(chars[range]))
        }
        guard let year = number(0..<4), chars[4] == "-", let month = number(5..<7), chars[7] == "-",
              let day = number(8..<10), chars[10] == "T" || chars[10] == " ",
              let hour = number(11..<13), chars[13] == ":", let minute = number(14..<16), chars[16] == ":",
              let second = number(17..<19)
        else { return nil }

        var index = 19
        var milliseconds = 0
        if index < chars.count, chars[index] == "." {
            index += 1
            var digits = ""
            while index < chars.count, chars[index].isNumber {
                digits.append(chars[index])
                index += 1
            }
            guard !digits.isEmpty else { return nil }
            milliseconds = Int(String((digits + "00").prefix(3))) ?? 0
        }

        var offsetSeconds = 0
        if index < chars.count {
            let sign = chars[index]
            if sign == "Z" || sign == "z" {
                index += 1
            } else if sign == "+" || sign == "-" {
                let rest = String(chars[(index + 1)...]).replacingOccurrences(of: ":", with: "")
                guard rest.count == 2 || rest.count == 4, let hh = Int(rest.prefix(2)), let mm = Int(rest.count == 4 ? rest.suffix(2) : "0")
                else { return nil }
                offsetSeconds = (hh * 3600 + mm * 60) * (sign == "-" ? -1 : 1)
                index = chars.count
            } else {
                return nil
            }
        }
        guard index == chars.count else { return nil }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let base = calendar.date(from: DateComponents(
            year: year, month: month, day: day, hour: hour, minute: minute, second: second
        )) else { return nil }
        return base.addingTimeInterval(Double(milliseconds) / 1000 - Double(offsetSeconds))
    }

    // MARK: - Status

    static func rank(_ status: String) -> Int {
        switch status {
        case booked: 0
        case reconfirmed: 1
        case arrived: 2
        case ready: 3
        case completed: 4
        default: -1
        }
    }

    static func isNoShowReason(_ reason: String?) -> Bool {
        (reason ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "no-show"
    }

    /// A no-show, including the older Cancelled-with-reason shape.
    static func isConfirmedNoShow(_ booking: StaffBooking) -> Bool {
        booking.status == noShow || (booking.status == cancelled && isNoShowReason(booking.cancelReason))
    }

    /// Occupies a seat and earns money: not cancelled and not a no-show.
    static func isCountable(_ booking: StaffBooking) -> Bool {
        booking.status != cancelled && booking.status != noShow
    }

    static func stage(of booking: StaffBooking) -> StaffStage {
        if isConfirmedNoShow(booking) { return .noShow }
        switch rank(booking.status) {
        case 2: return .inSalon
        case 3: return .ready
        case 4: return .collected
        default: return .booked
        }
    }

    /// Booked with a reminder sent, no answer, and confirmation not switched off.
    static func needsConfirmation(_ booking: StaffBooking) -> Bool {
        booking.status == booked && booking.reminderState == "sent" && booking.confirmationChannel != "none"
    }

    static func tone(for booking: StaffBooking) -> StaffStatusTone {
        let confirmation: StaffStatusPalette.Confirmation?
        if booking.status != booked {
            confirmation = nil
        } else if needsConfirmation(booking) {
            confirmation = .unconfirmed
        } else if booking.reminderState == "confirmed" {
            confirmation = .confirmed
        } else {
            confirmation = nil
        }
        return StaffStatusPalette.resolve(status: booking.status, cancelReason: booking.cancelReason, confirmation: confirmation)
    }

    // MARK: - The stack

    private struct Entry {
        let booking: StaffBooking
        let stage: StaffStage
        let sortMinutes: Double
        let isLate: Bool
        let overdueMinutes: Int
    }

    /// The bookings on `date` that belong on the stack, in appointment order, each
    /// with its one timing line when `date` is today in London.
    static func build(bookings: [StaffBooking], date: String, now: Date) -> [StaffDayRow] {
        let clock = londonClock(now)
        let isToday = date == clock.date

        let onTheDay = bookings.filter { $0.date == date && (isCountable($0) || isConfirmedNoShow($0)) }
        var placed: [(order: Int, entry: Entry)] = []
        for (order, booking) in onTheDay.enumerated() {
            placed.append((order, entry(for: booking, clock: clock, isToday: isToday)))
        }
        // Chronological and stable: two dogs in one slot keep the order they came in.
        placed.sort { lhs, rhs in
            if lhs.entry.sortMinutes != rhs.entry.sortMinutes { return lhs.entry.sortMinutes < rhs.entry.sortMinutes }
            return lhs.order < rhs.order
        }
        let entries: [Entry] = placed
            .map(\.entry)
            .filter { $0.stage == .noShow || stackStatuses.contains($0.booking.status) }

        let nextID = isToday
            ? entries.first { $0.stage == .booked && !$0.isLate && !$0.booking.slot.isEmpty }?.booking.id
            : nil

        return entries.map { entry in
            let timing = isToday
                ? timingFor(entry, now: now, minutesOfDay: clock.minutesOfDay, isNextArrival: entry.booking.id == nextID)
                : Timing.quiet
            return StaffDayRow(
                id: entry.booking.id,
                booking: entry.booking,
                stage: entry.stage,
                time: entry.booking.slot.isEmpty ? nil : entry.booking.slot,
                subtitle: subtitle(breed: entry.booking.breed, service: entry.booking.service),
                timing: timing.text,
                urgent: timing.urgent,
                readyOverdue: timing.readyOverdue,
                countdown: timing.countdown,
                tone: tone(for: entry.booking),
                safety: orderSafetyFacts(entry.booking.safetyFacts)
            )
        }
    }

    private static func entry(for booking: StaffBooking, clock: (minutesOfDay: Int, date: String), isToday: Bool) -> Entry {
        let minutes: Int? = booking.slot.isEmpty ? nil : slotMinutes(booking.slot)
        let past: Int? = minutes.map { clock.minutesOfDay - $0 }
        let rankValue = rank(booking.status)
        let stillToArrive = rankValue >= 0 && rankValue < 2
        let pastGrace = (past ?? 0) > lateArrivalGraceMinutes && past != nil
        let isLate = isToday && stillToArrive && !booking.slot.isEmpty && pastGrace
        let sortMinutes: Double = minutes.map { Double($0) } ?? .infinity
        let overdue: Int = isToday ? max(0, past ?? 0) : 0
        return Entry(booking: booking, stage: stage(of: booking), sortMinutes: sortMinutes, isLate: isLate, overdueMinutes: overdue)
    }

    private struct Timing {
        var text: String?
        var urgent = false
        var readyOverdue = false
        var countdown = false
        static let quiet = Timing(text: nil)
    }

    private static func timingFor(_ entry: Entry, now: Date, minutesOfDay: Int, isNextArrival: Bool) -> Timing {
        let booking = entry.booking
        if isNextArrival, let start = slotMinutes(booking.slot) {
            let until = start - minutesOfDay
            return Timing(text: until <= 0 ? "due now" : "in \(formatDuration(until))", countdown: true)
        }
        switch entry.stage {
        case .ready:
            guard let wait = minutesSince(booking.readyAt, now: now) else { return .quiet }
            let overdue = wait >= readyOverdueMinutes
            return Timing(text: "waiting \(formatDuration(wait))", urgent: overdue, readyOverdue: overdue)
        case .inSalon:
            guard let elapsed = minutesSince(booking.checkedInAt, now: now) else { return .quiet }
            return Timing(text: formatDuration(elapsed), urgent: elapsed >= inSalonLongMinutes)
        case .booked:
            guard entry.isLate else { return .quiet }
            let text = entry.overdueMinutes >= noArrivalMinutes ? "No arrival" : "\(formatDuration(entry.overdueMinutes)) late"
            return Timing(text: text, urgent: true)
        case .collected, .noShow:
            return .quiet
        }
    }
}
