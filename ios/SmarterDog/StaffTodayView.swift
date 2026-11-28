import SwiftUI
import UIKit

/// Staff Today: the day's dogs in appointment order, with legal salon-floor status
/// moves, one-tap Undo, opt-in Ready-for-collection messaging and live Realtime
/// updates. Mirrors the staff website's Today stack (`StaffDayStack` + `StaffDayActions`).
struct StaffTodayView: View {
    @State private var model: StaffTodayModel
    @State private var selectedID: String?
    @State private var presentedPrompt: StaffCollectionPrompt?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// `clock` is the real time in the app. Debug sample mode pins it so the made-up
    /// day reads like a working morning whenever it is opened.
    init(
        client: StaffDayClient? = SupabaseStaffDayClient.make(),
        clock: @escaping @Sendable () -> Date = { Date() }
    ) {
        _model = State(initialValue: StaffTodayModel(client: client, clock: clock))
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
            .sheet(
                isPresented: Binding(
                    get: { selectedID != nil },
                    set: { if !$0 { selectedID = nil } }
                ),
                onDismiss: { presentQueuedCollectionPromptIfReady() }
            ) {
                if let id = selectedID, let row = model.row(id: id) {
                    StaffRowDetail(row: row, model: model) {
                        selectedID = nil
                    }
                }
            }
        }
        .background(AppColor.surface.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let banner = model.banner {
                StaffBannerView(
                    banner: banner,
                    onUndo: { undo in Task { await model.performUndo(undo) } },
                    onRetry: { retry in Task { await model.retry(retry) } },
                    onDismiss: { model.dismissBanner() }
                )
                .padding(.horizontal, AppSpace.s2)
                .padding(.bottom, AppSpace.s1)
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: model.banner?.id)
        .sheet(item: $presentedPrompt, onDismiss: {
            if model.collectionPrompt?.id == presentedPrompt?.id {
                model.collectionPrompt = nil
            }
        }) { prompt in
            StaffCollectionNoticeSheet(prompt: prompt, client: model.client)
        }
        .task { await model.load() }
        // ST-10: a colleague's change on another till appears without manual refresh.
        .task { await model.listenForRealtimeUpdates() }
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
        // Present the collection prompt immediately when no detail sheet is up;
        // otherwise `onDismiss` of the detail sheet presents it without conflict.
        .onChange(of: model.collectionPrompt) { _, next in
            guard let next else {
                presentedPrompt = nil
                return
            }
            if selectedID == nil {
                presentedPrompt = next
            }
        }
        // Announce outcomes to VoiceOver and trigger subtle native haptics.
        .onChange(of: model.lastFeedback) { _, event in
            guard let event else { return }
            UIAccessibility.post(notification: .announcement, argument: event.announcement)
        }
        .sensoryFeedback(trigger: model.lastFeedback) { _, event in
            guard let event else { return nil }
            switch event.kind {
            case .success: return .success
            case .warning: return .warning
            case .error: return .error
            }
        }
    }

