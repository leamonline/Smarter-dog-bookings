import XCTest
@testable import AuthCore

@MainActor
final class AuthFlowTests: XCTestCase {
    func testUKMobileNormalisationMatchesTheWebsite() async {
        let accepted = [
            "07700 900123",
            "+44 7700 900123",
            "+44 (0)7700 900123",
            "447700900123",
            "00447700900123",
            " 07700-900-123 ",
            "+447700900123",
            "+44 07700 900123",
            "\u{202A}07700900123\u{202C}",
        ]
        for sample in accepted {
            XCTAssertEqual(PhoneNumber.normaliseUKMobile(sample), "+447700900123", sample)
        }
        XCTAssertEqual(PhoneNumber.normaliseUKMobile("02079460958"), "")
        XCTAssertEqual(PhoneNumber.normaliseUKMobile("0770090012"), "")
        XCTAssertEqual(PhoneNumber.normaliseUKMobile("077009001234"), "")
        XCTAssertEqual(PhoneNumber.normaliseUKMobile(""), "")
        XCTAssertEqual(PhoneNumber.nationalDisplay(from: "+447700900123"), "07700 900123")
    }

    func testPhoneDigitsForTelLinksMatchesTheWebsite() {
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits("07700 900123"), "447700900123")
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits("+44 (0)7700 900123"), "447700900123")
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits("00447700900123"), "447700900123")
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits("447700900123"), "447700900123")
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits("+44 (0)20 7946 0958"), "442079460958")
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits("+1 415 555 0100"), "14155550100")
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits(""), "")
        XCTAssertEqual(PhoneNumber.normalisePhoneDigits("n/a"), "")
    }

    func testPhoneRoutesToPasswordCodeOrWebsite() async throws {
        let fake = FakeSalonClient()
        let auth = try await signedOut(fake)
        fake.phone = PhoneOnFile(onFile: true, hasPassword: true)
        let password = try await auth.checkPhone("07700 900123")
        XCTAssertEqual(password, .password(display: "07700 900123"))

        fake.phone = PhoneOnFile(onFile: true, hasPassword: false)
        let code = try await auth.checkPhone("07700900123")
        XCTAssertEqual(code, .textCode(display: "07700 900123"))

        fake.phone = PhoneOnFile(onFile: false, hasPassword: false)
        let unknown = try await auth.checkPhone("07700 900456")
        XCTAssertEqual(unknown, .unknown(display: "07700 900456"))
        XCTAssertEqual(fake.sendCodeCount, 0)

        do {
            _ = try await auth.checkPhone("02079460958")
            XCTFail("a landline should not be accepted")
        } catch let failure as SignInFailure {
            XCTAssertEqual(
                failure.message,
                "That number doesn't look quite right. Try a UK mobile starting with 07."
            )
        }
    }

    func testWrongPasswordStaysSignedOut() async throws {
        let fake = FakeSalonClient()
        let auth = try await signedOut(fake)
        fake.phone = PhoneOnFile(onFile: true, hasPassword: true)
        _ = try await auth.checkPhone("07700 900123")
        fake.signInError = SalonClientError.invalidCredentials
        do {
            try await auth.signInWithPassword("wrong", captchaToken: "token")
            XCTFail("expected the password to be refused")
        } catch let failure as SignInFailure {
            XCTAssertEqual(
                failure.message,
                "That number and password don't match. Try again, or get a code by text."
            )
        }
        XCTAssertEqual(fake.passwordSignIns.map(\.kind), ["phone"])
        XCTAssertEqual(fake.passwordSignIns.map(\.account), ["+447700900123"])
        XCTAssertEqual(auth.phase, .signedOut)
    }

    func testStaffPasswordAndCodeFailuresExplainThemselves() async throws {
        let fake = FakeSalonClient()
        let auth = try await signedOut(fake)
        fake.signInError = SalonClientError.captchaFailed
        do {
            try await auth.signInStaff(email: "alex@smarterdog.co.uk", password: "secret", captchaToken: "token")
            XCTFail("expected the security check to fail")
        } catch let failure as SignInFailure {
            XCTAssertEqual(failure.message, "The security check didn't pass. Please try it again.")
        }
        XCTAssertEqual(auth.phase, .signedOut)

        do {
            try await auth.signInStaff(email: "not-an-email", password: "secret", captchaToken: "token")
            XCTFail("expected a bad email to be refused")
        } catch let failure as SignInFailure {
            XCTAssertEqual(failure.message, "Please enter the email address you use for the salon.")
        }

        fake.phone = PhoneOnFile(onFile: true, hasPassword: false)
        _ = try await auth.checkPhone("07700 900123")
        fake.verifyError = SalonClientError.otpExpired
        do {
            try await auth.verifyCode("123 456")
            XCTFail("expected the code to expire")
        } catch let failure as SignInFailure {
            XCTAssertEqual(failure.message, "That code has expired. Please ask for a new one.")
        }
        XCTAssertEqual(fake.verifiedCodes, ["123456"])

        fake.verifyError = nil
        try await auth.verifyCode("1234567")
        XCTAssertEqual(fake.verifiedCodes.last, "123456")

        fake.phoneError = SalonClientError.rateLimited
        do {
            _ = try await auth.checkPhone("07700 900123")
            XCTFail("expected the lookup to be rate limited")
        } catch let failure as SignInFailure {
            XCTAssertEqual(failure.message, "Too many attempts. Please wait a minute and try again.")
        }
    }

    func testRestoresStaffSessionWithoutAskingAgain() async {
        let fake = FakeSalonClient()
        fake.staff = StaffProfile(role: "owner", displayName: "Alex")
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(SalonAccount(id: "staff-1", email: "alex@smarterdog.co.uk", phone: nil)))
        let phase = await settled(auth)
        XCTAssertEqual(phase, .staff(AccountCard(name: "Alex", roleLabel: "Owner")))
        XCTAssertEqual(fake.linkCount, 0)
    }

    func testStaffRoleWinsOverACustomerPhone() async {
        let fake = FakeSalonClient()
        fake.staff = StaffProfile(role: "staff", displayName: "   ")
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(SalonAccount(id: "staff-2", email: "sam@smarterdog.co.uk", phone: "+447700900123")))
        let staff = await settled(auth)
        XCTAssertEqual(staff, .staff(AccountCard(name: "sam@smarterdog.co.uk", roleLabel: "Staff")))
        XCTAssertEqual(fake.linkCount, 0)
    }

    func testEmailWithoutAStaffProfileIsRefused() async {
        let fake = FakeSalonClient()
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(SalonAccount(id: "visitor", email: "sam@smarterdog.co.uk", phone: "   ")))
        let denied = await settled(auth)
        XCTAssertEqual(denied, .staffDenied(email: "sam@smarterdog.co.uk"))
        XCTAssertEqual(fake.linkCount, 0)
    }

    func testApprovedCustomerSeesTheirName() async {
        let fake = FakeSalonClient()
        fake.human = LinkedPerson(id: "human-1", name: "Sam", surname: "Taylor")
        fake.signup = SignupState(approvedAt: "2026-11-01T10:00:00Z", submittedAt: nil, claimsExisting: false)
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(customer("user-1")))
        let phase = await settled(auth)
        XCTAssertEqual(phase, .customer(AccountCard(name: "Sam Taylor", roleLabel: "Customer")))
    }

    func testPendingApprovalDoesNotOpenTheCustomerHome() async {
        let fake = FakeSalonClient()
        fake.human = LinkedPerson(id: "human-2", name: "Jo", surname: "Reed")
        fake.signup = SignupState(approvedAt: nil, submittedAt: "2026-11-01T10:00:00Z", claimsExisting: false)
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(customer("user-2")))
        let waiting = await settled(auth)
        XCTAssertEqual(
            waiting,
            .pending(PendingAccount(name: "Jo Reed", showsName: true, hold: .waiting))
        )

        fake.signup = SignupState(approvedAt: nil, submittedAt: "2026-11-01T10:00:00Z", claimsExisting: true)
        auth.refreshAccount()
        let claims = await settled(auth)
        XCTAssertEqual(
            claims,
            .pending(PendingAccount(name: "Jo Reed", showsName: true, hold: .claimsExisting))
        )

        fake.signup = SignupState(approvedAt: "2026-11-02T10:00:00Z", submittedAt: "2026-11-01T10:00:00Z", claimsExisting: false)
        auth.refreshAccount()
        let approved = await settled(auth)
        XCTAssertEqual(approved, .customer(AccountCard(name: "Jo Reed", roleLabel: "Customer")))
    }

    func testUnfinishedJoinThePackStaysOutOfTheCustomerHome() async {
        let fake = FakeSalonClient()
        fake.human = LinkedPerson(id: "human-3", name: nil, surname: nil)
        fake.signup = SignupState(approvedAt: nil, submittedAt: nil, claimsExisting: false)
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(customer("user-3")))
        let phase = await settled(auth)
        XCTAssertEqual(
            phase,
            .pending(PendingAccount(name: "07700 900123", showsName: false, hold: .finishOnTheWebsite))
        )
    }

    func testMissingCustomerRecordAndFailedRead() async {
        let fake = FakeSalonClient()
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(customer("user-4")))
        let missing = await settled(auth)
        XCTAssertEqual(missing, .accountMissing)

        fake.human = LinkedPerson(id: "human-4", name: "Sam", surname: "Taylor")
        fake.signupError = TestFailure()
        auth.refreshAccount()
        let failed = await settled(auth)
        XCTAssertEqual(failed, .accountError("We couldn't open your account. Check your connection and try again."))
    }

    func testSavedSessionSignsOut() async {
        let fake = FakeSalonClient()
        fake.human = LinkedPerson(id: "human-5", name: "Sam", surname: "Taylor")
        fake.signup = SignupState(approvedAt: "2026-11-01T10:00:00Z", submittedAt: nil, claimsExisting: false)
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        let home = SessionPhase.customer(AccountCard(name: "Sam Taylor", roleLabel: "Customer"))
        fake.emit(.session(customer("user-5")))
        let restored = await until(home, auth)
        XCTAssertEqual(restored, home)
        fake.emit(.signedOut)
        let signedOut = await until(.signedOut, auth)
        XCTAssertEqual(signedOut, .signedOut)

        fake.emit(.session(customer("user-5")))
        let restoredAgain = await until(home, auth)
        XCTAssertEqual(restoredAgain, home)
        await auth.signOut()
        XCTAssertEqual(auth.phase, .signedOut)
        XCTAssertEqual(fake.signOutCount, 1)
    }

    func testRestoreGivesUpWhenNoSessionArrives() async {
        let fake = FakeSalonClient()
        let auth = AuthService(client: fake, restoreTimeout: .milliseconds(20))
        let phase = await settled(auth)
        XCTAssertEqual(phase, .signedOut)
    }

    func testFailureCodesMatchTheMessagesPeopleSee() async {
        XCTAssertEqual(
            classifySalonFailure(code: "captcha_failed", message: "", httpStatus: nil),
            .captchaFailed
        )
        XCTAssertEqual(
            classifySalonFailure(code: nil, message: "captcha protection: request disallowed", httpStatus: nil),
            .captchaFailed
        )
        XCTAssertEqual(
            classifySalonFailure(code: "invalid_credentials", message: "Invalid login credentials", httpStatus: nil),
            .invalidCredentials
        )
        XCTAssertEqual(classifySalonFailure(code: "otp_expired", message: "", httpStatus: nil), .otpExpired)
        XCTAssertEqual(classifySalonFailure(code: "rate_limited", message: "", httpStatus: 429), .rateLimited)
        XCTAssertEqual(classifySalonFailure(code: "sms_send_failed", message: "", httpStatus: nil), .smsFailed)
        XCTAssertEqual(classifySalonFailure(code: nil, message: "", httpStatus: 404), .loginUnavailable)
        XCTAssertNil(classifySalonFailure(code: "unexpected", message: "nope", httpStatus: 500))
        XCTAssertEqual(
            signInFailureMessage(.invalidCredentials, wrongSecret: "That email and password don't match. Please try again."),
            "That email and password don't match. Please try again."
        )
    }

    private func signedOut(_ fake: FakeSalonClient) async throws -> AuthService {
        let auth = AuthService(client: fake, restoreTimeout: .seconds(2))
        fake.emit(.session(nil))
        let phase = await settled(auth)
        XCTAssertEqual(phase, .signedOut)
        return auth
    }

    private func until(_ expected: SessionPhase, _ auth: AuthService) async -> SessionPhase {
        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if auth.phase == expected { return auth.phase }
            try? await Task.sleep(for: .milliseconds(10))
        }
        return auth.phase
    }

    private func settled(_ auth: AuthService) async -> SessionPhase {
        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            if auth.phase != .restoring && auth.phase != .resolving {
                return auth.phase
            }
            try? await Task.sleep(for: .milliseconds(10))
        }
        return auth.phase
    }

    private func customer(_ id: String) -> SalonAccount {
        SalonAccount(id: id, email: nil, phone: "+447700900123")
    }
}

