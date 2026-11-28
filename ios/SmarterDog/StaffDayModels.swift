import Foundation

// What the staff Today screen reads, and how the rows become `StaffBooking`s.
// Pure Foundation, so Linux CI tests it. Read only: nothing here writes.
//
// The reads are the ones the website's staff dashboard makes (see
// `docs/ios-api-contract.md`, Staff screens): `bookings` for one London date with
// their reminder log, the dogs and owners on them, and that date's `day_settings`.
// Row Level Security returns them only to staff (`is_staff()`).

struct StaffNotificationRow: Decodable, Equatable, Sendable {
    var trigger_type: String?
    var status: String?
    var sent_at: String?
    /// When the row was written: the order a resend supersedes a failure in.
    var created_at: String? = nil
    /// The recipient. A failure is live per trigger and recipient, as on the website.
    var human_id: String? = nil
}

/// One row of `bookings` with its embedded `notification_log`.
struct StaffBookingRow: Decodable, Equatable, Sendable {
    var id: String
    var booking_date: String
    var slot: String?
    var service: String?
    var status: String?
    var cancel_reason: String?
    var dog_id: String?
    var checked_in_at: String?
    var ready_at: String?
    var completed_at: String?
    var reminder_confirmed_at: String?
    var reminder_confirmed_source: String? = nil
    var confirmation_channel: String?
    var notes: String?
    var dog_name_snapshot: String?
    var breed_snapshot: String?
    var owner_name_snapshot: String?
    var group_id: String?
    var notification_log: [StaffNotificationRow]?

    /// The columns to select, so the client and the tests agree.
    static let select = "id,booking_date,slot,service,status,cancel_reason,dog_id,checked_in_at,ready_at,completed_at,"
        + "reminder_confirmed_at,reminder_confirmed_source,confirmation_channel,notes,dog_name_snapshot,breed_snapshot,owner_name_snapshot,group_id,"
        + "notification_log(trigger_type,status,sent_at,created_at,human_id)"
}

struct StaffDogRow: Decodable, Equatable, Sendable {
    var id: String
    var name: String?
    var breed: String?
    var human_id: String?
    var alerts: [String]?
    var is_pregnant: Bool?

    static let select = "id,name,breed,human_id,alerts,is_pregnant"
}

struct StaffHumanRow: Decodable, Equatable, Sendable {
    var id: String
    var name: String?
    var surname: String?
    /// For the detail sheet's Call button. Staff already see it on the website.
    var phone: String? = nil

    static let select = "id,name,surname,phone"
}

struct StaffDaySettingRow: Decodable, Equatable, Sendable {
    var setting_date: String?
    var is_open: Bool?

    static let select = "setting_date,is_open"
}

/// Everything one day's screen needs, as read.
struct StaffDayRead: Equatable, Sendable {
    var bookings: [StaffBookingRow]
    var dogs: [StaffDogRow]
    var humans: [StaffHumanRow]
    var setting: StaffDaySettingRow?
}

/// One day, ready to draw.
struct StaffDaySnapshot: Equatable, Sendable {
    /// The browsed London date, `yyyy-MM-dd`.
    let date: String
    let isToday: Bool
    let isOpen: Bool
    let rows: [StaffDayRow]
    /// Dogs booked on the day: not cancelled and not a no-show, gone home included.
    let dogCount: Int
    /// Dogs collected and gone home, which leave the stack.
    let goneHome: Int
    /// Cancelled bookings on the day (not no-shows, which sit on the stack), shown
    /// faded under it so a gap in the day is explained. In appointment order.
    var cancelled: [StaffDayRow] = []
}

