import XCTest
@testable import AuthCore

final class BookingWizardTests: XCTestCase {
    // MARK: fixtures

    private func dog(_ id: String, _ name: String = "Luna", size: DogSize? = .medium, pregnant: Bool = false) -> BookingDog {
        BookingDog(id: id, name: name, breed: "Cockapoo", confirmedSize: size, isPregnant: pregnant)
    }

    private let window = ["2026-12-01", "2026-12-02", "2026-12-03"]
    private let offered = ["09:00", "09:30", "10:00"]

    /// A wizard that has everything chosen, ready for the summary.
    private func finished(_ chosen: BookingDog? = nil) throws -> BookingWizardState {
        var state = BookingWizardState()
        try state.choose(dog: chosen ?? dog("d1"))
        try state.choose(service: .fullGroom)
        try state.choose(date: "2026-12-01", window: window)
        try state.choose(time: "09:30", offered: offered)
        return state
    }

    // MARK: dogs

    func testDogsAreSortedAndAnUnreadableSizeBlocksThem() {
        let rows = [
            BookingDogRow(id: "1", name: "Moose", breed: "Newfoundland", size: "Large", is_pregnant: nil),
            BookingDogRow(id: "2", name: "  ", breed: nil, size: nil, is_pregnant: false),
            BookingDogRow(id: "3", name: "Biscuit", breed: "Cockapoo", size: "medium", is_pregnant: false),
            BookingDogRow(id: "4", name: "Cleo", breed: "", size: "tiny", is_pregnant: false),
        ]
        let dogs = BookingDogs.make(from: rows)
        XCTAssertEqual(dogs.map(\.name), ["Biscuit", "Cleo", "Moose", "Your dog"])
        XCTAssertEqual(dogs.first { $0.id == "1" }?.confirmedSize, .large, "the size is read whatever its capitals")
        XCTAssertEqual(dogs.first { $0.id == "1" }?.isPregnant, false, "a missing flag means not pregnant")
        XCTAssertNil(dogs.first { $0.id == "4" }?.confirmedSize, "a size the salon does not use is not a size")
        XCTAssertEqual(dogs.first { $0.id == "4" }?.blocker, .sizeUnconfirmed)
        XCTAssertTrue(dogs.first { $0.id == "3" }?.isBookable == true)
    }

    func testAPregnantDogIsBlockedEvenWithASizeAndTheWebsitesWordsAreUsed() {
        let pregnant = dog("p", pregnant: true)
        XCTAssertEqual(pregnant.blocker, .pregnant)
        XCTAssertFalse(pregnant.isBookable)
        // Pregnancy is the bigger blocker, so it wins over a missing size.
        XCTAssertEqual(dog("p", size: nil, pregnant: true).blocker, .pregnant)
        XCTAssertEqual(BookingDogBlocker.pregnant.note, "Pregnant — message us below")
        XCTAssertEqual(BookingDogBlocker.sizeUnconfirmed.note, "Size not confirmed — message us first")
        XCTAssertNil(dog("ok").blocker)
    }

    func testABlockedDogCannotBeChosen() {
        var state = BookingWizardState()
        XCTAssertThrowsError(try state.choose(dog: dog("p", pregnant: true))) {
            XCTAssertEqual($0 as? BookingWizardError, .dogNotBookable)
        }
        XCTAssertThrowsError(try state.choose(dog: dog("u", size: nil)))
        XCTAssertNil(state.dog)
    }

    // MARK: steps

    func testTheStepsAndTheirHeadingsMatchTheWebsite() {
        XCTAssertEqual(BookingStep.allCases.map(\.title), [
            "Select dogs", "Choose services", "Pick a date", "Choose a time", "Confirm booking",
        ])
    }

