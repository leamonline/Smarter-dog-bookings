import XCTest
@testable import AuthCore

final class DogsModelsTests: XCTestCase {
    private let today = "2026-11-22"

    private func draft(_ name: String = "Luna", breed: String = "Cockapoo", size: String? = "medium", dob: String? = nil) -> DogDraft {
        var d = DogDraft()
        d.name = name
        d.breed = breed
        d.reportedSize = size
        d.dob = dob
        return d
    }

    func testNameIsRequiredAndTrimmed() {
        XCTAssertNil(DogDraftCheck.problem(draft(), today: today))
        XCTAssertNotNil(DogDraftCheck.problem(draft("   "), today: today))
        XCTAssertNotNil(DogDraftCheck.problem(draft(String(repeating: "a", count: 61)), today: today))
    }

    func testSizeMustBeADatabaseWordOrEmpty() {
        XCTAssertNil(DogDraftCheck.problem(draft(size: nil), today: today))
        XCTAssertNotNil(DogDraftCheck.problem(draft(size: "huge"), today: today))
    }

    func testBirthdayCannotBeInTheFuture() {
        XCTAssertNil(DogDraftCheck.problem(draft(dob: "2026-11-22"), today: today))
        XCTAssertNotNil(DogDraftCheck.problem(draft(dob: "2026-11-23"), today: today))
    }

    func testEditKeepsWhatIsAlreadyOnFile() {
        let row = DogDetailRow(id: "d1", name: "Luna", breed: "Cockapoo", size: "medium",
                               reported_size: "small", dob: "2020-05-01", human_id: "h1")
        let d = DogDraft(row: row)
        XCTAssertEqual(d.reportedSize, "small")
        XCTAssertEqual(d.dob, "2020-05-01")
    }

    func testUnconfirmedSizeShowsWhatTheCustomerSaid() {
        let rows = [
            DogDetailRow(id: "d1", name: "Luna", breed: nil, size: nil, reported_size: "large", dob: nil, human_id: nil),
            DogDetailRow(id: "d2", name: "Bella", breed: "Poodle", size: "small", reported_size: "large", dob: nil, human_id: nil),
        ]
        let items = DogsSelector.items(from: rows)
        XCTAssertEqual(items.map(\.name), ["Bella", "Luna"])
        XCTAssertNil(items[0].sizeNote)
        XCTAssertEqual(items[0].sizeLetter, "S")
        XCTAssertNotNil(items[1].sizeNote)
        XCTAssertNil(items[1].sizeLetter)
    }

    func testDateRoundTrip() {
        let calendar = Calendar(identifier: .gregorian)
        let date = DogDraftCheck.date(fromISO: "2021-03-09", calendar: calendar)!
        XCTAssertEqual(DogDraftCheck.isoDate(date, calendar: calendar), "2021-03-09")
    }
}
