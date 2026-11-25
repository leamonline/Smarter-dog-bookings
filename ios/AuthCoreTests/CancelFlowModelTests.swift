import XCTest
@testable import AuthCore

// Every test here is `async`: Swift 6.0 on Linux cannot list a synchronous test from a main-actor class.
private let targetId = "11111111-1111-4111-8111-111111111111"
private let siblingId = "22222222-2222-4222-8222-222222222222"

@MainActor
final class CancelFlowModelTests: XCTestCase {

    private final class FakeClient: SalonCancelClient, @unchecked Sendable {
        var result: CancelSendResult = .cancelled(CancelReceipt(
            target_booking_id: targetId, booking_group_id: nil,
            cancelled_booking_ids: [targetId], cancelled_count: 1,
            cancelled_at: "2026-11-25T09:00:00+00:00"))
        var reread: BookingRow?
        var sent: [CancelRequest] = []
        var reloads = 0
        var hold = false
        var waiting: CheckedContinuation<Void, Never>?

        func cancelBooking(_ request: CancelRequest) async -> CancelSendResult {
            sent.append(request)
            if hold { await withCheckedContinuation { waiting = $0 } }
            return result
        }

        func reloadBooking(id: String) async -> BookingRow? {
            reloads += 1
            return reread
        }
    }

    private func row(status: String) -> BookingRow {
        BookingRow(id: targetId, booking_date: "2026-12-01", slot: "09:30", service: "Full Groom", status: status, dog_id: "d1")
    }

    private func model(_ client: FakeClient?, dogs: [String] = ["Rex"]) -> CancelFlowModel {
        CancelFlowModel(target: CancelTarget(id: targetId, dogNames: dogs, whenText: "Tuesday 1 December at 09:30"), client: client)
    }

    func testTheQuestionNamesEveryDogInTheVisit() async {
        XCTAssertEqual(model(nil).target.question, "Cancel the appointment for Rex?")
        XCTAssertNil(model(nil).target.togetherNote)
        let two = model(nil, dogs: ["Rex", "Bella"]).target
        XCTAssertEqual(two.question, "Cancel the appointment for Rex and Bella?")
        XCTAssertEqual(two.togetherNote, "Rex and Bella are booked in together, so this cancels all of them.")
        XCTAssertEqual(model(nil, dogs: ["Rex", "Bella", "Max"]).target.namesText, "Rex, Bella and Max")
    }

    func testNothingCanBeSentWithoutAReason() async {
        let client = FakeClient()
        let flow = model(client)
        XCTAssertFalse(flow.canSend)
        await flow.send()
        XCTAssertTrue(client.sent.isEmpty)
        flow.choice = "Other"
        XCTAssertFalse(flow.canSend)
        flow.otherText = "Car broke down"
        XCTAssertTrue(flow.canSend)
    }

    func testNothingCanBeSentWithoutAClient() async {
        let flow = model(nil)
        flow.choice = "Dog unwell"
        XCTAssertFalse(flow.canSend)
    }

    func testACancelSendsTheBookingAndTheReason() async {
        let client = FakeClient()
        let flow = model(client)
        flow.choice = "Dog unwell"
        await flow.send()
        XCTAssertEqual(client.sent, [CancelRequest(p_booking_id: targetId, p_reason: "Dog unwell")])
        XCTAssertEqual(flow.state, .done(.cancelled(ids: [targetId])))
        XCTAssertTrue(flow.isCancelled)
        XCTAssertFalse(flow.canSend)
        XCTAssertNil(flow.message)
        XCTAssertEqual(client.reloads, 0)
    }

    func testASecondTapWhileSendingSendsNothing() async {
        let client = FakeClient()
        client.hold = true
        let flow = model(client)
        flow.choice = "Changed plans"
        let first = Task { await flow.send() }
        while client.waiting == nil { await Task.yield() }
        XCTAssertTrue(flow.isSending)
        XCTAssertFalse(flow.canSend)
        await flow.send()
        XCTAssertEqual(client.sent.count, 1)
        client.waiting?.resume()
        await first.value
        XCTAssertEqual(client.sent.count, 1)
    }

    func testARefusalShowsTheWebsitesWords() async {
        let client = FakeClient()
        client.result = .refused(code: "SDC01")
        let flow = model(client)
        flow.choice = "Changed plans"
        await flow.send()
        XCTAssertEqual(flow.message, CancelCopy.switchedOff)
        XCTAssertFalse(flow.isReasonLocked)
    }

    func testNotSentSaysSoAndLeavesTheReasonFree() async {
        let client = FakeClient()
        client.result = .notSent
        let flow = model(client)
        flow.choice = "Changed plans"
        await flow.send()
        XCTAssertEqual(flow.message, CancelCopy.notSent)
        XCTAssertFalse(flow.isReasonLocked)
        XCTAssertTrue(flow.canSend)
    }

