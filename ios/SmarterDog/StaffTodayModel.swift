import Foundation
import Observation

/// What the staff Today screen asks the salon. The app uses Supabase
/// (`SupabaseStaffDayClient`); tests and Debug sample mode use stand-ins.
protocol StaffDayClient: Sendable {
    func loadDay(_ date: String) async throws -> StaffDayRead
    /// Whether status moves are enabled on this client.
    var supportsWrites: Bool { get }
    /// Whether live collection-notice messaging (`whatsapp-send` / `sms-send`) is enabled.
    var supportsMessaging: Bool { get }
    /// Update only the columns named in `request.patch` on `public.bookings`.
    func updateBooking(_ request: StaffBookingWriteRequest) async throws -> StaffBookingWriteOutcome
    /// Load owner and trusted contact cards for the collection notice sheet.
    func loadCollectionRecipients(ownerId: String) async throws -> [StaffCollectionRecipient]
    /// Send one ready-for-collection template message (WhatsApp or SMS).
    func sendCollectionNotice(_ request: StaffCollectionSendRequest) async throws
    /// Stream of server-side `bookings` change notifications (Realtime).
    func observeBookings() -> AsyncStream<Void>
}

enum StaffDayClientError: LocalizedError, Equatable, Sendable {
    case unsupported
    case server(String)

    var errorDescription: String? {
        switch self {
        case .unsupported: "This action isn't available here."
        case .server(let message): message
        }
    }
}

extension StaffDayClient {
    var supportsWrites: Bool { false }
    var supportsMessaging: Bool { false }

    func updateBooking(_ request: StaffBookingWriteRequest) async throws -> StaffBookingWriteOutcome {
        throw StaffDayClientError.unsupported
    }

    func loadCollectionRecipients(ownerId: String) async throws -> [StaffCollectionRecipient] {
        throw StaffDayClientError.unsupported
    }

    func sendCollectionNotice(_ request: StaffCollectionSendRequest) async throws {
        throw StaffDayClientError.unsupported
    }

    func observeBookings() -> AsyncStream<Void> {
        AsyncStream { $0.finish() }
    }
}

/// Retries a single failed status move with its exact minimal field patch.
struct StaffRetryAction: Equatable, Sendable {
    let plan: StaffMovePlan
    let before: StaffBooking
}

/// Single toast/banner shown at the bottom of staff Today (replaces the previous
/// one, matching `#1001`, so Undo always belongs to the most recent action).
struct StaffBanner: Identifiable, Equatable, Sendable {
    enum Tone: Equatable, Sendable {
        case success
        case info
        case error
    }

    let id: UUID
    let message: String
    let tone: Tone
    let undo: StaffUndoAction?
    let retry: StaffRetryAction?

    init(
        id: UUID = UUID(),
        message: String,
        tone: Tone,
        undo: StaffUndoAction? = nil,
        retry: StaffRetryAction? = nil
    ) {
        self.id = id
        self.message = message
        self.tone = tone
        self.undo = undo
        self.retry = retry
    }
}

/// Discrete feedback events for native haptics and VoiceOver announcements.
struct StaffFeedbackEvent: Equatable, Sendable {
    enum Kind: Equatable, Sendable {
        case success
        case warning
        case error
    }

    let id: UUID
    let kind: Kind
    let announcement: String

    init(id: UUID = UUID(), kind: Kind, announcement: String) {
        self.id = id
        self.kind = kind
        self.announcement = announcement
    }
}

/// The staff Today screen's state: which London date is showing, what it holds,
/// in-flight status moves, one-tap Undo and the opt-in collection notice prompt.
/// Lives here rather than in the view so Linux CI can test every state transition.
@MainActor
@Observable
final class StaffTodayModel {
    enum State: Equatable {
        case loading
        case loaded(StaffDaySnapshot)
        /// The real answer is unknown. Never shown as an empty day.
        case failed
    }

    private(set) var state: State = .loading
    /// The browsed London date, `yyyy-MM-dd`.
    private(set) var date: String
    /// Bookings currently saving a move. Second taps on these are ignored.
    private(set) var busyBookingIDs: Set<String> = []
    /// Most recent outcome banner (success with optional Undo, info, or error with Retry).
    private(set) var banner: StaffBanner?
    /// Non-nil when Mark ready (or a released sibling hold) asks staff whether to message.
    var collectionPrompt: StaffCollectionPrompt?
    /// Latest feedback event for native haptics and VoiceOver announcements.
    private(set) var lastFeedback: StaffFeedbackEvent?

    let client: StaffDayClient?
    private let clock: @Sendable () -> Date
    /// The last successful read, so timing lines tick and persisted rows patch in place.
    @ObservationIgnored private var lastRead: (date: String, read: StaffDayRead)?
    /// Bumped on every load, so a slow reply for a day staff have left is dropped.
    @ObservationIgnored private var generation = 0

