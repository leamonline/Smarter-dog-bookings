import SwiftUI

/// Two-step opt-in prompt shown after Mark ready succeeds (ST-8).
/// Step 1 asks staff whether to message the owner ("Send message" / "Not now").
/// Step 2 lets staff set the ETA in minutes, preview the exact WhatsApp / SMS
/// text and send per recipient. Nothing is ever sent automatically.
struct StaffCollectionNoticeSheet: View {
    @State private var model: StaffCollectionNoticeModel
    @Environment(\.dismiss) private var dismiss

    private let quickMinutes = ["10", "15", "20", "30"]

    init(prompt: StaffCollectionPrompt, client: StaffDayClient?, attempts: StaffCollectionAttempts) {
        _model = State(initialValue: StaffCollectionNoticeModel(prompt: prompt, client: client, attempts: attempts))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppSpace.s2) {
                    VStack(alignment: .leading, spacing: AppSpace.half) {
                        SectionLabel(text: "Ready for collection")
                        Text(model.title)
                            .appHeading(.title2)
                            .foregroundStyle(AppColor.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                    }

                    switch model.step {
                    case .ask:
                        askStep
                    case .compose:
                        composeStep
                    }
                }
                .padding(AppSpace.s2)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(AppColor.surface.ignoresSafeArea())
            .navigationTitle("Ready for collection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(model.step == .ask ? "Not now" : model.closeButtonLabel) {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    // MARK: - Step 1: Opt-in ask

    private var askStep: some View {
        VStack(alignment: .leading, spacing: AppSpace.s2) {
            Text("Would you like to message their humans to let them know they're nearly ready?")
                .font(.body)
                .foregroundStyle(AppColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: AppSpace.s1) {
                PrimaryButton(title: "Send message") {
                    Task { await model.chooseSendMessage() }
                }

                Button("Not now") {
                    dismiss()
                }
                .font(.body.weight(.semibold))
                .foregroundStyle(AppColor.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(AppColor.surfaceRaised, in: Capsule())
                .overlay(Capsule().strokeBorder(AppColor.separator, lineWidth: 1))
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Step 2: Compose & send per recipient

    private var composeStep: some View {
        VStack(alignment: .leading, spacing: AppSpace.s2) {
            VStack(alignment: .leading, spacing: AppSpace.half) {
                Text("Send a collection notice for \(model.dogNamesDisplay)?")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(AppColor.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("By WhatsApp, or by SMS where they prefer it or aren't on WhatsApp.")
                    .font(.subheadline)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                if model.isPlural {
                    Text("One message covers all of this owner's dogs that are ready.")
                        .font(.subheadline)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            minutesPicker

            VStack(alignment: .leading, spacing: AppSpace.half) {
                SectionLabel(text: "WhatsApp preview")
                Text("“\(model.whatsappPreview)”")
                    .font(.subheadline)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .cardSurface()
            }

            if model.anySmsRecipient {
                VStack(alignment: .leading, spacing: AppSpace.half) {
                    SectionLabel(text: "SMS version")
                    Text("“\(model.smsPreview)”")
                        .font(.subheadline)
                        .foregroundStyle(AppColor.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .cardSurface()
                }
            }

            if let feedback = model.sendFeedback {
                if feedback.isError {
                    ErrorNote(message: feedback.message)
                } else {
                    Text(feedback.message)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppColor.success)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(AppSpace.s1_5)
                        .background(AppColor.successSoft, in: RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous))
                }
            }

            contactsSection
        }
    }

    private var minutesPicker: some View {
        VStack(alignment: .leading, spacing: AppSpace.s1) {
            HStack(spacing: AppSpace.s1) {
                Text("Ready in")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(AppColor.textPrimary)
                TextField("15", text: Binding(
                    get: { model.minutes },
                    set: { model.minutes = String($0.filter(\.isNumber).prefix(3)) }
                ))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(AppColor.textPrimary)
                .frame(width: 64, height: 44)
                .background(AppColor.surfaceRaised, in: RoundedRectangle(cornerRadius: AppRadius.control, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: AppRadius.control, style: .continuous).strokeBorder(AppColor.separator, lineWidth: 1))
                .accessibilityLabel("Minutes until ready for collection")
                Text("mins")
                    .font(.body)
                    .foregroundStyle(AppColor.textPrimary)
            }

            HStack(spacing: AppSpace.s1) {
                ForEach(quickMinutes, id: \.self) { option in
                    let selected = model.minutes == option
                    Button("\(option)m") {
                        model.minutes = option
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(selected ? AppColor.onAction : AppColor.textPrimary)
                    .frame(minWidth: 52, minHeight: 44)
                    .background(selected ? AppColor.actionYellow : AppColor.surfaceRaised, in: Capsule())
                    .overlay(Capsule().strokeBorder(selected ? AppColor.actionYellow : AppColor.separator, lineWidth: 1))
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(option) minutes")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    @ViewBuilder
    private var contactsSection: some View {
        switch model.contactsState {
        case .idle, .loading:
            HStack(spacing: AppSpace.s1) {
                ProgressView()
                    .tint(AppColor.textPrimary)
                Text("Loading contacts…")
                    .font(.subheadline)
                    .foregroundStyle(AppColor.textSecondary)
            }
            .padding(.vertical, AppSpace.s1)

        case .unavailable(let message):
            Text(message)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppColor.warning)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(AppSpace.s1_5)
                .background(AppColor.warningSoft, in: RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous))

        case .failed(let message):
            VStack(alignment: .leading, spacing: AppSpace.s1) {
                ErrorNote(message: message)
                PrimaryButton(title: "Retry") {
                    Task { await model.loadContacts() }
                }
            }

        case .loaded(let recipients):
            if recipients.isEmpty {
                Text("This booking isn't linked to a customer record, so there's no contact to notify.")
                    .font(.subheadline)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(alignment: .leading, spacing: AppSpace.s1) {
                    SectionLabel(text: "Recipients")
                    ForEach(recipients) { recipient in
                        recipientRow(recipient)
                    }
                }
            }
        }
    }

    private func recipientRow(_ recipient: StaffCollectionRecipient) -> some View {
        let sendable = recipient.route.channel != nil
        let viaSms = recipient.route.channel == "sms"
        let attempt = model.attempt(for: recipient.id)
        let isSent = attempt == .accepted
        let isSending = attempt == .sending
        let disabled = !sendable || attempt != nil || !model.minutesValid || model.sendingRecipientID != nil

        return HStack(spacing: AppSpace.s1_5) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: AppSpace.half) {
                    Text(recipient.displayName)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(AppColor.textPrimary)
                    Text(recipient.relationship)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppColor.textSecondary)
                }
                Text(StaffCollectionNotice.routeNote(recipient.route, phone: recipient.contact.phone))
                    .font(.footnote)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: AppSpace.s1)
            Button {
                Task { await model.send(to: recipient) }
            } label: {
                Group {
                    if isSent {
                        Text("Sent")
                    } else if attempt == .unknown {
                        Text("Check Inbox")
                    } else if isSending {
                        ProgressView().tint(AppColor.onAction)
                    } else {
                        Text(viaSms ? "Send SMS" : "Send")
                    }
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isSent ? AppColor.success : (disabled ? AppColor.textSecondary : AppColor.onAction))
                .padding(.horizontal, AppSpace.s2)
                .frame(minHeight: 44)
                .background(
                    isSent ? AppColor.successSoft : (disabled ? AppColor.surface : AppColor.actionYellow),
                    in: Capsule()
                )
            }
            .buttonStyle(.plain)
            .disabled(disabled)
            .accessibilityLabel(
                attempt == .unknown ? "Send unconfirmed for \(recipient.displayName). Check the Inbox."
                    : isSent ? "Sent to \(recipient.displayName)"
                    : (sendable ? "Send \(viaSms ? "SMS" : "WhatsApp") to \(recipient.displayName)" : "\(recipient.displayName) cannot be messaged")
            )
        }
        .cardSurface()
    }
}
