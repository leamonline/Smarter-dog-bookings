import XCTest
@testable import AuthCore

/// Tests for Phase S2: minimal field-scoped booking patches, concurrent-write
/// guards, undo semantics, sibling collection-notice holds, opt-in messaging,
/// and Realtime quiet refreshes.
final class StaffDayActionsTests: XCTestCase {
    private let tuesday10am = StaffDayStack.parseTimestamp("2026-11-24T10:00:00Z")!

    private func decodeJSONObject(_ data: Data) throws -> [String: Any] {
        let obj = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(obj as? [String: Any])
    }

    private func makeBooking(
        id: String = "b1",
        date: String = "2026-11-24",
        status: String = "Booked",
        cancelReason: String? = nil,
        reminderState: String = "none",
        reminderConfirmedBy: String? = nil,
        ownerId: String? = "h-1",
        dogName: String = "Bella",
        groupId: String? = nil
    ) -> StaffBooking {
        StaffBooking(
            id: id, date: date, slot: "09:00", service: "full-groom", status: status,
            cancelReason: cancelReason, checkedInAt: nil, readyAt: nil, completedAt: nil,
            reminderState: reminderState, reminderConfirmedBy: reminderConfirmedBy,
            confirmationChannel: nil, dogName: dogName, breed: "Cockapoo",
            ownerId: ownerId, ownerName: "Sam Taylor", ownerPhone: "07700 900123",
            safetyFacts: [], notes: "", groupId: groupId
        )
    }

    // MARK: - Patch serialization (column-minimal writes)

    func testCheckInPatchEncodesOnlyStatusColumn() throws {
        let plan = StaffDayActions.plan(action: .checkIn, for: makeBooking(), now: tuesday10am)
        let data = try JSONEncoder().encode(plan.request.patch)
        let json = try decodeJSONObject(data)
        XCTAssertEqual(Set(json.keys), ["status"])
        XCTAssertEqual(json["status"] as? String, "Arrived")
        XCTAssertFalse(plan.opensCollectionPrompt)
    }

    func testDidntShowAndUndoNoShowEncodeExplicitCancelReasonAndNull() throws {
        let mark = StaffDayActions.plan(action: .didntShow, for: makeBooking(), now: tuesday10am)
        let markJSON = try decodeJSONObject(try JSONEncoder().encode(mark.request.patch))
        XCTAssertEqual(Set(markJSON.keys), ["status", "cancel_reason"])
        XCTAssertEqual(markJSON["status"] as? String, "No-show")
        XCTAssertEqual(markJSON["cancel_reason"] as? String, "No-show")

        let restore = StaffDayActions.plan(action: .undoNoShow, for: makeBooking(status: "No-show", cancelReason: "No-show"), now: tuesday10am)
        let restoreJSON = try decodeJSONObject(try JSONEncoder().encode(restore.request.patch))
        XCTAssertEqual(Set(restoreJSON.keys), ["status", "cancel_reason"])
        XCTAssertEqual(restoreJSON["status"] as? String, "Booked")
        XCTAssertTrue(restoreJSON["cancel_reason"] is NSNull, "must explicitly write SQL NULL, not omit the key")
    }

    func testConfirmAdvancesBookedTodayToReconfirmedButNotPastDates() throws {
        let todayPlan = StaffDayActions.plan(action: .confirm, for: makeBooking(date: "2026-11-24", status: "Booked"), now: tuesday10am)
        let todayJSON = try decodeJSONObject(try JSONEncoder().encode(todayPlan.request.patch))
        XCTAssertEqual(Set(todayJSON.keys), ["status", "reminder_confirmed_at", "reminder_confirmed_source"])
        XCTAssertEqual(todayJSON["status"] as? String, "Reconfirmed")
        XCTAssertEqual(todayJSON["reminder_confirmed_source"] as? String, "staff")

        let pastPlan = StaffDayActions.plan(action: .confirm, for: makeBooking(date: "2026-11-23", status: "Booked"), now: tuesday10am)
        let pastJSON = try decodeJSONObject(try JSONEncoder().encode(pastPlan.request.patch))
        XCTAssertEqual(Set(pastJSON.keys), ["reminder_confirmed_at", "reminder_confirmed_source"], "past bookings do not flip status")
    }

