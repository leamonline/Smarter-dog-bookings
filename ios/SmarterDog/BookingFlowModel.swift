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

    /// Sends the booking. The only call that writes. Never throws: every outcome is a `BookingSendResult`.
    func createBooking(_ request: BookingRequest) async -> BookingSendResult

    /// Reads back bookings the server just created, for the deposit and the confirmation. Nil if it failed.
    func loadBookings(ids: [String]) async -> [BookedRow]?

    /// Looks for a booking this dog already has at that date and slot, to learn what happened when the
    /// reply never arrived. Nil if the lookup itself failed.
    func findBookings(dogId: String, date: String) async -> [BookedRow]?
}

extension SalonBookingDataClient {
    // Defaults so a client that cannot book (the previews) still compiles. They never create a
    // booking: sending says "no usable answer" and reading says "could not read". The Supabase
    // client overrides all three.
    func createBooking(_ request: BookingRequest) async -> BookingSendResult { .unknown }
    func loadBookings(ids: [String]) async -> [BookedRow]? { nil }
    func findBookings(dogId: String, date: String) async -> [BookedRow]? { nil }
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
    /// Whether the confirm button may send. Off unless the app turns it on (Debug builds only, for now).
    let canBook: Bool

    /// The confirm step.
    private(set) var confirmState: ConfirmState = .idle
    /// What was sent, kept so a lookup can find it if the reply never arrived.
    private var sent: BookingRequest?

    /// The date step.
    private(set) var rules: BookingRules = .unknown
    private(set) var datePage = 0
    private(set) var calendarState: CalendarState = .idle
    private(set) var calendar: SalonCalendar = .empty
    private(set) var lastMinuteRows: [ImmediateSlotRow] = []
    private var calendarCache: [Int: SalonCalendar] = [:]

    /// The time step.
    private(set) var timesState: TimesState = .idle
    private(set) var offeredTimes: [String] = []
    /// Whether the times on show are for today's last-minute opening, for the empty-state wording.
    private(set) var timesAreLastMinute = false
    private var timesRequest = 0

    enum TimesState: Equatable {
        case idle
        case loading
        case loaded
        /// The day's bookings could not be read. Never shown as "fully booked".
        case failed
        /// Staff closed the day after it was picked. No times, and not "fully booked" either.
        case closed
    }
    /// Bumped on every page request so a slow answer for an old page is dropped.
    private var calendarRequest = 0

    enum CalendarState: Equatable {
        case idle
        case loading
        case loaded
    }

    init(client: SalonBookingDataClient?, now: @escaping @Sendable () -> Date = { Date() }, canBook: Bool = false) {
        self.client = client
        self.now = now
        self.canBook = canBook
    }

    // MARK: reading

