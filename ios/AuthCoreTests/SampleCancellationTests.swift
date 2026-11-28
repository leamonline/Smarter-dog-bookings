#if DEBUG
import XCTest
@testable import AuthCore

@MainActor
final class SampleCancellationTests: XCTestCase {
    func testGroupedCancellationUpdatesBothRowsAndPreservesOtherVisits() async throws {
        let now = Date()
        let client = SampleCancellationClient(now: now)
        let before = try await client.loadHome()
        let upcoming = HomeSelector.snapshot(bookings: before.bookings, dogs: before.dogs, now: now).upcoming
        let target = try XCTUnwrap(upcoming.first?.cancelTarget)
        XCTAssertEqual(target.dogNames, ["Biscuit", "Moose"])
        XCTAssertNil(upcoming.last?.cancelTarget)

        let model = CancelFlowModel(target: target, client: client)
        model.choice = CancelReason.choices.first
        await model.send()
        XCTAssertTrue(model.isCancelled)

        let after = try await client.loadHome()
        XCTAssertEqual(after.bookings.map(\.status), [
            BookingStatusName.cancelled, BookingStatusName.cancelled,
            BookingStatusName.booked, BookingStatusName.reconfirmed,
        ])
        let remaining = HomeSelector.snapshot(bookings: after.bookings, dogs: after.dogs, now: now).upcoming
        XCTAssertEqual(remaining.map(\.dogName), ["Pip", "Biscuit"])
    }

    func testInterruptedReplyShowsUncertaintyUntilCheckAgainReadsTheWrittenRow() async throws {
        let now = Date()
        let client = SampleCancellationClient(now: now)
        let before = try await client.loadHome()
        let upcoming = HomeSelector.snapshot(bookings: before.bookings, dogs: before.dogs, now: now).upcoming
        let target = try XCTUnwrap(upcoming.first(where: { $0.dogName == "Pip" })?.cancelTarget)
        let model = CancelFlowModel(target: target, client: client)
        model.choice = CancelReason.choices.first
        await model.send()

        XCTAssertEqual(model.state, .done(.unsure))
        XCTAssertTrue(model.isReasonLocked)
        let after = try await client.loadHome()
        XCTAssertEqual(after.bookings.first(where: { $0.id == target.id })?.status, BookingStatusName.cancelled)

        await model.checkAgain()
        XCTAssertTrue(model.isCancelled)
    }
}
#endif
