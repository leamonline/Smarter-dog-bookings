import Foundation
import Supabase

/// Reads for the staff Today screen: one London date's bookings with their reminder
/// log, the dogs and owners on them, and that date's `day_settings`. The same tables
/// the staff dashboard reads. Row Level Security returns them only to staff
/// (`is_staff()`). Reads only: nothing here inserts or updates a booking.
final class SupabaseStaffDayClient: StaffDayClient, Sendable {
    private let supabase: SupabaseClient

    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }

    static func make() -> SupabaseStaffDayClient? {
        SalonClient.make().map(SupabaseStaffDayClient.init)
    }

    func loadDay(_ date: String) async throws -> StaffDayRead {
        async let bookingRows: [StaffBookingRow] = supabase
            .from("bookings")
            .select(StaffBookingRow.select)
            .eq("booking_date", value: date)
            .order("slot")
            .execute()
            .value
        async let settingRows: [StaffDaySettingRow] = supabase
            .from("day_settings")
            .select(StaffDaySettingRow.select)
            .eq("setting_date", value: date)
            .limit(1)
            .execute()
            .value

        let bookings = try await bookingRows
        let dogIDs = Array(Set(bookings.compactMap(\.dog_id))).sorted()
        let dogs: [StaffDogRow] = dogIDs.isEmpty ? [] : try await supabase
            .from("dogs")
            .select(StaffDogRow.select)
            .in("id", values: dogIDs)
            .execute()
            .value
        let humanIDs = Array(Set(dogs.compactMap(\.human_id))).sorted()
        let humans: [StaffHumanRow] = humanIDs.isEmpty ? [] : try await supabase
            .from("humans")
            .select(StaffHumanRow.select)
            .in("id", values: humanIDs)
            .execute()
            .value
        return StaffDayRead(bookings: bookings, dogs: dogs, humans: humans, setting: try await settingRows.first)
    }
}
