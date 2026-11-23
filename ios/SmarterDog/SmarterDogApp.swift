import SwiftUI

@main
struct SmarterDogApp: App {
    @State private var auth = AuthService.connected()

    init() {
        AppFont.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if CommandLine.arguments.contains("-sampleHome") {
                // Debug only: the customer Home with made-up data, no sign-in and no network.
                let account = AccountCard(name: "Sam Taylor", roleLabel: "Customer")
                CustomerHomeView(
                    account: account,
                    auth: AuthService(previewPhase: .customer(account)),
                    client: SampleHomeClient()
                )
            } else if CommandLine.arguments.contains("-sampleBooking") {
                // Debug only: the booking screens with made-up dogs, no sign-in and no network.
                NavigationStack { BookingFlowView(client: SampleBookingClient()) }
            } else {
                RootView(auth: auth)
            }
            #else
            RootView(auth: auth)
            #endif
        }
    }
}

#if DEBUG
/// Made-up bookings and dogs for screenshots. Compiled into Debug builds only.
struct SampleHomeClient: SalonHomeClient {
    func loadHome() async throws -> (bookings: [BookingRow], dogs: [DogRow]) {
        let today = HomeSelector.londonDate(Date())
        let later = HomeSelector.londonDate(Date().addingTimeInterval(8 * 86_400))
        let dogs = [
            DogRow(id: "d1", name: "Biscuit", breed: "Cockapoo", size: "medium", photo_path: nil),
            DogRow(id: "d2", name: "Moose", breed: "Newfoundland", size: "large", photo_path: nil),
        ]
        let bookings = [
            BookingRow(id: "b1", booking_date: today, slot: "09:30", service: "Full Groom", status: "Arrived", dog_id: "d1"),
            BookingRow(id: "b2", booking_date: later, slot: "12:00", service: "Bath & De-shed", status: "Booked", dog_id: "d2"),
        ]
        return (bookings, dogs)
    }
}

/// Made-up dogs for booking screenshots, covering every state of the dog step.
/// Compiled into Debug builds only.
struct SampleBookingClient: SalonBookingDataClient {
    func loadDogs() async throws -> [BookingDogRow] {
        [
            BookingDogRow(id: "d1", name: "Biscuit", breed: "Cockapoo", size: "medium", is_pregnant: false),
            BookingDogRow(id: "d2", name: "Moose", breed: "Newfoundland", size: "large", is_pregnant: false),
            BookingDogRow(id: "d3", name: "Pip", breed: "Cavapoo", size: nil, is_pregnant: false),
            BookingDogRow(id: "d4", name: "Bella", breed: "Poodle", size: "small", is_pregnant: true),
        ]
    }
}
#endif
