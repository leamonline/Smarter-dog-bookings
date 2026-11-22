import Foundation

// What the customer Home screen shows: upcoming grooms and their dogs.
// Pure Foundation, no UI and no Supabase, so Linux CI can test it.
// Reads only. Booking writes are not part of this file.

/// One row of `dogs`, as Row Level Security returns it for this customer.
struct DogRow: Decodable, Equatable, Sendable {
    var id: String
    var name: String?
    var breed: String?
    var size: String?
    var photo_path: String?
}

/// One row of `bookings`, as Row Level Security returns it for this customer.
struct BookingRow: Decodable, Equatable, Sendable {
    var id: String
    var booking_date: String
    var slot: String
    var service: String?
    var status: String?
    var dog_id: String?
}

struct DogSummary: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let breed: String
    /// "S", "M" or "L". Only Large is styled differently on screen. Nil until staff confirm it.
    let sizeLetter: String?
    /// Path in the private `dog-photos` bucket, or nil.
    let photoPath: String?
}

struct UpcomingGroom: Identifiable, Equatable, Sendable {
    let id: String
    let dogName: String
    let service: String
    /// For example "Tuesday 1 December".
    let dateText: String
    /// For example "Drop off 09:30".
    let timeText: String
    /// Plain words for the customer. The same words the dashboard uses.
    let statusText: String
    let isToday: Bool
}

struct HomeSnapshot: Equatable, Sendable {
    var upcoming: [UpcomingGroom]
    var dogs: [DogSummary]
}

/// The salon's own booking states. Values mirror the database check constraint.
enum BookingStatusName {
    static let booked = "Booked"
    static let reconfirmed = "Reconfirmed"
    static let arrived = "Arrived"
    static let ready = "Ready for collection"
    static let completed = "Completed"
    static let cancelled = "Cancelled"
    static let noShow = "No-show"

    /// A visit still ahead of the customer, or happening now.
    static let live: Set<String> = [booked, reconfirmed, arrived, ready]
}

enum HomeSelector {
    static let london = TimeZone(identifier: "Europe/London")!

    /// Today's date in Europe/London as `yyyy-MM-dd`. The salon's day, not the phone's.
    static func londonDate(_ now: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = london
        let parts = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// "2026-12-01" becomes "Tuesday 1 December". Anything unreadable is returned as given.
    static func dateText(_ iso: String) -> String {
        let pieces = iso.split(separator: "-").compactMap { Int($0) }
        guard pieces.count == 3 else { return iso }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let date = calendar.date(from: DateComponents(
            year: pieces[0], month: pieces[1], day: pieces[2], hour: 12
        )) else { return iso }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEEE d MMMM"
        return formatter.string(from: date)
    }

    /// Slots are stored as "09:30" or "09:30:00". Show "09:30".
    static func timeText(_ slot: String) -> String {
        String(slot.prefix(5))
    }

    static func sizeLetter(_ size: String?) -> String? {
        switch size?.lowercased() {
        case "small": "S"
        case "medium": "M"
        case "large": "L"
        default: nil
        }
    }

    static func dogs(from rows: [DogRow]) -> [DogSummary] {
        rows
            .map { row in
                DogSummary(
                    id: row.id,
                    name: nonEmpty(row.name) ?? "Your dog",
                    breed: nonEmpty(row.breed) ?? "",
                    sizeLetter: sizeLetter(row.size),
                    photoPath: nonEmpty(row.photo_path)
                )
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Visits from today onwards that are still live, soonest first.
    /// Cancelled, completed and no-show visits are not "upcoming".
    static func upcoming(from bookings: [BookingRow], dogs: [DogRow], now: Date) -> [UpcomingGroom] {
        let today = londonDate(now)
        let names = Dictionary(uniqueKeysWithValues: dogs.map { ($0.id, nonEmpty($0.name) ?? "Your dog") })
        return bookings
            .filter { $0.booking_date >= today && BookingStatusName.live.contains($0.status ?? "") }
            .sorted { ($0.booking_date, $0.slot) < ($1.booking_date, $1.slot) }
            .map { row in
                UpcomingGroom(
                    id: row.id,
                    dogName: row.dog_id.flatMap { names[$0] } ?? "Your dog",
                    service: nonEmpty(row.service) ?? "Grooming",
                    dateText: dateText(row.booking_date),
                    timeText: "Drop off \(timeText(row.slot))",
                    statusText: row.status ?? "",
                    isToday: row.booking_date == today
                )
            }
    }

    static func snapshot(bookings: [BookingRow], dogs: [DogRow], now: Date) -> HomeSnapshot {
        HomeSnapshot(
            upcoming: upcoming(from: bookings, dogs: dogs, now: now),
            dogs: Self.dogs(from: dogs)
        )
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }
}

/// What the Home screen asks the salon. The iPhone app uses Supabase. Tests use a stand-in.
protocol SalonHomeClient: Sendable {
    func loadHome() async throws -> (bookings: [BookingRow], dogs: [DogRow])
}
