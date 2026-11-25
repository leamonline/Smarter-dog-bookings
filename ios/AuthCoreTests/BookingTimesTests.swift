import XCTest
@testable import AuthCore

final class BookingTimesTests: XCTestCase {
    private let tuesday = "2026-12-01"

    private func calendar(occupancy: [OccupancyRow]? = [], blocked: [BlockedSeatRow] = []) -> SalonCalendar {
        SalonCalendar(openRows: [], occupancyRows: occupancy, blockedRows: blocked)
    }

    private func booking(_ slot: String, _ size: String = "small") -> OccupancyRow {
        OccupancyRow(booking_date: tuesday, slot: slot, size: size)
    }

    func testTimesAreWrittenAsTheWebsiteWritesThem() {
        XCTAssertEqual(TimePlanner.label("08:30"), "8:30am")
        XCTAssertEqual(TimePlanner.label("09:00:00"), "9:00am")
        XCTAssertEqual(TimePlanner.label("12:00"), "12:00pm")
        XCTAssertEqual(TimePlanner.label("13:00"), "1:00pm")
        XCTAssertEqual(TimePlanner.label("00:15"), "12:15am")
        XCTAssertEqual(TimePlanner.label("junk"), "junk")
    }

    func testAQuietDayOffersTheWholeStandardGrid() {
        let slots = TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(), lastMinuteRows: [], isLastMinute: false)
        XCTAssertEqual(slots, BookingSlots.canonical)
    }

    func testATakenSlotDropsOutAndSeatsStillFreeKeepTheSlot() {
        let one = TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(occupancy: [booking("09:00")]), lastMinuteRows: [], isLastMinute: false)
        XCTAssertTrue(one.contains("09:00"), "one of two seats is still free")
        let two = TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(occupancy: [booking("09:00"), booking("09:00")]), lastMinuteRows: [], isLastMinute: false)
        XCTAssertFalse(two.contains("09:00"))
        XCTAssertTrue(two.contains("09:30"))
    }

    func testStaffBlockedSeatsRemoveASlot() {
        let blocked = [0, 1].map { BlockedSeatRow(setting_date: tuesday, slot: "10:00", seat_index: $0) }
        let slots = TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(blocked: blocked), lastMinuteRows: [], isLastMinute: false)
        XCTAssertFalse(slots.contains("10:00"))
        XCTAssertEqual(slots.count, 9)
    }

    func testALargeDogGetsOnlyTheSlotsItCanTake() {
        let slots = TimePlanner.offered(date: tuesday, size: .large, calendar: calendar(), lastMinuteRows: [], isLastMinute: false)
        XCTAssertEqual(slots, ["08:30", "09:00", "12:00", "12:30", "13:00"])
    }

    func testAFullDayOffersNothing() {
        let rows = (0..<14).map { booking(BookingSlots.canonical[$0 % 10]) }
        XCTAssertTrue(TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(occupancy: rows), lastMinuteRows: [], isLastMinute: false).isEmpty)
    }

    func testAnUnreadableDayOffersNothingRatherThanEverything() {
        XCTAssertTrue(TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(occupancy: nil), lastMinuteRows: [], isLastMinute: false).isEmpty)
    }

    func testLastMinuteOffersOnlyFlaggedTimesThatStillFit() {
        let flagged = ["10:00", "10:30"].map { ImmediateSlotRow(setting_date: tuesday, slot: $0) }
        let cal = calendar(occupancy: [booking("10:00"), booking("10:00")])
        let slots = TimePlanner.offered(date: tuesday, size: .small, calendar: cal, lastMinuteRows: flagged, isLastMinute: true)
        XCTAssertEqual(slots, ["10:30"], "10:00 is taken, and 09:00 was never flagged")
    }

    func testLastMinuteFailsClosedWhenTheServerNoLongerListsTheDay() {
        XCTAssertTrue(TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(), lastMinuteRows: [], isLastMinute: true).isEmpty)
        let otherDay = [ImmediateSlotRow(setting_date: "2026-12-02", slot: "10:00")]
        XCTAssertTrue(TimePlanner.offered(date: tuesday, size: .small, calendar: calendar(), lastMinuteRows: otherDay, isLastMinute: true).isEmpty)
    }

    func testTimesAreGroupedIntoMorningAndAfternoonInOrderAndEmptyGroupsVanish() {
        let groups = TimePlanner.groups(["13:00", "09:30", "12:00", "08:30"])
        XCTAssertEqual(groups.map(\.title), ["Morning drop-offs", "Afternoon drop-offs"])
        XCTAssertEqual(groups[0].slots, ["08:30", "09:30"])
        XCTAssertEqual(groups[1].slots, ["12:00", "13:00"], "12:00 is the afternoon")
        XCTAssertEqual(TimePlanner.groups(["08:30"]).map(\.title), ["Morning drop-offs"])
        XCTAssertTrue(TimePlanner.groups([]).isEmpty)
    }
}
