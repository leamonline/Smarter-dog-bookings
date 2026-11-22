import Foundation

// What the My dogs screen reads and sends. Pure Foundation, no UI and no
// Supabase, so Linux CI can test it. Writes go through `create_customer_dog`
// and `update_customer_dog` only, never a table insert.

/// One row of `dogs`, as Row Level Security returns it for this customer.
struct DogDetailRow: Decodable, Equatable, Sendable {
    var id: String
    var name: String?
    var breed: String?
    /// The salon's confirmed size. The customer never sets this.
    var size: String?
    /// What the customer said. Staff use it as a hint, not as the size.
    var reported_size: String?
    /// `yyyy-MM-dd`, or nil.
    var dob: String?
    var human_id: String?
}

/// What the form holds. Sizes are the database words: small, medium, large.
struct DogDraft: Equatable, Sendable {
    var name = ""
    var breed = ""
    var reportedSize: String?
    /// `yyyy-MM-dd`, or nil when not given.
    var dob: String?

    init() {}

    init(row: DogDetailRow) {
        name = row.name ?? ""
        breed = row.breed ?? ""
        reportedSize = DogDraftCheck.allowedSizes.contains(row.reported_size ?? "") ? row.reported_size : nil
        dob = row.dob.flatMap { $0.isEmpty ? nil : String($0.prefix(10)) }
    }
}

enum DogDraftCheck {
    static let allowedSizes = ["small", "medium", "large"]
    static let maxNameLength = 60
    static let maxBreedLength = 80

    /// Plain words for the first thing wrong, or nil when the draft can be sent.
    static func problem(_ draft: DogDraft, today: String) -> String? {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "Please enter your dog's name." }
        if name.count > maxNameLength { return "That name is too long." }
        if draft.breed.trimmingCharacters(in: .whitespacesAndNewlines).count > maxBreedLength {
            return "That breed is too long."
        }
        if let size = draft.reportedSize, !allowedSizes.contains(size) {
            return "Please choose small, medium or large."
        }
        if let dob = draft.dob, dob > today {
            return "A birthday can't be in the future."
        }
        return nil
    }

    /// `yyyy-MM-dd` for a calendar date picked on the phone, in the phone's calendar.
    static func isoDate(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func date(fromISO iso: String, calendar: Calendar = .current) -> Date? {
        let pieces = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard pieces.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: pieces[0], month: pieces[1], day: pieces[2], hour: 12))
    }
}

struct DogListItem: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let breed: String
    let sizeLetter: String?
    /// For example "You said: medium" while staff have not confirmed a size.
    let sizeNote: String?
    let draft: DogDraft
}

enum DogsSelector {
    static func items(from rows: [DogDetailRow]) -> [DogListItem] {
        rows
            .map { row in
                let letter = HomeSelector.sizeLetter(row.size)
                let reported = DogDraftCheck.allowedSizes.contains(row.reported_size ?? "") ? row.reported_size : nil
                return DogListItem(
                    id: row.id,
                    name: nonEmpty(row.name) ?? "Your dog",
                    breed: nonEmpty(row.breed) ?? "",
                    sizeLetter: letter,
                    sizeNote: letter == nil ? reported.map { "You said: \($0). The salon will confirm." } : nil,
                    draft: DogDraft(row: row)
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

/// What the My dogs screen asks the salon. The iPhone app uses Supabase. Tests use a stand-in.
protocol SalonDogsClient: Sendable {
    func loadDogs() async throws -> [DogDetailRow]
    /// The signed-in customer's own `humans` id, which `create_customer_dog` checks.
    func ownHumanId() async throws -> String?
    func addDog(_ draft: DogDraft, humanId: String) async throws
    func updateDog(id: String, _ draft: DogDraft) async throws
}
