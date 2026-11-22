import Foundation
import Supabase

extension AuthService {
    /// The live salon connection. A build without the public URL and anon key
    /// has no client, and the app says it is not connected.
    static func connected() -> AuthService {
        AuthService(client: SupabaseSessionClient.make())
    }
}

/// Supabase calls behind `SalonSessionClient`. Session events are forwarded
/// and the listener returns before any other call, which is what the website
/// does to avoid stalling sign-in.
final class SupabaseSessionClient: SalonSessionClient, Sendable {
    let events: AsyncStream<SalonAuthEvent>
    private let supabase: SupabaseClient

    static func make() -> SupabaseSessionClient? {
        guard let supabase = SalonClient.make() else { return nil }
        return SupabaseSessionClient(supabase: supabase)
    }

    init(supabase: SupabaseClient) {
        self.supabase = supabase
        let supabase = supabase
        events = AsyncStream { continuation in
            let task = Task {
                for await (event, session) in supabase.auth.authStateChanges {
                    switch event {
                    case .initialSession, .signedIn:
                        if let session {
                            continuation.yield(.session(SalonAccount(
                                id: session.user.id.uuidString,
                                email: session.user.email,
                                phone: session.user.phone
                            )))
                        } else {
                            continuation.yield(.session(nil))
                        }
                    case .signedOut, .userDeleted:
                        continuation.yield(.signedOut)
                    case .tokenRefreshed, .userUpdated, .passwordRecovery, .mfaChallengeVerified:
                        break
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    func phoneOnFile(_ e164: String) async throws -> PhoneOnFile {
        do {
            let result: PhoneLookupResult = try await supabase.functions.invoke(
                "customer-phone-on-file",
                options: FunctionInvokeOptions(body: PhoneLookupBody(phone: e164))
            )
            return PhoneOnFile(onFile: result.on_file, hasPassword: result.has_password == true)
        } catch {
            throw Self.translated(error)
        }
    }

    func signIn(phone: String, password: String, captchaToken: String) async throws {
        do {
            _ = try await supabase.auth.signIn(
                phone: phone,
                password: password,
                captchaToken: captchaToken
            )
        } catch {
            throw Self.translated(error)
        }
    }

    func signIn(email: String, password: String, captchaToken: String) async throws {
        do {
            _ = try await supabase.auth.signIn(
                email: email,
                password: password,
                captchaToken: captchaToken
            )
        } catch {
            throw Self.translated(error)
        }
    }

    func sendCode(phone: String, captchaToken: String) async throws {
        do {
            try await supabase.auth.signInWithOTP(
                phone: phone,
                channel: .sms,
                shouldCreateUser: true,
                captchaToken: captchaToken
            )
        } catch {
            throw Self.translated(error)
        }
    }

    func verifyCode(phone: String, code: String) async throws -> Bool {
        do {
            let response = try await supabase.auth.verifyOTP(
                phone: phone,
                token: code,
                type: .sms
            )
            return response.session != nil
        } catch {
            throw Self.translated(error)
        }
    }

    func signOut() async {
        try? await supabase.auth.signOut()
    }

    func staffProfile(userId: String) async throws -> StaffProfile? {
        do {
            let row: StaffRow? = try await supabase
                .from("staff_profiles")
                .select("role,display_name")
                .eq("user_id", value: userId)
                .maybeSingle()
                .execute()
                .value
            guard let row else { return nil }
            return StaffProfile(role: row.role, displayName: row.display_name)
        } catch {
            throw Self.translated(error)
        }
    }

    func linkHuman() async throws -> LinkedPerson? {
        do {
            let rows: [LinkedHuman] = try await supabase
                .rpc("link_customer_to_human")
                .execute()
                .value
            guard let row = rows.first else { return nil }
            return LinkedPerson(id: row.id, name: row.name, surname: row.surname)
        } catch {
            throw Self.translated(error)
        }
    }

    func signupState(humanId: String) async throws -> SignupState? {
        do {
            // Column names stay snake_case: supabase-swift 2.55.7's database
            // decoder does not rename JSON keys.
            let row: SignupRow? = try await supabase
                .from("humans")
                .select("approved_at,signup_submitted_at,claims_human_id")
                .eq("id", value: humanId)
                .maybeSingle()
                .execute()
                .value
            guard let row else { return nil }
            return SignupState(
                approvedAt: row.approved_at,
                submittedAt: row.signup_submitted_at,
                claimsExisting: row.claims_human_id?.isEmpty == false
            )
        } catch {
            throw Self.translated(error)
        }
    }

    private static func translated(_ error: Error) -> Error {
        if let auth = error as? AuthError, case .api(let message, let code, _, _) = auth,
           let mapped = classifySalonFailure(code: code.rawValue, message: message, httpStatus: nil) {
            return mapped
        }
        if let functions = error as? FunctionsError {
            if case .relayError = functions {
                return SalonClientError.loginUnavailable
            }
            if case .httpError(let status, let data) = functions {
                let body = try? JSONDecoder().decode(FunctionErrorBody.self, from: data)
                if let mapped = classifySalonFailure(code: body?.error, message: "", httpStatus: status) {
                    return mapped
                }
            }
        }
        return error
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
