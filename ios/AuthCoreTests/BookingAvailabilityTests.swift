import XCTest
@testable import AuthCore

final class BookingAvailabilityTests: XCTestCase {
    // 2026-11-30 is a Monday, 2026-12-01 a Tuesday, 2026-12-05 a Saturday, 2026-12-06 a Sunday.
    private let tuesday = "2026-12-01"
    private let saturday = "2026-12-05"

    private func calendar(
        open: [OpenDayRow]? = [],
        occupancy: [OccupancyRow]? = [],
        blocked: [BlockedSeatRow]? = []
    ) -> SalonCalendar {
        SalonCalendar(openRows: open, occupancyRows: occupancy, blockedRows: blocked)
    }

    private func booking(_ date: String, _ slot: String, _ size: String = "small") -> OccupancyRow {
        OccupancyRow(booking_date: date, slot: slot, size: size)
    }

    // MARK: open and closed

    func testWithNoStaffDecisionMondayToWednesdayAreOpenAndTheRestClosed() {
        XCTAssertTrue(DatePlanner.isOpenByDefault("2026-11-30"))
        XCTAssertTrue(DatePlanner.isOpenByDefault("2026-12-01"))
        XCTAssertTrue(DatePlanner.isOpenByDefault("2026-12-02"))
        XCTAssertFalse(DatePlanner.isOpenByDefault("2026-12-03"))
        XCTAssertFalse(DatePlanner.isOpenByDefault("2026-12-04"))
        XCTAssertFalse(DatePlanner.isOpenByDefault(saturday))
        XCTAssertFalse(DatePlanner.isOpenByDefault("2026-12-06"))
        XCTAssertFalse(DatePlanner.isOpenByDefault("not a date"))
    }

    func testAStaffDecisionBeatsTheWeekdayDefaultBothWays() {
        let cal = calendar(open: [
            OpenDayRow(setting_date: saturday, is_open: true),
            OpenDayRow(setting_date: tuesday, is_open: false),
        ])
        XCTAssertEqual(DatePlanner.state(of: saturday, size: .small, calendar: cal), .open, "staff reopened a Saturday")
        XCTAssertEqual(DatePlanner.state(of: tuesday, size: .small, calendar: cal), .closed, "staff closed a Tuesday")
        XCTAssertEqual(DatePlanner.state(of: "2026-12-02", size: .small, calendar: cal), .open, "no row, so the default")
    }

    func testClosedDaysAreClosedEvenWhenTheyAreAlsoEmpty() {
        XCTAssertEqual(DatePlanner.state(of: "2026-12-03", size: .small, calendar: calendar()), .closed)
    }

    // MARK: full

    func testAQuietOpenDayIsOpen() {
        XCTAssertEqual(DatePlanner.state(of: tuesday, size: .medium, calendar: calendar()), .open)
    }

    func testADayAtTheDailyCapIsFullForEveryoneNotJustTheDog() {
        let slots = BookingSlots.canonical
        let rows = (0..<14).map { booking(tuesday, slots[$0 % slots.count]) }
        let cal = calendar(occupancy: rows)
        for size in [DogSize.small, .medium, .large] {
            XCTAssertEqual(DatePlanner.state(of: tuesday, size: size, calendar: cal), .full, "\(size)")
        }
        // 13 dogs leaves room for one more.
        XCTAssertEqual(
            DatePlanner.state(of: tuesday, size: .small, calendar: calendar(occupancy: Array(rows.dropLast()))),
            .open
        )
    }

    func testADayWhereStaffBlockedEverySeatIsFull() {
        let blocked = BookingSlots.canonical.flatMap { slot in
            [0, 1].map { BlockedSeatRow(setting_date: tuesday, slot: slot, seat_index: $0) }
        }
        XCTAssertEqual(DatePlanner.state(of: tuesday, size: .small, calendar: calendar(blocked: blocked)), .full)
    }

    func testBlockingSomeSeatsDoesNotMakeTheDayFull() {
        let blocked = [BlockedSeatRow(setting_date: tuesday, slot: "08:30", seat_index: 0)]
        XCTAssertEqual(DatePlanner.state(of: tuesday, size: .small, calendar: calendar(blocked: blocked)), .open)
    }

    func testAnotherDaysBookingsDoNotFillThisDay() {
        let rows = (0..<14).map { booking("2026-12-02", BookingSlots.canonical[$0 % 10]) }
        XCTAssertEqual(DatePlanner.state(of: tuesday, size: .small, calendar: calendar(occupancy: rows)), .open)
    }

    // MARK: a failed read never becomes "full"

    func testWhenTheOccupancyReadFailedNoDayIsCalledFullAndThePageIsIncomplete() {
        let cal = calendar(occupancy: nil)
        XCTAssertFalse(cal.complete)
        XCTAssertEqual(DatePlanner.state(of: tuesday, size: .small, calendar: cal), .open)
        XCTAssertEqual(DatePlanner.state(of: saturday, size: .small, calendar: cal), .closed, "closed days still come from the calendar")
    }

