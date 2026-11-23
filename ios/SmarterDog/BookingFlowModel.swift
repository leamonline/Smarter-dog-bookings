import Foundation
import Observation

// What the booking screens read and call. Pure Foundation plus Observation, no UI and no
// Supabase, so Linux CI tests it. The screens are thin: they show this, and call this.
//
// It holds the wizard state (`BookingWizardState`) and loads the customer's dogs. Nothing
// here sends a booking.

/// What the booking screens ask the salon. The iPhone app uses Supabase. Tests and the
/// debug sample mode use a stand-in.
protocol SalonBookingDataClient: Sendable {
    /// The customer's own dogs, with the pregnancy flag. Row Level Security returns only theirs.
    func loadDogs() async throws -> [BookingDogRow]

    /// The raw JSON of `current_customer_booking_rules()`, or nil if it could not be read.
    func loadRules() async -> Data?

    /// The salon's calendar from one day to another, both inclusive (`yyyy-MM-dd`). Each of the
    /// reads behind it can fail on its own: a failed one is left out of the result and makes the
    /// calendar incomplete, never "empty". It does not throw.
    func loadCalendar(from: String, to: String) async -> SalonCalendar

    /// Today's staff-flagged last-minute slots. A failed read is no slots, as on the website.
    func loadLastMinuteSlots() async -> [ImmediateSlotRow]
}

@MainActor
@Observable
final class BookingFlowModel {
    enum DogsState: Equatable {
        case loading
        case loaded([BookingDog])
        /// The lookup failed. Never shown as "no dogs": the answer is unknown.
        case failed
    }

    private(set) var dogsState: DogsState = .loading
    private(set) var wizard = BookingWizardState()
    private let client: SalonBookingDataClient?
    private let now: @Sendable () -> Date

    /// The date step.
    private(set) var rules: BookingRules = .unknown
    private(set) var datePage = 0
    private(set) var calendarState: CalendarState = .idle
    private(set) var calendar: SalonCalendar = .empty
    private(set) var lastMinuteRows: [ImmediateSlotRow] = []
    private var calendarCache: [Int: SalonCalendar] = [:]
    /// Bumped on every page request so a slow answer for an old page is dropped.
    private var calendarRequest = 0

    enum CalendarState: Equatable {
        case idle
        case loading
        case loaded
    }

    init(client: SalonBookingDataClient?, now: @escaping @Sendable () -> Date = { Date() }) {
        self.client = client
        self.now = now
    }

    // MARK: reading

    var step: BookingStep { wizard.step }
    var canContinue: Bool { wizard.canContinue }
    var selectedDogId: String? { wizard.dog?.id }

    /// "Step 2 of 5".
    var stepCaption: String { "Step \(step.rawValue + 1) of \(BookingStep.allCases.count)" }

    var dogs: [BookingDog] {
        if case .loaded(let dogs) = dogsState { return dogs }
        return []
    }

    /// Whether to show the website's note about dogs the salon has not sized yet.
    var hasUnsizedDog: Bool { dogs.contains { $0.blocker == .sizeUnconfirmed } }

    /// Whether to show the website's note about pregnant dogs.
    var hasPregnantDog: Bool { dogs.contains { $0.blocker == .pregnant } }

    // MARK: the service step

    var selectedDogName: String? { wizard.dog?.name }
    var selectedService: BookingService? { wizard.service }

    /// The services this dog's size can have, as the website lists them. Empty until a dog is chosen.
    var offeredServices: [BookingService] {
        guard let size = wizard.dog?.confirmedSize else { return [] }
        return BookingService.offered(for: size)
    }

    /// The starting price line for a service on this dog, for example "From £46+".
    func priceLine(for service: BookingService) -> String? {
        guard let size = wizard.dog?.confirmedSize else { return nil }
        return service.priceLine(for: size)
    }

    // MARK: loading

