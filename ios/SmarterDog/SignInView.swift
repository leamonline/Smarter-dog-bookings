import SwiftUI

/// Phone-first customer sign-in, plus the staff email screen.
struct SignInView: View {
    var auth: AuthService

    @State private var stage = Stage.phone
    @State private var phone = ""
    @State private var password = ""
    @State private var code = ""
    @State private var email = ""
    @State private var showPassword = false
    @State private var recognised = ""
    @State private var errorText: String?
    @State private var captchaNote: String?
    @State private var captchaToken: String?
    @State private var captchaID = 0
    @State private var submitting = false
    @State private var cooldown = 0
    @State private var cooldownID = 0
    @FocusState private var focused: Field?

    private enum Stage {
        case phone
        case password
        case sendCode
        case code
        case unknown
        case staff
    }

    private enum Field: Hashable {
        case phone
        case password
        case code
        case email
    }

    var body: some View {
        PaperScreen {
            header
            stageContent
            if let errorText {
                ErrorNote(message: errorText)
            }
        }
        .onChange(of: stage) { _, newStage in
            errorText = nil
            captchaNote = nil
            captchaToken = nil
            if newStage == .phone || newStage == .staff {
                password = ""
            }
            if newStage == .phone {
                code = ""
                cooldown = 0
                cooldownID += 1
            }
            focused = focus(for: newStage)
        }
        .onChange(of: errorText) { _, message in
            announce(message)
        }
        .onAppear {
            focused = .phone
        }
    }

    private var header: some View {
        VStack(spacing: 12) {
            Text("Smarter Dog")
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(Brand.ink)
                .frame(maxWidth: .infinity)
                .accessibilityAddTraits(.isHeader)

            RoundedRectangle(cornerRadius: 2)
                .fill(Brand.yellow)
                .frame(width: 56, height: 4)
                .accessibilityHidden(true)

            Text(instruction)
                .font(.subheadline)
                .foregroundStyle(Brand.ink.opacity(0.72))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 12)
    }

    private var instruction: String {
        switch stage {
        case .phone:
            "Enter your mobile number and we'll take it from there."
        case .password:
            "Enter the password for \(recognised)."
        case .sendCode:
            "We'll text a code to \(recognised). Codes expire after a few minutes."
        case .code:
            "We just texted a code to \(recognised)."
        case .unknown:
            "We don't recognise \(recognised) yet."
        case .staff:
            "For the salon team. Customers use their mobile number."
        }
    }

    @ViewBuilder
    private var stageContent: some View {
        switch stage {
        case .phone:
            phoneStage
        case .password:
            passwordStage
        case .sendCode:
            sendCodeStage
        case .code:
            codeStage
        case .unknown:
            unknownStage
        case .staff:
            staffStage
        }
    }

    private var phoneStage: some View {
        VStack(alignment: .leading, spacing: 16) {
            labeledField("Phone number") {
                TextField("07123 456789", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .phone)
                    .accessibilityLabel("Phone number")
            }

            PrimaryButton(title: "Continue", busy: submitting, busyTitle: "Checking") {
                Task { await submitPhone() }
            }

            Button("Staff sign in") {
                stage = .staff
            }
            .buttonStyle(TextLinkButtonStyle())
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
        }
    }

    private var passwordStage: some View {
        VStack(alignment: .leading, spacing: 16) {
            labeledField("Password") {
                passwordField
            }
            securityCheck
            if let captchaNote { ErrorNote(message: captchaNote) }
            PrimaryButton(title: "Sign in", busy: submitting, busyTitle: "Signing in") {
                Task { await submitPassword() }
            }
            Button("Forgotten your password? Text me a code") {
                Task { await sendCodeFromPassword() }
            }
            .buttonStyle(TextLinkButtonStyle())
            .disabled(submitting)
            Button("Use a different number") { stage = .phone }
                .buttonStyle(TextLinkButtonStyle())
        }
    }

