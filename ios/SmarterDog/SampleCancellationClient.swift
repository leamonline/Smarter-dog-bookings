#if DEBUG
import Foundation

/// Offline fixture for the real My bookings and cancellation views. Each run starts with fresh rows.
actor SampleCancellationClient: SalonHomeClient, SalonCancelClient {
    private var bookings: [BookingRow]
    private let dogs: [DogRow]
    private let interruptedBookingId: String
    private var interruptedRead = false
    private var interruptedWrite: (request: CancelRequest, receipt: CancelReceipt)?

    init(now: Date = Date()) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = HomeSelector.london
        func date(daysAhead: Int) -> String {
            HomeSelector.londonDate(calendar.date(byAdding: .day, value: daysAhead, to: now) ?? now)
        }

        let biscuit = DogRow(id: "biscuit", name: "Biscuit", breed: "Cockapoo", size: "medium", photo_path: nil)
        let moose = DogRow(id: "moose", name: "Moose", breed: "Newfoundland", size: "large", photo_path: nil)
        let pip = DogRow(id: "pip", name: "Pip", breed: "Cavapoo", size: "small", photo_path: nil)
        let groupId = UUID().uuidString
        let interruptedBookingId = UUID().uuidString
        self.interruptedBookingId = interruptedBookingId
        dogs = [biscuit, moose, pip]
        bookings = [
            BookingRow(id: UUID().uuidString, booking_date: date(daysAhead: 2), slot: "09:30",
                       service: "Full Groom", status: BookingStatusName.booked, dog_id: biscuit.id, group_id: groupId),
            BookingRow(id: UUID().uuidString, booking_date: date(daysAhead: 2), slot: "10:00",
                       service: "Bath & De-shed", status: BookingStatusName.booked, dog_id: moose.id, group_id: groupId),
            BookingRow(id: interruptedBookingId, booking_date: date(daysAhead: 4), slot: "11:00",
                       service: "Puppy Groom", status: BookingStatusName.booked, dog_id: pip.id),
            BookingRow(id: UUID().uuidString, booking_date: date(daysAhead: 6), slot: "12:00",
                       service: "Full Groom", status: BookingStatusName.reconfirmed, dog_id: biscuit.id),
        ]
    }

    func loadHome() async throws -> (bookings: [BookingRow], dogs: [DogRow]) {
        (bookings, dogs)
    }

    func cancelBooking(_ request: CancelRequest) async -> CancelSendResult {
        if let interruptedWrite, request == interruptedWrite.request {
            return .cancelled(interruptedWrite.receipt)
        }
        guard let row = bookings.first(where: { $0.id == request.p_booking_id }) else {
            return .refused(code: nil)
        }
        let visit = BookingCancel.visit(of: row, in: bookings)
        guard visit.allSatisfy({ $0.status == BookingStatusName.booked }) else {
            return .refused(code: nil)
        }
        let ids = visit.map(\.id)
        for index in bookings.indices where ids.contains(bookings[index].id) {
            bookings[index].status = BookingStatusName.cancelled
        }
        let receipt = CancelReceipt(
            target_booking_id: row.id,
            booking_group_id: row.group_id,
            cancelled_booking_ids: ids,
            cancelled_count: ids.count,
            cancelled_at: ISO8601DateFormatter().string(from: Date())
        )
        if row.id == interruptedBookingId {
            // The write succeeds, but its response and the immediate reconciliation read are lost.
            interruptedWrite = (request, receipt)
            interruptedRead = true
            return .unknown
        }
        return .cancelled(receipt)
    }

    func reloadBooking(id: String) async -> BookingRow? {
        if id == interruptedBookingId && interruptedRead {
            interruptedRead = false
            return nil
        }
        return bookings.first { $0.id == id }
    }
}
#endif
