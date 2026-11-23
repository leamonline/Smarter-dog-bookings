import XCTest
@testable import AuthCore

final class BookingModelsTests: XCTestCase {
    // MARK: refusals

    private struct DenialCase: Decodable {
        var message: String?
        var details: String?
        var reason: String
    }

    /// The same table the website's mapper is checked against
    /// (`src/security/iosBookingDenials.test.ts`), so the two cannot disagree.
    func testEveryMessageMapsTheWayTheSharedTableSays() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("denial-cases.json")
        let cases = try JSONDecoder().decode([DenialCase].self, from: Data(contentsOf: url))
        XCTAssertGreaterThan(cases.count, 20)
        for row in cases {
            XCTAssertEqual(
                BookingDenial.reason(message: row.message, details: row.details),
                row.reason,
                "\(row.message ?? "nil") / \(row.details ?? "nil")"
            )
        }
    }

    func testEveryCodeHasCustomerCopyAndNothingLeaksTheDatabaseMessage() {
        for code in BookingDenial.reasonCodes where code != "unknown" {
            let copy = BookingDenial.customerCopy[code]
            XCTAssertNotNil(copy, code)
            XCTAssertEqual(BookingDenial.customerMessage(message: "raw text", details: code), copy)
        }
        let raw = "ERROR: Capped at 1 (2-2-1 rule) at trigger validate_booking_capacity"
        XCTAssertFalse(BookingDenial.customerMessage(message: raw, details: nil).contains("trigger"))
        XCTAssertEqual(
            BookingDenial.customerMessage(message: "something nobody has seen", details: nil),
            BookingDenial.genericCopy
        )
        XCTAssertEqual(BookingDenial.customerMessage(message: nil, details: nil), BookingDenial.genericCopy)
    }

    func testCapacityRefusalsAllTellTheCustomerThatTheTimeWasTaken() {
        let taken = BookingDenial.customerCopy["slot_full"]
        for code in ["capacity_2_2_1", "slot_full", "seat_blocked", "unavailable"] {
            XCTAssertEqual(BookingDenial.customerCopy[code], taken, code)
        }
    }

    func testAccountRefusalsAreTheFourTheDatabaseRaisesForTheAccount() {
        XCTAssertEqual(
            BookingDenial.accountRefusals,
            ["awaiting_approval", "profile_incomplete", "dog_size_unconfirmed", "dog_not_owned"]
        )
    }

    // MARK: rules

    private func rules(_ json: String) -> BookingRules {
        BookingRules.parse(Data(json.utf8))
    }

    func testRulesAreReadAndOddValuesBecomeNotEstablished() {
        let good = rules("""
        {"bookingHorizonDays": 60,
         "changeDeadline": {"rule": "rolling_24h", "description": "  Rescheduling closes 24 hours before.  "},
         "customerPortal": {"allowCancellations": false}}
        """)
        XCTAssertEqual(good.horizonDays, 60)
        XCTAssertEqual(good.changeDeadlineDescription, "Rescheduling closes 24 hours before.")
        XCTAssertEqual(good.allowCancellations, false)

        for odd in ["0", "731", "-3", "28.5", "\"60\"", "true", "null"] {
            XCTAssertEqual(rules("{\"bookingHorizonDays\": \(odd)}").horizonDays, 28, odd)
        }
        XCTAssertEqual(rules("{\"bookingHorizonDays\": 730}").horizonDays, 730)
        XCTAssertEqual(rules("{\"bookingHorizonDays\": 1}").horizonDays, 1)

        // One odd field does not hide the others.
        let mixed = rules("""
        {"bookingHorizonDays": "soon", "changeDeadline": {"description": "Changes close at 3pm."},
         "customerPortal": {"allowCancellations": "yes"}}
        """)
        XCTAssertEqual(mixed.horizonDays, 28)
        XCTAssertEqual(mixed.changeDeadlineDescription, "Changes close at 3pm.")
        XCTAssertNil(mixed.allowCancellations)

        XCTAssertEqual(rules("{\"changeDeadline\": {\"description\": \"   \"}}").changeDeadlineDescription, nil)
        XCTAssertEqual(BookingRules.parse(nil), .unknown)
        XCTAssertEqual(rules("not json"), .unknown)
        XCTAssertEqual(rules("[1, 2]"), .unknown)
        XCTAssertEqual(BookingRules.unknown.horizonDays, 28)
    }

    // MARK: date window

    func testTheWindowStartsTomorrowAndRunsForTheHorizonInLondonTime() {
        let now = ISO8601DateFormatter().date(from: "2026-11-22T12:00:00Z")!
        let dates = BookingWindow.dates(now: now, horizonDays: 28)
        XCTAssertEqual(dates.count, 28)
        XCTAssertEqual(dates.first, "2026-11-23")
        XCTAssertEqual(dates.last, "2026-12-20")
        XCTAssertFalse(dates.contains("2026-11-22"), "today is not in the window")
        XCTAssertEqual(BookingWindow.dates(now: now, horizonDays: 1), ["2026-11-23"])
        XCTAssertEqual(BookingWindow.dates(now: now, horizonDays: 0), [])
        XCTAssertEqual(Set(dates).count, dates.count)
    }

    func testTheWindowUsesTheSalonsDayNotTheUTCDay() {
        // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST), so tomorrow is 2 July.
        let justAfterLondonMidnight = ISO8601DateFormatter().date(from: "2026-06-30T23:30:00Z")!
        XCTAssertEqual(BookingWindow.dates(now: justAfterLondonMidnight, horizonDays: 2), ["2026-07-02", "2026-07-03"])
    }

    func testTheWindowSurvivesTheClocksChanging() {
        // Clocks go back on 25 October 2026 (a 25 hour day). Every date still appears once.
        let now = ISO8601DateFormatter().date(from: "2026-10-23T12:00:00Z")!
        XCTAssertEqual(
            BookingWindow.dates(now: now, horizonDays: 4),
            ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]
        )
        // Clocks go forward on 29 March 2026 (a 23 hour day).
        let spring = ISO8601DateFormatter().date(from: "2026-03-27T12:00:00Z")!
        XCTAssertEqual(
            BookingWindow.dates(now: spring, horizonDays: 4),
            ["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]
        )
    }

    // MARK: services and slots

    func testPuppyGroomIsNotOfferedForLargeDogs() {
        XCTAssertFalse(BookingService.puppyGroom.isOffered(forSize: "large"))
        XCTAssertFalse(BookingService.puppyGroom.isOffered(forSize: "Large"))
        XCTAssertTrue(BookingService.puppyGroom.isOffered(forSize: "small"))
        XCTAssertTrue(BookingService.fullGroom.isOffered(forSize: "large"))
        XCTAssertEqual(
            BookingService.allCases.map(\.rawValue),
            ["Full Groom", "Bath & Brush", "Bath & De-shed", "Puppy Groom"]
        )
        XCTAssertEqual(BookingService.addOns, ["Flea Bath", "Sensitive Shampoo", "Anal Glands"])
    }

    func testTheStandardGridIsTenHalfHourSlotsFrom0830() {
        XCTAssertEqual(BookingSlots.canonical.count, 10)
        XCTAssertEqual(BookingSlots.canonical.first, "08:30")
        XCTAssertEqual(BookingSlots.canonical.last, "13:00")
    }

    // MARK: the request

    private func choice(_ dog: String = "d1", size: String = "medium", _ service: BookingService = .fullGroom,
                        addOns: [String] = [], slot: String = "09:30") -> BookingChoice {
        BookingChoice(dogId: dog, confirmedSize: size, service: service, addOns: addOns, slot: slot)
    }

    func testARequestHasTheShapeTheRPCExpectsAndNeverSendsASize() throws {
        let request = try BookingRequest.make(date: "2026-12-01", choices: [choice(addOns: ["Flea Bath"])])
        XCTAssertEqual(request.p_booking_date, "2026-12-01")
        XCTAssertEqual(request.p_bookings, [
            BookingRequest.Row(dog_id: "d1", slot: "09:30", service: "Full Groom", addons: ["Flea Bath"], payment: "Due at Pick-up"),
        ])
        let json = String(decoding: try JSONEncoder().encode(request), as: UTF8.self)
        for key in ["p_bookings", "p_booking_date", "dog_id", "slot", "service", "addons", "payment"] {
            XCTAssertTrue(json.contains("\"\(key)\""), key)
        }
        XCTAssertFalse(json.contains("size"), "the database reads the size from the dog")
    }

    func testObviouslyWrongRequestsNeverLeaveThePhone() {
        func fails(_ choices: [BookingChoice], _ error: BookingRequestError, date: String = "2026-12-01",
                   grid: [String] = BookingSlots.canonical, line: UInt = #line) {
            XCTAssertThrowsError(try BookingRequest.make(date: date, choices: choices, gridSlots: grid), line: line) {
                XCTAssertEqual($0 as? BookingRequestError, error, line: line)
            }
        }
        fails([], .noDogs)
        fails([choice("a"), choice("b"), choice("c"), choice("d"), choice("e")], .tooManyDogs)
        fails([choice("a"), choice("a")], .sameDogTwice)
        for bad in ["", "tomorrow", "2026-13-01", "2026-02-30", "2026-1-1", "26-12-01", "2026/12/01"] {
            fails([choice()], .badDate, date: bad)
        }
        fails([choice(slot: "14:00")], .slotNotOnTheGrid("14:00"))
        fails([choice(slot: "9:30")], .slotNotOnTheGrid("9:30"))
        fails([choice("big", size: "large", .puppyGroom)], .serviceNotOffered(dogId: "big"))
        fails([choice(addOns: ["Teeth Whitening"])], .unknownAddOn("Teeth Whitening"))
    }

    func testAnExtraSlotIsAcceptedOnlyWhenTheDaysGridHasIt() throws {
        XCTAssertThrowsError(try BookingRequest.make(date: "2026-12-01", choices: [choice(slot: "13:30")]))
        let request = try BookingRequest.make(
            date: "2026-12-01",
            choices: [choice(slot: "13:30")],
            gridSlots: BookingSlots.canonical + ["13:30"]
        )
        XCTAssertEqual(request.p_bookings.first?.slot, "13:30")
    }

    func testUpToFourDifferentDogsAreAccepted() throws {
        let request = try BookingRequest.make(
            date: "2026-12-01",
            choices: ["a", "b", "c", "d"].map { choice($0) }
        )
        XCTAssertEqual(request.p_bookings.map(\.dog_id), ["a", "b", "c", "d"])
        XCTAssertTrue(["2024-02-29", "2026-12-31"].allSatisfy { (try? BookingRequest.make(date: $0, choices: [choice()])) != nil })
        XCTAssertThrowsError(try BookingRequest.make(date: "2026-02-29", choices: [choice()]))
    }
}