    private var sendCodeStage: some View {
        VStack(alignment: .leading, spacing: 16) {
            securityCheck
            if let captchaNote { ErrorNote(message: captchaNote) }
            PrimaryButton(title: "Text me a code", busy: submitting, busyTitle: "Sending") {
                Task { await submitSendCode() }
            }
            Button("Use a different number") { stage = .phone }
                .buttonStyle(TextLinkButtonStyle())
        }
    }

    private var codeStage: some View {
        VStack(alignment: .leading, spacing: 16) {
            labeledField("Code") {
                TextField("6-digit code", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .code)
                    .accessibilityLabel("Text message code")
                    .onChange(of: code) { _, newValue in
                        let digits = newValue.filter(\.isNumber)
                        if digits != newValue { code = String(digits.prefix(6)) }
                    }
            }
            PrimaryButton(title: "Continue", busy: submitting, busyTitle: "Checking") {
                Task { await submitCode() }
            }
            Text("To send another code, complete the security check.")
                .font(.subheadline)
                .foregroundStyle(Brand.ink.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)
            securityCheck
            if let captchaNote { ErrorNote(message: captchaNote) }
            Button(cooldown > 0 ? "Send a new code in \(cooldown)s" : "Send a new code") {
                Task { await submitSendCode() }
            }
            .buttonStyle(TextLinkButtonStyle())
            .disabled(submitting || cooldown > 0 || captchaToken == nil)
            Button("Use a different number") { stage = .phone }
                .buttonStyle(TextLinkButtonStyle())
        }
    }

