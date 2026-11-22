import Foundation

enum SalonLinks {
    static let book = URL(string: "https://smarterdog.co.uk/book")!
    static let whatsApp = URL(string: "https://wa.me/447873329440")!
}

struct SignInFailure: Error {
    let message: String
}

enum PhoneNext: Equatable {
    case password(display: String)
    case textCode(display: String)
    case unknown(display: String)
}

struct AccountCard: Equatable {
    var name: String
    var roleLabel: String
}

enum ApprovalHold: Equatable {
    /// Submitted Join the Pack and waiting for the salon.
    case waiting
    /// The name matched someone already on the books.
    case claimsExisting
    /// Phone is verified but the Join the Pack questions are still on the website.
    case finishOnTheWebsite
}

struct PendingAccount: Equatable {
    var name: String
    var showsName: Bool
    var hold: ApprovalHold
}

enum SessionPhase: Equatable {
    case restoring
    case needsConfiguration
    case signedOut
    case resolving
    case customer(AccountCard)
    case staff(AccountCard)
    case pending(PendingAccount)
    case staffDenied(email: String)
    case accountMissing
    case accountError(String)
}

enum PersonName {
    static func joined(name: String?, surname: String?, fallback: String) -> String {
        let parts = [name, surname]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? fallback : parts.joined(separator: " ")
    }

    static func hasRealName(name: String?, surname: String?) -> Bool {
        let joined = joined(name: name, surname: surname, fallback: "")
        return !joined.isEmpty
    }
}