    private func presentQueuedCollectionPromptIfReady() {
        if selectedID == nil, let queued = model.collectionPrompt, presentedPrompt?.id != queued.id {
            presentedPrompt = queued
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
                    rowButton(row)
                }
            }
            if !snapshot.cancelled.isEmpty {
                SectionLabel(text: "Cancelled")
                    .padding(.top, AppSpace.s1)
                    .accessibilityAddTraits(.isHeader)
                ForEach(snapshot.cancelled) { row in
                    // Faded: nothing is waiting on these. The status word still says Cancelled.
                    rowButton(row)
                        .opacity(0.6)
                }
            }
        }
    }

    private func rowButton(_ row: StaffDayRow) -> some View {
        let actions = model.canWrite ? StaffDayActions.legalActions(for: row) : []
        return Button {
            selectedID = row.id
        } label: {
            StaffDayRowView(row: row, busy: model.isBusy(row.id))
        }
        .buttonStyle(.plain)
        .contextMenu {
            ForEach(actions) { action in
                Button(role: action.id == .didntShow ? .destructive : nil) {
                    Task { await model.perform(action.id, on: row) }
                } label: {
                    Text(action.label)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(StaffDaySelector.accessibilityLabel(row))
        .accessibilityHint(actions.isEmpty ? "Shows the details" : "Shows details and actions")
        .accessibilityAddTraits(.isButton)
        .accessibilityActions {
            ForEach(actions) { action in
                Button(action.label) {
                    Task { await model.perform(action.id, on: row) }
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

// MARK: - Outcome / Undo banner

private struct StaffBannerView: View {
    let banner: StaffBanner
    let onUndo: (StaffUndoAction) -> Void
    let onRetry: (StaffRetryAction) -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: AppSpace.s1) {
            Text(banner.message)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let undo = banner.undo {
                Button("Undo") { onUndo(undo) }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(AppColor.accentBlueDeep)
                    .frame(minWidth: 44, minHeight: 44)
            } else if let retry = banner.retry {
                Button("Retry") { onRetry(retry) }
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(AppColor.destructive)
                    .frame(minWidth: 44, minHeight: 44)
            }

            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(foreground)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Dismiss message")
        }
        .padding(.leading, AppSpace.s2)
        .padding(.trailing, AppSpace.half)
        .padding(.vertical, AppSpace.half)
        .background(background, in: RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous)
                .strokeBorder(AppColor.separator, lineWidth: 1)
        )
        .appCardShadow()
    }

    private var foreground: Color {
        switch banner.tone {
        case .success: AppColor.success
        case .info: AppColor.textPrimary
        case .error: AppColor.destructive
        }
    }

    private var background: Color {
        switch banner.tone {
        case .success: AppColor.successSoft
        case .info: AppColor.surfaceRaised
        case .error: AppColor.destructiveSoft
        }
    }
}

// MARK: - A row

/// One dog: the strip from the website's stack. Line 1 is time, name and status;
/// line 2 the safety note, breed · service · surname and the timing.
struct StaffDayRowView: View {
    let row: StaffDayRow
    var busy: Bool = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let tone = row.tone
        HStack(spacing: 0) {
            Rectangle()
                .fill(Color(hex: tone.edge))
                .frame(width: row.readyOverdue ? 6 : 4)
            VStack(alignment: .leading, spacing: AppSpace.half) {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: AppSpace.half) {
                        HStack(alignment: .center, spacing: AppSpace.s1) {
                            if let time = StaffDaySelector.timeText(row.time) {
                                Text(time)
                                    .font(.headline.monospacedDigit())
                                    .foregroundStyle(Color(hex: tone.ink))
                                    .fixedSize()
                            }
                            Spacer(minLength: AppSpace.s1)
                            statusAccessory(tone)
                        }
                        Text(StaffDaySelector.dogName(row.booking))
                            .font(.headline)
                            .foregroundStyle(Color(hex: tone.ink))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: AppSpace.s1) {
                        if let time = StaffDaySelector.timeText(row.time) {
                            Text(time)
                                .font(.headline.monospacedDigit())
                                .foregroundStyle(Color(hex: tone.ink))
                                .fixedSize()
                        }
                        Text(StaffDaySelector.dogName(row.booking))
                            .font(.headline)
                            .foregroundStyle(Color(hex: tone.ink))
                            .lineLimit(1)
                        Spacer(minLength: AppSpace.s1)
                        statusAccessory(tone)
                    }
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
    private func statusAccessory(_ tone: StaffStatusTone) -> some View {
        if busy {
            ProgressView()
                .tint(Color(hex: tone.ink))
        } else {
            StaffStatusPill(tone: tone)
        }
    }

    @ViewBuilder
    private func secondLine(_ tone: StaffStatusTone) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: AppSpace.half))
            : AnyLayout(HStackLayout(spacing: AppSpace.s1))
        layout {
            if !row.safety.isEmpty {
                // Owner's call (24 November 2026): only the triangle on the card, so breed,
                // service and owner fit. The wording is in the detail sheet, and VoiceOver
                // reads every warning from the row's label.
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Color(hex: tone.ink))
                    .accessibilityHidden(true)
                    .layoutPriority(2)
            }
            Text(StaffDaySelector.detailLine(row))
                .font(.footnote)
                .foregroundStyle(Color(hex: tone.meta))
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                .fixedSize(horizontal: false, vertical: dynamicTypeSize.isAccessibilitySize)
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
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                .fixedSize(horizontal: false, vertical: dynamicTypeSize.isAccessibilitySize)
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

// MARK: - The details and legal moves

/// One dog's visit details and its legal Phase S2 status moves.
struct StaffRowDetail: View {
    let row: StaffDayRow
    var model: StaffTodayModel
    let onClose: () -> Void

    private var actions: [StaffBookingAction] {
        model.canWrite ? StaffDayActions.legalActions(for: row) : []
    }

    private var isBusy: Bool {
        model.isBusy(row.id)
    }

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
                            ForEach(row.safety, id: \.self) { fact in
                                Label(fact, systemImage: "exclamationmark.triangle.fill")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(AppColor.textPrimary)
                            }
                        }
                        .cardSurface()
                    }

                    actionsSection

                    if !row.booking.ownerName.isEmpty {
                        VStack(alignment: .leading, spacing: AppSpace.half) {
                            SectionLabel(text: "Owner")
                            Text(row.booking.ownerName)
                                .font(.body)
                                .foregroundStyle(AppColor.textPrimary)
                            if let call = StaffDaySelector.callURL(row.booking.ownerPhone) {
                                Link(destination: call) {
                                    Label("Call \(row.booking.ownerPhone)", systemImage: "phone.fill")
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(AppColor.textPrimary)
                                        .frame(maxWidth: .infinity, minHeight: 44)
                                        .background(AppColor.surfaceRaised, in: Capsule())
                                        .overlay(Capsule().strokeBorder(AppColor.separator, lineWidth: 1))
                                }
                                .padding(.top, AppSpace.half)
                                .accessibilityLabel("Call \(row.booking.ownerName)")
                                .accessibilityHint("Opens the phone")
                            }
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
                        if row.stage == .ready {
                            Text("Check-out and payment are on the website for now.")
                                .font(.subheadline)
                                .foregroundStyle(AppColor.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
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
                    Button("Done") { onClose() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private var actionsSection: some View {
        if !actions.isEmpty {
            VStack(alignment: .leading, spacing: AppSpace.s1) {
                SectionLabel(text: "Next step")
                ForEach(actions) { action in
                    actionButton(action)
                }
            }
        } else if row.stage == .noShow && row.booking.groupId != nil {
            Text("This dog is part of a grouped booking. Restore it from the calendar on the website.")
                .font(.subheadline)
                .foregroundStyle(AppColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private func actionButton(_ action: StaffBookingAction) -> some View {
        switch action.emphasis {
        case .primary:
            PrimaryButton(title: action.label, busy: isBusy, busyTitle: "Saving…") {
                run(action.id)
            }
        case .secondary:
            Button {
                run(action.id)
            } label: {
                Text(action.label)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(AppColor.textPrimary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(AppColor.surfaceRaised, in: Capsule())
                    .overlay(Capsule().strokeBorder(AppColor.separator, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
            .opacity(isBusy ? 0.6 : 1)
        case .quiet:
            Button {
                run(action.id)
            } label: {
                Text(action.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(action.id == .didntShow ? AppColor.destructive : AppColor.accentBlueDeep)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
            .opacity(isBusy ? 0.6 : 1)
        }
    }

    private func run(_ kind: StaffBookingActionKind) {
        Task {
            let saved = await model.perform(kind, on: row)
            if saved {
                onClose()
            }
        }
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
