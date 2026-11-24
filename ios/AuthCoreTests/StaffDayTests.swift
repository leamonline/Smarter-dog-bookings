import XCTest
@testable import AuthCore

/// The iPhone-only parts of the staff Today screen: turning database rows into
/// bookings, the day's open state and totals, the words VoiceOver reads, dates,
/// and the screen's state. The stack's own rules are in `StaffDayParityTests`.
final class StaffDayTests: XCTestCase {
    private func row(
        _ id: String,
        slot: String? = "09:00",
        status: String? = "Booked",
        dog: String? = "dog-1",
        date: String = "2026-11-24",
        reminderConfirmedAt: String? = nil,
        log: [StaffNotificationRow]? = nil,
        dogSnapshot: String? = nil,
        ownerSnapshot: String? = nil,
        breedSnapshot: String? = nil
    ) -> StaffBookingRow {
        StaffBookingRow(
            id: id, booking_date: date, slot: slot, service: "full-groom", status: status, cancel_reason: nil,
            dog_id: dog, checked_in_at: nil, ready_at: nil, completed_at: nil,
            reminder_confirmed_at: reminderConfirmedAt, confirmation_channel: nil, notes: nil,
            dog_name_snapshot: dogSnapshot, breed_snapshot: breedSnapshot, owner_name_snapshot: ownerSnapshot,
            group_id: nil, notification_log: log
        )
    }

    private let bella = StaffDogRow(id: "dog-1", name: "Bella", breed: "Cockapoo", human_id: "h-1", alerts: ["Nervous / Anxious", "Bites / Nips"], is_pregnant: true)
    private let sam = StaffHumanRow(id: "h-1", name: "Sam", surname: "Taylor")

    // MARK: - Rows to bookings

    func testLiveNamesWinAndWarningsStartWithPregnant() {
        let read = StaffDayRead(bookings: [row("b1", dogSnapshot: "Old name", ownerSnapshot: "Old owner")], dogs: [bella], humans: [sam], setting: nil)
        let booking = StaffDaySelector.bookings(from: read)[0]
        XCTAssertEqual(booking.dogName, "Bella")
        XCTAssertEqual(booking.breed, "Cockapoo")
        XCTAssertEqual(booking.ownerName, "Sam Taylor")
        XCTAssertEqual(booking.safetyFacts, ["Pregnant", "Nervous / Anxious", "Bites / Nips"])
    }

    func testSnapshotsFillInWhenTheDogOrOwnerIsMissing() {
        let read = StaffDayRead(
            bookings: [row("b1", dog: "gone", dogSnapshot: "Rex", ownerSnapshot: "Pat Lee", breedSnapshot: "Beagle")],
            dogs: [], humans: [], setting: nil
        )
        let booking = StaffDaySelector.bookings(from: read)[0]
        XCTAssertEqual([booking.dogName, booking.ownerName, booking.breed], ["Rex", "Pat Lee", "Beagle"])
        XCTAssertEqual(booking.safetyFacts, [])
    }

    func testAMissingStatusReadsAsBooked() {
        let read = StaffDayRead(bookings: [row("b1", status: nil), row("b2", status: "  ")], dogs: [], humans: [], setting: nil)
        XCTAssertEqual(StaffDaySelector.bookings(from: read).map(\.status), ["Booked", "Booked"])
    }

    func testReminderState() {
        let sent = StaffNotificationRow(trigger_type: "reminder", status: "sent", sent_at: "2026-11-23T10:00:00Z")
        let failed = StaffNotificationRow(trigger_type: "reminder", status: "failed", sent_at: nil)
        let ready = StaffNotificationRow(trigger_type: "ready", status: "sent", sent_at: nil)
        XCTAssertEqual(StaffDaySelector.reminderState(row("a")), "none")
        XCTAssertEqual(StaffDaySelector.reminderState(row("b", log: [failed, ready])), "none")
        XCTAssertEqual(StaffDaySelector.reminderState(row("c", log: [failed, sent])), "sent")
        XCTAssertEqual(StaffDaySelector.reminderState(row("d", reminderConfirmedAt: "2026-11-23T11:00:00Z", log: [sent])), "confirmed")
    }

    func testTheSelectStringsAskForEveryColumnTheRowsDecode() {
        for column in ["checked_in_at", "ready_at", "reminder_confirmed_at", "notification_log(trigger_type,status,sent_at)", "owner_name_snapshot"] {
            XCTAssertTrue(StaffBookingRow.select.contains(column), column)
        }
        XCTAssertTrue(StaffDogRow.select.contains("is_pregnant"))
        XCTAssertTrue(StaffDogRow.select.contains("alerts"))
    }

