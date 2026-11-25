import XCTest
@testable import AuthCore

final class BookingCancelTests: XCTestCase {
    private let target = "11111111-1111-4111-8111-111111111111"
    private let sibling = "22222222-2222-4222-8222-222222222222"
    private let group = "33333333-3333-4333-8333-333333333333"

    private func row(_ id: String, date: String = "2026-12-01", slot: String = "09:30",
                     status: String? = "Booked", group: String? = nil) -> BookingRow {
        BookingRow(id: id, booking_date: date, slot: slot, service: "Full Groom", status: status,
                   dog_id: nil, group_id: group)
    }

    private func receipt(ids: [String]? = nil, count: Int? = nil, target: String? = nil,
                         group: String? = nil) -> CancelReceipt {
        let ids = ids ?? [self.target]
        return CancelReceipt(target_booking_id: target ?? self.target, booking_group_id: group,
                             cancelled_booking_ids: ids, cancelled_count: count ?? ids.count,
                             cancelled_at: "2026-11-25T09:00:00+00:00")
    }

    private func body(_ text: String) -> Data { Data(text.utf8) }

    /// 30 November 2026, 08:00 London (GMT), the day before the visits above.
    private let dayBefore = Date(timeIntervalSince1970: 1_796_025_600)

    // MARK: the reason

    func testReasonsAreTheWebsitesChoicesInOrder() {
        XCTAssertEqual(CancelReason.choices, ["Changed plans", "Dog unwell", "Found another date", "Other"])
    }

    func testAListedReasonIsSentAsItIs() {
        XCTAssertEqual(CancelReason.text(choice: "Dog unwell", other: "ignored"), "Dog unwell")
    }

    func testOtherSendsTheTypedWordsTrimmedWithMarkupRemoved() {
        XCTAssertEqual(CancelReason.text(choice: "Other", other: "  Car <b>broke</b> down  "), "Car broke down")
    }

    func testNoReasonMeansNoSend() {
        XCTAssertNil(CancelReason.text(choice: nil, other: ""))
        XCTAssertNil(CancelReason.text(choice: "Other", other: "   "))
        XCTAssertNil(CancelReason.text(choice: "Other", other: "<i></i>"))
        XCTAssertNil(CancelReason.text(choice: "Something made up", other: "x"))
    }

    func testAReasonIsCutToWhatTheDatabaseAccepts() {
        let long = String(repeating: "a", count: 600)
        XCTAssertEqual(CancelReason.text(choice: "Other", other: long)?.count, 500)
    }

    func testTheRequestUsesTheDatabaseParameterNames() throws {
        let data = try JSONEncoder().encode(CancelRequest(p_booking_id: target, p_reason: "Dog unwell"))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
        XCTAssertEqual(object, ["p_booking_id": target, "p_reason": "Dog unwell"])
    }

    // MARK: the receipt

    func testAGoodReceiptPasses() {
        XCTAssertTrue(receipt().isValid(for: target))
        XCTAssertTrue(receipt(ids: [target, sibling], group: group).isValid(for: target))
        XCTAssertTrue(receipt().isValid(for: target.uppercased()))
    }

    func testAReceiptForAnotherBookingFails() {
        XCTAssertFalse(receipt(target: sibling, group: nil).isValid(for: target))
        XCTAssertFalse(receipt(ids: [sibling]).isValid(for: target))
    }

    func testAReceiptThatDoesNotAddUpFails() {
        XCTAssertFalse(receipt(ids: [], count: 0).isValid(for: target))
        XCTAssertFalse(receipt(ids: [target, target]).isValid(for: target))
        XCTAssertFalse(receipt(ids: [target, sibling], count: 1).isValid(for: target))
        XCTAssertFalse(receipt(ids: [target, "not-an-id"]).isValid(for: target))
        XCTAssertFalse(receipt(group: "not-an-id").isValid(for: target))
        var noTime = receipt()
        noTime.cancelled_at = " "
        XCTAssertFalse(noTime.isValid(for: target))
    }

    // MARK: the wire