    var step: BookingStep { wizard.step }
    /// The time step is only finished with a time that a successful read of the day, made on this
    /// visit, still offers. A time remembered from an earlier visit is not trusted until then.
    var canContinue: Bool {
        if wizard.step == .time {
            guard timesState == .loaded, let time = wizard.time else { return false }
            return offeredTimes.contains(time)
        }
        return wizard.canContinue
    }
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
        if let date = wizard.date, !isSelectable(date: date) {
            wizard.clearDate()
            lastMinuteDate = nil
        }
    }

    /// A service this dog cannot have is ignored (the screen does not list it).
    func select(service: BookingService) {
        try? wizard.choose(service: service)
    }

    func next() {
        guard canContinue else { return }
        wizard.next()
        arrived()
    }

    func back() {
        // Not while a request is in flight, and not once a booking exists or might exist: the
        // choices behind it must not change under a booking that was made from them.
        switch confirmState {
        case .checking, .sending, .done(.booked), .done(.unsure): return
        default: break
        }
        let from = wizard.step
        wizard.back()
        // Leaving the time step for the date step: drop the remembered pages, so a day staff have
        // closed or filled since it was picked shows as such when the list is read again.
        if from == .time, wizard.step == .date { calendarCache = [:] }
        arrived()
    }

    /// Arriving at the time step, from either side: forget any times from an earlier visit, so a
    /// stale list is never on screen or pickable, and the remembered time is not trusted until the
    /// day has been read again.
    private func arrived() {
        if wizard.step == .summary {
            // A fresh look at the summary: forget a refusal or a gone time from an earlier try.
            if case .done = confirmState { confirmState = .idle }
        }
        guard wizard.step == .time else { return }
        timesRequest += 1
        timesState = .idle
        offeredTimes = []
    }

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

    /// What staff opened for today that the chosen dog fits, on any page.
    private var lastMinuteForDog: LastMinuteOffer? {
        guard let size = chosenSize else { return nil }
        return DatePlanner.lastMinute(rows: lastMinuteRows, size: size, calendar: calendar)
    }

    /// "Today — last minute", shown above the list on the first page only.
    var lastMinuteOffer: LastMinuteOffer? {
        datePage == 0 ? lastMinuteForDog : nil
    }

    /// The date the customer chose as today's last-minute opening, remembered for as long as it
    /// is the chosen date, even after every flagged time has gone. Otherwise a refresh that finds
    /// nothing left would turn today into an ordinary day and offer the whole grid.
    private var lastMinuteDate: String?

    /// Whether the customer chose today's last-minute opening. Holds on every page.
    var isLastMinuteSelected: Bool {
        guard let chosen = lastMinuteDate else { return false }
        return wizard.date == chosen
    }

    /// Choose today's last-minute opening. Today is outside the normal window (tomorrow on),
    /// so it is allowed in by name. The time step then offers only `lastMinuteForDog`'s slots.
    func selectLastMinute() {
        guard let offer = lastMinuteForDog else { return }
        try? wizard.choose(date: offer.date, window: windowDates + [offer.date])
        if wizard.date == offer.date { lastMinuteDate = offer.date }
    }

    /// The times the time step may offer if today was chosen, else nil.
    var lastMinuteSlots: [String]? {
        isLastMinuteSelected ? lastMinuteForDog?.slots : nil
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
        if wizard.date == date { lastMinuteDate = nil }
    }

    var selectedDate: String? { wizard.date }

    /// Whether the chosen date is still one this dog can have. Today's last-minute opening counts
    /// while the dog fits it. A day on another page is kept, since only the current page is known.
    private func isSelectable(date: String) -> Bool {
        if lastMinuteForDog?.date == date { return true }
        // Not in the normal window means it was today's opening, which this dog no longer fits.
        if !windowDates.contains(date) { return false }
        return dateWeeks.flatMap(\.days).first(where: { $0.date == date })?.isSelectable ?? true
    }

    // MARK: the time step

    var timeGroups: [TimeGroup] { TimePlanner.groups(offeredTimes) }
    var selectedTime: String? { wizard.time }

    /// What the last step shows. Nil until a dog, service, date and time are all chosen.
    var summary: BookingSummary? { wizard.summary }

    /// For example "Tuesday 1 December", for the screen's sentence and empty state.
    var selectedDateText: String? { wizard.date.map { HomeSelector.dateText($0) } }

    /// Reads the chosen day afresh and works out which times to offer. Called every time the step
    /// appears, because someone else may have taken a slot since the date was picked. A chosen
    /// time that has gone is dropped.
    func loadTimes() async {
        guard let client, let date = wizard.date, let size = chosenSize else { return }
        timesRequest += 1
        let request = timesRequest
        timesState = .loading
        let lastMinute = isLastMinuteSelected
        if lastMinute {
            // The 30-minute cut-off moves on, so ask the server again which times are still open.
            let rows = await client.loadLastMinuteSlots()
            guard request == timesRequest else { return }
            lastMinuteRows = rows
        }
        let day = await client.loadCalendar(from: date, to: date)
        guard request == timesRequest else { return } // the customer has moved on
        guard day.bookings(on: date) != nil else {
            offeredTimes = []
            timesState = .failed
            return
        }
        timesAreLastMinute = lastMinute
        // Staff closed the day after it was picked. Say so, rather than "fully booked" or a list
        // the database would refuse.
        if !lastMinute, day.openDaysRead, !day.isOpen(date) {
            offeredTimes = []
            timesState = .closed
            return
        }
        offeredTimes = TimePlanner.offered(
            date: date, size: size, calendar: day, lastMinuteRows: lastMinuteRows, isLastMinute: lastMinute
        )
        timesState = .loaded
        if let chosen = wizard.time, !offeredTimes.contains(chosen) { wizard.clearTime() }
    }

    /// A time that is not on the list is ignored.
    func select(time: String) {
        try? wizard.choose(time: time, offered: offeredTimes)
    }

    // MARK: the confirm step

    /// Whether the confirm button may be pressed right now: booking is switched on, we are on the
    /// last step with everything chosen, and nothing is in flight or already settled.
    var canConfirm: Bool {
        guard canBook, step == .summary, summary != nil else { return false }
        switch confirmState {
        case .idle: return true
        case .checking, .sending: return false
        case .done(let outcome):
            // A new attempt is fine after a refusal or a gone time. Never after a booking was made,
            // and never while we are not sure: that could book twice.
            switch outcome {
            case .refused, .slotTaken, .incomplete, .notSent: return true
            case .booked, .unsure: return false
            }
        }
    }

    /// Send the booking. One tap is one request: while one is in flight a second tap does nothing.
    func confirm() async {
        guard canConfirm, let client, let summary = wizard.summary,
              let dog = wizard.dog, let date = wizard.date, let time = wizard.time,
              let size = chosenSize else { return }

        // Just before sending, read the day again: someone may have taken the time since it was shown.
        confirmState = .checking
        let lastMinute = isLastMinuteSelected
        if lastMinute { lastMinuteRows = await client.loadLastMinuteSlots() }
        let day = await client.loadCalendar(from: date, to: date)
        if day.bookings(on: date) != nil {
            let stillOffered = TimePlanner.offered(
                date: date, size: size, calendar: day, lastMinuteRows: lastMinuteRows, isLastMinute: lastMinute
            )
            if !stillOffered.contains(time) {
                offeredTimes = stillOffered
                timesState = .loaded
                confirmState = .done(.slotTaken)
                return
            }
        }
        // If the day could not be read, go ahead: the database refuses a time that has gone.

        // The request is checked against the same grid the time was offered from: the standard
        // slots, plus any extra slot staff opened for today (a last-minute 13:30, say). Without it
        // a time the app itself offered would be refused before it was sent.
        let grid = lastMinute ? BookingSlots.grid(extras: lastMinuteRows.compactMap(\.slot)) : BookingSlots.canonical
        let request: BookingRequest
        do { request = try wizard.request(gridSlots: grid) } catch {
            confirmState = .done(.incomplete)
            return
        }
        confirmState = .sending
        sent = request

        switch await client.createBooking(request) {
        case .created(let ids):
            let rows = await client.loadBookings(ids: ids)
            confirmState = .done(.booked(bookedSummary(summary, ids: ids, row: rows?.first { ids.contains($0.id) })))
        case .refused(let message, let details):
            sent = nil
            confirmState = .done(BookingConfirm.refusal(message: message, details: details))
        case .notSent:
            // It never left the phone, so nothing exists and trying again is safe.
            sent = nil
            confirmState = .done(.notSent)
        case .unknown:
            // No usable reply. Do not say it worked or failed, and never send again by ourselves.
            // Look on the server for what is there.
            await lookUpOutcome(summary: summary, dogId: dog.id, date: date, time: time)
        }
    }

    /// After an unknown outcome: ask the server again whether the booking is there. Sends nothing.
    func checkOutcome() async {
        guard case .done(.unsure) = confirmState, let request = sent, let summary = wizard.summary,
              let row = request.p_bookings.first else { return }
        await lookUpOutcome(summary: summary, dogId: row.dog_id, date: request.p_booking_date, time: row.slot)
    }

    private func lookUpOutcome(summary: BookingSummary, dogId: String, date: String, time: String) async {
        guard let client else { confirmState = .done(.unsure); return }
        if let rows = await client.findBookings(dogId: dogId, date: date),
           let found = BookingConfirm.matching(rows, date: date, slot: time) {
            confirmState = .done(.booked(bookedSummary(summary, ids: [found.id], row: found)))
        } else {
            confirmState = .done(.unsure)
        }
    }

    private func bookedSummary(_ summary: BookingSummary, ids: [String], row: BookedRow?) -> BookedSummary {
        BookedSummary(
            dogName: summary.dogName,
            service: summary.service,
            whenText: summary.whenText,
            deposit: DepositNote.from(row),
            bookingIds: ids
        )
    }

    // MARK: what the confirm screens read

    /// A request is out, or about to be: the day is being re-read, or the booking is being sent.
    var isConfirming: Bool {
        switch confirmState {
        case .checking, .sending: return true
        default: return false
        }
    }

    /// The label on the confirm button. The website's wording.
    var confirmButtonTitle: String { isConfirming ? "Booking…" : "Confirm booking" }

    /// Back is not offered while a request is out, or once a booking exists or might exist.
    var canGoBack: Bool {
        switch confirmState {
        case .checking, .sending, .done(.booked), .done(.unsure): return false
        default: return step != .dog
        }
    }

    /// Set when the booking was made. The booked screen shows it.
    var bookedSummary: BookedSummary? {
        if case .done(.booked(let booked)) = confirmState { return booked }
        return nil
    }

    /// After a booking: begin a fresh one. The only way out of a finished booking, so the choices behind
    /// a booking that exists can never be changed under it. The customer's dogs stay loaded.
    func startAnother() {
        guard bookedSummary != nil else { return }
        wizard = BookingWizardState()
        confirmState = .idle
        sent = nil
        lastMinuteDate = nil
        lastMinuteRows = []
        calendar = .empty
        calendarCache = [:]
        calendarState = .idle
        datePage = 0
        calendarRequest += 1
        timesState = .idle
        timesRequest += 1
        offeredTimes = []
        timesAreLastMinute = false
    }
}