    init(client: StaffDayClient?, clock: @escaping @Sendable () -> Date = { Date() }) {
        self.client = client
        self.clock = clock
        self.date = StaffDayStack.londonDate(clock())
    }

    var today: String { StaffDayStack.londonDate(clock()) }
    var isShowingToday: Bool { date == today }
    var canWrite: Bool { client?.supportsWrites == true }

    func isBusy(_ bookingId: String) -> Bool {
        busyBookingIDs.contains(bookingId)
    }

    /// Look up the latest row on screen by id (keeps an open detail sheet fresh).
    func row(id: String) -> StaffDayRow? {
        guard case .loaded(let snapshot) = state else { return nil }
        return snapshot.rows.first(where: { $0.id == id })
            ?? snapshot.cancelled.first(where: { $0.id == id })
    }

    /// Load the browsed date. Content already on screen for the same date stays up
    /// while it refreshes; a different date shows the loading state.
    func load() async {
        await performLoad(quiet: false)
    }

    /// Background refresh triggered by Supabase Realtime. Never replaces an already
    /// loaded screen with a spinner or failure banner on a transient hiccup.
    func refreshQuietly() async {
        await performLoad(quiet: true)
    }

    private func performLoad(quiet: Bool) async {
        generation += 1
        let mine = generation
        let wanted = date
        guard let client else {
            if !quiet { state = .failed }
            return
        }
        let alreadyShowingWanted: Bool
        if case .loaded(let snapshot) = state, snapshot.date == wanted {
            alreadyShowingWanted = true
        } else {
            alreadyShowingWanted = false
            if !quiet { state = .loading }
        }
        do {
            let read = try await client.loadDay(wanted)
            guard mine == generation, wanted == date else { return }
            lastRead = (wanted, read)
            state = .loaded(StaffDaySelector.snapshot(read: read, date: wanted, now: clock()))
        } catch {
            guard mine == generation, wanted == date else { return }
            if !quiet || !alreadyShowingWanted {
                state = .failed
            }
        }
    }

    /// Re-word the timing lines against the current minute, from the last read.
    func tick() {
        guard let lastRead, lastRead.date == date, case .loaded = state else { return }
        state = .loaded(StaffDaySelector.snapshot(read: lastRead.read, date: lastRead.date, now: clock()))
    }

    func showPreviousDay() async { await show(StaffDaySelector.shift(date, days: -1)) }
    func showNextDay() async { await show(StaffDaySelector.shift(date, days: 1)) }
    func showToday() async { await show(today) }

    func dismissBanner() {
        banner = nil
    }

    /// Run one legal S2 status/confirmation move on `row`.
    /// Returns `true` when the server accepted and saved the change.
    @discardableResult
    func perform(_ action: StaffBookingActionKind, on row: StaffDayRow) async -> Bool {
        let plan = StaffDayActions.plan(action: action, for: row.booking, now: clock())
        return await execute(plan: plan, before: row.booking)
    }

    /// Retry a previously failed move using its exact minimal field patch.
    @discardableResult
    func retry(_ retryAction: StaffRetryAction) async -> Bool {
        await execute(plan: retryAction.plan, before: retryAction.before)
    }

    private func execute(plan: StaffMovePlan, before: StaffBooking) async -> Bool {
        guard let client, client.supportsWrites else {
            showError("Changes aren't enabled in this view.", retry: nil)
            return false
        }
        let bookingId = before.id
        guard !busyBookingIDs.contains(bookingId) else { return false }

        busyBookingIDs.insert(bookingId)
        defer { busyBookingIDs.remove(bookingId) }

        do {
            let outcome = try await client.updateBooking(plan.request)
            switch outcome {
            case .updated(let persisted):
                applyPersistedRow(persisted)
                let undo = StaffDayActions.undoAction(for: plan.action, before: before, persisted: persisted)
                banner = StaffBanner(message: plan.successMessage, tone: .success, undo: undo)
                lastFeedback = StaffFeedbackEvent(kind: .success, announcement: plan.successMessage)

                let persistedStatus = persisted.status ?? StaffDayStack.booked
                if plan.opensCollectionPrompt {
                    handleCollectionPromptAfterReady(booking: before)
                } else if StaffCollectionNotice.releasesHeldNotice(beforeStatus: before.status, afterStatus: persistedStatus) {
                    reopenHeldCollectionPromptIfReady(releasedBy: before)
                }
                return true

            case .notMatched:
                let message = plan.notMatchedMessage ?? plan.failureMessage
                banner = StaffBanner(message: message, tone: .info)
                lastFeedback = StaffFeedbackEvent(kind: .warning, announcement: message)
                return false
            }
        } catch {
            let friendly = StaffDayActions.friendlyError(raw: error.localizedDescription, fallback: plan.failureMessage)
            let retryAction = plan.notMatchedMessage == nil ? StaffRetryAction(plan: plan, before: before) : nil
            showError(friendly, retry: retryAction)
            return false
        }
    }

