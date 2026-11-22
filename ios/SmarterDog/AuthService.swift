import Foundation
import Observation
import Supabase

/// One signed-in session for the phone.
///
/// Staff are an email login with a `staff_profiles` row whose role is `owner`
/// or `staff` — the same check as `is_staff()` on the website.
/// Customers are a phone login. After sign-in, `link_customer_to_human` binds
/// the login to their record. Approval is then read from that record the same
/// way the website does: `approved_at` set means they can come in,
/// `signup_submitted_at` set means Join the Pack is waiting for the salon,
/// and neither means the rest of Join the Pack is still on the website.
@MainActor
@Observable
final class AuthService {
    private(set) var phase: SessionPhase
    private let client: SupabaseClient?
    private var listenTask: Task<Void, Never>?
    private var resolveGeneration = 0
    private var signedInUser: User?
    private var normalisedPhone = ""

    init() {
        if let client = SalonClient.make() {
            self.client = client
            phase = .restoring
            listen(to: client)
        } else {
            client = nil
            phase = .needsConfiguration
        }
    }

    init(previewPhase: SessionPhase) {
        client = nil
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
            let result: PhoneLookupResult = try await client.functions.invoke(
                "customer-phone-on-file",
                options: FunctionInvokeOptions(body: PhoneLookupBody(phone: normalised))
            )
            guard result.on_file else {
                normalisedPhone = ""
                return .unknown(display: display)
            }
            normalisedPhone = normalised
            if result.has_password == true {
                return .password(display: display)
            }
            return .textCode(display: display)
        } catch let failure as SignInFailure {
            throw failure
        } catch {
            throw SignInFailure(message: Self.friendly(
                error,
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
            _ = try await client.auth.signIn(
                phone: normalisedPhone,
                password: password,
                captchaToken: captchaToken
            )
        } catch {
            throw SignInFailure(message: Self.friendly(
                error,
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
            try await client.auth.signInWithOTP(
                phone: normalisedPhone,
                channel: .sms,
                shouldCreateUser: true,
                captchaToken: captchaToken
            )
        } catch {
            throw SignInFailure(message: Self.friendly(
                error,
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
            let response = try await client.auth.verifyOTP(
                phone: normalisedPhone,
                token: code,
                type: .sms
            )
            guard response.session != nil else {
                throw SignInFailure(message: "That code did not sign you in. Please ask for a new one.")
            }
        } catch let failure as SignInFailure {
            throw failure
        } catch {
            throw SignInFailure(message: Self.friendly(
                error,
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
            _ = try await client.auth.signIn(
                email: email,
                password: password,
                captchaToken: captchaToken
            )
        } catch {
            throw SignInFailure(message: Self.friendly(
                error,
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
        try? await client?.auth.signOut()
    }

    private func requireClient() throws -> SupabaseClient {
        guard let client else {
            throw SignInFailure(message: "This copy of the app isn't connected to the salon yet.")
        }
        return client
    }

    private func listen(to client: SupabaseClient) {
        listenTask = Task { [weak self] in
            for await (event, session) in client.auth.authStateChanges {
                self?.handle(event: event, session: session)
            }
        }
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(8))
            self?.giveUpRestoring()
        }
    }

    private func giveUpRestoring() {
        if phase == .restoring {
            phase = .signedOut
        }
    }

    /// The auth listener must return before any other Supabase call, or the
    /// client can stall. Role lookup is started in a separate task.
    private func handle(event: AuthChangeEvent, session: Session?) {
        switch event {
        case .initialSession, .signedIn:
            guard let session else {
                signedInUser = nil
                phase = .signedOut
                return
            }
            beginResolve(user: session.user)
        case .signedOut, .userDeleted:
            signedInUser = nil
            if phase != .needsConfiguration {
                phase = .signedOut
            }
        case .tokenRefreshed, .userUpdated, .passwordRecovery, .mfaChallengeVerified:
            break
        }
    }

    private func beginResolve(user: User) {
        resolveGeneration += 1
        let generation = resolveGeneration
        signedInUser = user
        phase = .resolving
        Task {
            await resolve(user: user, generation: generation)
        }
    }

    private func resolve(user: User, generation: Int) async {
        guard let client else { return }
        do {
            let staff: StaffRow? = try await client
                .from("staff_profiles")
                .select("role,display_name")
                .eq("user_id", value: user.id)
                .maybeSingle()
                .execute()
                .value
            guard generation == resolveGeneration else { return }

            if let staff, staff.role == "owner" || staff.role == "staff" {
                let fallback = user.email ?? "Staff"
                phase = .staff(AccountCard(
                    name: PersonName.joined(name: staff.display_name, surname: nil, fallback: fallback),
                    roleLabel: staff.role == "owner" ? "Owner" : "Staff"
                ))
                return
            }

            let phone = user.phone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if phone.isEmpty {
                phase = .staffDenied(email: user.email ?? "This account")
                return
            }

            let linked: [LinkedHuman] = try await client
                .rpc("link_customer_to_human")
                .execute()
                .value
            guard generation == resolveGeneration else { return }
            guard let human = linked.first else {
                phase = .accountMissing
                return
            }

            // Column names stay snake_case: supabase-swift 2.55.7's database
            // decoder does not rename JSON keys.
            let signup: SignupRow? = try await client
                .from("humans")
                .select("approved_at,signup_submitted_at,claims_human_id")
                .eq("id", value: human.id)
                .maybeSingle()
                .execute()
                .value
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
            if let approved = signup.approved_at, !approved.isEmpty {
                phase = .customer(AccountCard(name: name, roleLabel: "Customer"))
                return
            }
            if let submitted = signup.signup_submitted_at, !submitted.isEmpty {
                let claims = signup.claims_human_id?.isEmpty == false
                phase = .pending(PendingAccount(
                    name: name,
                    showsName: showsName,
                    hold: claims ? .claimsExisting : .waiting
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

    private static func friendly(_ error: Error, fallback: String, wrongSecret: String) -> String {
        if let auth = error as? AuthError, case .api(let message, let code, _, _) = auth {
            if code == .captchaFailed || message.localizedStandardContains("captcha") {
                return "The security check didn't pass. Please try it again."
            }
            if code == .invalidCredentials || message.localizedStandardContains("invalid login credentials") {
                return wrongSecret
            }
            if code == .otpExpired {
                return "That code has expired. Please ask for a new one."
            }
            if code == .overRequestRateLimit || code == .overSMSSendRateLimit || code == .overEmailSendRateLimit {
                return "Too many attempts. Please wait a minute and try again."
            }
            if code == .smsSendFailed {
                return "Could not send your login code. Please check your number and try again."
            }
        }
        if let functions = error as? FunctionsError {
            if case .httpError(_, let data) = functions,
               let body = try? JSONDecoder().decode(FunctionErrorBody.self, from: data),
               body.error == "rate_limited" {
                return "Too many attempts. Please wait a minute and try again."
            }
            if case .httpError(let status, _) = functions, status == 404 {
                return "Login service isn't available right now. Please contact the salon."
            }
            if case .relayError = functions {
                return "Login service isn't available right now. Please contact the salon."
            }
        }
        return fallback
    }
}

private struct PhoneLookupBody: Encodable {
    let phone: String
}

private struct PhoneLookupResult: Decodable {
    let on_file: Bool
    let has_password: Bool?
}

private struct FunctionErrorBody: Decodable {
    let error: String?
}

private struct StaffRow: Decodable {
    let role: String
    let display_name: String?
}

private struct LinkedHuman: Decodable {
    let id: String
    let name: String?
    let surname: String?
}

private struct SignupRow: Decodable {
    let approved_at: String?
    let signup_submitted_at: String?
    let claims_human_id: String?
}
