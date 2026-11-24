#if DEBUG
import SwiftUI
import Supabase

/// Debug only, compiled out of Release builds. Launch with `-liveBooking` to run the real booking
/// flow against the staging project, signed in as the throwaway test customer.
///
/// - It refuses to run unless the app is configured for the staging project (`LiveBookingGuard`),
///   so a mistake in the configuration cannot point it at production.
/// - The test customer's email and password come from environment variables set locally in the
///   Xcode scheme (`STAGING_TEST_EMAIL`, `STAGING_TEST_PASSWORD`), never from the repository.
/// - Booking is switched on here and nowhere else.
struct LiveBookingDebugView: View {
    private enum Phase {
        case signingIn
        case ready(SupabaseBookingClient)
        case blocked(String)
    }

    @State private var phase: Phase = .signingIn

    var body: some View {
        switch phase {
        case .signingIn:
            VStack(spacing: AppSpace.s2) {
                ProgressView()
                Text("Signing in to staging…")
                    .font(.footnote)
                    .foregroundStyle(AppColor.textSecondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AppColor.surface.ignoresSafeArea())
            .task { await signIn() }
        case .ready(let client):
            VStack(spacing: 0) {
                Text("LIVE BOOKING · STAGING · creates real bookings")
                    .font(.caption.weight(.heavy))
                    .tracking(0.8)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Color.red)
                NavigationStack { BookingFlowView(client: client, canBook: true) }
            }
        case .blocked(let reason):
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                Text("Live booking is not available")
                    .appHeading(.title3)
                    .foregroundStyle(AppColor.textPrimary)
                Text(reason)
                    .font(.body)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(AppSpace.s2)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(AppColor.surface.ignoresSafeArea())
        }
    }

    private func signIn() async {
        guard LiveBookingGuard.isStaging(SupabaseConfig.urlString) else {
            phase = .blocked("The app is not configured for the staging project, so live booking is switched off. Point Config.local.xcconfig at staging (see ios/README.md), then run again. This mode refuses to run against any other project.")
            return
        }
        let environment = ProcessInfo.processInfo.environment
        guard let email = environment["STAGING_TEST_EMAIL"], !email.isEmpty,
              let password = environment["STAGING_TEST_PASSWORD"], !password.isEmpty else {
            phase = .blocked("Set STAGING_TEST_EMAIL and STAGING_TEST_PASSWORD as environment variables in the Xcode scheme (Product, Scheme, Edit Scheme, Run, Arguments). See ios/README.md.")
            return
        }
        guard let supabase = SalonClient.make() else {
            phase = .blocked("The app has no Supabase configuration.")
            return
        }
        do {
            _ = try await supabase.auth.signIn(email: email, password: password)
            phase = .ready(SupabaseBookingClient(supabase: supabase))
        } catch {
            phase = .blocked("Signing in to staging failed. Check the email and password in the scheme's environment variables.")
        }
    }
}
#endif
