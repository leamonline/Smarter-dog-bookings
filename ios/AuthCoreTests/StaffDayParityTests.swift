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
        var reminderConfirmedBy: String?
        var groupId: String?
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

    private struct ExpectedAction: Decodable, Equatable {
        var id: String
        var label: String
        var kind: String
    }

    private struct ActionCase: Decodable {
        var id: String
        var booking: FixtureBooking
        var actions: [ExpectedAction]
    }

    private struct ReversalCase: Decodable {
        var action: String
        var previousStatus: String
        var expected: String?
    }

    private struct CollectionContactFixture: Decodable {
        var phone: String?
        var whatsapp: Bool?
        var whatsapp_opted_out: Bool?
        var sms_opted_out: Bool?
    }

    private struct CollectionRouteCase: Decodable {
        var id: String
        var contact: CollectionContactFixture
        var whatsappUnreachable: Bool
        var channel: String?
        var because: String?
        var reason: String?
    }

    private struct CollectionReadinessRowFixture: Decodable {
        var id: String
        var status: String
        var dogName: String
    }

    private struct CollectionReadinessCase: Decodable {
        var id: String
        var currentBookingId: String
        var rows: [CollectionReadinessRowFixture]
        var readyDogNames: [String]
        var waitingDogNames: [String]
    }

    private struct CollectionReleaseCase: Decodable {
        var before: String
        var after: String
        var releases: Bool
    }

    private struct CollectionTextCase: Decodable {
        var dogNames: [String]
        var minutes: String
        var whatsappPreview: String
        var smsText: String
    }

    private struct CollectionFixtures: Decodable {
        var routes: [CollectionRouteCase]
        var readiness: [CollectionReadinessCase]
        var releases: [CollectionReleaseCase]
        var texts: [CollectionTextCase]
    }

    private struct File: Decodable {
        var readyOverdueMinutes: Int
        var scenarios: [Scenario]
        var safety: [SafetyCase]
        var durations: [Duration]
        var surnames: [Surname]
        var tones: [String: Tone]
        var unknownTone: Tone
        var actions: [ActionCase]
        var reversals: [ReversalCase]
        var collection: CollectionFixtures
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
            reminderConfirmedBy: fixture.reminderConfirmedBy,
            reminderFailed: fixture.reminderFailed ?? false,
            confirmationChannel: fixture.confirmationChannel,
            dogName: "",
            breed: fixture.breed ?? "",
            ownerName: "",
            safetyFacts: [],
            notes: "",
            groupId: fixture.groupId
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

    /// Legal S2 actions and their order/labels match `tokenActions` in `src/engine/salonBoard.ts`.
    func testLegalActionsMatchTheWebsite() throws {
        let file = try load()
        let now = try XCTUnwrap(StaffDayStack.parseTimestamp("2026-11-24T10:00:00Z"))
        for item in file.actions {
            let rows = StaffDayStack.build(bookings: [booking(item.booking, date: "2026-11-24")], date: "2026-11-24", now: now)
            let row = try XCTUnwrap(rows.first, item.id)
            let actual = StaffDayActions.legalActions(for: row).map { action in
                let kind: String
                switch action.emphasis {
                case .primary: kind = "primary"
                case .secondary: kind = "default"
                case .quiet: kind = "quiet"
                }
                return ExpectedAction(id: action.id.rawValue, label: action.label, kind: kind)
            }
            XCTAssertEqual(actual, item.actions, item.id)
        }
    }

    /// Reversible statuses match `reverseStatusFor` in `src/engine/salonBoard.ts`.
    func testReverseStatusMatchesTheWebsite() throws {
        for item in try load().reversals {
            let kind = try XCTUnwrap(StaffBookingActionKind(rawValue: item.action), item.action)
            XCTAssertEqual(
                StaffDayActions.reverseStatus(for: kind, previousStatus: item.previousStatus),
                item.expected,
                "\(item.action) from \(item.previousStatus)"
            )
        }
    }

    /// Collection notice routing, sibling readiness, hold release and message text match the website.
    func testCollectionNoticeMatchesTheWebsite() throws {
        let collection = try load().collection

        for item in collection.routes {
            let contact = StaffCollectionContact(
                id: item.id,
                name: "Sam",
                surname: "Taylor",
                phone: item.contact.phone,
                whatsapp: item.contact.whatsapp,
                whatsapp_opted_out: item.contact.whatsapp_opted_out,
                sms_opted_out: item.contact.sms_opted_out
            )
            let route = StaffCollectionNotice.route(for: contact, whatsappUnreachable: item.whatsappUnreachable)
            XCTAssertEqual(route.channel, item.channel, item.id)
            switch route {
            case .whatsapp:
                XCTAssertNil(item.because, item.id)
                XCTAssertNil(item.reason, item.id)
            case .sms(let because):
                XCTAssertEqual(because.rawValue, item.because, item.id)
                XCTAssertNil(item.reason, item.id)
            case .blocked(let reason):
                XCTAssertEqual(reason, item.reason, item.id)
            }
        }

        for item in collection.readiness {
            let bookings = item.rows.map { r in
                StaffBooking(
                    id: r.id, date: "2026-11-24", slot: "09:00", service: "full-groom",
                    status: r.status, cancelReason: nil, checkedInAt: nil, readyAt: nil, completedAt: nil,
                    reminderState: "none", confirmationChannel: nil,
                    dogName: r.dogName, breed: "", ownerId: "h-1", ownerName: "Sam Taylor",
                    safetyFacts: [], notes: "", groupId: nil
                )
            }
            let got = StaffCollectionNotice.readiness(bookings: bookings, ownerId: "h-1", currentBookingId: item.currentBookingId)
            XCTAssertEqual(got.readyDogNames, item.readyDogNames, item.id)
            XCTAssertEqual(got.waitingDogNames, item.waitingDogNames, item.id)
        }

        for item in collection.releases {
            XCTAssertEqual(
                StaffCollectionNotice.releasesHeldNotice(beforeStatus: item.before, afterStatus: item.after),
                item.releases,
                "\(item.before) -> \(item.after)"
            )
        }

        for item in collection.texts {
            XCTAssertEqual(
                StaffCollectionNotice.whatsappPreview(dogNames: item.dogNames, minutes: item.minutes),
                item.whatsappPreview
            )
            XCTAssertEqual(
                StaffCollectionNotice.smsText(dogNames: item.dogNames, minutes: item.minutes),
                item.smsText
            )
        }
    }
}
