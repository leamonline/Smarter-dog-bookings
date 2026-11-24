import XCTest
@testable import AuthCore

// Every test in this class is `async`. The class runs on the main actor, and Swift 6.0 on Linux
// (what CI uses) cannot list a plain synchronous test from a main-actor class: the build fails.
@MainActor
final class BookingFlowModelTests: XCTestCase {
    private final class FakeClient: SalonBookingDataClient, @unchecked Sendable {
        var rows: [BookingDogRow] = []
        var fails = false
        var calls = 0
        func loadDogs() async throws -> [BookingDogRow] {
            calls += 1
            if fails { throw URLError(.notConnectedToInternet) }
            return rows
        }

        var rulesJSON: Data? = Data(#"{"bookingHorizonDays":28}"#.utf8)
        var calendarFor: (String, String) -> SalonCalendar = { _, _ in .empty }
        var flagged: [ImmediateSlotRow] = []
        var calendarCalls: [(from: String, to: String)] = []
        func loadRules() async -> Data? { rulesJSON }
        func loadCalendar(from: String, to: String) async -> SalonCalendar {
            calendarCalls.append((from, to))
            return calendarFor(from, to)
        }
        func loadLastMinuteSlots() async -> [ImmediateSlotRow] { flagged }

        // The confirm step.
        var sendResult: BookingSendResult = .created(ids: ["b1"])
        var readBack: [BookedRow]? = [BookedRow(id: "b1", booking_date: "2026-11-24", slot: "09:30", service: "Full Groom", status: "Booked", deposit_required: false)]
        var found: [BookedRow]? = []
        var sentRequests: [BookingRequest] = []
        var lookups = 0
        /// When set, `createBooking` waits here until the test releases it, to model a request in flight.
        var holdCreate = false
        var waiting: CheckedContinuation<Void, Never>?
        func createBooking(_ request: BookingRequest) async -> BookingSendResult {
            sentRequests.append(request)
            if holdCreate { await withCheckedContinuation { waiting = $0 } }
            return sendResult
        }
        func loadBookings(ids: [String]) async -> [BookedRow]? { readBack }
        func findBookings(dogId: String, date: String) async -> [BookedRow]? {
            lookups += 1
            return found
        }
    }

    private func row(_ id: String, _ name: String, size: String? = "medium", pregnant: Bool = false) -> BookingDogRow {
        BookingDogRow(id: id, name: name, breed: "Cockapoo", size: size, is_pregnant: pregnant)
    }

    private func loaded(_ rows: [BookingDogRow]) async -> (BookingFlowModel, FakeClient) {
        let client = FakeClient()
        client.rows = rows
        let model = BookingFlowModel(client: client)
        await model.loadDogs()
        return (model, client)
    }

    func testItStartsLoadingAndThenShowsTheDogsSortedWithTheBlockedOnesMarked() async {
        let client = FakeClient()
        client.rows = [row("2", "Moose", size: "large"), row("1", "Biscuit"), row("3", "Pip", size: nil), row("4", "Bella", pregnant: true)]
        let model = BookingFlowModel(client: client)
        XCTAssertEqual(model.dogsState, .loading)
        XCTAssertTrue(model.dogs.isEmpty)
        await model.loadDogs()
        XCTAssertEqual(model.dogs.map(\.name), ["Bella", "Biscuit", "Moose", "Pip"])
        XCTAssertEqual(model.dogs.first { $0.name == "Pip" }?.blocker, .sizeUnconfirmed)
        XCTAssertEqual(model.dogs.first { $0.name == "Bella" }?.blocker, .pregnant)
        XCTAssertTrue(model.hasUnsizedDog)
        XCTAssertTrue(model.hasPregnantDog)
    }

    func testTheNotesAboutBlockedDogsAppearOnlyWhenThereIsOne() async {
        let (model, _) = await loaded([row("1", "Biscuit"), row("2", "Moose", size: "large")])
        XCTAssertFalse(model.hasUnsizedDog)
        XCTAssertFalse(model.hasPregnantDog)
    }

    func testAFailedLookupIsFailedNeverNoDogsAndATryAgainWorks() async {
        let client = FakeClient()
        client.fails = true
        let model = BookingFlowModel(client: client)
        await model.loadDogs()
        XCTAssertEqual(model.dogsState, .failed)
        XCTAssertTrue(model.dogs.isEmpty)
        client.fails = false
        client.rows = [row("1", "Biscuit")]
        await model.loadDogs()
        XCTAssertEqual(model.dogs.map(\.name), ["Biscuit"])
    }

    func testNoClientAtAllIsAFailureNotAnEmptyList() async {
        let model = BookingFlowModel(client: nil)
        await model.loadDogs()
        XCTAssertEqual(model.dogsState, .failed)
    }

    func testPickingADogLetsYouContinueAndABlockedDogIsIgnored() async {
        let (model, _) = await loaded([row("1", "Biscuit"), row("2", "Pip", size: nil), row("3", "Bella", pregnant: true)])
        XCTAssertFalse(model.canContinue)
        XCTAssertNil(model.selectedDogId)
        for blocked in model.dogs where blocked.name != "Biscuit" { model.select(dog: blocked) }
        XCTAssertNil(model.selectedDogId, "a dog that cannot be booked is not selected")
        XCTAssertFalse(model.canContinue)

        model.select(dog: model.dogs.first { $0.name == "Biscuit" }!)
        XCTAssertEqual(model.selectedDogId, "1")
        XCTAssertTrue(model.canContinue)
    }