enum StaffDaySelector {
    /// Turn the reads into `StaffBooking`s, the way the website's row transform does:
    /// live dog and owner names first, the snapshot columns when the link is missing,
    /// and a missing status read as Booked.
    static func bookings(from read: StaffDayRead) -> [StaffBooking] {
        let dogs = Dictionary(read.dogs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let humans = Dictionary(read.humans.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return read.bookings.map { row in
            let dog = row.dog_id.flatMap { dogs[$0] }
            let owner = dog?.human_id.flatMap { humans[$0] }
            let ownerFullName = owner.map { "\($0.name ?? "") \($0.surname ?? "")".trimmingCharacters(in: .whitespaces) } ?? ""
            var facts: [String] = []
            if dog?.is_pregnant == true { facts.append("Pregnant") }
            facts.append(contentsOf: (dog?.alerts ?? []).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty })
            return StaffBooking(
                id: row.id,
                date: row.booking_date,
                slot: row.slot ?? "",
                service: row.service ?? "",
                status: nonEmpty(row.status) ?? StaffDayStack.booked,
                cancelReason: row.cancel_reason,
                checkedInAt: row.checked_in_at,
                readyAt: row.ready_at,
                completedAt: row.completed_at,
                reminderState: reminderState(row),
                reminderConfirmedBy: nonEmpty(row.reminder_confirmed_source),
                reminderFailed: hasLiveFailedReminder(row),
                confirmationChannel: row.confirmation_channel,
                dogName: nonEmpty(dog?.name) ?? nonEmpty(row.dog_name_snapshot) ?? "",
                breed: nonEmpty(dog?.breed) ?? nonEmpty(row.breed_snapshot) ?? "",
                ownerId: nonEmpty(dog?.human_id),
                ownerName: nonEmpty(ownerFullName) ?? nonEmpty(row.owner_name_snapshot) ?? "",
                ownerPhone: nonEmpty(owner?.phone) ?? "",
                safetyFacts: facts,
                notes: row.notes ?? "",
                groupId: nonEmpty(row.group_id)
            )
        }
    }

    /// A recorded confirmation wins; otherwise a reminder that was sent; otherwise none.
    /// Failed and pending sends do not count, as on the website.
    static func reminderState(_ row: StaffBookingRow) -> String {
        if nonEmpty(row.reminder_confirmed_at) != nil { return "confirmed" }
        let sent = (row.notification_log ?? []).contains { $0.trigger_type == "reminder" && $0.status == "sent" }
        return sent ? "sent" : "none"
    }

    /// The website's `liveFailuresByBooking` + `failedReminderBookingIds`, for one booking:
    /// keep the newest row for each exact (trigger, recipient); the booking has a live
    /// failed reminder when one of those newest rows is a failed `reminder` or
    /// `reminder_sms_fallback`. A later sent or pending row for the same trigger and
    /// recipient means a resend, and clears it. An SMS fallback is a different trigger,
    /// so it never clears the WhatsApp failure. Meta's later verdict is already copied
    /// onto the log by the database (migration 20261012120000).
    static func hasLiveFailedReminder(_ row: StaffBookingRow) -> Bool {
        var newest: [String: (at: Date, status: String?)] = [:]
        for log in row.notification_log ?? [] {
            let trigger = log.trigger_type ?? ""
            let key = "\(trigger)|\(log.human_id ?? "")"
            let at = (log.created_at ?? log.sent_at).flatMap(StaffDayStack.parseTimestamp) ?? .distantPast
            if let seen = newest[key], seen.at >= at { continue }
            newest[key] = (at, log.status)
        }
        return newest.contains { key, value in
            let trigger = String(key.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
            let base = trigger.hasSuffix("_sms_fallback") ? String(trigger.dropLast("_sms_fallback".count)) : trigger
            return base == "reminder" && value.status == "failed"
        }
    }

    /// Open as staff set it for the date; with no setting, the salon's normal days
    /// (Monday to Wednesday), as the website's default.
    static func isOpen(date: String, setting: StaffDaySettingRow?) -> Bool {
        if let open = setting?.is_open { return open }
        return defaultOpenWeekdays.contains(weekday(date) ?? 0)
    }

    /// Monday = 2, Tuesday = 3, Wednesday = 4 (Gregorian, Sunday = 1).
    static let defaultOpenWeekdays: Set<Int> = [2, 3, 4]

    static func weekday(_ iso: String) -> Int? {
        guard let date = noonUTC(iso) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar.component(.weekday, from: date)
    }

    static func snapshot(read: StaffDayRead, date: String, now: Date) -> StaffDaySnapshot {
        let bookings = self.bookings(from: read).filter { $0.date == date }
        let countable = bookings.filter(StaffDayStack.isCountable)
        return StaffDaySnapshot(
            date: date,
            isToday: date == StaffDayStack.londonDate(now),
            isOpen: isOpen(date: date, setting: read.setting),
            rows: StaffDayStack.build(bookings: bookings, date: date, now: now),
            dogCount: countable.count,
            goneHome: countable.filter { $0.status == StaffDayStack.completed }.count,
            cancelled: StaffDayStack.cancelledRows(bookings: bookings, date: date)
        )
    }

    // MARK: - Words on screen

    /// "7 dogs · 2 gone home", "1 dog", or "No dogs booked".
    static func totals(_ snapshot: StaffDaySnapshot) -> String {
        guard snapshot.dogCount > 0 else { return "No dogs booked" }
        let dogs = snapshot.dogCount == 1 ? "1 dog" : "\(snapshot.dogCount) dogs"
        return snapshot.goneHome > 0 ? "\(dogs) · \(snapshot.goneHome) gone home" : dogs
    }

    /// The row's safety note: the most important warning, then "+N" for the rest.
    static func safetySummary(_ safety: [String]) -> String? {
        guard let first = safety.first else { return nil }
        return safety.count > 1 ? "\(first) +\(safety.count - 1)" : first
    }

    /// The dog's name as shown: "Unnamed booking" when nothing resolves.
    static func dogName(_ booking: StaffBooking) -> String {
        booking.dogName.isEmpty ? "Unnamed booking" : booking.dogName
    }

    /// "09:30" from "09:30" or "09:30:00".
    static func timeText(_ slot: String?) -> String? {
        guard let slot, !slot.isEmpty else { return nil }
        return String(slot.prefix(5))
    }

    /// Everything a row says, in reading order, for VoiceOver: time, dog, status,
    /// every warning, breed and service, owner, timing.
    static func accessibilityLabel(_ row: StaffDayRow) -> String {
        var parts: [String] = []
        if let time = timeText(row.time) { parts.append(time) }
        parts.append(dogName(row.booking))
        parts.append(row.tone.label)
        if !row.safety.isEmpty { parts.append("Warning: \(row.safety.joined(separator: ", "))") }
        if !row.subtitle.isEmpty { parts.append(row.subtitle) }
        if !row.booking.ownerName.isEmpty { parts.append("Owner \(row.booking.ownerName)") }
        if let timing = row.timing { parts.append(timing) }
        return parts.joined(separator: ". ")
    }

    /// The second line of a row: breed · service · owner surname.
    static func detailLine(_ row: StaffDayRow) -> String {
        [row.subtitle, StaffDayStack.ownerSurname(row.booking.ownerName)].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// A `tel:` link for the owner's number, or nil when there is no usable number.
    /// Normalised to E.164 via `PhoneNumber.normalisePhoneDigits`, so
    /// `+44 (0)7700 900123` dials `+447700900123`, not `+4407700900123`.
    static func callURL(_ phone: String) -> URL? {
        let digits = PhoneNumber.normalisePhoneDigits(phone)
        guard digits.count >= 7 else { return nil }
        return URL(string: "tel:+\(digits)")
    }

    // MARK: - Dates

    /// The date `days` away from `iso`, as `yyyy-MM-dd`.
    static func shift(_ iso: String, days: Int) -> String {
        guard let date = noonUTC(iso) else { return iso }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        guard let moved = calendar.date(byAdding: .day, value: days, to: date) else { return iso }
        let parts = calendar.dateComponents([.year, .month, .day], from: moved)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// "Tuesday 24 November", or "Tue 24 Nov" when `short`.
    static func dateText(_ iso: String, short: Bool = false) -> String {
        guard let date = noonUTC(iso) else { return iso }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = short ? "EEE d MMM" : "EEEE d MMMM"
        return formatter.string(from: date)
    }

    private static func noonUTC(_ iso: String) -> Date? {
        let pieces = iso.split(separator: "-").compactMap { Int($0) }
        guard pieces.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar.date(from: DateComponents(year: pieces[0], month: pieces[1], day: pieces[2], hour: 12))
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return value
    }
}

/// One link on the More tab.
struct StaffLink: Identifiable, Equatable, Sendable {
    let title: String
    /// What it is for, under the title.
    let detail: String
    let url: URL
    var id: String { title }
}

/// The website pages staff reach from the More tab. The phone's browser keeps its
/// own sign-in, as it does today.
enum StaffLinks {
    static let base = "https://smarterdog.co.uk/staff"

    /// `?calendar` keeps a fresh browser tab on the calendar instead of the
    /// website's once-per-tab landing on Today (`src/routing/todayLanding.ts`).
    static let calendar = URL(string: "\(base)?calendar")!
    static let today = URL(string: "\(base)/today")!
    static let inbox = URL(string: "\(base)/inbox")!
    static let customers = URL(string: "\(base)/humans")!
    static let dogs = URL(string: "\(base)/dogs")!
    static let reports = URL(string: "\(base)/reports")!
    static let settings = URL(string: "\(base)/settings")!

    /// The More tab, in order.
    static let more: [StaffLink] = [
        StaffLink(title: "Calendar", detail: "Book, move and block seats", url: calendar),
        StaffLink(title: "Messages", detail: "WhatsApp and app messages", url: inbox),
        StaffLink(title: "Customers", detail: "Owners and their details", url: customers),
        StaffLink(title: "Dogs", detail: "Every dog on file", url: dogs),
        StaffLink(title: "Reports", detail: "Takings and cash-up", url: reports),
        StaffLink(title: "Settings", detail: "Salon hours, prices and team", url: settings),
    ]
}
