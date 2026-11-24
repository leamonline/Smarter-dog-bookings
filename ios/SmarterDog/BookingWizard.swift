import Foundation

// The booking wizard's state and rules, with no screens. Pure Foundation, so Linux CI
// tests it. The five steps match the website: dog, service, date, time, summary
// ("Select dogs", "Choose services", "Pick a date", "Choose a time", "Confirm booking").
// This first version books ONE dog; several dogs are a later slice.
//
// Nothing here talks to the network and nothing here sends a booking. The screens will
// read this state and call these methods; the database still decides what is allowed.

// MARK: - Dogs

/// What the customer is told when a dog cannot be picked. Words from the website's dog step.
enum BookingDogBlocker: Equatable, Sendable {
    case pregnant
    case sizeUnconfirmed

    var note: String {
        switch self {
        case .pregnant: "Pregnant — message us below"
        case .sizeUnconfirmed: "Size not confirmed — message us first"
        }
    }
}

/// One dog on the first step. A dog the salon has not sized, or a pregnant dog, is shown but cannot
/// be chosen. The database enforces both (`dog_size_unconfirmed`, and the pregnancy gate), so
/// this is only the preflight that saves the customer a refusal.
struct BookingDog: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let breed: String
    /// The salon-confirmed size, or nil until staff confirm it. What the customer said when
    /// they added the dog is only a hint, and is not used here.
    let confirmedSize: DogSize?
    let isPregnant: Bool

    /// Pregnancy wins: a pregnant dog needs a chat first even once it has a size.
    var blocker: BookingDogBlocker? {
        if isPregnant { return .pregnant }
        if confirmedSize == nil { return .sizeUnconfirmed }
        return nil
    }

    var isBookable: Bool { blocker == nil }
}

/// A row of `dogs` with the pregnancy flag, as Row Level Security returns it for this customer.
struct BookingDogRow: Decodable, Equatable, Sendable {
    var id: String
    var name: String?
    var breed: String?
    var size: String?
    var is_pregnant: Bool?
}