    func testPickingAnotherDogMovesTheTick() async {
        let (model, _) = await loaded([row("1", "Biscuit"), row("2", "Moose", size: "large")])
        model.select(dog: model.dogs[0])
        model.select(dog: model.dogs[1])
        XCTAssertEqual(model.selectedDogId, "2")
    }

    func testContinueAndBackMoveThroughTheStepsWithTheirCaption() async {
        let (model, _) = await loaded([row("1", "Biscuit")])
        XCTAssertEqual(model.step, .dog)
        XCTAssertEqual(model.stepCaption, "Step 1 of 5")
        model.next()
        XCTAssertEqual(model.step, .dog, "no dog chosen yet")
        model.select(dog: model.dogs[0])
        model.next()
        XCTAssertEqual(model.step, .service)
        XCTAssertEqual(model.stepCaption, "Step 2 of 5")
        model.back()
        XCTAssertEqual(model.step, .dog)
        model.back()
        XCTAssertEqual(model.step, .dog, "there is nothing before the first step")
    }

    func testAReloadKeepsAChosenDogThatIsStillBookable() async {
        let (model, client) = await loaded([row("1", "Biscuit")])
        model.select(dog: model.dogs[0])
        await model.loadDogs()
        XCTAssertEqual(client.calls, 2)
        XCTAssertEqual(model.selectedDogId, "1")
    }

    func testAReloadStartsAgainIfTheChosenDogIsNowBlockedOrGone() async {
        let (model, client) = await loaded([row("1", "Biscuit"), row("2", "Moose", size: "large")])
        model.select(dog: model.dogs[0])
        model.next()
        XCTAssertEqual(model.step, .service)

        // Biscuit is now marked pregnant by the salon.
        client.rows = [row("1", "Biscuit", pregnant: true), row("2", "Moose", size: "large")]
        await model.loadDogs()
        XCTAssertNil(model.selectedDogId)
        XCTAssertEqual(model.step, .dog, "back to the start rather than carry a choice the salon would refuse")

        model.select(dog: model.dogs.first { $0.name == "Moose" }!)
        client.rows = [row("1", "Biscuit")]
        await model.loadDogs()
        XCTAssertNil(model.selectedDogId, "the chosen dog is gone")
    }

    func testAFailedReloadKeepsWhatWasChosen() async {
        let (model, client) = await loaded([row("1", "Biscuit")])
        model.select(dog: model.dogs[0])
        client.fails = true
        await model.loadDogs()
        XCTAssertEqual(model.dogsState, .failed)
        XCTAssertEqual(model.selectedDogId, "1", "a network blip does not throw the customer's choice away")
    }

    // MARK: the service step

    func testNoServicesUntilADogIsChosenThenTheOnesItsSizeCanHave() async {
        let (model, _) = await loaded([row("1", "Biscuit"), row("2", "Moose", size: "large")])
        XCTAssertTrue(model.offeredServices.isEmpty)
        XCTAssertNil(model.priceLine(for: .fullGroom))
        XCTAssertNil(model.selectedDogName)

        model.select(dog: model.dogs.first { $0.name == "Biscuit" }!)
        XCTAssertEqual(model.selectedDogName, "Biscuit")
        XCTAssertEqual(model.offeredServices.map(\.rawValue), ["Full Groom", "Bath & Brush", "Bath & De-shed", "Puppy Groom"])
        XCTAssertEqual(model.priceLine(for: .fullGroom), "From £46+")

        model.select(dog: model.dogs.first { $0.name == "Moose" }!)
        XCTAssertEqual(model.offeredServices.map(\.rawValue), ["Full Groom", "Bath & Brush", "Bath & De-shed"])
        XCTAssertEqual(model.priceLine(for: .fullGroom), "From £60+")
        XCTAssertNil(model.priceLine(for: .puppyGroom))
    }

    func testChoosingAServiceLetsYouContinueAndAServiceTheDogCannotHaveIsIgnored() async {
        let (model, _) = await loaded([row("1", "Moose", size: "large")])
        model.select(service: .fullGroom)
        XCTAssertNil(model.selectedService, "no dog yet")
        model.select(dog: model.dogs[0])
        model.next()
        XCTAssertEqual(model.step, .service)
        XCTAssertFalse(model.canContinue)

        model.select(service: .puppyGroom)
        XCTAssertNil(model.selectedService, "Puppy Groom is not offered for a large dog")
        XCTAssertFalse(model.canContinue)

        model.select(service: .bathAndDeshed)
        XCTAssertEqual(model.selectedService, .bathAndDeshed)
        XCTAssertTrue(model.canContinue)
        model.next()
        XCTAssertEqual(model.step, .date)
        XCTAssertEqual(model.stepCaption, "Step 3 of 5")
    }

    func testGoingBackAndChoosingALargeDogDropsAPuppyGroom() async {
        let (model, _) = await loaded([row("1", "Pip", size: "small"), row("2", "Moose", size: "large")])
        model.select(dog: model.dogs.first { $0.name == "Pip" }!)
        model.next()
        model.select(service: .puppyGroom)
        XCTAssertEqual(model.selectedService, .puppyGroom)
        model.back()
        model.select(dog: model.dogs.first { $0.name == "Moose" }!)
        XCTAssertNil(model.selectedService, "a large dog cannot keep Puppy Groom")
        model.next()
        XCTAssertFalse(model.canContinue, "a service has to be chosen again")
    }