    func testUnconfirmAndConfirmUndoGuardAgainstCustomerConfirmationAndConcurrentCheckIn() throws {
        let unconfirm = StaffDayActions.plan(action: .unconfirm, for: makeBooking(status: "Reconfirmed", reminderConfirmedBy: "staff"), now: tuesday10am)
        XCTAssertTrue(unconfirm.request.guardCondition.requireStaffConfirmationSource)
        let unconfirmJSON = try decodeJSONObject(try JSONEncoder().encode(unconfirm.request.patch))
        XCTAssertEqual(Set(unconfirmJSON.keys), ["reminder_confirmed_at", "reminder_confirmed_source"])
        XCTAssertTrue(unconfirmJSON["reminder_confirmed_at"] is NSNull)
        XCTAssertTrue(unconfirmJSON["reminder_confirmed_source"] is NSNull)

        let before = makeBooking(date: "2026-11-24", status: "Booked")
        let persisted = StaffBookingRow(
            id: "b1", booking_date: "2026-11-24", slot: "09:00", service: "full-groom", status: "Reconfirmed",
            cancel_reason: nil, dog_id: "d1", checked_in_at: nil, ready_at: nil, completed_at: nil,
            reminder_confirmed_at: "2026-11-24T10:00:00.000Z", reminder_confirmed_source: "staff",
            confirmation_channel: nil, notes: nil, dog_name_snapshot: "Bella", breed_snapshot: nil,
            owner_name_snapshot: nil, group_id: nil, notification_log: nil
        )
        let undo = try XCTUnwrap(StaffDayActions.undoAction(for: .confirm, before: before, persisted: persisted))
        XCTAssertTrue(undo.request.guardCondition.requireStaffConfirmationSource)
        XCTAssertEqual(undo.request.guardCondition.requireStatus, "Reconfirmed")
        let fallback = try XCTUnwrap(undo.request.guardCondition.fallbackPatchOnZeroRows)
        let fallbackJSON = try decodeJSONObject(try JSONEncoder().encode(fallback))
        XCTAssertEqual(Set(fallbackJSON.keys), ["reminder_confirmed_at", "reminder_confirmed_source"], "fallback clears confirmation without rolling back a concurrent check-in")
    }

    func testSelectIncludesReminderConfirmedSource() {
        XCTAssertTrue(StaffBookingRow.select.contains("reminder_confirmed_source"))
        XCTAssertTrue(StaffCollectionContact.select.contains("whatsapp_opted_out"))
        XCTAssertTrue(StaffCollectionContact.select.contains("sms_opted_out"))
    }
}

// MARK: - Stateful model tests (MainActor, all test methods async for Linux Swift 6.0 CI)

private final class StubWriteClient: StaffDayClient, @unchecked Sendable {
    private let lock = NSLock()
    var supportsWrites: Bool = true
    var supportsMessaging: Bool = true

    private var _dayRead: StaffDayRead
    private var _requests: [StaffBookingWriteRequest] = []
    private var _nextOutcome: Result<StaffBookingWriteOutcome, Error>?
    private var _recipientsResult: Result<[StaffCollectionRecipient], Error> = .success([])
    private var _sentRequests: [StaffCollectionSendRequest] = []
    private var _sendError: Error?
    private var _loadCount = 0
    private var _realtimeContinuation: AsyncStream<Void>.Continuation?
    private var _holdUpdate = false
    private var _updateGate: CheckedContinuation<Void, Never>?

    init(dayRead: StaffDayRead) {
        self._dayRead = dayRead
    }

    var requests: [StaffBookingWriteRequest] { lock.withLock { _requests } }
    var sentRequests: [StaffCollectionSendRequest] { lock.withLock { _sentRequests } }
    var loadCount: Int { lock.withLock { _loadCount } }

    func setDayRead(_ read: StaffDayRead) { lock.withLock { _dayRead = read } }
    func setNextOutcome(_ result: Result<StaffBookingWriteOutcome, Error>?) { lock.withLock { _nextOutcome = result } }
    func setRecipients(_ result: Result<[StaffCollectionRecipient], Error>) { lock.withLock { _recipientsResult = result } }
    func setSendError(_ error: Error?) { lock.withLock { _sendError = error } }
    func holdUpdates(_ hold: Bool) { lock.withLock { _holdUpdate = hold } }

