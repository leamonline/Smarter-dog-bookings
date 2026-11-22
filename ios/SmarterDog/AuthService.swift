import Foundation
import Observation

/// One signed-in session for the phone.
///
/// Staff are an email login with a staff profile whose role is owner or staff,
/// the same check as `is_staff()` on the website. Customers are a phone login.
/// After sign-in, the client links that login to the customer record. Approval
/// is then read the same way the website does: an approval time means they can
/// come in, a submitted Join the Pack form means they are waiting, and neither
/// means the rest of the form is still on the website.
@MainActor
@Observable
final class AuthService {
    private(set) var phase: SessionPhase
    private let client: (any SalonSessionClient)?
    private let restoreTimeout: Duration
    private var listenTask: Task<Void, Never>?
    private var resolveGeneration = 0
    private var signedInUser: SalonAccount?

    private var normalisedPhone = ""

    init(client: (any SalonSessionClient)?, restoreTimeout: Duration = .seconds(8)) {
        self.client = client
        self.restoreTimeout = restoreTimeout
        if client != nil {
            phase = .restoring
            listen()
        } else {
            phase = .needsConfiguration
        }
    }

    init(previewPhase: SessionPhase) {
        client = nil
        restoreTimeout = .seconds(8)
        phase = previewPhase
    }

    func checkPhone(_ raw: String) async throws -> PhoneNext {
        let normalised = PhoneNumber.normaliseUKMobile(raw)
        guard !normalised.isEmpty else {
            throw SignInFailure(message: "That number doesn't look quite right. Try a UK mobile starting with 07.")
        }
        let client = try requireClient()
        let display = PhoneNumber.nationalDisplay(from: normalised)
        do {
            let result = try await client.phoneOnFile(normalised)
            guard result.onFile else {
                normalisedPhone = ""
                return .unknown(display: display)
            }
            normalisedPhone = normalised
            if result.hasPassword {
                return .password(display: display)
            }
            return .textCode(display: display)
        } catch let failure as SignInFailure {
            throw failure
        } catch {
            throw SignInFailure(message: message(
                for: error,
                fallback: "We couldn't check that number. Please try again.",
                wrongSecret: "We couldn't check that number. Please try again."
            ))
        }
    }

    func signInWithPassword(_ password: String, captchaToken: String) async throws {
        let client = try requireClient()
        guard !normalisedPhone.isEmpty else {
            throw SignInFailure(message: "Enter your mobile number again, then your password.")
        }
        do {
            try await client.signIn(phone: normalisedPhone, password: password, captchaToken: captchaToken)
        } catch {
            throw SignInFailure(message: message(
                for: error,
                fallback: "We couldn't sign you in. Please try again.",
                wrongSecret: "That number and password don't match. Try again, or get a code by text."
            ))
        }
    }

    func sendCode(captchaToken: String) async throws {
        let client = try requireClient()
        guard !normalisedPhone.isEmpty else {
            throw SignInFailure(message: "Enter your mobile number again, then ask for a new code.")
        }
        do {
            try await client.sendCode(phone: normalisedPhone, captchaToken: captchaToken)
        } catch {
            throw SignInFailure(message: message(
                for: error,
                fallback: "Could not send your login code. Please check your number and try again.",
                wrongSecret: "Could not send your login code. Please check your number and try again."
            ))
        }
    }

    func verifyCode(_ raw: String) async throws {
        let client = try requireClient()
        let code = raw.filter(\.isNumber)
        guard code.count == 6 else {
            throw SignInFailure(message: "Please enter the 6-digit code.")
        }
        guard !normalisedPhone.isEmpty else {
            throw SignInFailure(message: "Enter your mobile number again, then ask for a new code.")
        }
        do {
            let signedIn = try await client.verifyCode(phone: normalisedPhone, code: code)
            guard signedIn else {
                throw SignInFailure(message: "That code did not sign you in. Please ask for a new one.")
            }
        } catch let failure as SignInFailure {
            throw failure
        } catch {
            throw SignInFailure(message: message(
                for: error,
                fallback: "That code did not work. Please check it and try again.",
                wrongSecret: "That code did not work. Please check it and try again."
            ))
        }
    }