    func testNobodyCanContinueWithoutChoosingAndTheFlowRunsToTheSummary() throws {
        var state = BookingWizardState()
        XCTAssertEqual(state.step, .dog)
        XCTAssertFalse(state.canContinue)
        XCTAssertFalse(state.next())
        XCTAssertFalse(state.back(), "there is nothing before the first step")

        try state.choose(dog: dog("d1"))
        XCTAssertTrue(state.next())
        XCTAssertEqual(state.step, .service)
        XCTAssertFalse(state.next(), "a service has to be chosen first")

        try state.choose(service: .bathAndBrush)
        XCTAssertTrue(state.next())
        try state.choose(date: "2026-12-02", window: window)
        XCTAssertTrue(state.next())
        XCTAssertEqual(state.step, .time)
        XCTAssertFalse(state.next())
        try state.choose(time: "10:00", offered: offered)
        XCTAssertTrue(state.next())
        XCTAssertEqual(state.step, .summary)
        XCTAssertFalse(state.next(), "the summary is the last step")
        XCTAssertFalse(state.canContinue)
        XCTAssertTrue(state.back())
        XCTAssertEqual(state.step, .time)
    }

    func testTheFurthestStepIsTheFirstUnfinishedOne() throws {
        var state = BookingWizardState()
        XCTAssertEqual(state.furthestStep, .dog)
        try state.choose(dog: dog("d1"))
        XCTAssertEqual(state.furthestStep, .service)
        try state.choose(service: .fullGroom)
        XCTAssertEqual(state.furthestStep, .date)
        try state.choose(date: "2026-12-01", window: window)
        try state.choose(time: "09:00", offered: offered)
        XCTAssertEqual(state.furthestStep, .summary)
    }

    func testTappingAStepNeverJumpsPastTheFirstUnfinishedOne() throws {
        var state = BookingWizardState()
        try state.choose(dog: dog("d1"))
        try state.choose(service: .fullGroom)
        XCTAssertFalse(state.go(to: .time), "the date is not chosen yet")
        XCTAssertFalse(state.go(to: .summary))
        XCTAssertEqual(state.step, .dog)
        XCTAssertTrue(state.go(to: .date), "the first unfinished step is reachable")
        XCTAssertTrue(state.go(to: .dog), "and so is any finished one")
        XCTAssertEqual(state.step, .dog)
    }

    // MARK: choices and what they undo

    func testAServiceNeedsADogAndMustBeOfferedForItsSize() throws {
        var state = BookingWizardState()
        XCTAssertThrowsError(try state.choose(service: .fullGroom)) {
            XCTAssertEqual($0 as? BookingWizardError, .serviceNotOffered)
        }
        try state.choose(dog: dog("big", size: .large))
        XCTAssertThrowsError(try state.choose(service: .puppyGroom), "Puppy Groom is not offered for large dogs")
        try state.choose(service: .bathAndDeshed)
        XCTAssertEqual(state.service, .bathAndDeshed)
    }

    func testChangingToALargeDogDropsAPuppyGroomAndTheTimeButKeepsTheDate() throws {
        var state = BookingWizardState()
        try state.choose(dog: dog("small", size: .small))
        try state.choose(service: .puppyGroom)
        try state.setAddOn("Flea Bath", on: true)
        try state.choose(date: "2026-12-02", window: window)
        try state.choose(time: "09:30", offered: offered)

        try state.choose(dog: dog("big", "Moose", size: .large))
        XCTAssertNil(state.service, "a large dog cannot have Puppy Groom")
        XCTAssertEqual(state.addOns, [], "the add-ons went with the service")
        XCTAssertNil(state.time, "the times were offered for a different size")
        XCTAssertEqual(state.date, "2026-12-02")
    }

    func testChangingToAnotherSmallDogKeepsTheServiceButNotTheTime() throws {
        var state = try finished(dog("a", size: .small))
        try state.setAddOn("Anal Glands", on: true)
        try state.choose(dog: dog("b", "Bella", size: .medium))
        XCTAssertEqual(state.service, .fullGroom)
        XCTAssertEqual(state.addOns, ["Anal Glands"])
        XCTAssertNil(state.time)
    }

