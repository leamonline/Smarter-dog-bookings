import SwiftUI

struct RootView: View {
    var auth: AuthService

    var body: some View {
        Group {
            switch auth.phase {
            case .restoring:
                StatusScreen(title: "Smarter Dog", message: "Opening your sign-in.", showsProgress: true)
            case .resolving:
                StatusScreen(title: "Smarter Dog", message: "Checking your account.", showsProgress: true)
            case .needsConfiguration:
                NeedsConfigurationView()
            case .signedOut:
                SignInView(auth: auth)
            case .customer(let account):
                CustomerHomeView(account: account, auth: auth)
            case .staff(let account):
                HomeRoot(account: account, auth: auth)
            case .pending(let account):
                PendingApprovalView(account: account, auth: auth)
            case .staffDenied(let email):
                MessageScreen(
                    title: "Staff access needed",
                    message: "\(email) is signed in, but it doesn't have a staff profile for this salon.",
                    auth: auth
                )
            case .accountMissing:
                MessageScreen(
                    title: "We can't find your record",
                    message: "You're signed in, but we don't have a customer record for this number yet. Join the Pack on the website. Once the salon has approved you, sign in here again.",
                    linkTitle: "Join the Pack on the website",
                    link: SalonLinks.book,
                    auth: auth
                )
            case .accountError(let message):
                AccountErrorView(message: message, auth: auth)
            }
        }
        .tint(AppColor.accentBlueDeep)
    }
}

private struct HomeRoot: View {
    let account: AccountCard
    var auth: AuthService

    var body: some View {
        TabView {
            PaperScreen {
                Text("Home")
                    .appHeading(.largeTitle)
                    .foregroundStyle(AppColor.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                Text(account.name)
                    .appHeading(.title2)
                    .foregroundStyle(AppColor.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(account.roleLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppColor.textSecondary)
                    .accessibilityLabel("Role, \(account.roleLabel)")

                Text("You're signed in. Booking from the phone comes later.")
                    .font(.body)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Sign out") {
                    Task { await auth.signOut() }
                }
                .buttonStyle(TextLinkButtonStyle())
            }
            .tabItem {
                Label("Home", systemImage: "house.fill")
            }
        }
    }
}

private struct PendingApprovalView: View {
    let account: PendingAccount
    var auth: AuthService

    var body: some View {
        PaperScreen {
            VStack(alignment: .leading, spacing: AppSpace.s1) {
                IconCircle(systemName: "pawprint.fill")
                Text(title)
                    .appHeading(.title2)
                    .foregroundStyle(AppColor.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if account.showsName {
                Text(account.name)
                    .appHeading(.headline)
                    .foregroundStyle(AppColor.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Text(message)
                .font(.body)
                .foregroundStyle(AppColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

            Text("Got a question while you wait?")
                .font(.subheadline)
                .foregroundStyle(AppColor.textSecondary)
            TextLink(title: "Message us on WhatsApp", destination: SalonLinks.whatsApp)

            if account.hold == .finishOnTheWebsite {
                TextLink(title: "Finish joining on the website", destination: SalonLinks.book)
            }

            PrimaryButton(title: "Check again") {
                auth.refreshAccount()
            }

            Button("Sign out") {
                Task { await auth.signOut() }
            }
            .buttonStyle(TextLinkButtonStyle())
        }
    }

    private var title: String {
        switch account.hold {
        case .claimsExisting:
            "Thanks — looks like we already know you!"
        case .waiting:
            "Thanks — you're on the list!"
        case .finishOnTheWebsite:
            "Finish joining on the website"
        }
    }

    private var message: String {
        switch account.hold {
        case .claimsExisting:
            "This number is new to us, but your name matches someone already on our books. One of the team will link this login to your existing record — you don't need to do anything. We usually do this on salon days, Monday to Wednesday, and we'll send you a message as soon as it's done so you can book as usual."
        case .waiting:
            "We've got your details and one of the team will check everything over. We usually look at new sign-ups on salon days, Monday to Wednesday, and we'll message you as soon as you're approved — then you can book your first appointment. You can close the app; you don't need to wait here."
        case .finishOnTheWebsite:
            "You've started Join the Pack, but the questions are still on the website. Finish them there. When the salon has approved you, open the app and tap Check again."
        }
    }
}

private struct NeedsConfigurationView: View {
    var body: some View {
        PaperScreen {
            Text("Smarter Dog")
                .appHeading(.largeTitle)
                .foregroundStyle(AppColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            Text("This copy of the app isn't connected to the salon yet.")
                .appHeading(.title3)
                .foregroundStyle(AppColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Text("Sign-in needs the Supabase project address and the public anon key. They are added on the Mac, or as two Xcode Cloud variables, before a TestFlight build can sign anyone in. The instructions are in the iPhone notes in the project.")
                .font(.body)
                .foregroundStyle(AppColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct MessageScreen: View {
    let title: String
    let message: String
    var linkTitle: String?
    var link: URL?
    var auth: AuthService

    var body: some View {
        PaperScreen {
            Text(title)
                .appHeading(.title2)
                .foregroundStyle(AppColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .font(.body)
                .foregroundStyle(AppColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let linkTitle, let link {
                TextLink(title: linkTitle, destination: link)
            }
            Button("Sign out") {
                Task { await auth.signOut() }
            }
            .buttonStyle(TextLinkButtonStyle())
        }
    }
}

private struct AccountErrorView: View {
    let message: String
    var auth: AuthService

    var body: some View {
        PaperScreen {
            Text("Smarter Dog")
                .appHeading(.largeTitle)
                .foregroundStyle(AppColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ErrorNote(message: message)
            PrimaryButton(title: "Try again") {
                auth.refreshAccount()
            }
            Button("Sign out") {
                Task { await auth.signOut() }
            }
            .buttonStyle(TextLinkButtonStyle())
        }
    }
}

private struct StatusScreen: View {
    let title: String
    let message: String
    let showsProgress: Bool

    var body: some View {
        PaperScreen {
            Text(title)
                .appHeading(.largeTitle)
                .foregroundStyle(AppColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if showsProgress {
                ProgressView()
                    .tint(AppColor.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel(message)
            }
            Text(message)
                .font(.body)
                .foregroundStyle(AppColor.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#Preview("Customer") {
    RootView(auth: AuthService(previewPhase: .customer(AccountCard(name: "Sam Taylor", roleLabel: "Customer"))))
}

#Preview("Pending") {
    RootView(auth: AuthService(previewPhase: .pending(PendingAccount(name: "Sam Taylor", showsName: true, hold: .waiting))))
}