    func releaseUpdate() {
        let gate = lock.withLock { () -> CheckedContinuation<Void, Never>? in
            _holdUpdate = false
            let g = _updateGate
            _updateGate = nil
            return g
        }
        gate?.resume()
    }

    func emitRealtimeChange() {
        let cont = lock.withLock { _realtimeContinuation }
        cont?.yield(())
    }

    func finishRealtime() {
        let cont = lock.withLock { _realtimeContinuation }
        cont?.finish()
    }

    func loadDay(_ date: String) async throws -> StaffDayRead {
        lock.withLock {
            _loadCount += 1
            return _dayRead
        }
    }

    func updateBooking(_ request: StaffBookingWriteRequest) async throws -> StaffBookingWriteOutcome {
        let mustWait = lock.withLock { () -> Bool in
            _requests.append(request)
            return _holdUpdate
        }
        if mustWait {
            await withCheckedContinuation { cont in
                let stillHeld = lock.withLock { () -> Bool in
                    guard _holdUpdate else { return false }
                    _updateGate = cont
                    return true
                }
                if !stillHeld { cont.resume() }
            }
        }
        let configured = lock.withLock { () -> Result<StaffBookingWriteOutcome, Error>? in
            let next = _nextOutcome
            _nextOutcome = nil
            return next
        }
        if let configured {
            return try configured.get()
        }
        // Apply patch to the in-memory row so tests assert the persisted row state.
        return lock.withLock {
            guard let index = _dayRead.bookings.firstIndex(where: { $0.id == request.bookingId }) else {
                return .notMatched
            }
            var row = _dayRead.bookings[index]
            if case .value(let status) = request.patch.status { row.status = status }
            switch request.patch.cancelReason {
            case .unchanged: break
            case .null: row.cancel_reason = nil
            case .value(let reason): row.cancel_reason = reason
            }
            switch request.patch.reminderConfirmedAt {
            case .unchanged: break
            case .null: row.reminder_confirmed_at = nil
            case .value(let at): row.reminder_confirmed_at = at
            }
            switch request.patch.reminderConfirmedSource {
            case .unchanged: break
            case .null: row.reminder_confirmed_source = nil
            case .value(let source): row.reminder_confirmed_source = source
            }
            _dayRead.bookings[index] = row
            return .updated(row)
        }
    }

    func loadCollectionRecipients(ownerId: String) async throws -> [StaffCollectionRecipient] {
        try lock.withLock { _recipientsResult }.get()
    }

    func sendCollectionNotice(_ request: StaffCollectionSendRequest) async throws {
        let error = lock.withLock { () -> Error? in
            _sentRequests.append(request)
            return _sendError
        }
        if let error { throw error }
    }

    func observeBookings() -> AsyncStream<Void> {
        AsyncStream { continuation in
            self.lock.withLock { self._realtimeContinuation = continuation }
        }
    }
}

@MainActor
final class StaffTodayActionsModelTests: XCTestCase {
    private let tuesday10am = StaffDayStack.parseTimestamp("2026-11-24T10:00:00Z")!

    private func row(
        _ id: String,
        dogId: String,
        status: String = "Booked",
        slot: String = "09:00"
    ) -> StaffBookingRow {
        StaffBookingRow(
            id: id, booking_date: "2026-11-24", slot: slot, service: "full-groom", status: status,
            cancel_reason: nil, dog_id: dogId, checked_in_at: nil, ready_at: nil, completed_at: nil,
            reminder_confirmed_at: nil, reminder_confirmed_source: nil, confirmation_channel: nil,
            notes: nil, dog_name_snapshot: nil, breed_snapshot: nil, owner_name_snapshot: nil,
            group_id: nil, notification_log: nil
        )
    }

    private func sampleRead(bookings: [StaffBookingRow]) -> StaffDayRead {
        StaffDayRead(
            bookings: bookings,
            dogs: [
                StaffDogRow(id: "d1", name: "Bella", breed: "Cockapoo", human_id: "h1", alerts: nil, is_pregnant: false),
                StaffDogRow(id: "d2", name: "Max", breed: "Poodle", human_id: "h1", alerts: nil, is_pregnant: false),
            ],
            humans: [
                StaffHumanRow(id: "h1", name: "Sam", surname: "Taylor", phone: "07700 900123"),
            ],
            setting: StaffDaySettingRow(setting_date: "2026-11-24", is_open: true)
        )
    }

