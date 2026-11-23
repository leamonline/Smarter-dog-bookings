import Foundation

// What the date step knows about the salon's calendar, with no screens and no network.
// Pure Foundation, so Linux CI tests it. The reads themselves (four customer-safe RPCs,
// none of which return personal data) are a later slice; this file turns their rows into
// a list of days the customer can pick from.
//
// Rules, all taken from the website's date step (`DateSelection.tsx`):
//  - A date with no `day_settings` row is open on Monday to Wednesday and closed otherwise.
//    A row says what staff decided, and wins: staff can reopen a Saturday or close a Monday.
//  - A day is "Fully booked" only when the capacity engine offers this dog no time at all.
//    If the occupancy read failed, no day is called full: the database stays the authority
//    and the website behaves the same way.
//  - "Today — last minute" exists only when staff flagged slots and this dog fits one.

// MARK: - Rows the RPCs return

/// `get_open_days`: only dates that have a row come back.
struct OpenDayRow: Decodable, Equatable, Sendable {
    var setting_date: String?
    var is_open: Bool?
}

/// `get_occupancy_range` and `get_slot_occupancy`: one row per booking that still holds a seat.
struct OccupancyRow: Decodable, Equatable, Sendable {
    var booking_date: String?
    var slot: String?
    var size: String?
}

/// `get_blocked_seats`: one row per seat staff blocked.
struct BlockedSeatRow: Decodable, Equatable, Sendable {
    var setting_date: String?
    var slot: String?
    var seat_index: Int?
}

/// `get_immediate_slots`: today's staff-flagged slots. `setting_date` is the server's today.
struct ImmediateSlotRow: Decodable, Equatable, Sendable {
    var setting_date: String?
    var slot: String?
}

// MARK: - Slot grid

extension BookingSlots {
    /// `buildSlotGrid`: the standard grid plus staff-added extra slots, tidied and sorted.
    /// Anything that is not a real `HH:MM` time is ignored, as the database does.
    static func grid(extras: [String] = []) -> [String] {
        let valid = extras.map { String($0.prefix(5)) }.filter(isRealTime)
        return Array(Set(canonical + valid)).sorted()
    }

    private static func isRealTime(_ text: String) -> Bool {
        let parts = text.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count == 2, parts[1].count == 2,
              let hours = Int(parts[0]), let minutes = Int(parts[1]) else { return false }
        return (0...23).contains(hours) && (0...59).contains(minutes)
    }
}

// MARK: - What was read

/// The calendar facts for a stretch of days, parsed from the RPC rows.
/// A read that failed is passed as `nil` and makes the page `complete == false`.
struct SalonCalendar: Equatable, Sendable {
    /// Explicit open or closed decisions by date.
    private(set) var openByDate: [String: Bool] = [:]
    /// Bookings that hold a seat, by date. `nil` means the read failed, so no day may be called full.
    private(set) var bookingsByDate: [String: [EngineBooking]]?
    private(set) var blockedByDate: [String: [String: [Int: SeatOverride]]] = [:]
    /// False if any read failed. The database stays the authority, so the screen carries on.
    private(set) var complete: Bool

    static let empty = SalonCalendar(openRows: [], occupancyRows: [], blockedRows: [])

    init(openRows: [OpenDayRow]?, occupancyRows: [OccupancyRow]?, blockedRows: [BlockedSeatRow]?) {
        var ok = true
        if let openRows {
            for row in openRows {
                if let date = row.setting_date.map(Self.dateOnly), let isOpen = row.is_open {
                    openByDate[date] = isOpen
                }
            }
        } else { ok = false }

        if let occupancyRows {
            var byDate: [String: [EngineBooking]] = [:]
            for row in occupancyRows {
                guard let date = row.booking_date.map(Self.dateOnly), let slot = row.slot,
                      let size = row.size.flatMap({ DogSize(rawValue: $0.lowercased()) }) else { continue }
                byDate[date, default: []].append(EngineBooking(slot: String(slot.prefix(5)), size: size))
            }
            bookingsByDate = byDate
        } else { ok = false }

        if let blockedRows {
            for row in blockedRows {
                guard let date = row.setting_date.map(Self.dateOnly), let slot = row.slot,
                      let seat = row.seat_index else { continue }
                blockedByDate[date, default: [:]][String(slot.prefix(5)), default: [:]][seat] = .blocked
            }
        } else { ok = false }
        complete = ok
    }

    /// The database may send a timestamp or a plain date. Only the date part is used.
    private static func dateOnly(_ text: String) -> String { String(text.prefix(10)) }

    /// Whether the salon is open that day, by the website's rule.
    func isOpen(_ date: String) -> Bool {
        if let decided = openByDate[date] { return decided }
        return DatePlanner.isOpenByDefault(date)
    }

    /// The day's bookings, `[]` for a quiet day, or `nil` if the occupancy read failed.
    func bookings(on date: String) -> [EngineBooking]? {
        guard let all = bookingsByDate else { return nil }
        return all[date] ?? []
    }
    func blockedSeats(on date: String) -> [String: [Int: SeatOverride]] { blockedByDate[date] ?? [:] }
}

// MARK: - The list

enum DayState: Equatable, Sendable {
    case open
    case full
    case closed

    /// The word shown beside a day that cannot be picked.
    var label: String? {
        switch self {
        case .open: nil
        case .full: "Fully booked"
        case .closed: "Closed"
        }
    }
}

