import Foundation
import Supabase

/// Reads for the booking screens. Row Level Security returns only this customer's dogs.
/// Reads only: nothing here creates a booking.
final class SupabaseBookingClient: SalonBookingDataClient, Sendable {
    private let supabase: SupabaseClient

    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }

    static func make() -> SupabaseBookingClient? {
        guard let supabase = SalonClient.make() else { return nil }
        return SupabaseBookingClient(supabase: supabase)
    }

    func loadDogs() async throws -> [BookingDogRow] {
        try await supabase
            .from("dogs")
            .select("id,name,breed,size,is_pregnant")
            .execute()
            .value
    }

    // MARK: the date step
    //
    // Four customer-safe reads. None returns personal data: staff-only tables are read through
    // SECURITY DEFINER functions that return only dates, times, sizes and seat numbers.

    func loadRules() async -> Data? {
        do {
            return try await supabase.rpc("current_customer_booking_rules").execute().data
        } catch {
            return nil
        }
    }

    func loadCalendar(from: String, to: String) async -> SalonCalendar {
        async let open = read(OpenDayRow.self, "get_open_days", ["p_start": from, "p_end": to])
        async let occupancy = read(OccupancyRow.self, "get_occupancy_range", ["p_from": from, "p_to": to])
        async let blocked = blockedSeats(from: from, to: to)
        return await SalonCalendar(openRows: open, occupancyRows: occupancy, blockedRows: blocked)
    }

    func loadLastMinuteSlots() async -> [ImmediateSlotRow] {
        do {
            return try await supabase.rpc("get_immediate_slots").execute().value
        } catch {
            return []
        }
    }

    /// Two weeks at a time, as the website reads them. One failed piece fails the whole read.
    private func blockedSeats(from: String, to: String) async -> [BlockedSeatRow]? {
        var all: [BlockedSeatRow] = []
        for piece in DatePlanner.chunks(from: from, to: to) {
            guard let rows = await read(BlockedSeatRow.self, "get_blocked_seats", ["p_start": piece.from, "p_end": piece.to]) else {
                return nil
            }
            all += rows
        }
        return all
    }

    /// nil when the read failed, so the calendar can say it is incomplete rather than empty.
    private func read<Row: Decodable & Sendable>(_ type: Row.Type, _ function: String, _ params: [String: String]) async -> [Row]? {
        do {
            return try await supabase.rpc(function, params: params).execute().value
        } catch {
            return nil
        }
    }
}