    func testCheckInUpdatesRowOffersUndoAndRevertsOnUndo() async throws {
        let client = StubWriteClient(dayRead: sampleRead(bookings: [row("b1", dogId: "d1", status: "Booked")]))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()

        let before = try XCTUnwrap(model.row(id: "b1"))
        let saved = await model.perform(.checkIn, on: before)
        XCTAssertTrue(saved)
        XCTAssertEqual(model.row(id: "b1")?.booking.status, "Arrived")
        XCTAssertEqual(model.banner?.message, "Bella checked in — with us now")
        let undo = try XCTUnwrap(model.banner?.undo)

        let reverted = await model.performUndo(undo)
        XCTAssertTrue(reverted)
        XCTAssertEqual(model.row(id: "b1")?.booking.status, "Booked")
        XCTAssertEqual(client.requests.count, 2)
    }

    func testFailedWriteLeavesRowUnchangedAndRetryUsesMinimalPatch() async throws {
        let client = StubWriteClient(dayRead: sampleRead(bookings: [row("b1", dogId: "d1", status: "Booked")]))
        client.setNextOutcome(.failure(URLError(.notConnectedToInternet)))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()

        let before = try XCTUnwrap(model.row(id: "b1"))
        let saved = await model.perform(.checkIn, on: before)
        XCTAssertFalse(saved)
        XCTAssertEqual(model.row(id: "b1")?.booking.status, "Booked", "row must stay as it was")
        XCTAssertEqual(model.banner?.tone, .error)
        let retry = try XCTUnwrap(model.banner?.retry)

        let retried = await model.retry(retry)
        XCTAssertTrue(retried)
        XCTAssertEqual(model.row(id: "b1")?.booking.status, "Arrived")
    }

    func testDoubleTapWhileWriteInFlightSendsOnlyOneRequest() async throws {
        let client = StubWriteClient(dayRead: sampleRead(bookings: [row("b1", dogId: "d1", status: "Booked")]))
        client.holdUpdates(true)
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()

        let row = try XCTUnwrap(model.row(id: "b1"))
        let first = Task { await model.perform(.checkIn, on: row) }
        await Task.yield()
        XCTAssertTrue(model.isBusy("b1"))
        let second = await model.perform(.checkIn, on: row)
        XCTAssertFalse(second)

        client.releaseUpdate()
        let firstResult = await first.value
        XCTAssertTrue(firstResult)
        XCTAssertEqual(client.requests.count, 1)
    }

    func testMarkReadyNeverSendsByItselfAndOpensPromptForSingleDog() async throws {
        let client = StubWriteClient(dayRead: sampleRead(bookings: [row("b1", dogId: "d1", status: "Arrived")]))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()

        let row = try XCTUnwrap(model.row(id: "b1"))
        let saved = await model.perform(.ready, on: row)
        XCTAssertTrue(saved)
        XCTAssertEqual(client.sentRequests, [], "Mark ready must never send a message by itself (ST-8)")
        XCTAssertEqual(model.collectionPrompt?.readyDogNames, ["Bella"])
    }

    func testMarkReadyHoldsNoticeWhenSiblingIsStillInSalonAndReleasesWhenSiblingNoShows() async throws {
        let client = StubWriteClient(dayRead: sampleRead(bookings: [
            row("b1", dogId: "d1", status: "Arrived", slot: "09:00"),
            row("b2", dogId: "d2", status: "Booked", slot: "09:30"),
        ]))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()

        let bella = try XCTUnwrap(model.row(id: "b1"))
        _ = await model.perform(.ready, on: bella)
        XCTAssertNil(model.collectionPrompt, "notice held while Max is still expected")
        XCTAssertEqual(model.banner?.message, "Bella ready. Holding the message until Max is ready too.")

        let max = try XCTUnwrap(model.row(id: "b2"))
        _ = await model.perform(.didntShow, on: max)
        XCTAssertEqual(model.collectionPrompt?.readyDogNames, ["Bella"], "no-show on sibling releases Bella's held notice")
    }

