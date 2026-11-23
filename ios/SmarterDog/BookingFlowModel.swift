import Foundation
import Observation

// What the booking screens read and call. Pure Foundation plus Observation, no UI and no
// Supabase, so Linux CI tests it. The screens are thin: they show this, and call this.
//
// It holds the wizard state (`BookingWizardState`) and loads the customer's dogs. Nothing
// here sends a booking.

/// What the booking screens ask the salon. The iPhone app uses Supabase. Tests and the
/// debug sample mode use a stand-in.
protocol SalonBookingDataClient: Sendable {
    /// The customer's own dogs, with the pregnancy flag. Row Level Security returns only theirs.
    func loadDogs() async throws -> [BookingDogRow]
}

@MainActor
@Observable
final class BookingFlowModel {
    enum DogsState: Equatable {
        case loading
        case loaded([BookingDog])
        /// The lookup failed. Never shown as "no dogs": the answer is unknown.
        case failed
    }

    private(set) var dogsState: DogsState = .loading
    private(set) var wizard = BookingWizardState()
    private let client: SalonBookingDataClient?

    init(client: SalonBookingDataClient?) {
        self.client = client
    }

    // MARK: reading

    var step: BookingStep { wizard.step }
    var canContinue: Bool { wizard.canContinue }
    var selectedDogId: String? { wizard.dog?.id }

    /// "Step 2 of 5".
    var stepCaption: String { "Step \(step.rawValue + 1) of \(BookingStep.allCases.count)" }

    var dogs: [BookingDog] {
        if case .loaded(let dogs) = dogsState { return dogs }
        return []
    }

    /// Whether to show the website's note about dogs the salon has not sized yet.
    var hasUnsizedDog: Bool { dogs.contains { $0.blocker == .sizeUnconfirmed } }

    /// Whether to show the website's note about pregnant dogs.
    var hasPregnantDog: Bool { dogs.contains { $0.blocker == .pregnant } }

    // MARK: loading

    func loadDogs() async {
        guard let client else {
            dogsState = .failed
            return
        }
        do {
            let loaded = BookingDogs.make(from: try await client.loadDogs())
            dogsState = .loaded(loaded)
            // A dog chosen earlier may have changed (now pregnant, or gone). Start again rather
            // than carry a choice the salon would now refuse.
            if let chosen = wizard.dog, loaded.first(where: { $0.id == chosen.id })?.isBookable != true {
                wizard = BookingWizardState()
            }
        } catch {
            dogsState = .failed
        }
    }

    // MARK: choosing and moving

    /// A dog that cannot be booked is ignored: the screen shows it disabled, and the
    /// wizard would refuse it anyway.
    func select(dog: BookingDog) {
        try? wizard.choose(dog: dog)
    }

    func next() { wizard.next() }
    func back() { wizard.back() }
}