    func testOneGoodReceiptIsCancelled() {
        let json = #"[{"target_booking_id":"\#(target)","booking_group_id":"\#(group)","cancelled_booking_ids":["\#(target)","\#(sibling)"],"cancelled_count":2,"cancelled_at":"2026-11-25T09:00:00.123+00:00"}]"#
        guard case .cancelled(let receipt) = CancelWire.sendResult(status: 200, body: body(json), bookingId: target) else {
            return XCTFail("expected cancelled")
        }
        XCTAssertEqual(receipt.cancelled_booking_ids, [target, sibling])
    }

    func testASuccessWeCannotVerifyIsUnknownNeverCancelled() {
        let wrong = #"[{"target_booking_id":"\#(sibling)","booking_group_id":null,"cancelled_booking_ids":["\#(sibling)"],"cancelled_count":1,"cancelled_at":"2026-11-25T09:00:00+00:00"}]"#
        XCTAssertEqual(CancelWire.sendResult(status: 200, body: body(wrong), bookingId: target), .unknown)
        XCTAssertEqual(CancelWire.sendResult(status: 200, body: body("[]"), bookingId: target), .unknown)
        XCTAssertEqual(CancelWire.sendResult(status: 200, body: body("<html>"), bookingId: target), .unknown)
        let two = #"[{"target_booking_id":"\#(target)","booking_group_id":null,"cancelled_booking_ids":["\#(target)"],"cancelled_count":1,"cancelled_at":"x"},{"target_booking_id":"\#(target)","booking_group_id":null,"cancelled_booking_ids":["\#(target)"],"cancelled_count":1,"cancelled_at":"x"}]"#
        XCTAssertEqual(CancelWire.sendResult(status: 200, body: body(two), bookingId: target), .unknown)
    }

    func testARefusalCarriesItsCode() {
        let json = #"{"code":"SDC01","message":"online_cancellation_disabled","details":"customerPortal.allowCancellations=false","hint":null}"#
        XCTAssertEqual(CancelWire.sendResult(status: 400, body: body(json), bookingId: target), .refused(code: "SDC01"))
    }

