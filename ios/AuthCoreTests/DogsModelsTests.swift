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

    // MARK: review fixes (#1266)

    func testBirthdaysAreStoredAsGregorianWhateverTheirCalendar() {
        // 1 May 2020 built in a Buddhist-calendar phone is year 2563 there.
        var buddhist = Calendar(identifier: .buddhist)
        buddhist.timeZone = TimeZone(identifier: "Europe/London")!
        let picked = buddhist.date(from: DateComponents(year: 2563, month: 5, day: 1, hour: 12))!
        XCTAssertEqual(DogDraftCheck.isoDate(picked, calendar: buddhist), "2563-05-01", "the bug this guards against")
        var gregorian = DogDraftCheck.gregorian
        gregorian.timeZone = TimeZone(identifier: "Europe/London")!
        XCTAssertEqual(DogDraftCheck.isoDate(picked, calendar: gregorian), "2020-05-01")
        XCTAssertEqual(DogDraftCheck.gregorian.identifier, .gregorian)
        // The default is Gregorian, so the value always passes the future-date check.
        XCTAssertNil(DogDraftCheck.problem(draft(dob: DogDraftCheck.isoDate(picked, calendar: gregorian)), today: "2026-11-22"))
    }

    func testMonthOnlyBirthdaysFromTheWebsiteAreReadAndKept() throws {
        XCTAssertTrue(DogDraftCheck.isMonthOnly("2020-05"))
        XCTAssertFalse(DogDraftCheck.isMonthOnly("2020-05-01"))
        XCTAssertFalse(DogDraftCheck.isMonthOnly(""))
        let calendar = DogDraftCheck.gregorian
        let monthDate = try XCTUnwrap(DogDraftCheck.date(fromISO: "2020-05", calendar: calendar))
        XCTAssertEqual(DogDraftCheck.isoDate(monthDate, calendar: calendar), "2020-05-01")
        XCTAssertNil(DogDraftCheck.date(fromISO: "soon", calendar: calendar))

        // Saving an unrelated change must send the stored month back untouched.
        XCTAssertEqual(
            DogDraftCheck.birthdayToSend(original: "2020-05", hasBirthday: true, picked: monthDate, edited: false, calendar: calendar),
            "2020-05"
        )
        // Changing the date sends a full date. Turning it off sends nil.
        XCTAssertEqual(
            DogDraftCheck.birthdayToSend(original: "2020-05", hasBirthday: true, picked: monthDate, edited: true, calendar: calendar),
            "2020-05-01"
        )
        XCTAssertNil(DogDraftCheck.birthdayToSend(original: "2020-05", hasBirthday: false, picked: monthDate, edited: false, calendar: calendar))
        // A full date that was not touched is also sent back as it was.
        XCTAssertEqual(
            DogDraftCheck.birthdayToSend(original: "2020-05-17", hasBirthday: true, picked: monthDate, edited: false, calendar: calendar),
            "2020-05-17"
        )
        // A birthday added where there was none is sent as a full date.
        XCTAssertEqual(
            DogDraftCheck.birthdayToSend(original: nil, hasBirthday: true, picked: monthDate, edited: true, calendar: calendar),
            "2020-05-01"
        )
    }

    func testAMonthOnlyRowKeepsItsBirthdayInTheDraft() {
        let row = DogDetailRow(id: "d1", name: "Luna", breed: nil, size: nil, reported_size: nil, dob: "2020-05", human_id: nil)
        XCTAssertEqual(DogDraft(row: row).dob, "2020-05")
        XCTAssertNil(DogDraftCheck.problem(DogDraft(row: row), today: "2026-11-22"))
        XCTAssertNotNil(DogDraftCheck.problem(draft(dob: "2026-12"), today: "2026-11-22"))
    }
}
