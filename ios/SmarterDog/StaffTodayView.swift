import SwiftUI

/// Staff Today: the day's dogs in appointment order, read only. Each row says the
/// dog's status in words, its safety warnings and how long it has been where it is,
/// exactly as the staff website's Today stack does (`StaffDayStack`). Tap a row for
/// the details. Changes are made on the website for now.
struct StaffTodayView: View {
    @State private var model: StaffTodayModel
    @State private var selected: StaffDayRow?
    @Environment(\.scenePhase) private var scenePhase

    init(client: StaffDayClient? = SupabaseStaffDayClient.make()) {
        _model = State(initialValue: StaffTodayModel(client: client))
    }

    var body: some View {
        VStack(spacing: 0) {
            BrandStripe()
                .padding(.horizontal, AppSpace.s2)
                .padding(.top, AppSpace.s1)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: AppSpace.s1_5) {
                    header
                    content
                }
                .padding(.horizontal, AppSpace.s2)
                .padding(.vertical, AppSpace.s2)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await model.load() }
        }
        .background(AppColor.surface.ignoresSafeArea())
        .task { await model.load() }
        // Coming back to the app: the salon may have moved on.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
        // The timing lines move on with the clock without another read.
        .task(id: model.date) {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                model.tick()
            }
        }
        .sheet(item: $selected) { row in
            StaffRowDetail(row: row)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: AppSpace.s1) {
            HStack(spacing: AppSpace.half) {
                Button {
                    Task { await model.showPreviousDay() }
                } label: {
                    dayArrow("chevron.left")
                }
                .accessibilityLabel("Previous day")
                VStack(alignment: .leading, spacing: 0) {
                    Text(model.isShowingToday ? "Today" : StaffDaySelector.dateText(model.date, short: true))
                        .appHeading(.largeTitle)
                        .foregroundStyle(AppColor.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .accessibilityAddTraits(.isHeader)
                    Text(StaffDaySelector.dateText(model.date))
                        .font(.subheadline)
                        .foregroundStyle(AppColor.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                Button {
                    Task { await model.showNextDay() }
                } label: {
                    dayArrow("chevron.right")
                }
                .accessibilityLabel("Next day")
            }

            HStack(spacing: AppSpace.s1) {
                if case .loaded(let snapshot) = model.state {
                    Text(StaffDaySelector.totals(snapshot))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppColor.textSecondary)
                    if !snapshot.isOpen {
                        Text("Salon closed")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppColor.textSecondary)
                            .padding(.horizontal, AppSpace.s1)
                            .padding(.vertical, 2)
                            .background(AppColor.separator.opacity(0.5), in: Capsule())
                    }
                }
                Spacer(minLength: 0)
                if !model.isShowingToday {
                    Button("Back to today") {
                        Task { await model.showToday() }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppColor.accentBlueDeep)
                    .frame(minHeight: 44)
                }
            }
        }
    }

    private func dayArrow(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.title3.weight(.semibold))
            .foregroundStyle(AppColor.textPrimary)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .tint(AppColor.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, AppSpace.s2)
                .accessibilityLabel("Loading the day")
        case .failed:
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                ErrorNote(message: "We couldn't load this day. Check your connection and try again.")
                PrimaryButton(title: "Try again") {
                    Task { await model.load() }
                }
            }
        case .loaded(let snapshot):
            if snapshot.rows.isEmpty {
                emptyDay(snapshot)
            } else {
                ForEach(snapshot.rows) { row in
                    Button {
                        selected = row
                    } label: {
                        StaffDayRowView(row: row)
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(StaffDaySelector.accessibilityLabel(row))
                    .accessibilityHint("Shows the details")
                    .accessibilityAddTraits(.isButton)
                }
            }
        }
    }

    /// A confirmed empty day only. A failed read never lands here.
    @ViewBuilder
    private func emptyDay(_ snapshot: StaffDaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: AppSpace.s1) {
            if snapshot.goneHome > 0 {
                HeroTitle(text: "All groomed.")
                Text(snapshot.goneHome == 1 ? "1 dog has gone home." : "\(snapshot.goneHome) dogs have gone home.")
                    .font(.body)
                    .foregroundStyle(AppColor.textSecondary)
            } else if !snapshot.isOpen {
                HeroTitle(text: "Salon closed.")
                Text("No dogs booked.")
                    .font(.body)
                    .foregroundStyle(AppColor.textSecondary)
            } else {
                HeroTitle(text: "Nothing booked.")
                HandwrittenLine(text: "Blue skies.")
            }
        }
        .padding(.top, AppSpace.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - A row

/// One dog: the strip from the website's stack. Line 1 is time, name and status;
/// line 2 the safety note, breed · service · surname and the timing.
struct StaffDayRowView: View {
    let row: StaffDayRow
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let tone = row.tone
        HStack(spacing: 0) {
            Rectangle()
                .fill(Color(hex: tone.edge))
                .frame(width: row.readyOverdue ? 6 : 4)
            VStack(alignment: .leading, spacing: AppSpace.half) {
                HStack(alignment: .firstTextBaseline, spacing: AppSpace.s1) {
                    if let time = StaffDaySelector.timeText(row.time) {
                        Text(time)
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(Color(hex: tone.ink))
                    }
                    Text(StaffDaySelector.dogName(row.booking))
                        .font(.headline)
                        .foregroundStyle(Color(hex: tone.ink))
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    Spacer(minLength: AppSpace.s1)
                    StaffStatusPill(tone: tone)
                }
                secondLine(tone)
            }
            .padding(.vertical, AppSpace.s1_5)
            .padding(.horizontal, AppSpace.s1_5)
        }
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .background(Color(hex: tone.tint))
        .clipShape(RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous).strokeBorder(AppColor.separator, lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous))
    }

    @ViewBuilder
    private func secondLine(_ tone: StaffStatusTone) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: AppSpace.half))
            : AnyLayout(HStackLayout(spacing: AppSpace.s1))
        layout {
            if let safety = StaffDaySelector.safetySummary(row.safety) {
                Label(safety, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Color(hex: tone.ink))
                    // Wraps at accessibility sizes: a warning is never cut off.
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    // The warning keeps its room; the surname gives way first.
                    .layoutPriority(2)
            }
            Text(StaffDaySelector.detailLine(row))
                .font(.footnote)
                .foregroundStyle(Color(hex: tone.meta))
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                .truncationMode(.tail)
            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
            if let timing = row.timing {
                HStack(spacing: 2) {
                    if row.readyOverdue {
                        Image(systemName: "clock.fill")
                            .accessibilityHidden(true)
                    }
                    Text(timing)
                }
                .font(.footnote.weight(row.urgent ? .bold : .regular))
                .foregroundStyle(Color(hex: tone.meta))
                .lineLimit(1)
                .layoutPriority(1)
            }
        }
    }
}

