import Foundation

// The time step's decisions, with no screens and no network. Pure Foundation, so Linux CI
// tests it. Mirrors the website's `SlotSelection.tsx`:
//  - Only times this dog can be booked at are shown, split into morning and afternoon drop-offs.
//  - Today's last-minute times must sit on slots staff flagged, and a failed read means no times
//    rather than times the database would refuse.
//  - Not ported yet: the owner's preferred and blocked times ("Your usual time"), and the
//    waitlist. The database still refuses a blocked time, so the worst case is a refusal.

struct TimeGroup: Identifiable, Equatable, Sendable {
    var title: String
    var slots: [String]
    var id: String { title }
}

enum TimePlanner {
    /// "09:30" becomes "9:30am", "13:00" becomes "1:00pm", as the website writes them.
    static func label(_ slot: String) -> String {
        let pieces = slot.prefix(5).split(separator: ":").compactMap { Int($0) }
        guard pieces.count == 2 else { return slot }
        let hour = pieces[0], minute = pieces[1]
        let suffix = hour >= 12 ? "pm" : "am"
        let shown = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour)
        return "\(shown):" + String(format: "%02d", minute) + suffix
    }

    /// The times to offer on a date, in order. `calendar` is a fresh read of that one day.
    /// - A normal day: what the capacity engine offers this dog on the standard grid.
    /// - Today's last-minute day: only the slots staff flagged that still fit.
    /// A calendar whose bookings could not be read offers nothing: the caller shows an error.
    static func offered(
        date: String,
        size: DogSize,
        calendar: SalonCalendar,
        lastMinuteRows: [ImmediateSlotRow],
        isLastMinute: Bool
    ) -> [String] {
        guard let bookings = calendar.bookings(on: date) else { return [] }
        // A day staff have closed offers nothing. The database refuses it too (`calendar_closed`).
        // Today's last-minute opening was already checked as open by the server.
        if !isLastMinute, calendar.openDaysRead, !calendar.isOpen(date) { return [] }
        if isLastMinute {
            guard let offer = DatePlanner.lastMinute(rows: lastMinuteRows, size: size, calendar: calendar),
                  offer.date == date else { return [] }
            return offer.slots
        }
        return CapacityEngine.offeredSlots(
            size: size,
            bookings: bookings,
            activeSlots: BookingSlots.canonical,
            overrides: calendar.blockedSeats(on: date)
        )
    }

    /// Morning (before 12:00) and afternoon drop-offs, each in time order. Empty groups are left out.
    static func groups(_ slots: [String]) -> [TimeGroup] {
        func hour(_ slot: String) -> Int { Int(slot.prefix(2)) ?? 0 }
        let sorted = slots.sorted()
        let morning = sorted.filter { hour($0) < 12 }
        let afternoon = sorted.filter { hour($0) >= 12 }
        return [
            TimeGroup(title: "Morning drop-offs", slots: morning),
            TimeGroup(title: "Afternoon drop-offs", slots: afternoon),
        ].filter { !$0.slots.isEmpty }
    }
}
