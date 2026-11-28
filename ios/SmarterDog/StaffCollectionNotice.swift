import Foundation
import Observation

// Pure rules and state for the opt-in "Ready for collection" messaging prompt.
// Mirrors `src/engine/collectionNotice.ts`, `supabase/functions/_shared/channelPolicy.ts`,
// `supabase/functions/_shared/collectionFallback.ts`, `src/constants/whatsappTemplates.js`,
// and `CollectionNoticeModal.jsx`.
//
// Mark ready NEVER sends a message by itself (ST-8). Staff explicitly choose
// "Send message" or "Not now". When an owner has another dog still being groomed
// on the same date, the notice is held until all of their dogs in the salon are ready.

struct StaffCollectionContact: Decodable, Identifiable, Equatable, Sendable {
    var id: String
    var name: String?
    var surname: String?
    var phone: String?
    var whatsapp: Bool?
    var whatsapp_opted_out: Bool?
    var sms_opted_out: Bool?

    /// Mirrors `CONTACT_CARD_COLS` in `src/supabase/repositories/humansRepo.ts`.
    static let select = "id,name,surname,phone,whatsapp,whatsapp_opted_out,sms_opted_out"

    var displayName: String {
        let full = "\(name ?? "") \(surname ?? "")".trimmingCharacters(in: .whitespacesAndNewlines)
        return full.isEmpty ? "this contact" : full
    }
}

struct StaffTrustedContactLink: Decodable, Equatable, Sendable {
    var trusted_id: String?
    var relationship: String?

    static let select = "trusted_id,relationship"
}

enum StaffSmsFallbackReason: String, Equatable, Sendable {
    case whatsappUnreachable = "whatsapp_unreachable"
    case whatsappOptedOut = "whatsapp_opted_out"
    case smsPreferred = "sms_preferred"
}

enum StaffCollectionRoute: Equatable, Sendable {
    case whatsapp
    case sms(because: StaffSmsFallbackReason)
    case blocked(reason: String)

    var channel: String? {
        switch self {
        case .whatsapp: "whatsapp"
        case .sms: "sms"
        case .blocked: nil
        }
    }
}

struct StaffCollectionRecipient: Identifiable, Equatable, Sendable {
    let id: String
    let displayName: String
    let relationship: String
    let isOwner: Bool
    let contact: StaffCollectionContact
    let route: StaffCollectionRoute
}

struct StaffCollectionReadiness: Equatable, Sendable {
    /// Dogs to name in the message, in the order encountered.
    let readyDogNames: [String]
    /// Dogs still in the salon and not yet ready. Non-empty means hold the notice.
    let waitingDogNames: [String]
}

/// Identifies a collection-notice prompt sheet opened after Mark ready (or after a
/// sibling hold is released). Uses a fresh UUID so re-opening for the same booking
/// always starts a fresh prompt.
struct StaffCollectionPrompt: Identifiable, Equatable, Sendable {
    let id: UUID
    let bookingId: String
    let date: String
    let ownerId: String?
    let readyDogNames: [String]

    init(id: UUID = UUID(), bookingId: String, date: String, ownerId: String?, readyDogNames: [String]) {
        self.id = id
        self.bookingId = bookingId
        self.date = date
        self.ownerId = ownerId
        self.readyDogNames = readyDogNames
    }
}

/// The exact payload sent to `whatsapp-send` or `sms-send` in template mode.
enum StaffCollectionSendRequest: Equatable, Sendable {
    case whatsapp(to: String, templateName: String, language: String, params: [String], humanId: String, bookingId: String)
    case sms(to: String, text: String, templateName: String, humanId: String, bookingId: String)
}

/// The delivery verdict mirrored onto notification_log by the database.
struct StaffCollectionDeliveryRow: Decodable {
    let booking_id: String?
    let human_id: String
    let trigger_type: String
    let channel: String
    let status: String
    let error_message: String?
    let provider_message_id: String?

    static let select = "booking_id,human_id,trigger_type,channel,status,error_message,provider_message_id"
}

enum StaffCollectionSendOutcome: Equatable {
    case accepted(recorded: Bool, replayed: Bool = false)
    case notSent(String)
    case unknown
}

struct StaffCollectionFunctionReply: Decodable {
    let ok: Bool?
    let recorded: Bool?
    let replayed: Bool?
    let outcome: String?
    let error: String?
    let detail: String?