    func testAnyFailedReadMakesThePageIncompleteAndOnlyThen() {
        XCTAssertTrue(calendar().complete)
        XCTAssertFalse(calendar(open: nil).complete)
        XCTAssertFalse(calendar(blocked: nil).complete)
    }

    func testWhenTheOpenDaysReadFailedTheWeekdayDefaultStillApplies() {
        let cal = calendar(open: nil)
        XCTAssertEqual(DatePlanner.state(of: tuesday, size: .small, calendar: cal), .open)
        XCTAssertEqual(DatePlanner.state(of: saturday, size: .small, calendar: cal), .closed)
    }

    // MARK: odd rows

    func testOddRowsAreSkippedNotFatalAndTimestampsAndCaseAreAccepted() {
        let cal = calendar(
            open: [
                OpenDayRow(setting_date: nil, is_open: true),
                OpenDayRow(setting_date: saturday, is_open: nil),
                OpenDayRow(setting_date: "\(saturday)T00:00:00+00:00", is_open: true),
            ],
            occupancy: [
                OccupancyRow(booking_date: tuesday, slot: "09:00:00", size: "Large"),
                OccupancyRow(booking_date: tuesday, slot: nil, size: "small"),
                OccupancyRow(booking_date: tuesday, slot: "09:30", size: "giant"),
                OccupancyRow(booking_date: nil, slot: "09:30", size: "small"),
            ]
        )
        XCTAssertTrue(cal.isOpen(saturday), "the timestamp row counts, the nil rows do not")
        XCTAssertEqual(cal.bookings(on: tuesday), [EngineBooking(slot: "09:00", size: .large)])
        XCTAssertEqual(cal.bookings(on: "2026-12-02"), [])
    }

