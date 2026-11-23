import SwiftUI

/// The booking wizard's screens. Thin: they show `BookingFlowModel` and call it. This slice has
/// the first step (pick a dog); the other steps arrive in the next ones, and nothing here can
/// send a booking. It is reachable only from the Debug sample mode (`-sampleBooking`) for now,
/// so no customer sees a half-built flow.
struct BookingFlowView: View {
    @State private var model: BookingFlowModel

    init(client: SalonBookingDataClient? = SupabaseBookingClient.make()) {
        _model = State(initialValue: BookingFlowModel(client: client))
    }

    var body: some View {
        VStack(spacing: 0) {
            BrandStripe()
                .padding(.horizontal, AppSpace.s2)
                .padding(.top, AppSpace.s1)
            ScrollView {
                VStack(alignment: .leading, spacing: AppSpace.s3) {
                    header
                    stepContent
                }
                .padding(.horizontal, AppSpace.s2)
                .padding(.vertical, AppSpace.s3)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
            footer
        }
        .background(AppColor.surface.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadDogs() }
    }

    // MARK: header

    private var header: some View {
        VStack(alignment: .leading, spacing: AppSpace.s1_5) {
            Text(model.stepCaption.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .foregroundStyle(AppColor.textSecondary)
            HighlightedWord(text: model.step.title)
                .appHero()
                .foregroundStyle(AppColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            StepDots(current: model.step)
        }
    }

    // MARK: steps

    @ViewBuilder
    private var stepContent: some View {
        switch model.step {
        case .dog:
            dogStep
        default:
            Text("This step is coming next.")
                .font(.body)
                .foregroundStyle(AppColor.textSecondary)
                .cardSurface()
        }
    }

    @ViewBuilder
    private var dogStep: some View {
        switch model.dogsState {
        case .loading:
            ProgressView()
                .tint(AppColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("Loading your dogs")
        case .failed:
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                ErrorNote(message: "We couldn't load your dogs. Check your connection and try again.")
                PrimaryButton(title: "Try again") { Task { await model.loadDogs() } }
            }
        case .loaded(let dogs):
            if dogs.isEmpty {
                VStack(alignment: .leading, spacing: AppSpace.s1) {
                    Text("You haven't added a dog yet.")
                        .appHeading(.title3)
                        .foregroundStyle(AppColor.textPrimary)
                    Text("Add your dog from the Home screen, then come back to book.")
                        .font(.body)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .cardSurface()
            } else {
                VStack(spacing: AppSpace.s1_5) {
                    ForEach(dogs) { dog in
                        DogChoiceRow(dog: dog, selected: model.selectedDogId == dog.id) {
                            model.select(dog: dog)
                        }
                    }
                }
                blockedDogNotes
            }
        }
    }

    /// The website's explanations, with a way to unblock: message the salon.
    @ViewBuilder
    private var blockedDogNotes: some View {
        if model.hasUnsizedDog || model.hasPregnantDog {
            VStack(alignment: .leading, spacing: AppSpace.half) {
                if model.hasUnsizedDog {
                    Text("We need to confirm a pup’s size before booking them in.")
                }
                if model.hasPregnantDog {
                    Text("Pregnant dogs need a quick chat first.")
                }
                TextLink(title: "Message us on WhatsApp 🐾", destination: SalonLinks.whatsApp)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(AppColor.textSecondary)
        }
    }

    // MARK: footer

    private var footer: some View {
        HStack(spacing: AppSpace.s1_5) {
            if model.step != .dog {
                Button("Back") { model.back() }
                    .buttonStyle(BackButtonStyle())
            }
            if model.step != .summary {
                PrimaryButton(title: "Continue") { model.next() }
                    .disabled(!model.canContinue)
                    .opacity(model.canContinue ? 1 : 0.5)
            }
        }
        .padding(.horizontal, AppSpace.s2)
        .padding(.vertical, AppSpace.s1_5)
        .frame(maxWidth: .infinity)
        .background(AppColor.surface)
    }
}

// MARK: - Pieces

/// One dog. A dog that cannot be booked is shown, with the website's reason, and cannot be tapped.
/// Selected is brand blue (a ring, a tint and a tick), never colour alone.
private struct DogChoiceRow: View {
    let dog: BookingDog
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous)
        Button(action: action) {
            HStack(spacing: AppSpace.s1_5) {
                SizeChip(letter: HomeSelector.sizeLetter(dog.confirmedSize?.rawValue))
                VStack(alignment: .leading, spacing: AppSpace.half) {
                    Text(dog.name)
                        .font(.headline)
                        .foregroundStyle(dog.isBookable ? AppColor.textPrimary : AppColor.textSecondary)
                    if !dog.breed.isEmpty {
                        Text(dog.breed)
                            .font(.subheadline)
                            .foregroundStyle(AppColor.textSecondary)
                    }
                    if let blocker = dog.blocker {
                        Text(blocker.note)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(AppColor.warning)
                    }
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(AppColor.accentBlueDeep)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 44)
            .cardSurface()
            .overlay(shape.fill(selected ? AppColor.accentBlueDeep.opacity(0.08) : Color.clear).allowsHitTesting(false))
            .overlay(shape.strokeBorder(selected ? AppColor.accentBlueDeep : Color.clear, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .disabled(!dog.isBookable)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// The website's stepper: done steps are brand blue with a tick, the current one is ringed in
/// ink, later ones are plain. Decoration: the heading already says "Step 2 of 5".
private struct StepDots: View {
    let current: BookingStep

    var body: some View {
        HStack(spacing: 0) {
            ForEach(BookingStep.allCases, id: \.self) { step in
                dot(for: step)
                if step != BookingStep.allCases.last {
                    Rectangle()
                        .fill(step < current ? AppColor.accentBlueDeep : AppColor.separator)
                        .frame(height: 2)
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func dot(for step: BookingStep) -> some View {
        let done = step < current
        return ZStack {
            Circle().fill(done ? AppColor.accentBlueDeep : AppColor.surfaceRaised)
            Circle().strokeBorder(
                done ? AppColor.accentBlueDeep : (step == current ? AppColor.textPrimary : AppColor.separator),
                lineWidth: 2
            )
            if done {
                Image(systemName: "checkmark")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(AppColor.surfaceRaised)
            } else {
                Text("\(step.rawValue + 1)")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(step == current ? AppColor.textPrimary : AppColor.textSecondary)
            }
        }
        .frame(width: 26, height: 26)
    }
}

/// A quiet capsule beside the yellow Continue. Yellow stays for the one lead action.
private struct BackButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(AppColor.textPrimary)
            .padding(.horizontal, AppSpace.s3)
            .frame(minHeight: 44)
            .background(AppColor.surfaceRaised, in: Capsule())
            .overlay(Capsule().strokeBorder(AppColor.separator, lineWidth: 1.5))
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

#Preview("Pick a dog") {
    NavigationStack { BookingFlowView(client: PreviewBookingClient()) }
}

private struct PreviewBookingClient: SalonBookingDataClient {
    func loadDogs() async throws -> [BookingDogRow] {
        [
            BookingDogRow(id: "1", name: "Biscuit", breed: "Cockapoo", size: "medium", is_pregnant: false),
            BookingDogRow(id: "2", name: "Moose", breed: "Newfoundland", size: "large", is_pregnant: false),
            BookingDogRow(id: "3", name: "Pip", breed: "Cavapoo", size: nil, is_pregnant: false),
            BookingDogRow(id: "4", name: "Bella", breed: "Poodle", size: "small", is_pregnant: true),
        ]
    }
}