    func result(status: Int) -> StaffCollectionSendOutcome {
        if (200..<300).contains(status), ok == true {
            return .accepted(recorded: recorded == true, replayed: replayed == true)
        }
        if outcome == "not_sent" || (status == 409 && outcome == nil && error != nil) {
            return .notSent(detail ?? error ?? "The message was not sent.")
        }
        return .unknown
    }
}

/// Keeps accepted and ambiguous attempts locked across sheets on this Today
/// screen. A server-side claim is required to enforce this across devices.
@MainActor
@Observable
final class StaffCollectionAttempts {
    enum State: Equatable { case sending, accepted, unknown }

    private struct Key: Hashable {
        let date: String
        let owner: String
        let recipient: String
    }

    private var attempts: [Key: State] = [:]

    func state(for prompt: StaffCollectionPrompt, recipient: String) -> State? {
        attempts[Key(date: prompt.date, owner: prompt.ownerId ?? prompt.bookingId, recipient: recipient)]
    }

    func set(_ state: State?, for prompt: StaffCollectionPrompt, recipient: String) {
        attempts[Key(date: prompt.date, owner: prompt.ownerId ?? prompt.bookingId, recipient: recipient)] = state
    }
}

enum StaffCollectionNotice {
    /// Meta-approved Utility template (`src/constants/whatsappTemplates.js`).
    static let whatsappTemplateName = "ready_for_collection_v2"
    static let whatsappTemplateLanguage = "en_GB"
    /// Audit name written beside SMS sends (`src/components/modals/collection-notice/CollectionNoticeModal.jsx`).
    static let smsTemplateName = "ready_for_collection_sms"

    /// Mirrors `blocksCollectionNotice` in `src/engine/collectionNotice.ts`.
    static func blocksCollectionNotice(status: String?) -> Bool {
        let value = status ?? ""
        return value != StaffDayStack.ready
            && value != StaffDayStack.completed
            && value != StaffDayStack.cancelled
            && value != StaffDayStack.noShow
    }

    /// Mirrors `releasesHeldNotice` in `src/engine/collectionNotice.ts` for an in-place
    /// status change on the same owner and date.
    static func releasesHeldNotice(beforeStatus: String?, afterStatus: String?) -> Bool {
        guard blocksCollectionNotice(status: beforeStatus) else { return false }
        guard afterStatus != StaffDayStack.ready else { return false }
        return !blocksCollectionNotice(status: afterStatus)
    }

    /// Mirrors `collectionNoticeReadiness` in `src/engine/collectionNotice.ts`.
    static func readiness(
        bookings: [StaffBooking],
        ownerId: String?,
        currentBookingId: String
    ) -> StaffCollectionReadiness {
        let relevant: [StaffBooking]
        if let ownerId, !ownerId.isEmpty {
            relevant = bookings.filter { $0.ownerId == ownerId }
        } else {
            relevant = bookings.filter { $0.id == currentBookingId }
        }

        var ready: [String] = []
        var waiting: [String] = []
        func pushUnique(_ list: inout [String], _ name: String) {
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !list.contains(trimmed) else { return }
            list.append(trimmed)
        }

        for booking in relevant {
            if booking.id == currentBookingId || booking.status == StaffDayStack.ready {
                pushUnique(&ready, booking.dogName)
            } else if blocksCollectionNotice(status: booking.status) {
                pushUnique(&waiting, booking.dogName)
            }
        }
        return StaffCollectionReadiness(readyDogNames: ready, waitingDogNames: waiting)
    }

    /// Mirrors `isSmsCapableNumber` in `supabase/functions/_shared/channelPolicy.ts`.
    static func isSmsCapableNumber(_ phone: String?) -> Bool {
        guard let raw = phone else { return false }
        let stripped = String(raw.unicodeScalars.filter { scalar in
            if scalar.properties.generalCategory == .format { return false }
            if CharacterSet.whitespacesAndNewlines.contains(scalar) { return false }
            if CharacterSet(charactersIn: "-().").contains(scalar) { return false }
            return true
        })
        guard !stripped.isEmpty else { return false }

        var e164 = stripped
        if stripped.hasPrefix("00") {
            e164 = "+" + String(stripped.dropFirst(2))
        } else if wholeMatch("^07\\d{9}$", stripped) {
            e164 = "+44" + String(stripped.dropFirst(1))
        } else if wholeMatch("^447\\d{9}$", stripped) {
            e164 = "+" + stripped
        }
        guard e164.hasPrefix("+") else { return false }
        if e164.hasPrefix("+440") {
            e164 = "+44" + String(e164.dropFirst(4))
        }
        if e164.hasPrefix("+44") {
            return wholeMatch("^\\+447\\d{9}$", e164)
        }
        return wholeMatch("^\\+\\d{8,15}$", e164)
    }

