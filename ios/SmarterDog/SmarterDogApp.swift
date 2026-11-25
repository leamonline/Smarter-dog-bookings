import SwiftUI

@main
struct SmarterDogApp: App {
    @State private var auth = AuthService.connected()

    init() {
        AppFont.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if CommandLine.arguments.contains("-sampleHome") {
                // Debug only: the customer Home with made-up data, no sign-in and no network.
                let account = AccountCard(name: "Sam Taylor", roleLabel: "Customer")
                CustomerHomeView(
                    account: account,
                    auth: AuthService(previewPhase: .customer(account)),
                    client: SampleHomeClient()
                )
            } else if CommandLine.arguments.contains("-sampleBooking") {
                // Debug only: the booking screens with made-up dogs, no sign-in and no network.
                NavigationStack { BookingFlowView(client: SampleBookingClient()) }
            } else if CommandLine.arguments.contains("-sampleBooked") {
                // Debug only: the booked screen with made-up data, to see the hero moment. No network.
                BookedView(
                    booked: BookedSummary(
                        dogName: "Biscuit", service: "Full Groom",
                        whenText: "Tuesday 1 December 2026 at 9:30am",
                        deposit: .due(amountPence: 1000), bookingIds: ["sample"]
                    ),
                    onDone: {}
                )
            } else if CommandLine.arguments.contains("-sampleStaffToday") {
                // Debug only: staff Today with made-up dogs at 10:05 this morning, no sign-in and
                // no network. Every status the day stack shows appears at least once.
                let account = AccountCard(name: "Alex Groomer", roleLabel: "Owner")
                StaffRootView(
                    account: account,
                    auth: AuthService(previewPhase: .staff(account)),
                    today: { StaffTodayView(client: SampleStaffDayClient(), clock: SampleStaffDayClient.clock) }
                )
            } else if CommandLine.arguments.contains("-liveBooking") {
                // Debug only: the real booking flow against the STAGING project, signed in as the
                // throwaway test customer. It refuses to run against any other project.
                LiveBookingDebugView()
            } else {
                RootView(auth: auth)
            }
            #else
            RootView(auth: auth)
            #endif
        }
    }
}

#if DEBUG
/// Made-up bookings and dogs for screenshots. Compiled into Debug builds only.
struct SampleHomeClient: SalonHomeClient {
    func loadHome() async throws -> (bookings: [BookingRow], dogs: [DogRow]) {
        let today = HomeSelector.londonDate(Date())
        let later = HomeSelector.londonDate(Date().addingTimeInterval(8 * 86_400))
        let dogs = [
            DogRow(id: "d1", name: "Biscuit", breed: "Cockapoo", size: "medium", photo_path: nil),
            DogRow(id: "d2", name: "Moose", breed: "Newfoundland", size: "large", photo_path: nil),
        ]
        let bookings = [
            BookingRow(id: "b1", booking_date: today, slot: "09:30", service: "Full Groom", status: "Arrived", dog_id: "d1"),
            BookingRow(id: "b2", booking_date: later, slot: "12:00", service: "Bath & De-shed", status: "Booked", dog_id: "d2"),
        ]
        return (bookings, dogs)
    }
}

/// Made-up dogs for booking screenshots, covering every state of the dog step.
/// Compiled into Debug builds only.
struct SampleBookingClient: SalonBookingDataClient {
    func loadDogs() async throws -> [BookingDogRow] {
        [
            BookingDogRow(id: "d1", name: "Biscuit", breed: "Cockapoo", size: "medium", is_pregnant: false),
            BookingDogRow(id: "d2", name: "Moose", breed: "Newfoundland", size: "large", is_pregnant: false),
            BookingDogRow(id: "d3", name: "Pip", breed: "Cavapoo", size: nil, is_pregnant: false),
            BookingDogRow(id: "d4", name: "Bella", breed: "Poodle", size: "small", is_pregnant: true),
        ]
    }

    func loadRules() async -> Data? {
        Data(#"{"bookingHorizonDays":28}"#.utf8)
    }

    /// A calendar that shows every state: the second open weekday in the window is full,
    /// the third has been closed by staff, and the rest are quiet.
    func loadCalendar(from: String, to: String) async -> SalonCalendar {
        let open = BookingWindow.dates(now: Date(), horizonDays: 28).filter(DatePlanner.isOpenByDefault)
        var closed: [OpenDayRow] = []
        var bookings: [OccupancyRow] = []
        if open.count > 2 {
            closed = [OpenDayRow(setting_date: open[2], is_open: false)]
        }
        if open.count > 1 {
            bookings = (0..<14).map { OccupancyRow(booking_date: open[1], slot: BookingSlots.canonical[$0 % 10], size: "small") }
        }
        return SalonCalendar(openRows: closed, occupancyRows: bookings, blockedRows: [])
    }

    func loadLastMinuteSlots() async -> [ImmediateSlotRow] {
        let today = HomeSelector.londonDate(Date())
        return ["10:00", "10:30"].map { ImmediateSlotRow(setting_date: today, slot: $0) }
    }
}

/// A made-up salon morning for staff Today screenshots. The clock is pinned to 10:05
/// London time on the real date, so lateness and waiting times read the same whenever
/// it is opened. Other dates come back empty. Compiled into Debug builds only.
struct SampleStaffDayClient: StaffDayClient {
    /// 10:05 today, London time.
    static let clock: @Sendable () -> Date = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/London") ?? .current
        var parts = calendar.dateComponents([.year, .month, .day], from: Date())
        parts.hour = 10
        parts.minute = 5
        return calendar.date(from: parts) ?? Date()
    }