    func testChoosingTheSameDogOrDateAgainChangesNothing() throws {
        var state = try finished()
        try state.choose(dog: dog("d1"))
        try state.choose(date: "2026-12-01", window: window)
        XCTAssertEqual(state.time, "09:30", "nothing was undone")
        try state.choose(date: "2026-12-02", window: window)
        XCTAssertNil(state.time, "a different date drops the time")
    }

    func testADateOutsideTheWindowAndATimeThatWasNotOfferedAreRefused() throws {
        var state = BookingWizardState()
        XCTAssertThrowsError(try state.choose(date: "2026-12-09", window: window)) {
            XCTAssertEqual($0 as? BookingWizardError, .dateOutsideTheWindow)
        }
        XCTAssertThrowsError(try state.choose(date: "2026-12-01", window: []))
        XCTAssertNil(state.date)
        try state.choose(date: "2026-12-01", window: window)
        XCTAssertThrowsError(try state.choose(time: "11:00", offered: offered)) {
            XCTAssertEqual($0 as? BookingWizardError, .timeNotOffered)
        }
        XCTAssertThrowsError(try state.choose(time: "09:00", offered: []))
        XCTAssertNil(state.time)
    }

    func testAddOnsAreKnownKeptInTheSalonsOrderAndCanBeRemoved() throws {
        var state = BookingWizardState()
        XCTAssertThrowsError(try state.setAddOn("Teeth Whitening", on: true)) {
            XCTAssertEqual($0 as? BookingWizardError, .unknownAddOn("Teeth Whitening"))
        }
        try state.setAddOn("Anal Glands", on: true)
        try state.setAddOn("Flea Bath", on: true)
        try state.setAddOn("Flea Bath", on: true)
        XCTAssertEqual(state.addOns, ["Flea Bath", "Anal Glands"])
        try state.setAddOn("Flea Bath", on: false)
        XCTAssertEqual(state.addOns, ["Anal Glands"])
        try state.setAddOn("Sensitive Shampoo", on: false)
        XCTAssertEqual(state.addOns, ["Anal Glands"])
    }

    // MARK: the summary and the request

    func testTheSummaryExistsOnlyWhenEverythingIsChosen() throws {
        var state = BookingWizardState()
        XCTAssertNil(state.summary)
        XCTAssertFalse(state.isFinished)
        try state.choose(dog: dog("d1"))
        try state.choose(service: .fullGroom)
        try state.choose(date: "2026-12-01", window: window)
        XCTAssertNil(state.summary, "no time yet")
        try state.choose(time: "09:30", offered: offered)
        try state.setAddOn("Flea Bath", on: true)
        XCTAssertEqual(state.summary, BookingSummary(
            dogName: "Luna", service: "Full Groom", addOns: ["Flea Bath"],
            dateText: "Tuesday 1 December", timeText: "09:30",
            longDateText: "Tuesday 1 December 2026", timeLabel: "9:30am",
            breed: "Cockapoo", sizeLabel: "Medium",
            priceLine: "From £46+", totalText: "From £46"
        ))
    }

    func testTheSummaryReadsLikeTheWebsitesConfirmStep() throws {
        let summary = try XCTUnwrap(finished().summary)
        XCTAssertEqual(summary.whenText, "Tuesday 1 December 2026 at 9:30am")
        XCTAssertEqual(summary.priceLine, "From £46+", "a from-priced service keeps its plus")
        XCTAssertEqual(summary.totalText, "From £46", "the total has no plus, as on the website")
    }

    func testTheSummaryPriceFollowsTheDogsSizeAndAFixedPriceServiceHasNoPlus() throws {
        let large = try XCTUnwrap(finished(dog("d9", "Moose", size: .large)).summary)
        XCTAssertEqual(large.priceLine, "From £60+")
        XCTAssertEqual(large.totalText, "From £60")
        XCTAssertEqual(large.sizeLabel, "Large")

        var state = BookingWizardState()
        try state.choose(dog: dog("d2", "Pip", size: .small))
        try state.choose(service: .puppyGroom)
        try state.choose(date: "2026-12-01", window: window)
        try state.choose(time: "09:30", offered: offered)
        let puppy = try XCTUnwrap(state.summary)
        XCTAssertEqual(puppy.priceLine, "From £38", "Puppy Groom is a fixed price")
        XCTAssertEqual(puppy.totalText, "From £38")
    }

