import XCTest
@testable import AuthCore

/// Runs the Swift day stack against `staff-day-parity.json`: the website's own answers
/// for a governed list of days. `src/engine/staffDayParity.ios.test.ts` fails if that
/// file is out of date, so these tests always compare against the live website rules.
final class StaffDayParityTests: XCTestCase {
    private struct FixtureBooking: Decodable {
        var id: String
        var slot: String
        var status: String
        var service: String?
        var cancelReason: String?
        var checkedInAt: String?
        var readyAt: String?
        var completedAt: String?
        var reminderState: String?
        var confirmationChannel: String?
        var breed: String?
        var reminderFailed: Bool?
    }

    private struct ExpectedRow: Decodable, Equatable {
        var id: String
        var time: String?
        var subtitle: String
        var timing: String?
        var urgent: Bool
        var readyOverdue: Bool
        var countdown: Bool
        var tone: String
        var label: String
    }

    private struct Scenario: Decodable {
        var id: String
        var date: String
        var now: String
        var bookings: [FixtureBooking]
        var rows: [ExpectedRow]
    }

    private struct SafetyCase: Decodable {
        var facts: [String]
        var ordered: [String]
    }

    private struct Duration: Decodable {
        var minutes: Int
        var text: String
    }

    private struct Surname: Decodable {
        var name: String
        var surname: String
    }

    private struct Tone: Decodable {
        var label: String?
        var tint: String
        var ink: String
        var meta: String
        var edge: String
    }

    private struct File: Decodable {
        var readyOverdueMinutes: Int
        var scenarios: [Scenario]
        var safety: [SafetyCase]
        var durations: [Duration]
        var surnames: [Surname]
        var tones: [String: Tone]
        var unknownTone: Tone
    }

    private func load() throws -> File {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("staff-day-parity.json")
        return try JSONDecoder().decode(File.self, from: Data(contentsOf: url))
    }

    private func booking(_ fixture: FixtureBooking, date: String) -> StaffBooking {
        StaffBooking(
            id: fixture.id,
            date: date,
            slot: fixture.slot,
            service: fixture.service ?? "",
            status: fixture.status,
            cancelReason: fixture.cancelReason,
            checkedInAt: fixture.checkedInAt,
            readyAt: fixture.readyAt,
            completedAt: fixture.completedAt,
            reminderState: fixture.reminderState ?? "none",
            reminderFailed: fixture.reminderFailed ?? false,
            confirmationChannel: fixture.confirmationChannel,
            dogName: "",
            breed: fixture.breed ?? "",
            ownerName: "",
            safetyFacts: [],
            notes: "",
            groupId: nil
        )
    }

    func testTheFileIsReadAndCoversTheDay() throws {
        let file = try load()
        XCTAssertGreaterThanOrEqual(file.scenarios.count, 9)
        XCTAssertEqual(Set(file.scenarios.map(\.id)).count, file.scenarios.count, "ids are unique")
        XCTAssertEqual(file.readyOverdueMinutes, StaffDayStack.readyOverdueMinutes)
    }

    /// Every row, word for word: which dogs, in what order, and what each says.
    func testEveryDayMatchesTheWebsite() throws {
        for scenario in try load().scenarios {
            let now = try XCTUnwrap(StaffDayStack.parseTimestamp(scenario.now), scenario.id)
            let rows = StaffDayStack.build(
                bookings: scenario.bookings.map { booking($0, date: scenario.date) },
                date: scenario.date,
                now: now
            )
            let actual = rows.map {
                ExpectedRow(
                    id: $0.id, time: $0.time, subtitle: $0.subtitle, timing: $0.timing,
                    urgent: $0.urgent, readyOverdue: $0.readyOverdue, countdown: $0.countdown,
                    tone: $0.tone.key, label: $0.tone.label
                )
            }
            XCTAssertEqual(actual.map(\.id), scenario.rows.map(\.id), "\(scenario.id): which dogs, in what order")
            for (got, want) in zip(actual, scenario.rows) {
                XCTAssertEqual(got, want, "\(scenario.id) / \(want.id)")
            }
        }
    }

    func testSafetyWarningsAreReadInTheWebsitesOrder() throws {
        for item in try load().safety {
            XCTAssertEqual(StaffDayStack.orderSafetyFacts(item.facts), item.ordered, item.facts.joined(separator: ", "))
        }
    }

    func testDurationsAndSurnamesAreWordedTheSame() throws {
        let file = try load()
        for item in file.durations {
            XCTAssertEqual(StaffDayStack.formatDuration(item.minutes), item.text)
        }
        for item in file.surnames {
            XCTAssertEqual(StaffDayStack.ownerSurname(item.name), item.surname, item.name)
        }
    }

    /// The status colours are the website's, value for value.
    func testStatusColoursMatchTheWebsitePalette() throws {
        let file = try load()
        XCTAssertEqual(Set(file.tones.keys), Set(StaffStatusPalette.tones.keys))
        for (key, want) in file.tones {
            let got = try XCTUnwrap(StaffStatusPalette.tones[key], key)
            XCTAssertEqual(got.label, want.label, key)
            XCTAssertEqual([got.tint, got.ink, got.meta, got.edge], [want.tint, want.ink, want.meta, want.edge], key)
        }
        let unknown = StaffStatusPalette.unknown("Weird")
        let want = file.unknownTone
        XCTAssertEqual([unknown.tint, unknown.ink, unknown.meta, unknown.edge], [want.tint, want.ink, want.meta, want.edge])
    }
}