    func testRowsDecodeFromThePostgrestShape() throws {
        let json = """
        [{"id":"b1","booking_date":"2026-11-24","slot":"09:30:00","service":"full-groom","status":"Arrived",
          "checked_in_at":"2026-11-24T09:31:02.123456+00:00","notification_log":[{"trigger_type":"reminder","status":"sent","sent_at":null}]}]
        """
        let rows = try JSONDecoder().decode([StaffBookingRow].self, from: Data(json.utf8))
        XCTAssertEqual(rows[0].slot, "09:30:00")
        XCTAssertEqual(rows[0].notification_log?.count, 1)
        XCTAssertNil(rows[0].dog_id)
    }

    // MARK: - The day

    func testOpenDaysFollowTheSettingOrTheNormalWeek() {
        XCTAssertTrue(StaffDaySelector.isOpen(date: "2026-11-23", setting: nil), "Monday")
        XCTAssertTrue(StaffDaySelector.isOpen(date: "2026-11-25", setting: nil), "Wednesday")
        XCTAssertFalse(StaffDaySelector.isOpen(date: "2026-11-26", setting: nil), "Thursday")
        XCTAssertFalse(StaffDaySelector.isOpen(date: "2026-11-29", setting: nil), "Sunday")
        XCTAssertFalse(StaffDaySelector.isOpen(date: "2026-11-24", setting: StaffDaySettingRow(setting_date: "2026-11-24", is_open: false)))
        XCTAssertTrue(StaffDaySelector.isOpen(date: "2026-11-27", setting: StaffDaySettingRow(setting_date: "2026-11-27", is_open: true)))
        XCTAssertTrue(StaffDaySelector.isOpen(date: "2026-11-24", setting: StaffDaySettingRow(setting_date: "2026-11-24", is_open: nil)))
    }

    func testTotalsCountDogsAndThoseGoneHome() throws {
        let rows = [
            row("a", status: "Completed"), row("b", status: "Arrived"), row("c", status: "Cancelled"),
            row("d", status: "No-show"), row("e"), row("f", date: "2026-11-25"),
        ]
        let now = try XCTUnwrap(StaffDayStack.parseTimestamp("2026-11-24T10:00:00Z"))
        let snapshot = StaffDaySelector.snapshot(read: StaffDayRead(bookings: rows, dogs: [], humans: [], setting: nil), date: "2026-11-24", now: now)
        XCTAssertEqual(snapshot.dogCount, 3)
        XCTAssertEqual(snapshot.goneHome, 1)
        XCTAssertEqual(StaffDaySelector.totals(snapshot), "3 dogs · 1 gone home")
        XCTAssertTrue(snapshot.isToday)
        XCTAssertEqual(snapshot.rows.map(\.id), ["b", "d", "e"], "one slot, so the order they came in")
    }

    func testTotalsWording() {
        func words(_ dogs: Int, _ home: Int) -> String {
            StaffDaySelector.totals(StaffDaySnapshot(date: "2026-11-24", isToday: true, isOpen: true, rows: [], dogCount: dogs, goneHome: home))
        }
        XCTAssertEqual(words(0, 0), "No dogs booked")
        XCTAssertEqual(words(1, 0), "1 dog")
        XCTAssertEqual(words(7, 2), "7 dogs · 2 gone home")
    }

    // MARK: - Words on a row

    func testSafetySummaryShowsTheFirstWarningAndHowManyMore() {
        XCTAssertNil(StaffDaySelector.safetySummary([]))
        XCTAssertEqual(StaffDaySelector.safetySummary(["Pregnant"]), "Pregnant")
        XCTAssertEqual(StaffDaySelector.safetySummary(["Pregnant", "Bites / Nips", "Fear of dryer"]), "Pregnant +2")
    }

    func testVoiceOverReadsEveryWarningAndTheTiming() throws {
        let read = StaffDayRead(bookings: [row("b1", slot: "09:30:00")], dogs: [bella], humans: [sam], setting: nil)
        let now = try XCTUnwrap(StaffDayStack.parseTimestamp("2026-11-24T10:00:00Z"))
        let row = try XCTUnwrap(StaffDaySelector.snapshot(read: read, date: "2026-11-24", now: now).rows.first)
        XCTAssertEqual(
            StaffDaySelector.accessibilityLabel(row),
            "09:30. Bella. Expected. Warning: Pregnant, Bites / Nips, Nervous / Anxious. Cockapoo · Full Groom. Owner Sam Taylor. 30 min late"
        )
        XCTAssertEqual(StaffDaySelector.detailLine(row), "Cockapoo · Full Groom · Taylor")
    }