    func testTheSummaryCarriesNoClaimAboutWhenPaymentIsDue() throws {
        // Whether a deposit is due is not known to the app yet, so the summary must not say
        // "paid at pick-up" or anything like it.
        let summary = try XCTUnwrap(finished().summary)
        let everything = [summary.whenText, summary.priceLine ?? "", summary.totalText ?? "", summary.breed, summary.sizeLabel]
        XCTAssertFalse(everything.joined(separator: " ").lowercased().contains("pick-up"))
        XCTAssertFalse(everything.joined(separator: " ").lowercased().contains("deposit"))
    }

    func testTheRequestIsWhatWasChosenAndSendsNothing() throws {
        var state = try finished()
        try state.setAddOn("Sensitive Shampoo", on: true)
        let request = try state.request()
        XCTAssertEqual(request.p_booking_date, "2026-12-01")
        XCTAssertEqual(request.p_bookings, [
            BookingRequest.Row(dog_id: "d1", slot: "09:30", service: "Full Groom", addons: ["Sensitive Shampoo"], payment: "Due at Pick-up"),
        ])
    }

    func testAnUnfinishedWizardHasNoRequest() throws {
        var state = BookingWizardState()
        XCTAssertThrowsError(try state.request()) { XCTAssertEqual($0 as? BookingWizardError, .notFinished) }
        try state.choose(dog: dog("d1"))
        try state.choose(service: .fullGroom)
        XCTAssertThrowsError(try state.request())
    }

    func testATimeOffAGridTheRequestKnowsIsStillCaughtAtTheEnd() throws {
        var state = BookingWizardState()
        try state.choose(dog: dog("d1"))
        try state.choose(service: .fullGroom)
        try state.choose(date: "2026-12-01", window: window)
        try state.choose(time: "13:30", offered: ["13:30"])
        XCTAssertThrowsError(try state.request()) {
            XCTAssertEqual($0 as? BookingRequestError, .slotNotOnTheGrid("13:30"))
        }
        XCTAssertNoThrow(try state.request(gridSlots: BookingSlots.canonical + ["13:30"]))
    }

    // MARK: with the real window and engine

    func testTheRealWindowAndEngineFeedTheWizard() throws {
        let now = ISO8601DateFormatter().date(from: "2026-11-22T12:00:00Z")!
        let dates = BookingWindow.dates(now: now, horizonDays: 28)
        let big = dog("big", "Moose", size: .large)
        // A small dog at 12:30: a large dog takes that whole slot, so it cannot join (the
        // website's engine says "Large dog fills this slot"). At 08:30 it could, so that is
        // not the slot to test with.
        let bookings = [EngineBooking(slot: "12:30", size: .small)]
        let offeredToday = CapacityEngine.offeredSlots(size: .large, bookings: bookings, activeSlots: BookingSlots.canonical)

        var state = BookingWizardState()
        try state.choose(dog: big)
        try state.choose(service: .fullGroom)
        try state.choose(date: dates[0], window: dates)
        XCTAssertFalse(offeredToday.contains("12:30"), "a large dog cannot join the small dog at 12:30")
        XCTAssertTrue(offeredToday.contains("08:30"), "but it can at the start of the day")
        XCTAssertThrowsError(try state.choose(time: "12:30", offered: offeredToday))
        try state.choose(time: "08:30", offered: offeredToday)
        XCTAssertEqual(try state.request().p_bookings.first?.slot, "08:30")
        XCTAssertEqual(try state.request().p_booking_date, "2026-11-23")
    }
}