    /// Revert a reversible move using the minimal undo patch computed at save time.
    @discardableResult
    func performUndo(_ undo: StaffUndoAction) async -> Bool {
        guard let client, client.supportsWrites else { return false }
        guard !busyBookingIDs.contains(undo.bookingId) else { return false }

        busyBookingIDs.insert(undo.bookingId)
        defer { busyBookingIDs.remove(undo.bookingId) }

        do {
            let outcome = try await client.updateBooking(undo.request)
            switch outcome {
            case .updated(let persisted):
                applyPersistedRow(persisted)
                banner = StaffBanner(message: undo.successMessage, tone: .success)
                lastFeedback = StaffFeedbackEvent(kind: .success, announcement: undo.successMessage)
                return true
            case .notMatched:
                let message = undo.notMatchedMessage ?? undo.failureMessage
                banner = StaffBanner(message: message, tone: .info)
                lastFeedback = StaffFeedbackEvent(kind: .warning, announcement: message)
                return false
            }
        } catch {
            let friendly = StaffDayActions.friendlyError(raw: error.localizedDescription, fallback: undo.failureMessage)
            showError(friendly, retry: nil)
            return false
        }
    }

    /// Observe live `bookings` changes until the enclosing task is cancelled.
    func listenForRealtimeUpdates() async {
        guard let client else { return }
        for await _ in client.observeBookings() {
            if Task.isCancelled { break }
            await refreshQuietly()
        }
    }

    // MARK: - Private helpers

    private func show(_ newDate: String) async {
        guard newDate != date else {
            await load()
            return
        }
        date = newDate
        banner = nil
        await load()
    }

    private func showError(_ message: String, retry: StaffRetryAction?) {
        banner = StaffBanner(message: message, tone: .error, retry: retry)
        lastFeedback = StaffFeedbackEvent(kind: .error, announcement: message)
    }

    private func applyPersistedRow(_ persisted: StaffBookingRow) {
        guard var current = lastRead else { return }
        var updated = persisted
        if let index = current.read.bookings.firstIndex(where: { $0.id == persisted.id }) {
            // Preserve the embedded notification log when a minimal update response omits it.
            if updated.notification_log == nil {
                updated.notification_log = current.read.bookings[index].notification_log
            }
            current.read.bookings[index] = updated
        } else if persisted.booking_date == current.date {
            current.read.bookings.append(updated)
        }
        lastRead = current
        if current.date == date {
            state = .loaded(StaffDaySelector.snapshot(read: current.read, date: current.date, now: clock()))
        }
    }

    private func handleCollectionPromptAfterReady(booking: StaffBooking) {
        let dayBookings = currentDayBookings()
        let readiness = StaffCollectionNotice.readiness(
            bookings: dayBookings,
            ownerId: booking.ownerId,
            currentBookingId: booking.id
        )
        if !readiness.waitingDogNames.isEmpty {
            let ready = readiness.readyDogNames.isEmpty ? [StaffDaySelector.dogName(booking)] : readiness.readyDogNames
            let held = StaffCollectionNotice.heldMessage(readyDogNames: ready, waitingDogNames: readiness.waitingDogNames)
            banner = StaffBanner(message: held, tone: .info, undo: banner?.undo)
            lastFeedback = StaffFeedbackEvent(kind: .warning, announcement: held)
            return
        }
        let names = readiness.readyDogNames.isEmpty ? [StaffDaySelector.dogName(booking)] : readiness.readyDogNames
        collectionPrompt = StaffCollectionPrompt(
            bookingId: booking.id,
            date: booking.date,
            ownerId: booking.ownerId,
            readyDogNames: names
        )
    }

    /// Mirrors `reopenHeldNotice` in `useBookings.ts`: if marking a sibling No-show
    /// released the last blocker on another Ready dog of the same owner, open the
    /// collection notice for those ready dogs so the notice is never stranded.
    private func reopenHeldCollectionPromptIfReady(releasedBy booking: StaffBooking) {
        guard let ownerId = booking.ownerId, !ownerId.isEmpty else { return }
        let dayBookings = currentDayBookings()
        guard let readySibling = dayBookings.first(where: {
            $0.id != booking.id && $0.ownerId == ownerId && $0.status == StaffDayStack.ready
        }) else {
            return
        }
        let readiness = StaffCollectionNotice.readiness(
            bookings: dayBookings,
            ownerId: ownerId,
            currentBookingId: readySibling.id
        )
        guard readiness.waitingDogNames.isEmpty else { return }
        let names = readiness.readyDogNames.isEmpty ? [StaffDaySelector.dogName(readySibling)] : readiness.readyDogNames
        collectionPrompt = StaffCollectionPrompt(
            bookingId: readySibling.id,
            date: readySibling.date,
            ownerId: ownerId,
            readyDogNames: names
        )
    }

    private func currentDayBookings() -> [StaffBooking] {
        guard let lastRead, lastRead.date == date else { return [] }
        return StaffDaySelector.bookings(from: lastRead.read).filter { $0.date == date }
    }
}
