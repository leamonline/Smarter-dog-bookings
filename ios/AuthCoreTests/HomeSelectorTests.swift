import XCTest
@testable import AuthCore

final class HomeSelectorTests: XCTestCase {
    // 22 Nov 2026 12:00 UTC is 12:00 in London (GMT).
    private let now = ISO8601DateFormatter().date(from: "2026-11-22T12:00:00Z")!

    private let dogs = [
        DogRow(id: "d1", name: "Luna", breed: "Cockapoo", size: "medium", photo_path: nil),
        DogRow(id: "d2", name: "  ", breed: nil, size: "large", photo_path: "d2/photo.jpg"),
        DogRow(id: "d3", name: "Bella", breed: "Poodle", size: nil, photo_path: ""),
    ]

    private func booking(_ id: String, _ date: String, _ slot: String, _ status: String, dog: String = "d1") -> BookingRow {
        BookingRow(id: id, booking_date: date, slot: slot, service: "Full Groom", status: status, dog_id: dog)
    }

    func testOnlyLiveVisitsFromTodayAreUpcoming() {
        let rows = [
            booking("past", "2026-11-16", "09:00", "Completed"),
            booking("yesterday", "2026-11-21", "09:00", "Booked"),
            booking("cancelled", "2026-12-01", "09:00", "Cancelled"),
            booking("noshow", "2026-12-01", "10:00", "No-show"),
            booking("done", "2026-11-23", "10:00", "Completed"),
            booking("ok", "2026-12-01", "09:30", "Booked"),
        ]
        let result = HomeSelector.upcoming(from: rows, dogs: dogs, now: now)
        XCTAssertEqual(result.map(\.id), ["ok"])
    }

    func testSoonestFirstByDateThenSlot() {
        let rows = [
            booking("c", "2026-12-07", "08:30", "Booked"),
            booking("b", "2026-11-23", "12:00", "Reconfirmed"),
            booking("a", "2026-11-23", "08:30:00", "Booked"),
        ]
        XCTAssertEqual(HomeSelector.upcoming(from: rows, dogs: dogs, now: now).map(\.id), ["a", "b", "c"])
    }

    func testTodayCountsAndIsFlaggedAndInProgressStaysVisible() {
        let rows = [booking("t", "2026-11-22", "09:00", "Arrived")]
        let result = HomeSelector.upcoming(from: rows, dogs: dogs, now: now)
        XCTAssertEqual(result.count, 1)
        XCTAssertTrue(result[0].isToday)
        XCTAssertEqual(result[0].statusText, "Arrived")
    }

    func testTodayIsTheLondonDayNotTheUTCDay() {
        // 00:30 on 1 July 2026 in London (BST) is still 30 June 23:30 UTC.
        let justAfterMidnight = ISO8601DateFormatter().date(from: "2026-06-30T23:30:00Z")!
        XCTAssertEqual(HomeSelector.londonDate(justAfterMidnight), "2026-07-01")
        let winter = ISO8601DateFormatter().date(from: "2026-12-01T00:10:00Z")!
        XCTAssertEqual(HomeSelector.londonDate(winter), "2026-12-01")
    }

    func testDisplayText() {
        let rows = [booking("x", "2026-12-01", "09:30:00", "Booked")]
        let item = HomeSelector.upcoming(from: rows, dogs: dogs, now: now)[0]
        XCTAssertEqual(item.dateText, "Tuesday 1 December")
        XCTAssertEqual(item.timeText, "Drop off 09:30")
        XCTAssertEqual(item.dogName, "Luna")
        XCTAssertEqual(item.service, "Full Groom")
        XCTAssertFalse(item.isToday)
    }

    func testMissingDogOrServiceNeverShowsAnIdOrBlank() {
        let row = BookingRow(id: "x", booking_date: "2026-12-01", slot: "09:30", service: nil, status: "Booked", dog_id: "nope")
        let item = HomeSelector.upcoming(from: [row], dogs: dogs, now: now)[0]
        XCTAssertEqual(item.dogName, "Your dog")
        XCTAssertEqual(item.service, "Grooming")
    }

    func testUnreadableDateIsReturnedAsGivenRatherThanCrashing() {
        XCTAssertEqual(HomeSelector.dateText("soon"), "soon")
    }

    func testDogsAreSortedAndTidied() {
        let result = HomeSelector.dogs(from: dogs)
        XCTAssertEqual(result.map(\.name), ["Bella", "Luna", "Your dog"])
        XCTAssertEqual(result.first { $0.id == "d2" }?.sizeLetter, "L")
        XCTAssertEqual(result.first { $0.id == "d1" }?.sizeLetter, "M")
        XCTAssertNil(result.first { $0.id == "d3" }?.sizeLetter)
        XCTAssertNil(result.first { $0.id == "d3" }?.photoPath)
        XCTAssertEqual(result.first { $0.id == "d2" }?.photoPath, "d2/photo.jpg")
    }

    func testRowsDecodeFromTheDatabaseShape() throws {
        let json = """
        [{"id":"b1","booking_date":"2026-12-01","slot":"09:30:00","service":"Full Groom",
          "status":"Booked","dog_id":"d1","extra":"ignored"}]
        """
        let rows = try JSONDecoder().decode([BookingRow].self, from: Data(json.utf8))
        XCTAssertEqual(rows.first?.slot, "09:30:00")
        let dogJSON = #"[{"id":"d1","name":"Luna","breed":null,"size":"small","photo_path":null}]"#
        let dogRows = try JSONDecoder().decode([DogRow].self, from: Data(dogJSON.utf8))
        XCTAssertEqual(dogRows.first?.size, "small")
    }

    func testEachBookableServiceHasOneMascotAndWalkInsHaveNone() {
        XCTAssertEqual(ServiceMascot.assetName(forService: "Full Groom"), "MascotFullGroom")
        XCTAssertEqual(ServiceMascot.assetName(forService: "Bath & Brush"), "MascotBathBrush")
        XCTAssertEqual(ServiceMascot.assetName(forService: "Bath & De-shed"), "MascotBathDeshed")
        XCTAssertEqual(ServiceMascot.assetName(forService: " Puppy Groom "), "MascotPuppyGroom")
        // Walk-in services are not booked, so they never get a mascot on a booking card.
        XCTAssertNil(ServiceMascot.assetName(forService: "Nail clip"))
        XCTAssertNil(ServiceMascot.assetName(forService: "Grooming"))
        XCTAssertNil(ServiceMascot.assetName(forService: ""))
    }
}