enum BookingDogs {
    /// Every dog, sorted by name, with those that cannot be booked marked rather than hidden.
    static func make(from rows: [BookingDogRow]) -> [BookingDog] {
        rows
            .map { row in
                BookingDog(
                    id: row.id,
                    name: nonEmpty(row.name) ?? "Your dog",
                    breed: nonEmpty(row.breed) ?? "",
                    confirmedSize: row.size.flatMap { DogSize(rawValue: $0.lowercased()) },
                    isPregnant: row.is_pregnant ?? false
                )
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private static func nonEmpty(_ text: String?) -> String? {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }
}

// MARK: - Steps

enum BookingStep: Int, CaseIterable, Comparable, Sendable {
    case dog, service, date, time, summary

    static func < (lhs: BookingStep, rhs: BookingStep) -> Bool { lhs.rawValue < rhs.rawValue }

    /// The website's heading for each step.
    var title: String {
        switch self {
        case .dog: "Select dogs"
        case .service: "Choose services"
        case .date: "Pick a date"
        case .time: "Choose a time"
        case .summary: "Confirm booking"
        }
    }
}

enum BookingWizardError: Error, Equatable {
    case dogNotBookable
    case serviceNotOffered
    case unknownAddOn(String)
    case dateOutsideTheWindow
    case timeNotOffered
    case notFinished
}

/// What the summary step shows, in the customer's words. No price yet: prices come from the
/// salon's pricing settings, which the app does not read in this slice, and a guess would be
/// worse than saying nothing.
struct BookingSummary: Equatable, Sendable {
    var dogName: String
    var service: String
    var addOns: [String]
    /// For example "Tuesday 1 December".
    var dateText: String
    /// For example "09:30".
    var timeText: String
}

// MARK: - State

/// Where the customer is, and what they have chosen. A choice made earlier is dropped when a
/// later change makes it wrong: a different dog may change the size, so the time (which was
/// offered for the old size) is cleared; a different date clears the time. The service is
/// kept unless the new dog's size cannot have it.
///
/// A chosen time is only as fresh as the list it was picked from. Re-read availability before
/// anything is sent (step 4).
struct BookingWizardState: Equatable, Sendable {
    private(set) var step: BookingStep = .dog
    private(set) var dog: BookingDog?
    private(set) var service: BookingService?
    private(set) var addOns: [String] = []
    private(set) var date: String?
    private(set) var time: String?

    init() {}

    // MARK: choices

    mutating func choose(dog newDog: BookingDog) throws {
        guard newDog.isBookable else { throw BookingWizardError.dogNotBookable }
        if dog?.id == newDog.id { return }
        dog = newDog
        // The size may differ, so what was offered for the old dog no longer holds.
        time = nil
        if let service, let size = newDog.confirmedSize, !service.isOffered(forSize: size.rawValue) {
            self.service = nil
            addOns = []
        }
    }

    mutating func choose(service newService: BookingService) throws {
        guard let size = dog?.confirmedSize, newService.isOffered(forSize: size.rawValue) else {
            throw BookingWizardError.serviceNotOffered
        }
        service = newService
    }

    mutating func setAddOn(_ name: String, on: Bool) throws {
        guard BookingService.addOns.contains(name) else { throw BookingWizardError.unknownAddOn(name) }
        var chosen = Set(addOns)
        if on { chosen.insert(name) } else { chosen.remove(name) }
        // Kept in the salon's order, not the order they were ticked.
        addOns = BookingService.addOns.filter { chosen.contains($0) }
    }

    /// `window` is `BookingWindow.dates(now:horizonDays:)`.
    mutating func choose(date newDate: String, window: [String]) throws {
        guard window.contains(newDate) else { throw BookingWizardError.dateOutsideTheWindow }
        if date == newDate { return }
        date = newDate
        time = nil
    }

    /// Forgets the time, for when a fresh read shows it has gone.
    mutating func clearTime() {
        time = nil
    }

    /// Forgets the date and time, for when a change of dog makes the date unavailable.
    mutating func clearDate() {
        date = nil
        time = nil
    }

    /// `offered` is `CapacityEngine.offeredSlots(...)` for this dog on this date.
    mutating func choose(time newTime: String, offered: [String]) throws {
        guard offered.contains(newTime) else { throw BookingWizardError.timeNotOffered }
        time = newTime
    }

    // MARK: moving between steps

    /// Whether this step has what it needs to go on.
    func isComplete(_ step: BookingStep) -> Bool {
        switch step {
        case .dog: dog != nil
        case .service: service != nil
        case .date: date != nil
        case .time: time != nil
        case .summary: false
        }
    }

    var canContinue: Bool { isComplete(step) }

    /// The first step that is not finished: the furthest the customer can go.
    var furthestStep: BookingStep {
        BookingStep.allCases.first { !isComplete($0) } ?? .summary
    }

    @discardableResult
    mutating func next() -> Bool {
        guard canContinue, let following = BookingStep(rawValue: step.rawValue + 1) else { return false }
        step = following
        return true
    }

    @discardableResult
    mutating func back() -> Bool {
        guard let previous = BookingStep(rawValue: step.rawValue - 1) else { return false }
        step = previous
        return true
    }

    /// Tapping a finished step in the progress dots. Never past the first unfinished one.
    @discardableResult
    mutating func go(to target: BookingStep) -> Bool {
        guard target <= furthestStep else { return false }
        step = target
        return true
    }

    // MARK: finishing

    var isFinished: Bool {
        BookingStep.allCases.dropLast().allSatisfy { isComplete($0) }
    }

    var summary: BookingSummary? {
        guard isFinished, let dog, let service, let date, let time else { return nil }
        return BookingSummary(
            dogName: dog.name,
            service: service.rawValue,
            addOns: addOns,
            dateText: HomeSelector.dateText(date),
            timeText: HomeSelector.timeText(time)
        )
    }

    /// The arguments for `create_customer_booking_group`, built from what was chosen.
    /// Building it sends nothing.
    func request(gridSlots: [String] = BookingSlots.canonical) throws -> BookingRequest {
        guard isFinished, let dog, let size = dog.confirmedSize, let service, let date, let time else {
            throw BookingWizardError.notFinished
        }
        return try BookingRequest.make(
            date: date,
            choices: [BookingChoice(dogId: dog.id, confirmedSize: size.rawValue, service: service, addOns: addOns, slot: time)],
            gridSlots: gridSlots
        )
    }
}