    func testAnUnnamedBookingSaysSoRatherThanShowingAnId() {
        let booking = StaffDaySelector.bookings(from: StaffDayRead(bookings: [row("b1", dog: nil)], dogs: [], humans: [], setting: nil))[0]
        XCTAssertEqual(StaffDaySelector.dogName(booking), "Unnamed booking")
    }

    // MARK: - Time

    func testTimestampsAreReadToTheMillisecondInEveryShape() throws {
        let base = try XCTUnwrap(StaffDayStack.parseTimestamp("2026-11-24T09:12:33Z"))
        let cases: [(String, Double)] = [
            ("2026-11-24T09:12:33.500Z", 0.5),
            ("2026-11-24T09:12:33.123456+00:00", 0.123),
            ("2026-11-24 09:12:33+00", 0),
            ("2026-11-24T10:12:33+01:00", 0),
            ("2026-11-24T08:12:33-0100", 0),
        ]
        for (text, offset) in cases {
            let date = try XCTUnwrap(StaffDayStack.parseTimestamp(text), text)
            XCTAssertEqual(date.timeIntervalSince(base), offset, accuracy: 0.0005, text)
        }
        for bad in ["", "yesterday", "2026-11-24", "2026-11-24T09:12:33.Z", "2026-11-24T09:12:33+1"] {
            XCTAssertNil(StaffDayStack.parseTimestamp(bad), bad)
        }
    }

    func testTheLondonDateNotThePhonesClock() throws {
        // 23:30 UTC on 24 November is still the 24th in London (GMT)…
        XCTAssertEqual(StaffDayStack.londonDate(try XCTUnwrap(StaffDayStack.parseTimestamp("2026-11-24T23:30:00Z"))), "2026-11-24")
        // …but 23:30 UTC on 14 July is already the 15th in London (BST).
        XCTAssertEqual(StaffDayStack.londonDate(try XCTUnwrap(StaffDayStack.parseTimestamp("2026-07-14T23:30:00Z"))), "2026-07-15")
    }

    func testDatesShiftAcrossMonthsAndYears() {
        XCTAssertEqual(StaffDaySelector.shift("2026-11-30", days: 1), "2026-12-01")
        XCTAssertEqual(StaffDaySelector.shift("2027-01-01", days: -1), "2026-12-31")
        XCTAssertEqual(StaffDaySelector.shift("2026-03-29", days: 1), "2026-03-30", "across the clocks going forward")
        XCTAssertEqual(StaffDaySelector.dateText("2026-11-24"), "Tuesday 24 November")
        XCTAssertEqual(StaffDaySelector.dateText("2026-11-24", short: true), "Tue 24 Nov")
        XCTAssertEqual(StaffDaySelector.timeText("09:30:00"), "09:30")
        XCTAssertNil(StaffDaySelector.timeText(""))
    }

    func testTheMoreTabLinksToTheStaffWebsite() {
        XCTAssertEqual(StaffLinks.more.map(\.title), ["Calendar", "Messages", "Customers", "Dogs", "Reports", "Settings"])
        for item in StaffLinks.more {
            XCTAssertTrue(item.url.absoluteString.hasPrefix("https://smarterdog.co.uk/staff"), item.title)
        }
    }
}

// MARK: - The screen's state

private final class StubDayClient: StaffDayClient, @unchecked Sendable {
    private let lock = NSLock()
    private var _replies: [String: Result<StaffDayRead, Error>] = [:]
    private var _asked: [String] = []
    private var _gate: [String: CheckedContinuation<Void, Never>] = [:]
    private var _held: Set<String> = []

    var asked: [String] { lock.withLock { _asked } }

    func reply(_ date: String, _ result: Result<StaffDayRead, Error>) {
        lock.withLock { _replies[date] = result }
    }

    /// Make the reply for `date` wait until `release` is called.
    func hold(_ date: String) { lock.withLock { _ = _held.insert(date) } }

    func release(_ date: String) {
        let waiting = lock.withLock { () -> CheckedContinuation<Void, Never>? in
            _held.remove(date)
            return _gate.removeValue(forKey: date)
        }
        waiting?.resume()
    }

    func loadDay(_ date: String) async throws -> StaffDayRead {
        let mustWait = lock.withLock { () -> Bool in
            _asked.append(date)
            return _held.contains(date)
        }
        if mustWait {
            await withCheckedContinuation { continuation in
                let stillHeld = lock.withLock { () -> Bool in
                    guard _held.contains(date) else { return false }
                    _gate[date] = continuation
                    return true
                }
                if !stillHeld { continuation.resume() }
            }
        }
        let result = lock.withLock { _replies[date] }
        guard let result else { throw URLError(.badServerResponse) }
        return try result.get()
    }
}

@MainActor
final class StaffTodayModelTests: XCTestCase {
    private let tuesday10am = StaffDayStack.parseTimestamp("2026-11-24T10:00:00Z")!

