import Foundation
import Observation

/// What the staff Today screen asks the salon. The app uses Supabase
/// (`SupabaseStaffDayClient`); tests use a stand-in.
protocol StaffDayClient: Sendable {
    func loadDay(_ date: String) async throws -> StaffDayRead
}

/// The staff Today screen's state: which London date is showing, and what it holds.
/// Read only. Lives here rather than in the view so Linux CI can test it.
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

    private let client: StaffDayClient?
    private let clock: @Sendable () -> Date
    /// The last successful read, so the timing lines can move on each minute without a reload.
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

    /// Load the browsed date. Content already on screen for the same date stays up
    /// while it refreshes; a different date shows the loading state.
    func load() async {
        generation += 1
        let mine = generation
        let wanted = date
        guard let client else {
            state = .failed
            return
        }
        if case .loaded(let snapshot) = state, snapshot.date == wanted {
            // Pull to refresh: keep the day on screen.
        } else {
            state = .loading
        }
        do {
            let read = try await client.loadDay(wanted)
            guard mine == generation, wanted == date else { return }
            lastRead = (wanted, read)
            state = .loaded(StaffDaySelector.snapshot(read: read, date: wanted, now: clock()))
        } catch {
            guard mine == generation, wanted == date else { return }
            state = .failed
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

    private func show(_ newDate: String) async {
        guard newDate != date else {
            await load()
            return
        }
        date = newDate
        await load()
    }
}