    /// Mirrors `collectionNoticeRoute` in `src/engine/collectionNotice.ts`.
    /// Mirrors the website's latest live failure and three distinct undeliverable sends.
    /// Call with notification_log rows in reverse chronological order.
    static func unreachableRecipients(in rows: [StaffCollectionDeliveryRow]) -> Set<String> {
        struct Notification: Hashable {
            let booking: String
            let trigger: String
            let recipient: String
        }

        var seenNotifications: Set<Notification> = []
        var liveFailures: Set<String> = []
        for row in rows {
            guard let booking = row.booking_id else { continue }
            let key = Notification(booking: booking, trigger: row.trigger_type, recipient: row.human_id)
            if seenNotifications.insert(key).inserted, row.status == "failed" {
                liveFailures.insert(row.human_id)
            }
        }

        return Set(liveFailures.filter { recipient in
            var messageIDs: Set<String> = []
            var distinct: [StaffCollectionDeliveryRow] = []
            for row in rows where row.human_id == recipient && row.channel == "whatsapp" {
                if let messageID = row.provider_message_id, !messageID.isEmpty,
                   !messageIDs.insert(messageID).inserted { continue }
                distinct.append(row)
                if distinct.count == 3 { break }
            }
            return distinct.count == 3 && distinct.allSatisfy {
                $0.status == "failed" && wholeMatch("\\b131026\\b", $0.error_message ?? "")
            }
        })
    }

    static func route(
        for contact: StaffCollectionContact?,
        whatsappUnreachable: Bool = false
    ) -> StaffCollectionRoute {
        guard let contact, !PhoneNumber.normaliseUKMobile(contact.phone ?? "").isEmpty else {
            return .blocked(reason: "No mobile number on file")
        }
        let whatsappOptedOut = contact.whatsapp_opted_out == true
        let prefersSms = contact.whatsapp != true

        if !prefersSms && !whatsappOptedOut && !whatsappUnreachable {
            return .whatsapp
        }

        if !isSmsCapableNumber(contact.phone) {
            return .blocked(reason: "That number can't receive texts (it may be a landline)")
        }
        if contact.sms_opted_out == true {
            if whatsappOptedOut {
                return .blocked(reason: "Opted out of WhatsApp and SMS")
            }
            if whatsappUnreachable {
                return .blocked(reason: "Not on WhatsApp, and opted out of SMS")
            }
            return .blocked(reason: "Prefers SMS, and opted out of SMS")
        }

        let reason: StaffSmsFallbackReason
        if whatsappOptedOut {
            reason = .whatsappOptedOut
        } else if whatsappUnreachable {
            reason = .whatsappUnreachable
        } else {
            reason = .smsPreferred
        }
        return .sms(because: reason)
    }

    /// Mirrors `joinNames` in `src/lib/reminders/templates.js`.
    static func joinNames(_ names: [String]) -> String {
        let list = names.filter { !$0.isEmpty }
        guard !list.isEmpty else { return "" }
        if list.count == 1 { return list[0] }
        return list.dropLast().joined(separator: ", ") + " and " + list[list.count - 1]
    }

    /// Mirrors `titleCase` in `src/utils/text.ts` (`/\b\w/g`).
    static func titleCase(_ text: String) -> String {
        guard !text.isEmpty else { return "" }
        var result = ""
        var previousIsWord = false
        for char in text {
            let isWord = char.isLetter || char.isNumber || char == "_"
            if isWord && !previousIsWord {
                result.append(contentsOf: String(char).uppercased())
            } else {
                result.append(char)
            }
            previousIsWord = isWord
        }
        return result
    }

    static func formattedDogNames(_ names: [String]) -> String {
        let joined = joinNames(names.map(titleCase))
        return joined.isEmpty ? "Your dog" : joined
    }

    /// Mirrors `ready_for_collection_v2.preview` in `src/constants/whatsappTemplates.js`.
    static func whatsappPreview(dogNames: [String], minutes: String) -> String {
        let dogs = formattedDogNames(dogNames)
        let trimmedMinutes = minutes.trimmingCharacters(in: .whitespacesAndNewlines)
        let mins = trimmedMinutes.isEmpty ? "__" : trimmedMinutes
        return "Hi! 🐾 We've finished pampering \(dogs) and they're ready to head home in \(mins) mins. See you soon 🎓🐶❤️ X"
    }

