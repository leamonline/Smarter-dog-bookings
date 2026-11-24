import SwiftUI

/// The staff side of the app: Today, built natively, and More, which opens the
/// staff website for everything done at the desk. See
/// `docs/plans/active/2026-11-23-iphone-staff.md`.
struct StaffRootView: View {
    let account: AccountCard
    var auth: AuthService

    var body: some View {
        TabView {
            StaffTodayView()
                .tabItem {
                    Label("Today", systemImage: "list.bullet.rectangle.portrait")
                }
            StaffMoreView(account: account, auth: auth)
                .tabItem {
                    Label("More", systemImage: "ellipsis.circle")
                }
        }
    }
}

/// Links to the staff website, the signed-in person and Sign out.
struct StaffMoreView: View {
    let account: AccountCard
    var auth: AuthService

    var body: some View {
        PaperScreen {
            VStack(alignment: .leading, spacing: AppSpace.half) {
                Text("More")
                    .appHeading(.largeTitle)
                    .foregroundStyle(AppColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("These open the staff website in your browser.")
                    .font(.subheadline)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: AppSpace.s1) {
                ForEach(StaffLinks.more) { item in
                    Link(destination: item.url) {
                        HStack(spacing: AppSpace.s1_5) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(AppColor.textPrimary)
                                Text(item.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(AppColor.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: AppSpace.s1)
                            Image(systemName: "arrow.up.right")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(AppColor.accentBlueDeep)
                                .accessibilityHidden(true)
                        }
                        .frame(minHeight: 44)
                        .cardSurface()
                    }
                    .accessibilityHint("Opens the staff website")
                }
            }

            VStack(alignment: .leading, spacing: AppSpace.half) {
                SectionLabel(text: "Signed in")
                Text(account.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(AppColor.textPrimary)
                Text(account.roleLabel)
                    .font(.subheadline)
                    .foregroundStyle(AppColor.textSecondary)
            }

            Button("Sign out") {
                Task { await auth.signOut() }
            }
            .buttonStyle(TextLinkButtonStyle())
        }
    }
}

#Preview("Staff") {
    StaffRootView(
        account: AccountCard(name: "Alex Groomer", roleLabel: "Owner"),
        auth: AuthService(previewPhase: .staff(AccountCard(name: "Alex Groomer", roleLabel: "Owner")))
    )
}