    // MARK: the date step

    // A fixed "now": Monday 23 November 2026, 12:00 London. Tomorrow is Tuesday 24 November.
    private let now: @Sendable () -> Date = { Date(timeIntervalSince1970: 1_795_435_200) }

    private func dateStep(
        rows: [BookingDogRow]? = nil,
        canBook: Bool = false,
        configure: (FakeClient) -> Void = { _ in }
    ) async -> (BookingFlowModel, FakeClient) {
        let client = FakeClient()
        client.rows = rows ?? [row("1", "Biscuit"), row("2", "Moose", size: "large")]
        configure(client)
        let model = BookingFlowModel(client: client, now: now, canBook: canBook)
        await model.loadDogs()
        model.select(dog: model.dogs[0])
        model.next()
        model.select(service: .fullGroom)
        model.next()
        XCTAssertEqual(model.step, .date)
        await model.loadDateStep()
        return (model, client)
    }

    func testTheClockUsedByTheTestsIsTheMondayItClaims() async {
        XCTAssertEqual(HomeSelector.londonDate(now()), "2026-11-23")
    }

    func testTheWindowStartsTomorrowAndThePageStartsReadingFromToday() async {
        let (model, client) = await dateStep()
        XCTAssertEqual(model.windowDates.first, "2026-11-24")
        XCTAssertEqual(model.windowDates.count, 28)
        XCTAssertEqual(client.calendarCalls.count, 1)
        XCTAssertEqual(client.calendarCalls.first?.from, "2026-11-23", "page 0 reads from today for the last-minute row")
        XCTAssertEqual(client.calendarCalls.first?.to, "2026-12-21")
        XCTAssertEqual(model.calendarState, .loaded)
        XCTAssertFalse(model.canShowEarlierDates)
        XCTAssertFalse(model.canShowLaterDates)
    }

    func testAnUnreadableRulesAnswerFallsBackToTwentyEightDays() async {
        let (model, _) = await dateStep { $0.rulesJSON = nil }
        XCTAssertEqual(model.windowDates.count, 28)
    }