    /// Mirrors `collectionSmsText` in `supabase/functions/_shared/collectionFallback.ts`.
    static func smsText(dogNames: [String], minutes: String) -> String {
        let joined = joinNames(dogNames.map(titleCase))
        let dogs = joined.isEmpty ? "your dog" : joined
        let trimmedMinutes = minutes.trimmingCharacters(in: .whitespacesAndNewlines)
        let mins = trimmedMinutes.isEmpty ? "__" : trimmedMinutes
        return "Hi! We've finished pampering \(dogs) and they're ready to head home in \(mins) mins. See you soon! X - Smarter Dog Grooming"
    }

    /// Mirrors the toast shown when a sibling dog is still being groomed.
    static func heldMessage(readyDogNames: [String], waitingDogNames: [String]) -> String {
        let ready = joinNames(readyDogNames.map(titleCase))
        let waiting = joinNames(waitingDogNames.map(titleCase))
        let verb = waitingDogNames.count > 1 ? "are" : "is"
        return "\(ready) ready. Holding the message until \(waiting) \(verb) ready too."
    }

    /// Mirrors `routeNote` in `CollectionNoticeModal.jsx`.
    static func routeNote(_ route: StaffCollectionRoute, phone: String?) -> String {
        switch route {
        case .blocked(let reason):
            return reason
        case .whatsapp:
            return formatPhoneForDisplay(phone)
        case .sms(let reason):
            let number = formatPhoneForDisplay(phone)
            switch reason {
            case .smsPreferred:
                return "\(number) · Prefers SMS, will send as SMS"
            case .whatsappOptedOut:
                return "\(number) · Opted out of WhatsApp, will send as SMS"
            case .whatsappUnreachable:
                return "\(number) · Not on WhatsApp, will send as SMS"
            }
        }
    }

    /// Mirrors `formatPhoneForDisplay` in `src/utils/phone.js`.
    static func formatPhoneForDisplay(_ raw: String?) -> String {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        let normalised = PhoneNumber.normaliseUKMobile(trimmed)
        if !normalised.isEmpty {
            return PhoneNumber.nationalDisplay(from: normalised)
        }
        return trimmed
    }

    /// Mirrors `minutesValid` in `CollectionNoticeModal.jsx` (1–3 digits, > 0).
    static func isValidMinutes(_ raw: String) -> Bool {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard wholeMatch("^\\d{1,3}$", trimmed), let value = Int(trimmed) else { return false }
        return value > 0
    }

    private static func wholeMatch(_ pattern: String, _ value: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
}

/// Drives the two-step Ask → Compose collection notice sheet.
/// Lives in `AuthCore` so Linux CI tests opt-in, channel routing, duplicate-send lock
/// and failure recovery without Xcode.
@MainActor
@Observable
final class StaffCollectionNoticeModel {
    enum Step: Equatable {
        case ask
        case compose
    }

    enum ContactsState: Equatable {
        case idle
        case loading
        case unavailable(String)
        case failed(String)
        case loaded([StaffCollectionRecipient])
    }

    let prompt: StaffCollectionPrompt
    private(set) var step: Step = .ask
    var minutes: String = "15"
    private(set) var contactsState: ContactsState = .idle
    private(set) var sendingRecipientID: String?
    private(set) var sentRecipientIDs: Set<String> = []
    private(set) var sendFeedback: (message: String, isError: Bool)?

    private let client: StaffDayClient?
    private let attempts: StaffCollectionAttempts

    init(prompt: StaffCollectionPrompt, client: StaffDayClient?, attempts: StaffCollectionAttempts = StaffCollectionAttempts()) {
        self.prompt = prompt
        self.client = client
        self.attempts = attempts
    }

    func attempt(for recipient: String) -> StaffCollectionAttempts.State? {
        attempts.state(for: prompt, recipient: recipient)
    }

    var dogNamesDisplay: String {
        StaffCollectionNotice.formattedDogNames(prompt.readyDogNames)
    }

    var isPlural: Bool {
        prompt.readyDogNames.count > 1
    }

    var title: String {
        "\(dogNamesDisplay) \(isPlural ? "are" : "is") ready"
    }

    var minutesValid: Bool {
        StaffCollectionNotice.isValidMinutes(minutes)
    }

