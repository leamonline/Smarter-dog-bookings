import SwiftUI

/// The booking wizard's screens. Thin: they show `BookingFlowModel` and call it. This slice has
/// the first four steps (pick a dog, choose a service, pick a date, choose a time); the others arrive in the next ones, and
/// nothing here can send a booking. It is reachable only from the Debug sample mode (`-sampleBooking`) for now,
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
        // The date step reads the calendar the first time it appears, not before.
        .task(id: model.step) {
            if model.step == .date {
                if model.calendarState == .idle {
                    await model.loadDateStep()
                } else {
                    // Coming back from the time step: the remembered pages were dropped, so this reads
                    // the page again and shows any change staff have made since.
                    await model.showDatePage(model.datePage)
                }
            }
            // The time step reads the chosen day afresh every time it appears: a slot may have gone.
            if model.step == .time { await model.loadTimes() }
        }
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
        case .service:
            serviceStep
        case .date:
            dateStep
        case .time:
            timeStep
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

    /// The website's service step for one dog: its sentence about starting prices, then a tile
    /// per service the dog's size can have (Puppy Groom is not offered for large dogs).
    private var serviceStep: some View {
        VStack(alignment: .leading, spacing: AppSpace.s1_5) {
            Text(BookingService.startingPriceNote)
                .font(.subheadline)
                .foregroundStyle(AppColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let name = model.selectedDogName {
                SectionLabel(text: name)
            }
            ForEach(model.offeredServices, id: \.self) { service in
                ServiceChoiceRow(
                    service: service,
                    priceLine: model.priceLine(for: service),
                    selected: model.selectedService == service
                ) {
                    model.select(service: service)
                }
            }
        }
    }

    /// The date step: a list by week, not the website's grid. The salon is open Monday to Wednesday,
    /// so a grid would be mostly closed cells with small targets. Closed and fully booked days stay
    /// in the list, greyed and labelled, so the customer can see why a day is missing.
    @ViewBuilder
    private var dateStep: some View {
        if model.calendarState != .loaded {
            ProgressView()
                .tint(AppColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("Loading available days")
        } else {
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                if let name = model.selectedDogName {
                    Text("Pick a day for \(name). Days we can't take \(name) on are greyed out.")
                        .font(.subheadline)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if model.calendarIsIncomplete {
                    ErrorNote(message: "We couldn't check every day, so one may turn out to be full when you pick a time.")
                    Button("Check again") { Task { await model.showDatePage(model.datePage) } }
                        .buttonStyle(BackButtonStyle())
                }
                if let offer = model.lastMinuteOffer {
                    LastMinuteRow(offer: offer, selected: model.isLastMinuteSelected) {
                        model.selectLastMinute()
                    }
                }
                if model.canShowEarlierDates {
                    Button("Show earlier dates") { Task { await model.showDatePage(model.datePage - 1) } }
                        .buttonStyle(BackButtonStyle())
                }
                ForEach(model.dateWeeks) { week in
                    SectionLabel(text: week.heading)
                    ForEach(week.days) { day in
                        DateChoiceRow(option: day, selected: model.selectedDate == day.date) {
                            model.select(date: day.date)
                        }
                    }
                }
                if model.canShowLaterDates {
                    Button("Show later dates") { Task { await model.showDatePage(model.datePage + 1) } }
                        .buttonStyle(BackButtonStyle())
                }
            }
        }
    }

    /// The time step: only the times this dog can be booked at, as morning and afternoon drop-offs.
    @ViewBuilder
    private var timeStep: some View {
        switch model.timesState {
        case .idle, .loading:
            ProgressView()
                .tint(AppColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel("Checking availability")
        case .failed:
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                ErrorNote(message: "We couldn't check availability just now. Please try again.")
                PrimaryButton(title: "Try again") { Task { await model.loadTimes() } }
            }
        case .closed:
            VStack(alignment: .leading, spacing: AppSpace.s1) {
                Text("We're closed on \(model.selectedDateText ?? "this day")")
                    .appHeading(.title3)
                    .foregroundStyle(AppColor.textPrimary)
                Text("Go back and pick a different day.")
                    .font(.body)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .cardSurface()
        case .loaded:
            if model.timeGroups.isEmpty {
                VStack(alignment: .leading, spacing: AppSpace.s1) {
                    Text(model.timesAreLastMinute
                         ? "Today's last-minute times have gone"
                         : "Fully booked on \(model.selectedDateText ?? "this day")")
                        .appHeading(.title3)
                        .foregroundStyle(AppColor.textPrimary)
                    Text(model.timesAreLastMinute
                         ? "They do get snapped up fast — pick another day and we'll see you then."
                         : "Try a different day.")
                        .font(.body)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .cardSurface()
            } else {
                VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                    if let name = model.selectedDogName, let day = model.selectedDateText {
                        Text("\(name) on \(day)")
                            .font(.subheadline)
                            .foregroundStyle(AppColor.textSecondary)
                    }
                    ForEach(model.timeGroups) { group in
                        SectionLabel(text: group.title)
                        ForEach(group.slots, id: \.self) { slot in
                            TimeChoiceRow(slot: slot, selected: model.selectedTime == slot) {
                                model.select(time: slot)
                            }
                        }
                    }
                }
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
            .choiceHighlight(selected: selected)
        }
        .buttonStyle(.plain)
        .disabled(!dog.isBookable)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// One service: its mascot, name, one-line description and starting price. Selected looks the
/// same as a selected dog.
private struct ServiceChoiceRow: View {
    let service: BookingService
    let priceLine: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppSpace.s1_5) {
                if let mascot = ServiceMascot.assetName(forService: service.rawValue) {
                    MascotCircle(assetName: mascot, size: 52)
                }
                VStack(alignment: .leading, spacing: AppSpace.half) {
                    Text(service.rawValue)
                        .font(.headline)
                        .foregroundStyle(AppColor.textPrimary)
                    Text(service.summary)
                        .font(.caption)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let priceLine {
                        Text(priceLine)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppColor.textPrimary)
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
            .choiceHighlight(selected: selected)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// One day. A day that cannot be picked shows why ("Closed", "Fully booked") and cannot be tapped.
private struct DateChoiceRow: View {
    let option: DateOption
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppSpace.s1_5) {
                Text(option.title)
                    .font(.headline)
                    .foregroundStyle(option.isSelectable ? AppColor.textPrimary : AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if let label = option.state.label {
                    Text(label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppColor.textSecondary)
                } else if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(AppColor.accentBlueDeep)
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: 44)
            .cardSurface()
            .choiceHighlight(selected: selected)
            .opacity(option.isSelectable ? 1 : 0.6)
        }
        .buttonStyle(.plain)
        .disabled(!option.isSelectable)
        .accessibilityElement(children: .combine)
        .accessibilityValue(option.state.label ?? "")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// One drop-off time, written as the website writes it ("9:30am").
private struct TimeChoiceRow: View {
    let slot: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppSpace.s1_5) {
                Image(systemName: "clock")
                    .font(.title3)
                    .foregroundStyle(AppColor.textSecondary)
                    .accessibilityHidden(true)
                Text(TimePlanner.label(slot))
                    .font(.headline)
                    .foregroundStyle(AppColor.textPrimary)
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
            .choiceHighlight(selected: selected)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// Today's staff-opened slots. Shown only when there is something to book, above the list.
private struct LastMinuteRow: View {
    let offer: LastMinuteOffer
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppSpace.s1_5) {
                Image(systemName: "bolt.fill")
                    .font(.title3)
                    .foregroundStyle(AppColor.textPrimary)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: AppSpace.half) {
                    Text(offer.title)
                        .font(.headline)
                        .foregroundStyle(AppColor.textPrimary)
                    Text("Times: " + offer.slots.map(HomeSelector.timeText).joined(separator: ", "))
                        .font(.subheadline)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
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
            .choiceHighlight(selected: selected)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

private extension View {
    /// Style board decision 5: brand blue marks "selected". A ring, a tint (and the tick the
    /// row draws), never colour alone.
    func choiceHighlight(selected: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous)
        return overlay(shape.fill(selected ? AppColor.accentBlueDeep.opacity(0.08) : Color.clear).allowsHitTesting(false))
            .overlay(shape.strokeBorder(selected ? AppColor.accentBlueDeep : Color.clear, lineWidth: 2))
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

    func loadRules() async -> Data? { nil }
    func loadCalendar(from: String, to: String) async -> SalonCalendar { .empty }
    func loadLastMinuteSlots() async -> [ImmediateSlotRow] { [] }
}