    private var unknownStage: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Join the Pack on the website and we'll get you set up. Once the salon has approved you, come back here and sign in with this number.")
                .font(.body)
                .foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            Link("Join the Pack on the website", destination: SalonLinks.book)
                .font(.headline)
                .foregroundStyle(Brand.cyanDark)
            Button("Use a different number") { stage = .phone }
                .buttonStyle(TextLinkButtonStyle())
        }
    }

    private var staffStage: some View {
        VStack(alignment: .leading, spacing: 16) {
            labeledField("Email") {
                TextField("name@smarterdog.co.uk", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .email)
                    .accessibilityLabel("Email")
                    .submitLabel(.next)
                    .onSubmit { focused = .password }
            }
            labeledField("Password") {
                passwordField
            }
            securityCheck
            if let captchaNote { ErrorNote(message: captchaNote) }
            PrimaryButton(title: "Sign in", busy: submitting, busyTitle: "Signing in") {
                Task { await submitStaff() }
            }
            Button("Customer sign in") { stage = .phone }
                .buttonStyle(TextLinkButtonStyle())
        }
    }

    private var passwordField: some View {
        HStack(spacing: 8) {
            Group {
                if showPassword {
                    TextField("Password", text: $password)
                } else {
                    SecureField("Password", text: $password)
                }
            }
            .textContentType(.password)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focused, equals: .password)
            .accessibilityLabel("Password")

            Button {
                showPassword.toggle()
            } label: {
                Image(systemName: showPassword ? "eye.slash" : "eye")
                    .foregroundStyle(Brand.cyanDark)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showPassword ? "Hide password" : "Show password")
        }
    }

    private var securityCheck: some View {
        SecurityCheckView(siteKey: SupabaseConfig.turnstileSiteKey) { event in
            switch event {
            case .token(let token):
                captchaToken = token
                captchaNote = nil
            case .expired:
                captchaToken = nil
            case .failed:
                captchaToken = nil
                captchaNote = "The security check couldn't finish. Check your connection and try again."
            }
        }
        .id(captchaID)
    }

    private func submitPhone() async {
        await run {
            let next = try await auth.checkPhone(phone)
            switch next {
            case .password(let display):
                recognised = display
                password = ""
                stage = .password
            case .textCode(let display):
                recognised = display
                stage = .sendCode
            case .unknown(let display):
                recognised = display
                stage = .unknown
            }
        }
    }

    private func submitPassword() async {
        guard !password.isEmpty else {
            errorText = "Please enter your password."
            return
        }
        guard let token = requiredCaptchaToken() else { return }
        await run {
            try await auth.signInWithPassword(password, captchaToken: token)
        }
    }

    private func sendCodeFromPassword() async {
        guard let token = requiredCaptchaToken() else { return }
        await run {
            try await auth.sendCode(captchaToken: token)
            code = ""
            stage = .code
            startCooldown()
            invalidateCaptcha()
        }
    }

    private func submitSendCode() async {
        guard cooldown == 0 else { return }
        guard let token = requiredCaptchaToken() else { return }
        await run {
            try await auth.sendCode(captchaToken: token)
            code = ""
            stage = .code
            startCooldown()
            invalidateCaptcha()
        }
    }

    private func submitCode() async {
        await run {
            try await auth.verifyCode(code)
        }
    }

    private func submitStaff() async {
        guard !password.isEmpty else {
            errorText = "Please enter your password."
            return
        }
        guard let token = requiredCaptchaToken() else { return }
        await run {
            try await auth.signInStaff(email: email, password: password, captchaToken: token)
        }
    }

    private func requiredCaptchaToken() -> String? {
        if let captchaToken, !captchaToken.isEmpty { return captchaToken }
        errorText = SupabaseConfig.turnstileSiteKey == nil
            ? "The security check isn't available in this build, so signing in is turned off."
            : "Just finishing the security check — please try again in a moment."
        return nil
    }

    private func run(_ work: () async throws -> Void) async {
        guard !submitting else { return }
        submitting = true
        errorText = nil
        defer { submitting = false }
        do {
            try await work()
        } catch let failure as SignInFailure {
            errorText = failure.message
            invalidateCaptcha()
        } catch {
            errorText = "Something went wrong. Please try again."
            invalidateCaptcha()
        }
    }

    private func invalidateCaptcha() {
        captchaToken = nil
        captchaID += 1
    }

    private func startCooldown() {
        cooldownID += 1
        let id = cooldownID
        cooldown = 60
        Task {
            while cooldown > 0 {
                try? await Task.sleep(for: .seconds(1))
                guard id == cooldownID else { return }
                cooldown = max(0, cooldown - 1)
            }
        }
    }

    private func focus(for stage: Stage) -> Field? {
        switch stage {
        case .phone: .phone
        case .password: .password
        case .staff: .email
        case .code: .code
        case .sendCode, .unknown: nil
        }
    }

    private func announce(_ message: String?) {
        guard let message, !message.isEmpty else { return }
        AccessibilityNotification.Announcement(message).post()
    }

    private func labeledField(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.ink)
            content()
                .font(.body)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Brand.paperLine, lineWidth: 1)
                )
        }
    }
}

struct PaperScreen<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                content()
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 32)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .background(Brand.paper.ignoresSafeArea())
    }
}

struct ErrorNote: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.subheadline)
            .foregroundStyle(Brand.ink)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Brand.yellow, lineWidth: 2)
            )
            .accessibilityLabel("Problem. \(message)")
            .accessibilityAddTraits(.updatesFrequently)
    }
}

struct PrimaryButton: View {
    let title: String
    var busy = false
    var busyTitle = "Please wait"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if busy {
                    HStack(spacing: 10) {
                        ProgressView()
                            .tint(Brand.ink)
                        Text(busyTitle)
                    }
                } else {
                    Text(title)
                }
            }
            .font(.headline)
            .foregroundStyle(Brand.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Brand.yellow)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy ? 0.7 : 1)
        .accessibilityLabel(busy ? busyTitle : title)
    }
}

struct TextLinkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Brand.cyanDark)
            .underline()
            .frame(minHeight: 44)
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

#Preview {
    SignInView(auth: AuthService(previewPhase: .signedOut))
}