    func loadDay(_ date: String) async throws -> StaffDayRead {
        let now = Self.clock()
        guard date == StaffDayStack.londonDate(now) else {
            return StaffDayRead(bookings: [], dogs: [], humans: [], setting: nil)
        }
        let iso = ISO8601DateFormatter()
        func ago(_ minutes: Double) -> String { iso.string(from: now.addingTimeInterval(-minutes * 60)) }
        func booking(
            _ id: String, _ slot: String, _ service: String, _ status: String, dog: String,
            checkedIn: Double? = nil, ready: Double? = nil, completed: Double? = nil,
            reminder: String? = nil, confirmedVia: String? = nil, notes: String? = nil, cancelReason: String? = nil
        ) -> StaffBookingRow {
            StaffBookingRow(
                id: id, booking_date: date, slot: slot, service: service, status: status,
                cancel_reason: cancelReason, dog_id: dog,
                checked_in_at: checkedIn.map(ago), ready_at: ready.map(ago), completed_at: completed.map(ago),
                reminder_confirmed_at: confirmedVia == nil ? nil : ago(60 * 20), confirmation_channel: confirmedVia,
                notes: notes, dog_name_snapshot: nil, breed_snapshot: nil, owner_name_snapshot: nil, group_id: nil,
                notification_log: reminder.map { [StaffNotificationRow(trigger_type: "reminder", status: $0, sent_at: ago(60 * 22))] }
            )
        }
        let bookings = [
            booking("s1", "08:30", "full-groom", "Completed", dog: "d1", checkedIn: 95, ready: 40, completed: 20),
            booking("s2", "08:30", "bath-and-brush", "Arrived", dog: "d2", checkedIn: 92, confirmedVia: "whatsapp"),
            booking("s3", "09:00", "bath-and-deshed", "Ready for collection", dog: "d3", checkedIn: 63, ready: 55),
            booking("s4", "09:00", "puppy-groom", "Booked", dog: "d4", reminder: "sent"),
            booking("s5", "09:30", "full-groom", "Arrived", dog: "d5", checkedIn: 30, confirmedVia: "sms",
                    notes: "Short on the face, leave the ears long."),
            booking("s6", "10:30", "full-groom", "Booked", dog: "d6", confirmedVia: "whatsapp"),
            booking("s7", "11:00", "bath-and-brush", "Booked", dog: "d7", reminder: "failed"),
            booking("s8", "12:00", "full-groom", "Booked", dog: "d8"),
            booking("s9", "12:30", "bath-and-brush", "Cancelled", dog: "d9", cancelReason: "Customer cancelled"),
            booking("s10", "09:30", "bath-and-brush", "No-show", dog: "d10"),
        ]
        let dogs = [
            StaffDogRow(id: "d1", name: "Biscuit", breed: "Cockapoo", human_id: "h1", alerts: nil, is_pregnant: false),
            StaffDogRow(id: "d2", name: "Moose", breed: "Newfoundland", human_id: "h2", alerts: ["Sensitive paws"], is_pregnant: false),
            StaffDogRow(id: "d3", name: "Luna", breed: "Husky", human_id: "h3", alerts: nil, is_pregnant: false),
            StaffDogRow(id: "d4", name: "Pip", breed: "Shih Tzu", human_id: "h4", alerts: nil, is_pregnant: false),
            StaffDogRow(id: "d5", name: "Bella", breed: "Poodle", human_id: "h5", alerts: nil, is_pregnant: true),
            StaffDogRow(id: "d6", name: "Ziggy", breed: "Cavapoo", human_id: "h1", alerts: ["Kennel aggressive"], is_pregnant: false),
            StaffDogRow(id: "d7", name: "Rolo", breed: "Dachshund", human_id: "h6", alerts: nil, is_pregnant: false),
            StaffDogRow(id: "d8", name: "Bramble", breed: "Springer Spaniel", human_id: "h7", alerts: nil, is_pregnant: false),
            StaffDogRow(id: "d9", name: "Teddy", breed: "Bichon Frise", human_id: "h8", alerts: nil, is_pregnant: false),
            StaffDogRow(id: "d10", name: "Archie", breed: "Border Terrier", human_id: "h4", alerts: nil, is_pregnant: false),
        ]
        let humans = [
            StaffHumanRow(id: "h1", name: "Sam", surname: "Taylor", phone: "07700 900101"),
            StaffHumanRow(id: "h2", name: "Priya", surname: "Shah", phone: "07700 900102"),
            StaffHumanRow(id: "h3", name: "Tom", surname: "Hughes", phone: "07700 900103"),
            StaffHumanRow(id: "h4", name: "Ellie", surname: "Brooks", phone: "07700 900104"),
            StaffHumanRow(id: "h5", name: "Jo", surname: "Patel", phone: "07700 900105"),
            StaffHumanRow(id: "h6", name: "Mark", surname: "Evans", phone: "07700 900106"),
            StaffHumanRow(id: "h7", name: "Ruth", surname: "Green", phone: "07700 900107"),
            StaffHumanRow(id: "h8", name: "Dan", surname: "Morris", phone: "07700 900108"),
        ]
        return StaffDayRead(
            bookings: bookings, dogs: dogs, humans: humans,
            setting: StaffDaySettingRow(setting_date: date, is_open: true)
        )
    }
}
#endif