    func testUnconfirmNotMatchedShowsCustomerConfirmationStandsMessage() async throws {
        var r = row("b1", dogId: "d1", status: "Reconfirmed")
        r.reminder_confirmed_source = "staff"
        let client = StubWriteClient(dayRead: sampleRead(bookings: [r]))
        client.setNextOutcome(.success(.notMatched))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()

        let bookingRow = try XCTUnwrap(model.row(id: "b1"))
        let saved = await model.perform(.unconfirm, on: bookingRow)
        XCTAssertFalse(saved)
        XCTAssertEqual(model.banner?.tone, .info)
        XCTAssertEqual(model.banner?.message, StaffDayActions.unconfirmNotMatchedMessage)
    }

    func testRealtimeUpdateRefreshesDayQuietly() async {
        let client = StubWriteClient(dayRead: sampleRead(bookings: [row("b1", dogId: "d1", status: "Booked")]))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()
        XCTAssertEqual(model.row(id: "b1")?.booking.status, "Booked")

        let listener = Task { await model.listenForRealtimeUpdates() }
        await Task.yield()

        client.setDayRead(sampleRead(bookings: [row("b1", dogId: "d1", status: "Arrived")]))
        client.emitRealtimeChange()
        try? await Task.sleep(for: .milliseconds(30))
        client.finishRealtime()
        await listener.value

        XCTAssertEqual(model.row(id: "b1")?.booking.status, "Arrived")
        XCTAssertGreaterThanOrEqual(client.loadCount, 2)
    }

    func testCollectionNoticeModelRoutesWhatsAppAndSMSAndBlocksOptOuts() async {
        let client = StubWriteClient(dayRead: sampleRead(bookings: []))
        let waContact = StaffCollectionContact(id: "h1", name: "Sam", surname: "Taylor", phone: "07700 900123", whatsapp: true, whatsapp_opted_out: false, sms_opted_out: false)
        let smsContact = StaffCollectionContact(id: "h2", name: "Jo", surname: "Patel", phone: "07700 900124", whatsapp: false, whatsapp_opted_out: false, sms_opted_out: false)
        let blockedContact = StaffCollectionContact(id: "h3", name: "Pat", surname: "Lee", phone: "07700 900125", whatsapp: true, whatsapp_opted_out: true, sms_opted_out: true)

        let recipients = [
            StaffCollectionRecipient(id: "h1", displayName: "Sam Taylor", relationship: "Owner", isOwner: true, contact: waContact, route: StaffCollectionNotice.route(for: waContact)),
            StaffCollectionRecipient(id: "h2", displayName: "Jo Patel", relationship: "Partner", isOwner: false, contact: smsContact, route: StaffCollectionNotice.route(for: smsContact)),
            StaffCollectionRecipient(id: "h3", displayName: "Pat Lee", relationship: "Friend", isOwner: false, contact: blockedContact, route: StaffCollectionNotice.route(for: blockedContact)),
        ]
        client.setRecipients(.success(recipients))

        let prompt = StaffCollectionPrompt(bookingId: "b1", date: "2026-11-24", ownerId: "h1", readyDogNames: ["bella", "max"])
        let sheetModel = StaffCollectionNoticeModel(prompt: prompt, client: client)
        XCTAssertEqual(sheetModel.step, .ask)
        XCTAssertEqual(sheetModel.title, "Bella and Max are ready")

        await sheetModel.chooseSendMessage()
        XCTAssertEqual(sheetModel.step, .compose)
        XCTAssertTrue(sheetModel.anySmsRecipient)

        await sheetModel.send(to: recipients[0])
        await sheetModel.send(to: recipients[1])
        await sheetModel.send(to: recipients[2]) // blocked — must not send

        XCTAssertEqual(client.sentRequests, [
            .whatsapp(to: "+447700900123", templateName: "ready_for_collection_v2", language: "en_GB", params: ["Bella and Max", "15"], humanId: "h1"),
            .sms(to: "+447700900124", text: "Hi! We've finished pampering Bella and Max and they're ready to head home in 15 mins. See you soon! X - Smarter Dog Grooming", templateName: "ready_for_collection_sms", humanId: "h2"),
        ])
        XCTAssertEqual(sheetModel.sentRecipientIDs, ["h1", "h2"])
        XCTAssertEqual(sheetModel.closeButtonLabel, "Done")
    }
}
