import Foundation
import Supabase

/// Reads for the customer Home screen. Row Level Security returns only this
/// customer's dogs and bookings, so there is no human id to send. Reads only:
/// nothing here inserts or updates a booking.
final class SupabaseHomeClient: SalonHomeClient, Sendable {
    private let supabase: SupabaseClient

    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }

    static func make() -> SupabaseHomeClient? {
        guard let supabase = SalonClient.make() else { return nil }
        return SupabaseHomeClient(supabase: supabase)
    }

    func loadHome() async throws -> (bookings: [BookingRow], dogs: [DogRow]) {
        // The salon's own date, so a visit this evening is still "today".
        let today = HomeSelector.londonDate(Date())
        async let dogs: [DogRow] = supabase
            .from("dogs")
            .select("id,name,breed,size,photo_path")
            .execute()
            .value
        async let bookings: [BookingRow] = supabase
            .from("bookings")
            .select("id,booking_date,slot,service,status,dog_id")
            .gte("booking_date", value: today)
            .order("booking_date")
            .order("slot")
            .execute()
            .value
        return try await (bookings: bookings, dogs: dogs)
    }
}