struct DateOption: Identifiable, Equatable, Sendable {
    /// `yyyy-MM-dd`.
    var date: String
    var state: DayState
    var id: String { date }
    var isSelectable: Bool { state == .open }
    /// For example "Tuesday 1 December".
    var title: String { HomeSelector.dateText(date) }
}

struct DateWeek: Identifiable, Equatable, Sendable {
    /// The Monday that starts the week, `yyyy-MM-dd`.
    var start: String
    var days: [DateOption]
    var id: String { start }
    /// For example "Week of Monday 30 November".
    var heading: String { "Week of \(HomeSelector.dateText(start))" }
}

/// Today's staff-flagged openings that this dog can actually take.
struct LastMinuteOffer: Equatable, Sendable {
    /// The server's today.
    var date: String
    /// Flagged times the dog fits, for example ["10:00", "10:30"].
    var slots: [String]
    var title: String { "Today — last minute" }
}

enum DatePlanner {
    /// The website shows 28 days at a time.
    static let pageSize = 28

    private static var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private static func parse(_ iso: String) -> Date? {
        let pieces = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard pieces.count == 3 else { return nil }
        return utc.date(from: DateComponents(year: pieces[0], month: pieces[1], day: pieces[2], hour: 12))
    }

    /// Monday = 1 ... Sunday = 7.
    private static func isoWeekday(_ iso: String) -> Int? {
        guard let date = parse(iso) else { return nil }
        let weekday = utc.component(.weekday, from: date) // Sunday = 1
        return weekday == 1 ? 7 : weekday - 1
    }

    /// With no staff decision: Monday to Wednesday open (`getDefaultOpenForDate`).
    static func isOpenByDefault(_ iso: String) -> Bool {
        guard let weekday = isoWeekday(iso) else { return false }
        return (1...3).contains(weekday)
    }

    /// The Monday of the week a date is in.
    static func weekStart(_ iso: String) -> String {
        guard let date = parse(iso), let weekday = isoWeekday(iso),
              let monday = utc.date(byAdding: .day, value: -(weekday - 1), to: date) else { return iso }
        let parts = utc.dateComponents([.year, .month, .day], from: monday)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Whether the day is open, full or closed for a dog of this size.
    static func state(of date: String, size: DogSize, calendar: SalonCalendar) -> DayState {
        guard calendar.isOpen(date) else { return .closed }
        // No occupancy read, no claim that the day is full. The database decides at booking.
        guard let bookings = calendar.bookings(on: date) else { return .open }
        let offered = CapacityEngine.offeredSlots(
            size: size,
            bookings: bookings,
            activeSlots: BookingSlots.canonical,
            overrides: calendar.blockedSeats(on: date)
        )
        return offered.isEmpty ? .full : .open
    }

    static func options(for dates: [String], size: DogSize, calendar: SalonCalendar) -> [DateOption] {
        dates.map { DateOption(date: $0, state: state(of: $0, size: size, calendar: calendar)) }
    }

    /// Days grouped by the Monday of their week, in date order.
    static func weeks(_ options: [DateOption]) -> [DateWeek] {
        var order: [String] = []
        var byWeek: [String: [DateOption]] = [:]
        for option in options.sorted(by: { $0.date < $1.date }) {
            let start = weekStart(option.date)
            if byWeek[start] == nil { order.append(start) }
            byWeek[start, default: []].append(option)
        }
        return order.map { DateWeek(start: $0, days: byWeek[$0] ?? []) }
    }

    // MARK: paging

    static func pageCount(of dates: [String]) -> Int {
        max(1, (dates.count + pageSize - 1) / pageSize)
    }

    /// One 28-day page of the booking window. A page past the end is empty.
    static func page(_ dates: [String], index: Int) -> [String] {
        guard index >= 0 else { return [] }
        let start = index * pageSize
        guard start < dates.count else { return [] }
        return Array(dates[start..<min(start + pageSize, dates.count)])
    }

    // MARK: last minute

    /// The "Today — last minute" row, or nil. The server's date is trusted over the phone's clock.
    /// The slots are only those staff flagged. The grid includes them even after 13:00, as the
    /// website's `buildSlotGrid(immediate.slots)` does, so the 2-2-1 neighbours are right.
    static func lastMinute(
        rows: [ImmediateSlotRow],
        size: DogSize,
        calendar: SalonCalendar
    ) -> LastMinuteOffer? {
        let flagged = rows.compactMap { row -> (String, String)? in
            guard let date = row.setting_date.map({ String($0.prefix(10)) }), let slot = row.slot else { return nil }
            return (date, String(slot.prefix(5)))
        }
        guard let date = flagged.first?.0 else { return nil }
        let slots = Array(Set(flagged.filter { $0.0 == date }.map { $0.1 })).sorted()
        guard !slots.isEmpty else { return nil }

        // Without occupancy the website still shows the row and lets the database decide.
        guard let bookings = calendar.bookings(on: date) else {
            return LastMinuteOffer(date: date, slots: slots)
        }
        let offered = CapacityEngine.offeredSlots(
            size: size,
            bookings: bookings,
            activeSlots: BookingSlots.grid(extras: slots),
            overrides: calendar.blockedSeats(on: date)
        )
        let fits = slots.filter { offered.contains($0) }
        return fits.isEmpty ? nil : LastMinuteOffer(date: date, slots: fits)
    }
}