/// The status word on a white pill, edged in the status colour.
struct StaffStatusPill: View {
    let tone: StaffStatusTone

    var body: some View {
        Text(tone.label)
            .font(.caption.weight(.bold))
            .foregroundStyle(Color(hex: tone.ink))
            .padding(.horizontal, AppSpace.s1)
            .padding(.vertical, 3)
            .background(AppColor.surfaceRaised, in: Capsule())
            .overlay(Capsule().strokeBorder(Color(hex: tone.edge), lineWidth: 1.5))
            .fixedSize()
    }
}

// MARK: - The details

/// Everything about one dog's visit, read only.
struct StaffRowDetail: View {
    let row: StaffDayRow
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppSpace.s2) {
                    HStack(spacing: AppSpace.s1) {
                        if let time = StaffDaySelector.timeText(row.time) {
                            Text(time)
                                .font(.headline.monospacedDigit())
                                .foregroundStyle(AppColor.textPrimary)
                        }
                        StaffStatusPill(tone: row.tone)
                        if let timing = row.timing {
                            Text(timing)
                                .font(.subheadline.weight(row.urgent ? .bold : .regular))
                                .foregroundStyle(AppColor.textSecondary)
                        }
                    }

                    VStack(alignment: .leading, spacing: AppSpace.half) {
                        Text(StaffDaySelector.dogName(row.booking))
                            .appHeading(.title2)
                            .foregroundStyle(AppColor.textPrimary)
                            .accessibilityAddTraits(.isHeader)
                        if !row.subtitle.isEmpty {
                            Text(row.subtitle)
                                .font(.body)
                                .foregroundStyle(AppColor.textSecondary)
                        }
                    }

                    if !row.safety.isEmpty {
                        VStack(alignment: .leading, spacing: AppSpace.s1) {
                            SectionLabel(text: "Warnings")
                            ForEach(row.safety, id: \.self) { fact in
                                Label(fact, systemImage: "exclamationmark.triangle.fill")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(AppColor.textPrimary)
                            }
                        }
                        .cardSurface()
                    }

                    if !row.booking.ownerName.isEmpty {
                        VStack(alignment: .leading, spacing: AppSpace.half) {
                            SectionLabel(text: "Owner")
                            Text(row.booking.ownerName)
                                .font(.body)
                                .foregroundStyle(AppColor.textPrimary)
                        }
                    }

                    if !row.booking.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        VStack(alignment: .leading, spacing: AppSpace.half) {
                            SectionLabel(text: "Notes")
                            Text(row.booking.notes)
                                .font(.body)
                                .foregroundStyle(AppColor.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    if row.tone.key == "unconfirmed" {
                        // The website also counts a typed "yes" in the inbox as a
                        // confirmation. This screen does not read the inbox yet.
                        Text("The owner may have replied in WhatsApp. Check the inbox before chasing.")
                            .font(.subheadline)
                            .foregroundStyle(AppColor.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    VStack(alignment: .leading, spacing: AppSpace.half) {
                        Text("To check in, mark ready or take payment, use the website for now.")
                            .font(.subheadline)
                            .foregroundStyle(AppColor.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        TextLink(title: "Open Today on the website", destination: StaffLinks.today)
                    }
                }
                .padding(AppSpace.s2)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(AppColor.surface.ignoresSafeArea())
            .navigationTitle(StaffDaySelector.dogName(row.booking))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private extension Color {
    /// A status colour from `StaffStatusPalette`. Falls back to the app's primary text colour.
    init(hex: String) {
        if let rgb = StaffStatusPalette.rgb(hex) {
            self.init(.sRGB, red: rgb.red, green: rgb.green, blue: rgb.blue, opacity: 1)
        } else {
            self = AppColor.textPrimary
        }
    }
}

#Preview("Today") {
    StaffTodayView(client: nil)
}