    func testRowsDecodeFromTheJSONTheDatabaseSends() throws {
        let decoder = JSONDecoder()
        let open = try decoder.decode([OpenDayRow].self, from: Data(#"[{"setting_date":"2026-12-01","is_open":false}]"#.utf8))
        XCTAssertEqual(open, [OpenDayRow(setting_date: "2026-12-01", is_open: false)])
        let occ = try decoder.decode([OccupancyRow].self, from: Data(#"[{"booking_date":"2026-12-01","slot":"09:00","size":"small"}]"#.utf8))
        XCTAssertEqual(occ.first?.size, "small")
        let blocked = try decoder.decode([BlockedSeatRow].self, from: Data(#"[{"setting_date":"2026-12-01","slot":"09:00","seat_index":1}]"#.utf8))
        XCTAssertEqual(blocked.first?.seat_index, 1)
        let flagged = try decoder.decode([ImmediateSlotRow].self, from: Data(#"[{"setting_date":"2026-12-01","slot":"10:00"}]"#.utf8))
        XCTAssertEqual(flagged.first?.slot, "10:00")
    }

    // MARK: the list

    func testTheListKeepsClosedAndFullDaysWithTheirWord() {
        let options = DatePlanner.options(
            for: ["2026-12-01", "2026-12-02", "2026-12-03"],
            size: .small,
            calendar: calendar(open: [OpenDayRow(setting_date: "2026-12-02", is_open: false)])
        )
        XCTAssertEqual(options.map(\.state), [.open, .closed, .closed])
        XCTAssertEqual(options.map(\.isSelectable), [true, false, false])
        XCTAssertEqual(options.first?.title, "Tuesday 1 December")
        XCTAssertNil(DayState.open.label)
        XCTAssertEqual(DayState.closed.label, "Closed")
        XCTAssertEqual(DayState.full.label, "Fully booked")
    }

    func testDaysAreGroupedByTheMondayOfTheirWeekIncludingTheSunday() {
        XCTAssertEqual(DatePlanner.weekStart("2026-11-30"), "2026-11-30")
        XCTAssertEqual(DatePlanner.weekStart("2026-12-06"), "2026-11-30", "a Sunday belongs to the week before")
        XCTAssertEqual(DatePlanner.weekStart("2026-12-07"), "2026-12-07")
        XCTAssertEqual(DatePlanner.weekStart("2026-12-31"), "2026-12-28")

        let dates = ["2026-12-07", "2026-12-05", "2026-12-06", "2026-12-01"]
        let weeks = DatePlanner.weeks(DatePlanner.options(for: dates, size: .small, calendar: calendar()))
        XCTAssertEqual(weeks.map(\.start), ["2026-11-30", "2026-12-07"])
        XCTAssertEqual(weeks[0].days.map(\.date), ["2026-12-01", "2026-12-05", "2026-12-06"])
        XCTAssertEqual(weeks[0].heading, "Week of Monday 30 November")
    }

    func testTheWindowIsPagedIn28DayPages() {
        let dates = (1...60).map { String(format: "d%02d", $0) }
        XCTAssertEqual(DatePlanner.pageCount(of: dates), 3)
        XCTAssertEqual(DatePlanner.page(dates, index: 0).count, 28)
        XCTAssertEqual(DatePlanner.page(dates, index: 2), ["d57", "d58", "d59", "d60"])
        XCTAssertTrue(DatePlanner.page(dates, index: 3).isEmpty)
        XCTAssertTrue(DatePlanner.page(dates, index: -1).isEmpty)
        XCTAssertEqual(DatePlanner.pageCount(of: Array(dates.prefix(28))), 1)
        XCTAssertEqual(DatePlanner.pageCount(of: []), 1, "an empty window is still one (empty) page")
    }

    // MARK: the slot grid

    func testTheGridIsTheStandardSlotsPlusSensibleExtrasSorted() {
        XCTAssertEqual(BookingSlots.grid(), BookingSlots.canonical)
        let grid = BookingSlots.grid(extras: ["13:30", "25:00", "9:30", "junk", "13:30:00", "09:30"])
        XCTAssertEqual(grid, BookingSlots.canonical + ["13:30"])
        XCTAssertEqual(BookingSlots.grid(extras: ["07:30"]).first, "07:30", "an early extra sorts to the front")
    }

    // MARK: last minute

    private func flagged(_ slots: String..., date: String = "2026-12-01") -> [ImmediateSlotRow] {
        slots.map { ImmediateSlotRow(setting_date: date, slot: $0) }
    }

    func testNoFlaggedSlotsMeansNoLastMinuteRow() {
        XCTAssertNil(DatePlanner.lastMinute(rows: [], size: .small, calendar: calendar()))
        XCTAssertNil(DatePlanner.lastMinute(rows: [ImmediateSlotRow(setting_date: nil, slot: "10:00")], size: .small, calendar: calendar()))
    }

    func testFlaggedSlotsThatFitAreOfferedWithTheServersDate() {
        let offer = DatePlanner.lastMinute(rows: flagged("10:30", "10:00", "10:00"), size: .small, calendar: calendar())
        XCTAssertEqual(offer, LastMinuteOffer(date: "2026-12-01", slots: ["10:00", "10:30"]))
        XCTAssertEqual(offer?.title, "Today — last minute")
    }

    func testOnlyTheFirstDatesSlotsAreUsed() {
        let rows = flagged("10:00", date: "2026-12-01") + flagged("11:00", date: "2026-12-02")
        XCTAssertEqual(DatePlanner.lastMinute(rows: rows, size: .small, calendar: calendar())?.slots, ["10:00"])
    }

    func testAFlaggedSlotThatIsAlreadyFullIsNotOffered() {
        let cal = calendar(occupancy: [booking("2026-12-01", "10:00"), booking("2026-12-01", "10:00")])
        let offer = DatePlanner.lastMinute(rows: flagged("10:00", "10:30"), size: .small, calendar: cal)
        XCTAssertEqual(offer?.slots, ["10:30"])
    }

    func testNoRowWhenEveryFlaggedSlotIsTakenOrTheDayIsAtTheCap() {
        let full = calendar(occupancy: [booking("2026-12-01", "10:00"), booking("2026-12-01", "10:00")])
        XCTAssertNil(DatePlanner.lastMinute(rows: flagged("10:00"), size: .small, calendar: full))

        let slots = BookingSlots.canonical
        let capped = calendar(occupancy: (0..<14).map { booking("2026-12-01", slots[$0 % 10]) })
        XCTAssertNil(DatePlanner.lastMinute(rows: flagged("10:00", "10:30"), size: .small, calendar: capped))
    }

    func testAStaffBlockedFlaggedSlotIsNotOffered() {
        let blocked = [0, 1].map { BlockedSeatRow(setting_date: "2026-12-01", slot: "10:00", seat_index: $0) }
        let offer = DatePlanner.lastMinute(rows: flagged("10:00", "10:30"), size: .small, calendar: calendar(blocked: blocked))
        XCTAssertEqual(offer?.slots, ["10:30"])
    }

    func testWithoutAnOccupancyReadTheRowStillShowsAndTheDatabaseDecides() {
        let offer = DatePlanner.lastMinute(rows: flagged("10:00"), size: .large, calendar: calendar(occupancy: nil))
        XCTAssertEqual(offer, LastMinuteOffer(date: "2026-12-01", slots: ["10:00"]))
    }

    func testAnExtraSlotAfterOneIsOfferedToASmallDogButNeverToALargeOne() {
        let small = DatePlanner.lastMinute(rows: flagged("13:30"), size: .small, calendar: calendar())
        XCTAssertEqual(small?.slots, ["13:30"], "extra slots reach customers only as last-minute openings")
        XCTAssertNil(DatePlanner.lastMinute(rows: flagged("13:30"), size: .large, calendar: calendar()), "large dogs are never extra-slot eligible")
    }
}