    func testAServerErrorOrGatewayPageIsUnknown() {
        XCTAssertEqual(CancelWire.sendResult(status: 500, body: body(#"{"code":"XX000"}"#), bookingId: target), .unknown)
        XCTAssertEqual(CancelWire.sendResult(status: 502, body: body("<html>"), bookingId: target), .unknown)
        XCTAssertEqual(CancelWire.sendResult(status: 404, body: body("not json"), bookingId: target), .unknown)
        XCTAssertEqual(CancelWire.sendResult(status: 400, body: body("{}"), bookingId: target), .unknown)
    }

    // MARK: the words

    func testRefusalsUseTheWebsitesWordsNeverTheRawMessage() {
        XCTAssertEqual(CancelCopy.refusal(code: "SDC01"), CancelCopy.switchedOff)
        XCTAssertEqual(CancelCopy.refusal(code: "SDC02"), CancelCopy.tooClose)
        XCTAssertEqual(CancelCopy.refusal(code: "SDC03"), CancelCopy.generic)
        XCTAssertEqual(CancelCopy.refusal(code: nil), CancelCopy.generic)
    }

    // MARK: the outcome

    func testOutcomes() {
        XCTAssertEqual(BookingCancel.outcome(.cancelled(receipt(ids: [target, sibling], group: group))),
                       .cancelled(ids: [target, sibling]))
        XCTAssertEqual(BookingCancel.outcome(.refused(code: "SDC01")), .refused(message: CancelCopy.switchedOff))
        XCTAssertEqual(BookingCancel.outcome(.notSent), .notSent)
    }

    func testAnUnknownReplyIsSettledOnlyByWhatTheServerNowHolds() {
        XCTAssertEqual(BookingCancel.outcome(.unknown, reread: row(target, status: "Cancelled")), .cancelled(ids: [target]))
        // A same-day cancel is saved as a No-show (ADR 015). It still went through.
        XCTAssertEqual(BookingCancel.outcome(.unknown, reread: row(target, status: "No-show")), .cancelled(ids: [target]))
        XCTAssertEqual(BookingCancel.outcome(.unknown, reread: row(target, status: "Booked")), .unsure)
        XCTAssertEqual(BookingCancel.outcome(.unknown, reread: nil), .unsure)
        XCTAssertEqual(BookingCancel.outcome(.unknown), .unsure)
    }

    // MARK: the visit

    func testABookingWithNoGroupGoesAlone() {
        let rows = [row(target), row(sibling)]
        XCTAssertEqual(BookingCancel.visit(of: rows[0], in: rows).map(\.id), [target])
    }

    func testDogsInTheSameGroupOnTheSameDateGoTogether() {
        let rows = [row(target, group: group), row(sibling, slot: "10:00", group: group)]
        XCTAssertEqual(BookingCancel.visit(of: rows[0], in: rows).map(\.id), [target, sibling])
    }

    func testTheSameGroupOnAnotherDateIsAnotherVisit() {
        let rows = [row(target, group: group), row(sibling, date: "2026-12-08", group: group)]
        XCTAssertEqual(BookingCancel.visit(of: rows[0], in: rows).map(\.id), [target])
    }

    // MARK: whether to offer Cancel

    func testABookedVisitAheadCanBeCancelled() {
        XCTAssertTrue(BookingCancel.canCancel(visit: [row(target)], allowCancellations: true, now: dayBefore))
        XCTAssertTrue(BookingCancel.canCancel(visit: [row(target)], allowCancellations: nil, now: dayBefore))
    }

    func testNotWhenTheSalonHasSwitchedItOff() {
        XCTAssertFalse(BookingCancel.canCancel(visit: [row(target)], allowCancellations: false, now: dayBefore))
    }

    func testOnlyWhenEveryDogInTheVisitIsBooked() {
        for status in ["Reconfirmed", "Arrived", "Ready for collection", "Completed", "Cancelled", "No-show"] {
            XCTAssertFalse(BookingCancel.canCancel(visit: [row(target), row(sibling, status: status)],
                                                   allowCancellations: true, now: dayBefore), status)
        }
        // The server counts only the exact word, so a row with no status cannot be cancelled online.
        XCTAssertFalse(BookingCancel.canCancel(visit: [row(target, status: nil)], allowCancellations: true, now: dayBefore))
        XCTAssertFalse(BookingCancel.canCancel(visit: [], allowCancellations: true, now: dayBefore))
    }

    func testOnTheDayItCanStillBeCancelledUntilDropOffInLondonTime() {
        // 1 December 2026 09:29 and 09:30 London (GMT in winter).
        let justBefore = Date(timeIntervalSince1970: 1_796_117_340)
        let atDropOff = Date(timeIntervalSince1970: 1_796_117_400)
        XCTAssertTrue(BookingCancel.canCancel(visit: [row(target)], allowCancellations: true, now: justBefore))
        XCTAssertFalse(BookingCancel.canCancel(visit: [row(target)], allowCancellations: true, now: atDropOff))
    }

    func testTheEarliestDogDecidesForTheWholeVisit() {
        // 08:45 London: after the 08:30 dog, before the 09:30 one.
        let between = Date(timeIntervalSince1970: 1_796_114_700)
        let visit = [row(target, slot: "09:30", group: group), row(sibling, slot: "08:30", group: group)]
        XCTAssertFalse(BookingCancel.canCancel(visit: visit, allowCancellations: true, now: between))
    }

    func testSummerTimeIsLondonNotUTC() {
        // 1 June 2027 09:30 London is 08:30 UTC. At 09:00 UTC the visit has started.
        let visit = [row(target, date: "2027-06-01", slot: "09:30")]
        let at0829UTC = Date(timeIntervalSince1970: 1_811_838_540)
        let at0900UTC = Date(timeIntervalSince1970: 1_811_840_400)
        XCTAssertTrue(BookingCancel.canCancel(visit: visit, allowCancellations: true, now: at0829UTC))
        XCTAssertFalse(BookingCancel.canCancel(visit: visit, allowCancellations: true, now: at0900UTC))
    }

    func testAnUnreadableTimeIsNeverOffered() {
        XCTAssertFalse(BookingCancel.canCancel(visit: [row(target, slot: "soon")], allowCancellations: true, now: dayBefore))
    }
}