    func testAnUnknownReplyThatReadsCancelledIsCancelled() async {
        let client = FakeClient()
        client.result = .unknown
        client.reread = row(status: "Cancelled")
        let flow = model(client)
        flow.choice = "Changed plans"
        await flow.send()
        XCTAssertEqual(client.reloads, 1)
        XCTAssertTrue(flow.isCancelled)
    }

    func testAnUnknownReplyOnTheDayThatReadsNoShowIsCancelled() async {
        let client = FakeClient()
        client.result = .unknown
        client.reread = row(status: "No-show")
        let flow = model(client)
        flow.choice = "Changed plans"
        await flow.send()
        XCTAssertTrue(flow.isCancelled)
    }

    func testAnUnknownReplyLocksTheReasonSoATryAgainSendsTheSameWords() async {
        let client = FakeClient()
        client.result = .unknown
        client.reread = row(status: "Booked")
        let flow = model(client)
        flow.choice = "Other"
        flow.otherText = "Car broke down"
        await flow.send()
        XCTAssertEqual(flow.state, .done(.unsure))
        XCTAssertEqual(flow.message, CancelCopy.unsure)
        XCTAssertTrue(flow.isReasonLocked)

        // Changing the picker now must not change what is sent.
        flow.choice = "Dog unwell"
        XCTAssertEqual(flow.reason, "Car broke down")
        client.result = .cancelled(CancelReceipt(
            target_booking_id: targetId, booking_group_id: nil, cancelled_booking_ids: [targetId],
            cancelled_count: 1, cancelled_at: "2026-11-25T09:00:00+00:00"))
        await flow.send()
        XCTAssertEqual(client.sent.map(\.p_reason), ["Car broke down", "Car broke down"])
        XCTAssertTrue(flow.isCancelled)
        XCTAssertFalse(flow.isReasonLocked)
    }

    func testCheckAgainReadsAndNeverSends() async {
        let client = FakeClient()
        client.result = .unknown
        let flow = model(client)
        flow.choice = "Changed plans"
        await flow.send()
        XCTAssertEqual(flow.state, .done(.unsure))
        client.reread = row(status: "Cancelled")
        await flow.checkAgain()
        XCTAssertEqual(client.sent.count, 1)
        XCTAssertEqual(client.reloads, 2)
        XCTAssertTrue(flow.isCancelled)
    }

    func testCheckAgainDoesNothingUnlessUnsure() async {
        let client = FakeClient()
        let flow = model(client)
        await flow.checkAgain()
        XCTAssertEqual(client.reloads, 0)
        XCTAssertEqual(flow.state, .choosing)
    }

    // MARK: what Home offers

    // 30 November 2026 08:00 London.
    private let dayBefore = Date(timeIntervalSince1970: 1_796_025_600)

    private func home(_ rows: [BookingRow]) -> [UpcomingGroom] {
        let dogs = [DogRow(id: "d1", name: "Rex", breed: nil, size: "medium", photo_path: nil),
                    DogRow(id: "d2", name: "Bella", breed: nil, size: "small", photo_path: nil)]
        return HomeSelector.upcoming(from: rows, dogs: dogs, now: dayBefore)
    }

    func testHomeOffersCancelForABookedVisitAhead() async {
        let groom = home([BookingRow(id: targetId, booking_date: "2026-12-01", slot: "09:30", service: "Full Groom", status: "Booked", dog_id: "d1")])
        XCTAssertEqual(groom.first?.cancelTarget, CancelTarget(id: targetId, dogNames: ["Rex"], whenText: "Tuesday 1 December at 09:30"))
    }

    func testHomeDoesNotOfferCancelForAReconfirmedVisit() async {
        let groom = home([BookingRow(id: targetId, booking_date: "2026-12-01", slot: "09:30", service: "Full Groom", status: "Reconfirmed", dog_id: "d1")])
        XCTAssertEqual(groom.count, 1)
        XCTAssertNil(groom.first?.cancelTarget)
    }

    func testHomeNamesBothDogsOfAVisitAndTheEarliestTime() async {
        let group = "33333333-3333-4333-8333-333333333333"
        let grooms = home([
            BookingRow(id: targetId, booking_date: "2026-12-01", slot: "10:00", service: "Full Groom", status: "Booked", dog_id: "d1", group_id: group),
            BookingRow(id: siblingId, booking_date: "2026-12-01", slot: "09:30", service: "Bath & Brush", status: "Booked", dog_id: "d2", group_id: group),
        ])
        XCTAssertEqual(grooms.count, 2)
        for groom in grooms {
            XCTAssertEqual(groom.cancelTarget?.dogNames.sorted(), ["Bella", "Rex"])
            XCTAssertEqual(groom.cancelTarget?.whenText, "Tuesday 1 December at 09:30")
        }
    }
}