    func signInStaff(email rawEmail: String, password: String, captchaToken: String) async throws {
        let client = try requireClient()
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = email.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, parts[1].contains(".") else {
            throw SignInFailure(message: "Please enter the email address you use for the salon.")
        }
        do {
            try await client.signIn(email: email, password: password, captchaToken: captchaToken)
        } catch {
            throw SignInFailure(message: message(
                for: error,
                fallback: "We couldn't sign you in. Please try again.",
                wrongSecret: "That email and password don't match. Please try again."
            ))
        }
    }

    func refreshAccount() {
        guard let signedInUser else { return }
        beginResolve(user: signedInUser)
    }

    func signOut() async {
        resolveGeneration += 1
        signedInUser = nil
        normalisedPhone = ""
        phase = .signedOut
        await client?.signOut()
    }

    private func requireClient() throws -> any SalonSessionClient {
        guard let client else {
            throw SignInFailure(message: "This copy of the app isn't connected to the salon yet.")
        }
        return client
    }

    private func listen() {
        guard let client else { return }
        listenTask = Task { [weak self] in
            for await event in client.events {
                self?.handle(event)
            }
        }
        let timeout = restoreTimeout
        Task { [weak self] in
            try? await Task.sleep(for: timeout)
            self?.giveUpRestoring()
        }
    }

    private func giveUpRestoring() {
        if phase == .restoring {
            phase = .signedOut
        }
    }

    /// Role lookup starts in a separate task so the session listener can return
    /// before the next salon call. Holding the listener open can stall sign-in.
    private func handle(_ event: SalonAuthEvent) {
        switch event {
        case .session(let account):
            guard let account else {
                signedInUser = nil
                phase = .signedOut
                return
            }
            beginResolve(user: account)
        case .signedOut:
            signedInUser = nil
            if phase != .needsConfiguration {
                phase = .signedOut
            }
        }
    }

    private func beginResolve(user: SalonAccount) {
        resolveGeneration += 1
        let generation = resolveGeneration
        signedInUser = user
        phase = .resolving
        Task {
            await resolve(user: user, generation: generation)
        }
    }

    private func resolve(user: SalonAccount, generation: Int) async {
        guard let client else { return }
        do {
            let staff = try await client.staffProfile(userId: user.id)
            guard generation == resolveGeneration else { return }

            if let staff, staff.role == "owner" || staff.role == "staff" {
                let fallback = user.email ?? "Staff"
                phase = .staff(AccountCard(
                    name: PersonName.joined(name: staff.displayName, surname: nil, fallback: fallback),
                    roleLabel: staff.role == "owner" ? "Owner" : "Staff"
                ))
                return
            }

            let phone = user.phone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if phone.isEmpty {
                phase = .staffDenied(email: user.email ?? "This account")
                return
            }

            let human = try await client.linkHuman()
            guard generation == resolveGeneration else { return }
            guard let human else {
                phase = .accountMissing
                return
            }

            let signup = try await client.signupState(humanId: human.id)
            guard generation == resolveGeneration else { return }

            let name = PersonName.joined(
                name: human.name,
                surname: human.surname,
                fallback: PhoneNumber.nationalDisplay(from: phone)
            )
            let showsName = PersonName.hasRealName(name: human.name, surname: human.surname)
            // No row is a failed read, not an unapproved customer. The website
            // lets them through in that case; booking is still checked on the server.
            guard let signup else {
                phase = .customer(AccountCard(name: name, roleLabel: "Customer"))
                return
            }
            if let approved = signup.approvedAt, !approved.isEmpty {
                phase = .customer(AccountCard(name: name, roleLabel: "Customer"))
                return
            }
            if let submitted = signup.submittedAt, !submitted.isEmpty {
                phase = .pending(PendingAccount(
                    name: name,
                    showsName: showsName,
                    hold: signup.claimsExisting ? .claimsExisting : .waiting
                ))
                return
            }
            phase = .pending(PendingAccount(
                name: name,
                showsName: showsName,
                hold: .finishOnTheWebsite
            ))
        } catch {
            guard generation == resolveGeneration else { return }
            phase = .accountError("We couldn't open your account. Check your connection and try again.")
        }
    }

    private func message(for error: Error, fallback: String, wrongSecret: String) -> String {
        guard let salon = error as? SalonClientError else { return fallback }
        return signInFailureMessage(salon, wrongSecret: wrongSecret)
    }
}
