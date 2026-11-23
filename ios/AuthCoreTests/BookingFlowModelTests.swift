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
        configure: (FakeClient) -> Void = { _ in }
    ) async -> (BookingFlowModel, FakeClient) {
        let client = FakeClient()
        client.rows = rows ?? [row("1", "Biscuit"), row("2", "Moose", size: "large")]
        configure(client)
        let model = BookingFlowModel(client: client, now: now)
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
