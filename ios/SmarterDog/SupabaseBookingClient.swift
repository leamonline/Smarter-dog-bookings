import Foundation
import Supabase

/// Reads for the booking screens, and the two writes (making and cancelling a booking), which are
/// reached only from the Debug-only staging mode. Row Level Security returns only this customer's rows.
final class SupabaseBookingClient: SalonBookingDataClient, SalonCancelClient, Sendable {
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

    // MARK: sending a booking
    //
    // The first write. It goes through `create_customer_booking_group` only:
    // customers cannot insert into `bookings` directly, and the database's three gates (calendar,
    // capacity, pregnancy) apply to it whatever sends it.
    //
    // It is sent as a plain web request rather than through the Supabase library, so the answer is read by
    // `BookingWire`, which is tested against real answers: the refusal wording depends on the
    // database's own `details` code, and the library's error type has changed between versions.

    func createBooking(_ request: BookingRequest) async -> BookingSendResult {
        guard let body = try? JSONEncoder().encode(request) else { return .notSent }
        switch await post(rpc: "rest/v1/rpc/create_customer_booking_group", body: body) {
        case .notSent: return .notSent
        case .unknown: return .unknown
        case .answered(let status, let data): return BookingWire.sendResult(status: status, body: data)
        }
    }

    // MARK: cancelling a booking
    //
    // The second write, behind the same Debug-only staging switch as booking. It goes through
    // `cancel_customer_booking` only, which decides ownership, the rest of the visit and the
    // salon's policy itself. Its answer is read by `CancelWire`, which checks the receipt names
    // the booking asked about.

    func cancelBooking(_ request: CancelRequest) async -> CancelSendResult {
        guard let body = try? JSONEncoder().encode(request) else { return .notSent }
        switch await post(rpc: "rest/v1/rpc/cancel_customer_booking", body: body) {
        case .notSent: return .notSent
        case .unknown: return .unknown
        case .answered(let status, let data):
            return CancelWire.sendResult(status: status, body: data, bookingId: request.p_booking_id)
        }
    }

    /// The booking as the server holds it now, to settle a cancel whose reply never arrived.
    /// Row Level Security returns only this customer's. Nil when it was not found or the read failed.
    func reloadBooking(id: String) async -> BookingRow? {
        do {
            let rows: [BookingRow] = try await supabase
                .from("bookings")
                .select("id,booking_date,slot,service,status,dog_id,group_id")
                .eq("id", value: id)
                .execute()
                .value
            return rows.first
        } catch {
            return nil
        }
    }

    private enum PostResult {
        /// Nothing left the phone.
        case notSent
        /// It may have arrived, and no answer came back.
        case unknown
        case answered(status: Int, body: Data)
    }

    /// The one plain web request in the app, shared by the two writes.
    private func post(rpc path: String, body: Data) async -> PostResult {
        // Everything up to the send can fail without anything leaving the phone.
        guard let base = URL(string: SupabaseConfig.urlString) else { return .notSent }
        let token: String
        do {
            token = try await supabase.auth.session.accessToken
        } catch {
            return .notSent
        }
        var urlRequest = URLRequest(url: base.appendingPathComponent(path))
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = 30
        urlRequest.httpBody = body
        urlRequest.setValue(SupabaseConfig.publishableKey, forHTTPHeaderField: "apikey")
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await URLSession.shared.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse else { return .unknown }
            return .answered(status: http.statusCode, body: data)
        } catch let error as URLError {
            // A connection that was never made means nothing was sent. A timeout or a dropped
            // connection might have come after the request arrived, so that is unknown.
            return BookingWire.neverLeftThePhone(error.code) ? .notSent : .unknown
        } catch {
            return .unknown
        }
    }

    private static let bookedColumns = "id,booking_date,slot,service,status,deposit_required,deposit_amount"

    /// Reads back bookings just created, for the confirmation and the deposit. Row Level Security
    /// returns only this customer's. Nil when the read fails.
    func loadBookings(ids: [String]) async -> [BookedRow]? {
        guard !ids.isEmpty else { return [] }
        do {
            return try await supabase
                .from("bookings")
                .select(Self.bookedColumns)
                .in("id", values: ids)
                .execute()
                .value
        } catch {
            return nil
        }
    }

    /// Looks for this dog's bookings on a date, to learn what happened when the reply never arrived.
    /// It returns every row, cancelled ones included: `BookingConfirm.matching` decides what is live,
    /// with tested code, and a database filter on status would also hide a row with no status.
    /// Nil when the lookup fails.
    func findBookings(dogId: String, date: String) async -> [BookedRow]? {
        do {
            return try await supabase
                .from("bookings")
                .select(Self.bookedColumns)
                .eq("dog_id", value: dogId)
                .eq("booking_date", value: date)
                .execute()
                .value
        } catch {
            return nil
        }
    }
}