    private func read(_ ids: [String], date: String = "2026-11-24") -> StaffDayRead {
        StaffDayRead(
            bookings: ids.map {
                StaffBookingRow(
                    id: $0, booking_date: date, slot: "09:00", service: "full-groom", status: "Booked", cancel_reason: nil,
                    dog_id: nil, checked_in_at: nil, ready_at: nil, completed_at: nil, reminder_confirmed_at: nil,
                    confirmation_channel: nil, notes: nil, dog_name_snapshot: "Dog \($0)", breed_snapshot: nil,
                    owner_name_snapshot: nil, group_id: nil, notification_log: nil
                )
            },
            dogs: [], humans: [], setting: nil
        )
    }

    private func ids(_ model: StaffTodayModel) -> [String]? {
        if case .loaded(let snapshot) = model.state { return snapshot.rows.map(\.id) }
        return nil
    }

    func testStartsOnTodayInLondonAndLoadsIt() async {
        let client = StubDayClient()
        client.reply("2026-11-24", .success(read(["a"])))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        XCTAssertEqual(model.date, "2026-11-24")
        XCTAssertEqual(model.state, .loading)
        await model.load()
        XCTAssertEqual(ids(model), ["a"])
        XCTAssertTrue(model.isShowingToday)
    }

    func testAFailedReadIsAFailureNeverAnEmptyDay() async {
        let client = StubDayClient()
        client.reply("2026-11-24", .failure(URLError(.notConnectedToInternet)))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()
        XCTAssertEqual(model.state, .failed)
    }

    func testNoClientIsAFailure() async {
        let now = tuesday10am
        let model = StaffTodayModel(client: nil, clock: { now })
        await model.load()
        XCTAssertEqual(model.state, .failed)
    }

    func testMovingBetweenDaysLoadsEachAndComesBackToToday() async {
        let client = StubDayClient()
        client.reply("2026-11-24", .success(read(["today"])))
        client.reply("2026-11-25", .success(read(["tomorrow"], date: "2026-11-25")))
        client.reply("2026-11-23", .success(read(["yesterday"], date: "2026-11-23")))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()
        await model.showNextDay()
        XCTAssertEqual(model.date, "2026-11-25")
        XCTAssertEqual(ids(model), ["tomorrow"])
        XCTAssertFalse(model.isShowingToday)
        await model.showToday()
        await model.showPreviousDay()
        XCTAssertEqual(ids(model), ["yesterday"])
        XCTAssertEqual(client.asked, ["2026-11-24", "2026-11-25", "2026-11-24", "2026-11-23"])
    }

    func testRefreshingKeepsTheDayOnScreen() async {
        let client = StubDayClient()
        client.reply("2026-11-24", .success(read(["a"])))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        await model.load()
        client.reply("2026-11-24", .success(read(["a", "b"])))
        client.hold("2026-11-24")
        let refresh = Task { await model.load() }
        await Task.yield()
        XCTAssertEqual(ids(model), ["a"], "still showing the day while it refreshes")
        client.release("2026-11-24")
        await refresh.value
        XCTAssertEqual(ids(model), ["a", "b"])
    }

    func testASlowReplyForADayStaffHaveLeftIsDropped() async {
        let client = StubDayClient()
        client.reply("2026-11-24", .success(read(["today"])))
        client.reply("2026-11-25", .success(read(["tomorrow"], date: "2026-11-25")))
        let now = tuesday10am
        let model = StaffTodayModel(client: client, clock: { now })
        client.hold("2026-11-24")
        let first = Task { await model.load() }
        await Task.yield()
        await model.showNextDay()
        client.release("2026-11-24")
        await first.value
        XCTAssertEqual(model.date, "2026-11-25")
        XCTAssertEqual(ids(model), ["tomorrow"], "today's late reply did not overwrite tomorrow")
    }

    func testTickRewordsTheTimingWithoutReloading() async throws {
        let client = StubDayClient()
        client.reply("2026-11-24", .success(read(["a"])))
        final class Clock: @unchecked Sendable { var now: Date; init(_ now: Date) { self.now = now } }
        let clock = Clock(tuesday10am)
        let model = StaffTodayModel(client: client, clock: { clock.now })
        await model.load()
        guard case .loaded(let before) = model.state else { return XCTFail("not loaded") }
        XCTAssertEqual(before.rows.first?.timing, "1 hr late")
        clock.now = clock.now.addingTimeInterval(10 * 60)
        model.tick()
        guard case .loaded(let after) = model.state else { return XCTFail("not loaded") }
        XCTAssertEqual(after.rows.first?.timing, "1 hr 10 min late")
        XCTAssertEqual(client.asked.count, 1, "no second read")
    }
}
