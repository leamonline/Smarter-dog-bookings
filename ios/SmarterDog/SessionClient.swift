import Foundation

/// What the sign-in screens ask the salon. The iPhone app uses Supabase.
/// Tests use a stand-in that returns chosen answers.
protocol SalonSessionClient: Sendable {
    var events: AsyncStream<SalonAuthEvent> { get }
    func phoneOnFile(_ e164: String) async throws -> PhoneOnFile
    func signIn(phone: String, password: String, captchaToken: String) async throws
    func signIn(email: String, password: String, captchaToken: String) async throws
    func sendCode(phone: String, captchaToken: String) async throws
    func verifyCode(phone: String, code: String) async throws -> Bool
    func signOut() async
    func staffProfile(userId: String) async throws -> StaffProfile?
    func linkHuman() async throws -> LinkedPerson?
    func signupState(humanId: String) async throws -> SignupState?
}

struct SalonAccount: Equatable, Sendable {
    var id: String
    var email: String?
    var phone: String?
}

enum SalonAuthEvent: Equatable, Sendable {
    /// A saved or new session. `nil` means there is nobody signed in.
    case session(SalonAccount?)
    case signedOut
}

struct PhoneOnFile: Equatable, Sendable {
    var onFile: Bool
    var hasPassword: Bool
}

struct StaffProfile: Equatable, Sendable {
    var role: String
    var displayName: String?
}

struct LinkedPerson: Equatable, Sendable {
    var id: String
    var name: String?
    var surname: String?
}

struct SignupState: Equatable, Sendable {
    var approvedAt: String?
    var submittedAt: String?
    var claimsExisting: Bool
}

enum SalonClientError: Error, Equatable {
    case invalidCredentials
    case captchaFailed
    case otpExpired
    case rateLimited
    case smsFailed
    case loginUnavailable
}

/// Turns the codes Supabase sends into one of the errors the screens understand.
/// `code` is the auth error code or the edge-function `error` field.
func classifySalonFailure(code: String?, message: String, httpStatus: Int?) -> SalonClientError? {
    let code = code ?? ""
    let message = message.lowercased()
    if code == "captcha_failed" || message.contains("captcha") {
        return .captchaFailed
    }
    if code == "invalid_credentials" || message.contains("invalid login credentials") {
        return .invalidCredentials
    }
    if code == "otp_expired" {
        return .otpExpired
    }
    if code == "over_request_rate_limit"
        || code == "over_sms_send_rate_limit"
        || code == "over_email_send_rate_limit"
        || code == "rate_limited" {
        return .rateLimited
    }
    if code == "sms_send_failed" {
        return .smsFailed
    }
    if httpStatus == 404 {
        return .loginUnavailable
    }
    return nil
}

func signInFailureMessage(_ error: SalonClientError, wrongSecret: String) -> String {
    switch error {
    case .captchaFailed:
        "The security check didn't pass. Please try it again."
    case .invalidCredentials:
        wrongSecret
    case .otpExpired:
        "That code has expired. Please ask for a new one."
    case .rateLimited:
        "Too many attempts. Please wait a minute and try again."
    case .smsFailed:
        "Could not send your login code. Please check your number and try again."
    case .loginUnavailable:
        "Login service isn't available right now. Please contact the salon."
    }
}