    func testALongerHorizonGivesMorePagesAndEachIsReadOnce() async {
        let (model, client) = await dateStep { $0.rulesJSON = Data(#"{"bookingHorizonDays":60}"#.utf8) }
        XCTAssertEqual(model.datePageCount, 3)
        XCTAssertTrue(model.canShowLaterDates)
        await model.showDatePage(1)
        XCTAssertEqual(client.calendarCalls.last?.from, "2026-12-22", "later pages start on their own first day")
        XCTAssertEqual(model.datePage, 1)
        XCTAssertTrue(model.canShowEarlierDates)
        await model.showDatePage(0)
        await model.showDatePage(1)
        XCTAssertEqual(client.calendarCalls.count, 2, "complete pages are remembered")
        await model.showDatePage(9)
        XCTAssertEqual(model.datePage, 1, "a page past the end is ignored")
    }

    func testAPageThatFailedToLoadFullyIsReadAgainNextTime() async {
        let (model, client) = await dateStep { client in
            client.calendarFor = { _, _ in SalonCalendar(openRows: [], occupancyRows: nil, blockedRows: []) }
        }
        XCTAssertTrue(model.calendarIsIncomplete)
        await model.showDatePage(0)
        XCTAssertEqual(client.calendarCalls.count, 2)
    }

    func testDaysAreListedByWeekForTheChosenDogWithClosedDaysKept() async {
        let (model, _) = await dateStep()
        let weeks = model.dateWeeks
        XCTAssertEqual(weeks.first?.start, "2026-11-23")
        XCTAssertEqual(weeks.first?.days.map(\.date), ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"])
        XCTAssertEqual(weeks.first?.days.map(\.state), [.open, .open, .closed, .closed, .closed, .closed])
    }

    func testPickingAnOpenDayCountsAndAClosedOrUnknownDayDoesNot() async {
        let (model, _) = await dateStep()
        model.select(date: "2026-11-26")
        XCTAssertNil(model.selectedDate, "Thursday is closed")
        model.select(date: "2027-06-01")
        XCTAssertNil(model.selectedDate, "outside the window")
        model.select(date: "2026-11-24")
        XCTAssertEqual(model.selectedDate, "2026-11-24")
        XCTAssertTrue(model.canContinue)
        model.next()
        XCTAssertEqual(model.step, .time)
    }

    func testAFullDayCannotBePickedAndShowsAsFull() async {
        let slots = BookingSlots.canonical
        let (model, _) = await dateStep { client in
            let rows = (0..<14).map { OccupancyRow(booking_date: "2026-11-24", slot: slots[$0 % 10], size: "small") }
            client.calendarFor = { _, _ in SalonCalendar(openRows: [], occupancyRows: rows, blockedRows: []) }
        }
        XCTAssertEqual(model.dateWeeks.first?.days.first?.state, .full)
        model.select(date: "2026-11-24")
        XCTAssertNil(model.selectedDate)
    }

    func testChangingToADogThatCannotHaveTheChosenDayDropsTheDate() async {
        // Two small dogs in every slot a large dog can use. A medium dog still fits in between;
        // a large dog fits nowhere, so that Tuesday is full for Moose but open for Biscuit.
        let (model, _) = await dateStep { client in
            let rows = ["08:30", "09:00", "12:00", "12:30", "13:00"].flatMap { slot in
                [OccupancyRow(booking_date: "2026-11-24", slot: slot, size: "small"),
                 OccupancyRow(booking_date: "2026-11-24", slot: slot, size: "small")]
            }
            client.calendarFor = { _, _ in SalonCalendar(openRows: [], occupancyRows: rows, blockedRows: []) }
        }
        XCTAssertEqual(model.dateWeeks.first?.days.first?.state, .open, "open for Biscuit")
        model.select(date: "2026-11-24")
        XCTAssertEqual(model.selectedDate, "2026-11-24")

        model.select(dog: model.dogs.first { $0.name == "Moose" }!)
        XCTAssertEqual(model.dateWeeks.first?.days.first?.state, .full, "full for Moose")
        XCTAssertNil(model.selectedDate, "the day is no longer one this dog can have")
    }

    func testTheLastMinuteRowShowsOnlyOnThePageOneAndOnlyWhenTheDogFits() async {
        let (model, _) = await dateStep { client in
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:00")]
        }
        XCTAssertEqual(model.lastMinuteOffer, LastMinuteOffer(date: "2026-11-23", slots: ["10:00"]))
        let (none, _) = await dateStep()
        XCTAssertNil(none.lastMinuteOffer)

        let (paged, _) = await dateStep { client in
            client.rulesJSON = Data(#"{"bookingHorizonDays":60}"#.utf8)
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:00")]
        }
        await paged.showDatePage(1)
        XCTAssertNil(paged.lastMinuteOffer, "today is only offered on the first page")
    }

    func testChoosingTodaysLastMinuteOpeningLetsYouContinueAndLimitsTheTimes() async {
        let (model, _) = await dateStep { client in
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:30"),
                              ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:00")]
        }
        XCTAssertFalse(model.isLastMinuteSelected)
        XCTAssertNil(model.lastMinuteSlots)
        model.selectLastMinute()
        XCTAssertEqual(model.selectedDate, "2026-11-23")
        XCTAssertTrue(model.isLastMinuteSelected)
        XCTAssertEqual(model.lastMinuteSlots, ["10:00", "10:30"], "only the flagged times, never the whole day")
        XCTAssertTrue(model.canContinue)
        model.next()
        XCTAssertEqual(model.step, .time)
    }

    func testTodayCannotBeChosenWhenNothingIsOpenForIt() async {
        let (model, _) = await dateStep()
        model.selectLastMinute()
        XCTAssertNil(model.selectedDate)
    }

    func testTodayStaysChosenOnAnotherPageAndGoesIfTheNewDogDoesNotFit() async {
        let (model, _) = await dateStep { client in
            client.rulesJSON = Data(#"{"bookingHorizonDays":60}"#.utf8)
            // 13:30 is an extra slot, which a large dog is never offered.
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "13:30")]
        }
        model.selectLastMinute()
        XCTAssertTrue(model.isLastMinuteSelected)
        await model.showDatePage(1)
        XCTAssertNil(model.lastMinuteOffer, "the row itself is shown on the first page only")
        XCTAssertTrue(model.isLastMinuteSelected, "but the choice is kept")

        model.select(dog: model.dogs.first { $0.name == "Moose" }!)
        XCTAssertNil(model.selectedDate, "a large dog does not fit a 13:30 extra slot")
        XCTAssertFalse(model.isLastMinuteSelected)
    }

    func testPickingARegularDayAfterTodayReplacesIt() async {
        let (model, _) = await dateStep { client in
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:00")]
        }
        model.selectLastMinute()
        model.select(date: "2026-11-24")
        XCTAssertEqual(model.selectedDate, "2026-11-24")
        XCTAssertFalse(model.isLastMinuteSelected)
        XCTAssertNil(model.lastMinuteSlots)
    }

    // MARK: the time step

    private func timeStep(
        rows: [BookingDogRow]? = nil,
        pick: String = "2026-11-24",
        canBook: Bool = false,
        configure: (FakeClient) -> Void = { _ in }
    ) async -> (BookingFlowModel, FakeClient) {
        let (model, client) = await dateStep(rows: rows, canBook: canBook, configure: configure)
        if pick == "today" { model.selectLastMinute() } else { model.select(date: pick) }
        model.next()
        XCTAssertEqual(model.step, .time)
        await model.loadTimes()
        return (model, client)
    }

    func testTheTimeStepReadsTheChosenDayAloneAndOffersTheFreeTimes() async {
        let (model, client) = await timeStep()
        XCTAssertEqual(client.calendarCalls.last?.from, "2026-11-24")
        XCTAssertEqual(client.calendarCalls.last?.to, "2026-11-24")
        XCTAssertEqual(model.timesState, .loaded)
        XCTAssertEqual(model.offeredTimes, BookingSlots.canonical)
        XCTAssertEqual(model.timeGroups.map(\.title), ["Morning drop-offs", "Afternoon drop-offs"])
        XCTAssertEqual(model.selectedDateText, "Tuesday 24 November")
    }

    func testPickingATimeOnTheListLetsYouContinueAndOneOffTheListIsIgnored() async {
        let (model, _) = await timeStep()
        model.select(time: "03:00")
        XCTAssertNil(model.selectedTime)
        XCTAssertFalse(model.canContinue)
        model.select(time: "09:30")
        XCTAssertEqual(model.selectedTime, "09:30")
        XCTAssertTrue(model.canContinue)
        model.next()
        XCTAssertEqual(model.step, .summary)
    }

    func testAFailedReadOfTheDayIsAnErrorNeverAnEmptyDay() async {
        let (model, _) = await timeStep { client in
            // Only the single-day read fails; the page read before it was fine.
            client.calendarFor = { from, to in
                from == to ? SalonCalendar(openRows: [], occupancyRows: nil, blockedRows: []) : .empty
            }
        }
        XCTAssertFalse(model.calendarIsIncomplete, "the page was read before the day failed")
        XCTAssertEqual(model.timesState, .failed)
        XCTAssertTrue(model.offeredTimes.isEmpty)
    }

    func testAChosenTimeThatHasGoneByTheNextVisitIsDropped() async {
        let (model, client) = await timeStep()
        model.select(time: "09:30")
        XCTAssertEqual(model.selectedTime, "09:30")
        client.calendarFor = { _, _ in
            SalonCalendar(openRows: [], occupancyRows: [
                OccupancyRow(booking_date: "2026-11-24", slot: "09:30", size: "small"),
                OccupancyRow(booking_date: "2026-11-24", slot: "09:30", size: "small"),
            ], blockedRows: [])
        }
        await model.loadTimes()
        XCTAssertFalse(model.offeredTimes.contains("09:30"))
        XCTAssertNil(model.selectedTime, "someone else took it")
    }

    func testComingBackToTheTimeStepStartsFromNothingWhileItReloads() async {
        let (model, _) = await timeStep()
        XCTAssertEqual(model.timesState, .loaded)
        model.back()
        model.next()
        XCTAssertEqual(model.step, .time)
        XCTAssertEqual(model.timesState, .idle, "no stale list is shown or pickable")
        XCTAssertTrue(model.offeredTimes.isEmpty)
        model.select(time: "09:30")
        XCTAssertNil(model.selectedTime)
    }

    func testTodaysLastMinuteTimesAreOnlyTheFlaggedOnesAndAreReadAgain() async {
        let (model, client) = await timeStep(pick: "today") { client in
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:00"),
                              ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:30")]
        }
        XCTAssertEqual(model.offeredTimes, ["10:00", "10:30"])
        XCTAssertTrue(model.timesAreLastMinute)
        // By the next visit the 10:00 cut-off has passed.
        client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:30")]
        await model.loadTimes()
        XCTAssertEqual(model.offeredTimes, ["10:30"])
        client.flagged = []
        await model.loadTimes()
        XCTAssertTrue(model.offeredTimes.isEmpty, "the times have gone")
        XCTAssertEqual(model.timesState, .loaded)
        XCTAssertTrue(model.timesAreLastMinute)
    }

    // MARK: review findings on the time step

    func testTodayStaysALastMinuteChoiceAfterEveryFlaggedTimeHasGone() async {
        let (model, client) = await timeStep(pick: "today") { client in
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:00")]
        }
        XCTAssertEqual(model.offeredTimes, ["10:00"])
        client.flagged = []
        await model.loadTimes()
        XCTAssertTrue(model.offeredTimes.isEmpty)
        XCTAssertTrue(model.isLastMinuteSelected, "today is still the last-minute choice, with nothing left in it")

        // Going back and continuing must not turn today into an ordinary day.
        model.back()
        XCTAssertEqual(model.selectedDate, "2026-11-23")
        model.next()
        await model.loadTimes()
        XCTAssertTrue(model.offeredTimes.isEmpty, "never the ordinary grid for today")
        XCTAssertTrue(model.timesAreLastMinute)
    }

    func testPickingAnOrdinaryDayAfterTodayEndsTheLastMinuteChoice() async {
        let (model, _) = await dateStep { client in
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: "10:00")]
        }
        model.selectLastMinute()
        XCTAssertTrue(model.isLastMinuteSelected)
        model.select(date: "2026-11-24")
        XCTAssertFalse(model.isLastMinuteSelected)
    }

    func testContinueIsShutUntilTheChosenTimeHasBeenCheckedAgain() async {
        let (model, client) = await timeStep()
        model.select(time: "09:30")
        XCTAssertTrue(model.canContinue)
        model.next()
        XCTAssertEqual(model.step, .summary)
        model.back()
        XCTAssertEqual(model.step, .time)
        XCTAssertEqual(model.selectedTime, "09:30", "the choice is remembered")
        XCTAssertFalse(model.canContinue, "but not trusted until the day has been read again")
        model.next()
        XCTAssertEqual(model.step, .time, "Continue does nothing while it is unchecked")

        await model.loadTimes()
        XCTAssertTrue(model.canContinue)

        // A failed read must not leave the old time usable.
        model.back()
        model.next()
        client.calendarFor = { from, to in
            from == to ? SalonCalendar(openRows: [], occupancyRows: nil, blockedRows: []) : .empty
        }
        await model.loadTimes()
        XCTAssertEqual(model.timesState, .failed)
        XCTAssertFalse(model.canContinue)
        model.next()
        XCTAssertEqual(model.step, .time)
    }

    func testADayStaffClosedSinceItWasPickedOffersNoTimesAndSaysSo() async {
        let (model, client) = await timeStep()
        client.calendarFor = { from, to in
            from == to
                ? SalonCalendar(openRows: [OpenDayRow(setting_date: "2026-11-24", is_open: false)], occupancyRows: [], blockedRows: [])
                : .empty
        }
        await model.loadTimes()
        XCTAssertEqual(model.timesState, .closed)
        XCTAssertTrue(model.offeredTimes.isEmpty)
        XCTAssertFalse(model.canContinue)
    }

    func testAFailedOpenDaysReadDoesNotMakeAStaffOpenedDayLookClosed() async {
        // Saturday 28 November is closed by default but staff opened it. The page read knows that;
        // the later single-day read loses its open-days answer, and must not call the day closed.
        let (model, _) = await timeStep(pick: "2026-11-28") { client in
            client.calendarFor = { from, to in
                from == to
                    ? SalonCalendar(openRows: nil, occupancyRows: [], blockedRows: [])
                    : SalonCalendar(openRows: [OpenDayRow(setting_date: "2026-11-28", is_open: true)], occupancyRows: [], blockedRows: [])
            }
        }
        XCTAssertEqual(model.selectedDate, "2026-11-28")
        XCTAssertEqual(model.timesState, .loaded)
        XCTAssertEqual(model.offeredTimes, BookingSlots.canonical, "the database decides when we cannot tell")
    }

    func testGoingBackToTheDateStepReadsThePageAgain() async {
        let (model, client) = await timeStep()
        let before = client.calendarCalls.count
        model.back()
        await model.showDatePage(0)
        XCTAssertEqual(client.calendarCalls.count, before + 1, "the remembered page is dropped, so a closure staff made since shows up")
    }

    // MARK: the confirm step

    /// Everything chosen and on the summary, booking switched on unless said otherwise.
    private func summaryStep(
        canBook: Bool = true,
        configure: (FakeClient) -> Void = { _ in }
    ) async -> (BookingFlowModel, FakeClient) {
        let (model, client) = await timeStep(canBook: canBook, configure: configure)
        model.select(time: "09:30")
        model.next()
        XCTAssertEqual(model.step, .summary)
        return (model, client)
    }

    /// Today's last-minute opening chosen, on the summary, with booking switched on.
    private func summaryStepForToday(slot: String) async -> (BookingFlowModel, FakeClient) {
        let (model, client) = await timeStep(pick: "today", canBook: true) { client in
            client.flagged = [ImmediateSlotRow(setting_date: "2026-11-23", slot: slot)]
            client.readBack = [BookedRow(id: "b1", deposit_required: false)]
        }
        model.select(time: slot)
        model.next()
        XCTAssertEqual(model.step, .summary)
        return (model, client)
    }

    func testBookingIsOffByDefaultAndConfirmSendsNothing() async {
        let (model, client) = await summaryStep(canBook: false)
        XCTAssertFalse(model.canConfirm)
        await model.confirm()
        XCTAssertEqual(model.confirmState, .idle)
        XCTAssertTrue(client.sentRequests.isEmpty, "with booking off, nothing can be sent")
    }

    func testAConfirmedBookingIsSentOnceAndReportedFromWhatTheServerReadsBack() async throws {
        let (model, client) = await summaryStep()
        XCTAssertTrue(model.canConfirm)
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1)
        XCTAssertEqual(client.sentRequests.first?.p_booking_date, "2026-11-24")
        XCTAssertEqual(client.sentRequests.first?.p_bookings.first?.slot, "09:30")
        guard case .done(.booked(let booked)) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(booked.dogName, "Biscuit")
        XCTAssertEqual(booked.service, "Full Groom")
        XCTAssertEqual(booked.whenText, "Tuesday 24 November 2026 at 9:30am")
        XCTAssertEqual(booked.deposit, .none)
        XCTAssertEqual(booked.bookingIds, ["b1"])
        XCTAssertFalse(model.canConfirm, "a booking that exists is never sent again")
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1)
    }

