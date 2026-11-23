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
}
