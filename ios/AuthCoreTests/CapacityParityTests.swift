import XCTest
@testable import AuthCore

/// Runs the Swift capacity engine against `capacity-parity.json`: every shared scenario
/// from the website's governed list, with the answers the REAL website engine gives.
/// `src/engine/capacityParityFixtures.ios.test.ts` fails if that file is out of date.
final class CapacityParityTests: XCTestCase {
    private struct Placed: Decodable {
        var slot: String
        var size: DogSize
    }

    private struct Verdict: Decodable {
        var allowed: Bool
        var reason: String?
        var needsApproval: Bool
    }

    private struct Scenario: Decodable {
        var id: String
        var kind: String
        var activeSlots: [String]
        var dailyCap: Int
        var existing: [Placed]
        var overrides: [String: [String: SeatOverride]]
        var offers: [String: [String]]
        var candidate: Placed?
        var verdict: Verdict?
        var dogs: [DogSize]?

        var bookings: [EngineBooking] { existing.map { EngineBooking(slot: $0.slot, size: $0.size) } }

        /// `{"09:00": {"0": "blocked"}}` becomes `["09:00": [0: .blocked]]`.
        var seatOverrides: [String: [Int: SeatOverride]] {
            overrides.mapValues { Dictionary(uniqueKeysWithValues: $0.compactMap { key, value in Int(key).map { ($0, value) } }) }
        }
    }

    private struct File: Decodable {
        var scenarios: [Scenario]
    }

    private func load() throws -> [Scenario] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("capacity-parity.json")
        return try JSONDecoder().decode(File.self, from: Data(contentsOf: url)).scenarios
    }

    func testTheFileIsReadAndHasEveryKindOfScenario() throws {
        let scenarios = try load()
        XCTAssertGreaterThan(scenarios.count, 50)
        let singles = scenarios.filter { $0.kind == "single" }
        XCTAssertGreaterThan(singles.count, 30)
        XCTAssertTrue(singles.contains { $0.verdict?.allowed == true })
        XCTAssertTrue(singles.contains { $0.verdict?.allowed == false })
        XCTAssertEqual(Set(scenarios.map(\.id)).count, scenarios.count, "ids are unique")
        // The one-dog daily-cap edge (the three iPhone-only scenarios) is in the file.
        XCTAssertEqual(scenarios.filter { $0.id.hasPrefix("ios-one-dog") }.count, 3)
        XCTAssertEqual(scenarios.filter { $0.id.hasPrefix("ios-221") }.count, 2)
    }

    /// The verdict for one candidate dog, word for word including the reason.
    func testEverySingleScenarioGetsTheWebsitesVerdict() throws {
        for scenario in try load() where scenario.kind == "single" {
            let candidate = try XCTUnwrap(scenario.candidate, scenario.id)
            let expected = try XCTUnwrap(scenario.verdict, scenario.id)
            let actual = CapacityEngine.canBookSlot(
                scenario.bookings,
                slot: candidate.slot,
                size: candidate.size,
                activeSlots: scenario.activeSlots,
                overrides: scenario.seatOverrides[candidate.slot] ?? [:]
            )
            XCTAssertEqual(actual.allowed, expected.allowed, "\(scenario.id): allowed")
            XCTAssertEqual(actual.reason, expected.reason, "\(scenario.id): reason")
            XCTAssertEqual(actual.needsApproval, expected.needsApproval, "\(scenario.id): needsApproval")
        }
    }

    /// The slots the app would offer one dog of each size on every scenario's day.
    /// Compared with what the website's grouped search offers one dog, so this also
    /// proves "offer every slot canBookSlot allows, after the daily cap" is the same thing.
    func testTheTimesOfferedToOneDogMatchTheWebsiteForEverySize() throws {
        var checked = 0
        for scenario in try load() {
            for (name, expected) in scenario.offers {
                let size = try XCTUnwrap(DogSize(rawValue: name), name)
                let actual = CapacityEngine.offeredSlots(
                    size: size,
                    bookings: scenario.bookings,
                    activeSlots: scenario.activeSlots,
                    overrides: scenario.seatOverrides,
                    dailyCap: scenario.dailyCap
                )
                XCTAssertEqual(actual, expected, "\(scenario.id) / \(name)")
                checked += 1
            }
        }
        XCTAssertGreaterThan(checked, 150)
    }

    // MARK: spot checks that do not depend on the file

    func testAnEmptyDayOffersTheWholeGridToASmallDog() {
        XCTAssertEqual(
            CapacityEngine.offeredSlots(size: .small, bookings: [], activeSlots: BookingSlots.canonical),
            BookingSlots.canonical
        )
    }

    func testALargeDogIsOnlyOfferedTheTimesTheSalonAllows() {
        let offered = CapacityEngine.offeredSlots(size: .large, bookings: [], activeSlots: BookingSlots.canonical)
        // Not 09:30 to 11:30, which need a manager's approval.
        XCTAssertEqual(offered, ["08:30", "09:00", "12:00", "12:30", "13:00"])
        let midMorning = CapacityEngine.canBookSlot([], slot: "10:00", size: .large, activeSlots: BookingSlots.canonical)
        XCTAssertFalse(midMorning.allowed)
        XCTAssertTrue(midMorning.needsApproval)
    }

    func testALargeDogAtNoonClosesTheLastSlotForEveryone() {
        let day = [EngineBooking(slot: "12:00", size: .large)]
        XCTAssertFalse(CapacityEngine.offeredSlots(size: .small, bookings: day, activeSlots: BookingSlots.canonical).contains("13:00"))
        XCTAssertFalse(CapacityEngine.canBookSlot(day, slot: "13:00", size: .small, activeSlots: BookingSlots.canonical).allowed)
    }

    func testTheDailyCapStopsEveryOffer() {
        let full = (0..<14).map { _ in EngineBooking(slot: "09:00", size: .small) }
        XCTAssertEqual(CapacityEngine.offeredSlots(size: .small, bookings: full, activeSlots: BookingSlots.canonical), [])
        let oneLeft = Array(full.dropLast())
        XCTAssertFalse(
            CapacityEngine.offeredSlots(size: .small, bookings: oneLeft, activeSlots: BookingSlots.canonical).isEmpty,
            "13 of 14 dogs booked: one place is still offered"
        )
        XCTAssertEqual(CapacityEngine.dailyDogCap, 14)
    }
}