    func testADepositIsReportedFromTheRowReadBackNeverFromAPreCheck() async {
        let (model, _) = await summaryStep { client in
            client.readBack = [BookedRow(id: "b1", deposit_required: true, deposit_amount: 10)]
        }
        await model.confirm()
        guard case .done(.booked(let booked)) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(booked.deposit, .due(amountPence: 1000))
        XCTAssertEqual(booked.deposit.text, "A £10 deposit is due to hold this booking. The salon will be in touch about paying.")
    }

    func testABookingWhoseRowCannotBeReadBackIsStillBookedWithNoClaimAboutADeposit() async {
        let (model, _) = await summaryStep { $0.readBack = nil }
        await model.confirm()
        guard case .done(.booked(let booked)) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(booked.deposit, .unknown)
        XCTAssertEqual(booked.deposit.text, "We couldn't check whether a deposit is due. The salon will tell you if one is.")
    }

    func testARefusalShowsTheCustomerCopyAndNothingWasCreated() async {
        let (model, client) = await summaryStep { client in
            client.sendResult = .refused(message: "We can't book a pregnant dog online — please call the salon.", details: "pregnant")
        }
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1)
        guard case .done(.refused(let reason, let message)) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(reason, "pregnant")
        XCTAssertTrue(message.hasPrefix("Pregnant dogs need a quick chat"), message)
        XCTAssertFalse(message.contains("online —"), "never the raw message")
        XCTAssertTrue(model.canConfirm, "after a refusal the customer may try again, or go back")
    }

    func testAnUnknownRefusalShowsTheGenericLineNeverTheRawText() async {
        let (model, _) = await summaryStep { $0.sendResult = .refused(message: "boom: relation \"x\" does not exist", details: "weird_code") }
        await model.confirm()
        guard case .done(.refused(_, let message)) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertFalse(message.contains("relation"))
        XCTAssertEqual(message, BookingDenial.genericCopy)
    }

    func testATimeTakenSinceItWasShownIsCaughtBeforeAnythingIsSent() async {
        let (model, client) = await summaryStep()
        client.calendarFor = { from, to in
            from == to
                ? SalonCalendar(openRows: [], occupancyRows: [
                    OccupancyRow(booking_date: "2026-11-24", slot: "09:30", size: "small"),
                    OccupancyRow(booking_date: "2026-11-24", slot: "09:30", size: "small"),
                ], blockedRows: [])
                : .empty
        }
        await model.confirm()
        XCTAssertEqual(model.confirmState, .done(.slotTaken))
        XCTAssertTrue(client.sentRequests.isEmpty, "nothing was sent")
        XCTAssertFalse(model.offeredTimes.contains("09:30"))
    }

    func testIfTheDayCannotBeReadJustBeforeSendingTheDatabaseDecides() async {
        let (model, client) = await summaryStep()
        client.calendarFor = { from, to in
            from == to ? SalonCalendar(openRows: [], occupancyRows: nil, blockedRows: []) : .empty
        }
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1, "an unreadable day does not stop a booking the database would accept")
    }

    func testAReplyThatNeverArrivesIsLookedUpAndNeverSentAgain() async {
        let (model, client) = await summaryStep { client in
            client.sendResult = .unknown
            client.found = [BookedRow(id: "b9", booking_date: "2026-11-24", slot: "09:30:00", deposit_required: false)]
        }
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1, "one request, not a retry")
        XCTAssertEqual(client.lookups, 1)
        guard case .done(.booked(let booked)) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(booked.bookingIds, ["b9"])
    }

    func testIfTheLookupFindsNothingTheAppIsUnsureAndDoesNotSendAgainEvenWhenAskedTo() async {
        let (model, client) = await summaryStep { client in
            client.sendResult = .unknown
            client.found = []
        }
        await model.confirm()
        XCTAssertEqual(model.confirmState, .done(.unsure))
        XCTAssertFalse(model.canConfirm, "not while we are not sure: that could book twice")
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1)

        // Checking again sends nothing, and reports what is now there.
        await model.checkOutcome()
        XCTAssertEqual(client.sentRequests.count, 1)
        XCTAssertEqual(model.confirmState, .done(.unsure))
        client.found = [BookedRow(id: "b9", booking_date: "2026-11-24", slot: "09:30")]
        await model.checkOutcome()
        guard case .done(.booked) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(client.sentRequests.count, 1)
    }

    func testALookupThatItselfFailsIsUnsureToo() async {
        let (model, _) = await summaryStep { client in
            client.sendResult = .unknown
            client.found = nil
        }
        await model.confirm()
        XCTAssertEqual(model.confirmState, .done(.unsure))
    }

    func testALookupFindingADifferentSlotDoesNotCountAsThisBooking() async {
        let (model, _) = await summaryStep { client in
            client.sendResult = .unknown
            client.found = [BookedRow(id: "other", booking_date: "2026-11-24", slot: "10:00")]
        }
        await model.confirm()
        XCTAssertEqual(model.confirmState, .done(.unsure))
    }

    func testAnExtraSlotRequestIsBuiltOnTheGridThatIncludesIt() async {
        let (model, client) = await summaryStepForToday(slot: "13:30")
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1, "the extra slot is on the grid the request is checked against")
        XCTAssertEqual(client.sentRequests.first?.p_bookings.first?.slot, "13:30")
        guard case .done(.booked) = model.confirmState else { return XCTFail("\(model.confirmState)") }
    }

    func testACancelledOrNoShowBookingForTheSameSlotIsNeverTakenForTheNewOne() async {
        for status in ["Cancelled", "No-show"] {
            let (model, client) = await summaryStep { client in
                client.sendResult = .unknown
                client.found = [BookedRow(id: "old", booking_date: "2026-11-24", slot: "09:30", status: status)]
            }
            await model.confirm()
            XCTAssertEqual(model.confirmState, .done(.unsure), "a \(status) row is history, not this booking")
            XCTAssertEqual(client.sentRequests.count, 1)
        }
    }

    func testWhenBothAHistoricalAndALiveRowExistTheLiveOneIsUsed() async {
        let (model, _) = await summaryStep { client in
            client.sendResult = .unknown
            client.found = [
                BookedRow(id: "old", booking_date: "2026-11-24", slot: "09:30", status: "Cancelled", deposit_required: true, deposit_amount: 10),
                BookedRow(id: "new", booking_date: "2026-11-24", slot: "09:30", status: "Booked", deposit_required: false),
            ]
        }
        await model.confirm()
        guard case .done(.booked(let booked)) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(booked.bookingIds, ["new"])
        XCTAssertEqual(booked.deposit, .none, "the cancelled row's deposit must not leak in")
    }

    func testARowWithNoStatusCountsAsLiveAsOnTheWebsite() async {
        XCTAssertTrue(BookedRow(id: "x").isLive)
        XCTAssertTrue(BookedRow(id: "x", status: "Booked").isLive)
        XCTAssertTrue(BookedRow(id: "x", status: "Arrived").isLive)
        XCTAssertFalse(BookedRow(id: "x", status: "Cancelled").isLive)
        XCTAssertFalse(BookedRow(id: "x", status: "No-show").isLive)
    }

    func testARequestThatNeverLeftThePhoneIsSafeToTryAgain() async {
        let (model, client) = await summaryStep { $0.sendResult = .notSent }
        await model.confirm()
        XCTAssertEqual(model.confirmState, .done(.notSent))
        XCTAssertEqual(client.lookups, 0, "nothing was sent, so there is nothing to look up")
        XCTAssertTrue(model.canConfirm, "unlike an unknown outcome, trying again cannot book twice")
        client.sendResult = .created(ids: ["b1"])
        await model.confirm()
        guard case .done(.booked) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(client.sentRequests.count, 2)
    }

    func testASecondTapWhileTheFirstIsInFlightDoesNothing() async {
        let (model, client) = await summaryStep { $0.holdCreate = true }
        let first = Task { await model.confirm() }
        // Let the first tap reach the point where the request is out.
        for _ in 0..<200 where client.waiting == nil { await Task.yield() }
        XCTAssertNotNil(client.waiting, "the request is in flight")
        XCTAssertEqual(model.confirmState, .sending)
        XCTAssertFalse(model.canConfirm)
        await model.confirm()
        XCTAssertEqual(client.sentRequests.count, 1, "a double tap sends once")
        model.back()
        XCTAssertEqual(model.step, .summary, "Back does nothing while a request is out")

        client.holdCreate = false
        client.waiting?.resume()
        await first.value
        guard case .done(.booked) = model.confirmState else { return XCTFail("\(model.confirmState)") }
        XCTAssertEqual(client.sentRequests.count, 1)
    }

    func testOnceBookedTheChoicesCannotBeChangedUnderIt() async {
        let (model, _) = await summaryStep()
        await model.confirm()
        model.back()
        XCTAssertEqual(model.step, .summary)
    }

    func testAfterARefusalGoingBackAndForwardGivesAFreshSummary() async {
        let (model, _) = await summaryStep { $0.sendResult = .refused(message: nil, details: "daily_cap") }
        await model.confirm()
        XCTAssertEqual(model.step, .summary)
        model.back()
        XCTAssertEqual(model.step, .time)
        XCTAssertEqual(model.confirmState, .done(.refused(reason: "daily_cap", message: BookingDenial.customerMessage(message: nil, details: "daily_cap"))), "kept until the summary is reached again")
        await model.loadTimes()
        model.select(time: "10:00")
        model.next()
        XCTAssertEqual(model.confirmState, .idle)
        XCTAssertTrue(model.canConfirm)
    }

    func testBookedRowsDecodeFromTheJSONTheDatabaseSends() async throws {
        let json = #"[{"id":"b1","booking_date":"2026-11-25","slot":"09:30","service":"Full Groom","status":"Booked","size":"medium","deposit_required":true,"deposit_amount":10.00,"payment":"Due at Pick-up"}]"#
        let rows = try JSONDecoder().decode([BookedRow].self, from: Data(json.utf8))
        XCTAssertEqual(rows.first?.deposit_amount, 10)
        XCTAssertEqual(DepositNote.from(rows.first), .due(amountPence: 1000))
        let text = #"[{"id":"b2","deposit_required":true,"deposit_amount":"7.50"}]"#
        XCTAssertEqual(DepositNote.from(try JSONDecoder().decode([BookedRow].self, from: Data(text.utf8)).first), .due(amountPence: 750))
        let bare = #"[{"id":"b3"}]"#
        XCTAssertEqual(DepositNote.from(try JSONDecoder().decode([BookedRow].self, from: Data(bare.utf8)).first), .unknown, "no flag means no claim either way")
        XCTAssertEqual(DepositNote.from(BookedRow(id: "x", deposit_required: false)), .none)
        XCTAssertEqual(DepositNote.from(BookedRow(id: "x", deposit_required: true)), .due(amountPence: nil))
        XCTAssertEqual(DepositNote.due(amountPence: nil).text, "A deposit is due to hold this booking. The salon will be in touch about paying.")
        XCTAssertNil(DepositNote.none.text)
    }

    func testNoClientMeansTheDateStepDoesNothingRatherThanCrash() async {
        let model = BookingFlowModel(client: nil, now: now)
        await model.loadDateStep()
        XCTAssertEqual(model.calendarState, .idle)
        XCTAssertTrue(model.dateWeeks.isEmpty)
    }

    func testChunksSplitARangeIntoFortnightsWithBothEndsInclusive() async {
        let pieces = DatePlanner.chunks(from: "2026-11-23", to: "2026-12-21")
        XCTAssertEqual(pieces.map(\.from), ["2026-11-23", "2026-12-07", "2026-12-21"])
        XCTAssertEqual(pieces.map(\.to), ["2026-12-06", "2026-12-20", "2026-12-21"])
        XCTAssertEqual(DatePlanner.chunks(from: "2026-12-01", to: "2026-12-01").count, 1)
        XCTAssertTrue(DatePlanner.chunks(from: "2026-12-02", to: "2026-12-01").isEmpty)
        XCTAssertTrue(DatePlanner.chunks(from: "bad", to: "2026-12-01").isEmpty)
    }
}