    var whatsappPreview: String {
        StaffCollectionNotice.whatsappPreview(dogNames: prompt.readyDogNames, minutes: minutes)
    }

    var smsPreview: String {
        StaffCollectionNotice.smsText(dogNames: prompt.readyDogNames, minutes: minutes)
    }

    var anySmsRecipient: Bool {
        guard case .loaded(let recipients) = contactsState else { return false }
        return recipients.contains {
            if case .sms = $0.route { return true }
            return false
        }
    }

    var closeButtonLabel: String {
        if !sentRecipientIDs.isEmpty { return "Done" }
        if case .failed = contactsState { return "Not now" }
        if case .unavailable = contactsState { return "Close" }
        return "No, close"
    }

    func chooseSendMessage() async {
        step = .compose
        await loadContacts()
    }

    func loadContacts() async {
        sendFeedback = nil
        guard let client, client.supportsMessaging else {
            contactsState = .unavailable("Collection messaging is unavailable in this view.")
            return
        }
        guard let ownerId = prompt.ownerId, !ownerId.isEmpty else {
            contactsState = .loaded([])
            return
        }
        contactsState = .loading
        do {
            let recipients = try await client.loadCollectionRecipients(ownerId: ownerId)
            contactsState = .loaded(recipients)
        } catch {
            contactsState = .failed("We couldn't load contact details. This booking is still marked Ready. Retry, or contact the customer directly.")
        }
    }

    func send(to recipient: StaffCollectionRecipient) async {
        guard sendingRecipientID == nil, attempt(for: recipient.id) == nil else { return }
        guard minutesValid else {
            sendFeedback = ("Let us know how many minutes until collection", true)
            return
        }
        guard let client, client.supportsMessaging, let ownerId = prompt.ownerId else {
            sendFeedback = ("Collection messaging isn't available right now.", true)
            return
        }

        sendingRecipientID = recipient.id
        attempts.set(.sending, for: prompt, recipient: recipient.id)
        sendFeedback = nil
        var finalState: StaffCollectionAttempts.State?
        defer {
            attempts.set(finalState, for: prompt, recipient: recipient.id)
            sendingRecipientID = nil
        }

        do {
            let fresh = try await client.loadCollectionRecipients(ownerId: ownerId)
            contactsState = .loaded(fresh)
            guard fresh.first(where: { $0.id == recipient.id }) == recipient else {
                sendFeedback = ("The contact details changed. Review them before sending.", true)
                return
            }
        } catch {
            sendFeedback = ("We couldn't check the contact details. No message was sent.", true)
            return
        }

        let route = recipient.route
        guard route.channel != nil else {
            if case .blocked(let reason) = route {
                sendFeedback = (reason, true)
            }
            return
        }
        let e164 = PhoneNumber.normaliseUKMobile(recipient.contact.phone ?? "")
        guard !e164.isEmpty else {
            sendFeedback = ("No valid mobile number for this contact.", true)
            return
        }
        let trimmedMinutes = minutes.trimmingCharacters(in: .whitespacesAndNewlines)
        let request: StaffCollectionSendRequest
        let viaSms: Bool
        switch route {
        case .whatsapp:
            viaSms = false
            request = .whatsapp(
                to: e164,
                templateName: StaffCollectionNotice.whatsappTemplateName,
                language: StaffCollectionNotice.whatsappTemplateLanguage,
                params: [dogNamesDisplay, trimmedMinutes],
                humanId: recipient.id,
                bookingId: prompt.bookingId
            )
        case .sms:
            viaSms = true
            request = .sms(
                to: e164,
                text: StaffCollectionNotice.smsText(dogNames: prompt.readyDogNames, minutes: trimmedMinutes),
                templateName: StaffCollectionNotice.smsTemplateName,
                humanId: recipient.id,
                bookingId: prompt.bookingId
            )
        case .blocked:
            return
        }

        switch await client.sendCollectionNotice(request) {
        case .accepted(let recorded, let replayed):
            finalState = .accepted
            sentRecipientIDs.insert(recipient.id)
            let message = recorded
                ? "Collection notice sent to \(recipient.displayName)\(viaSms && !replayed ? " by SMS" : "")."
                : "The provider accepted the collection notice. It may be missing from the Inbox."
            sendFeedback = (message, false)
        case .notSent(let message):
            sendFeedback = (message, true)
        case .unknown:
            finalState = .unknown
            sendFeedback = ("We couldn't confirm whether the notice was sent. Check the Inbox and reconcile this attempt before sending another notice.", true)
        }
    }
}
