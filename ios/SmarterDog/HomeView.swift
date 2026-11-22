import SwiftUI

/// Customer Home: the next grooms and the customer's dogs. Read-only for now.
/// Styled to the flyer style board: cream paper, white cards, a Poppins Black
/// hero title with one yellow swash, one handwritten line, blue for "now".
@MainActor
@Observable
final class HomeModel {
    enum State: Equatable {
        case loading
        case loaded(HomeSnapshot)
        case failed
    }

    private(set) var state: State = .loading
    private let client: SalonHomeClient?

    init(client: SalonHomeClient?) {
        self.client = client
    }

    func load() async {
        guard let client else {
            state = .failed
            return
        }
        do {
            let result = try await client.loadHome()
            state = .loaded(HomeSelector.snapshot(bookings: result.bookings, dogs: result.dogs, now: Date()))
        } catch {
            // Never show an empty "nothing booked" screen when the real answer is unknown.
            state = .failed
        }
    }
}

struct CustomerHomeView: View {
    let account: AccountCard
    var auth: AuthService
    @State private var model = HomeModel(client: SupabaseHomeClient.make())

    var body: some View {
        VStack(spacing: 0) {
            BrandStripe()
                .padding(.horizontal, AppSpace.s2)
                .padding(.top, AppSpace.s1)
            ScrollView {
                VStack(alignment: .leading, spacing: AppSpace.s3) {
                    hero
                    content
                    Button("Sign out") {
                        Task { await auth.signOut() }
                    }
                    .buttonStyle(TextLinkButtonStyle())
                }
                .padding(.horizontal, AppSpace.s2)
                .padding(.vertical, AppSpace.s3)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await model.load() }
        }
        .background(AppColor.surface.ignoresSafeArea())
        .task { await model.load() }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: AppSpace.half) {
            HeroTitle(text: firstName.map { "Hello, \($0)." } ?? "Hello.")
            HandwrittenLine(text: "See you soon!")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var firstName: String? {
        account.name.split(separator: " ").first.map(String.init)
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .tint(AppColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("Loading your bookings")
        case .failed:
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                ErrorNote(message: "We couldn't load your bookings. Check your connection and try again.")
                PrimaryButton(title: "Try again") {
                    Task { await model.load() }
                }
            }
        case .loaded(let snapshot):
            upcoming(snapshot.upcoming)
            dogs(snapshot.dogs)
        }
    }

    private func upcoming(_ grooms: [UpcomingGroom]) -> some View {
        VStack(alignment: .leading, spacing: AppSpace.s1_5) {
            SectionLabel(text: "Coming up")
            if grooms.isEmpty {
                VStack(alignment: .leading, spacing: AppSpace.s1) {
                    Text("Nothing booked yet.")
                        .appHeading(.title3)
                        .foregroundStyle(AppColor.textPrimary)
                    Text("Booking from the app is coming. For now, book on the website.")
                        .font(.body)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    TextLink(title: "Book on the website", destination: SalonLinks.book)
                }
                .cardSurface()
            } else {
                ForEach(grooms) { groom in
                    GroomCard(groom: groom)
                }
            }
        }
    }

    @ViewBuilder
    private func dogs(_ dogs: [DogSummary]) -> some View {
        if !dogs.isEmpty {
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                SectionLabel(text: "Your dogs")
                VStack(spacing: 0) {
                    ForEach(Array(dogs.enumerated()), id: \.element.id) { index, dog in
                        DogRowView(dog: dog)
                        if index < dogs.count - 1 {
                            Divider().overlay(AppColor.separator)
                        }
                    }
                }
                .cardSurface()
            }
        }
    }
}

private struct GroomCard: View {
    let groom: UpcomingGroom

    var body: some View {
        VStack(alignment: .leading, spacing: AppSpace.half) {
            HStack(alignment: .firstTextBaseline) {
                Text(groom.dogName)
                    .font(.headline)
                    .foregroundStyle(AppColor.textPrimary)
                Spacer(minLength: AppSpace.s1)
                Text(groom.isToday ? "Today" : groom.statusText)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(groom.isToday ? AppColor.accentBlueDeep : AppColor.textSecondary)
            }
            Text(groom.service)
                .font(.subheadline)
                .foregroundStyle(AppColor.textSecondary)
            Text("\(groom.dateText) · \(groom.timeText)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppColor.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }
}

private struct DogRowView: View {
    let dog: DogSummary

    var body: some View {
        HStack(spacing: AppSpace.s1_5) {
            SizeChip(letter: dog.sizeLetter)
            VStack(alignment: .leading, spacing: 0) {
                Text(dog.name)
                    .font(.headline)
                    .foregroundStyle(AppColor.textPrimary)
                if !dog.breed.isEmpty {
                    Text(dog.breed)
                        .font(.subheadline)
                        .foregroundStyle(AppColor.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, AppSpace.s1_5)
        .accessibilityElement(children: .combine)
    }
}

/// Style board decision 7: only Large stands out. Small and Medium are plain
/// outlined chips; Large is solid navy. The letter is always shown.
private struct SizeChip: View {
    let letter: String?

    var body: some View {
        let isLarge = letter == "L"
        Text(letter ?? "–")
            .font(.caption.weight(.heavy))
            .foregroundStyle(isLarge ? Color.white : AppColor.textPrimary)
            .frame(width: AppSpace.s3, height: AppSpace.s3)
            .background(isLarge ? AppColor.dashNavy : AppColor.surfaceRaised, in: Circle())
            .overlay(Circle().strokeBorder(isLarge ? AppColor.dashNavy : AppColor.textPrimary, lineWidth: 2))
            .accessibilityLabel(sizeWords)
    }

    private var sizeWords: String {
        switch letter {
        case "S": "Small"
        case "M": "Medium"
        case "L": "Large"
        default: "Size not confirmed"
        }
    }
}

private struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .tracking(1.4)
            .foregroundStyle(AppColor.textSecondary)
            .accessibilityAddTraits(.isHeader)
    }
}

private extension View {
    /// White card on cream paper with the warm soft shadow.
    func cardSurface() -> some View {
        padding(AppSpace.s2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppColor.surfaceRaised, in: RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous).strokeBorder(AppColor.separator, lineWidth: 1))
            .appCardShadow()
    }
}

#Preview("Home") {
    CustomerHomeView(
        account: AccountCard(name: "Sam Taylor", roleLabel: "Customer"),
        auth: AuthService(previewPhase: .customer(AccountCard(name: "Sam Taylor", roleLabel: "Customer")))
    )
}