    func loadDogs() async {
        guard let client else {
            dogsState = .failed
            return
        }
        do {
            let loaded = BookingDogs.make(from: try await client.loadDogs())
            dogsState = .loaded(loaded)
            // A dog chosen earlier may have changed (now pregnant, or gone). Start again rather
            // than carry a choice the salon would now refuse.
            if let chosen = wizard.dog, loaded.first(where: { $0.id == chosen.id })?.isBookable != true {
                wizard = BookingWizardState()
            }
        } catch {
            dogsState = .failed
        }
    }

    // MARK: choosing and moving

    /// A dog that cannot be booked is ignored: the screen shows it disabled, and the
    /// wizard would refuse it anyway.
    func select(dog: BookingDog) {
        try? wizard.choose(dog: dog)
        // A day that was open for the last dog may be full for this one (a large dog needs more room).
        if let date = wizard.date,
           dateWeeks.flatMap(\.days).first(where: { $0.date == date })?.isSelectable == false {
            wizard.clearDate()
        }
    }

    /// A service this dog cannot have is ignored (the screen does not list it).
    func select(service: BookingService) {
        try? wizard.choose(service: service)
    }

    func next() { wizard.next() }
    func back() { wizard.back() }

    // MARK: the date step

    /// Every date the customer may book: tomorrow to the booking horizon.
    var windowDates: [String] {
        BookingWindow.dates(now: now(), horizonDays: rules.horizonDays)
    }

    var datePageCount: Int { DatePlanner.pageCount(of: windowDates) }
    var canShowEarlierDates: Bool { datePage > 0 }
    var canShowLaterDates: Bool { datePage + 1 < datePageCount }

    /// The size of the chosen dog. The date step cannot be reached without one.
    private var chosenSize: DogSize? { wizard.dog?.confirmedSize }

    /// This page's days grouped by week, for the chosen dog's size.
    var dateWeeks: [DateWeek] {
        guard let size = chosenSize else { return [] }
        let days = DatePlanner.page(windowDates, index: datePage)
        return DatePlanner.weeks(DatePlanner.options(for: days, size: size, calendar: calendar))
    }

    /// "Today — last minute", only on the first page.
    var lastMinuteOffer: LastMinuteOffer? {
        guard datePage == 0, let size = chosenSize else { return nil }
        return DatePlanner.lastMinute(rows: lastMinuteRows, size: size, calendar: calendar)
    }

    /// Whether a read failed, so the screen can say the list may be out of date.
    var calendarIsIncomplete: Bool { calendarState == .loaded && !calendar.complete }

    /// Reads the rules, today's last-minute slots and the first page. Call when the step appears.
    func loadDateStep() async {
        guard let client else { return }
        async let rulesData = client.loadRules()
        async let flagged = client.loadLastMinuteSlots()
        let (data, slots) = await (rulesData, flagged)
        rules = BookingRules.parse(data)
        lastMinuteRows = slots
        calendarCache = [:]
        await showDatePage(min(datePage, max(0, datePageCount - 1)))
    }

    /// Moves to another 28-day page and reads it. A complete page is remembered; one with a
    /// failed read is read again next time, as on the website.
    func showDatePage(_ index: Int) async {
        guard let client, (0..<datePageCount).contains(index) else { return }
        calendarRequest += 1
        let request = calendarRequest
        datePage = index
        if let cached = calendarCache[index] {
            calendar = cached
            calendarState = .loaded
            return
        }
        guard let range = DatePlanner.readRange(page: index, dates: windowDates, today: HomeSelector.londonDate(now())) else { return }
        calendarState = .loading
        let loaded = await client.loadCalendar(from: range.from, to: range.to)
        guard request == calendarRequest else { return } // the customer has moved on
        calendar = loaded
        calendarState = .loaded
        if loaded.complete { calendarCache[index] = loaded }
    }

    /// A date the salon lists as open. Anything else, or a date outside the window, is ignored.
    func select(date: String) {
        guard dateWeeks.flatMap(\.days).first(where: { $0.date == date })?.isSelectable == true else { return }
        try? wizard.choose(date: date, window: windowDates)
    }

    var selectedDate: String? { wizard.date }
}