private struct TestFailure: Error {}

private final class FakeSalonClient: SalonSessionClient, @unchecked Sendable {
    var phone = PhoneOnFile(onFile: false, hasPassword: false)
    var phoneError: Error?
    var signInError: Error?
    var sendCodeError: Error?
    var verifyError: Error?
    var verifySucceeds = true
    var staff: StaffProfile?
    var staffError: Error?
    var human: LinkedPerson?
    var linkError: Error?
    var signup: SignupState?
    var signupError: Error?

    private(set) var passwordSignIns: [(kind: String, account: String)] = []
    private(set) var sendCodeCount = 0
    private(set) var verifiedCodes: [String] = []
    private(set) var linkCount = 0
    private(set) var signOutCount = 0

    private let continuation: AsyncStream<SalonAuthEvent>.Continuation
    let events: AsyncStream<SalonAuthEvent>

    init() {
        var continuation: AsyncStream<SalonAuthEvent>.Continuation!
        events = AsyncStream { continuation = $0 }
        self.continuation = continuation
    }

    func emit(_ event: SalonAuthEvent) {
        continuation.yield(event)
    }

    func phoneOnFile(_ e164: String) async throws -> PhoneOnFile {
        if let phoneError { throw phoneError }
        return phone
    }

    func signIn(phone: String, password: String, captchaToken: String) async throws {
        passwordSignIns.append((kind: "phone", account: phone))
        if let signInError { throw signInError }
    }

    func signIn(email: String, password: String, captchaToken: String) async throws {
        passwordSignIns.append((kind: "email", account: email))
        if let signInError { throw signInError }
    }

    func sendCode(phone: String, captchaToken: String) async throws {
        sendCodeCount += 1
        if let sendCodeError { throw sendCodeError }
    }

    func verifyCode(phone: String, code: String) async throws -> Bool {
        verifiedCodes.append(code)
        if let verifyError { throw verifyError }
        return verifySucceeds
    }

    func signOut() async {
        signOutCount += 1
    }

    func staffProfile(userId: String) async throws -> StaffProfile? {
        if let staffError { throw staffError }
        return staff
    }

    func linkHuman() async throws -> LinkedPerson? {
        linkCount += 1
        if let linkError { throw linkError }
        return human
    }

    func signupState(humanId: String) async throws -> SignupState? {
        if let signupError { throw signupError }
        return signup
    }
}
