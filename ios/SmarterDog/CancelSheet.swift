import SwiftUI

/// The confirm sheet for cancelling one visit. Its behaviour lives in `CancelFlowModel`, tested on
/// Linux; this file only draws it. No warning step about cancelling on the day (owner decision,
/// 24 November 2026): the salon's rule is stated in its terms, not here.
struct CancelSheet: View {
    @State private var model: CancelFlowModel
    @Environment(\.dismiss) private var dismiss

    init(target: CancelTarget, client: SalonCancelClient?) {
        _model = State(initialValue: CancelFlowModel(target: target, client: client))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppSpace.s2) {
                header
                if model.isCancelled {
                    cancelled
                } else {
                    reasons
                    outcome
                    buttons
                }
            }
            .padding(AppSpace.s2)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(AppColor.surface.ignoresSafeArea())
        .presentationDragIndicator(.visible)
        // A request may be on its way: the sheet stays until it is settled.
        .interactiveDismissDisabled(model.isSending)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: AppSpace.half) {
            Text(model.target.question)
                .appHeading(.title3)
                .foregroundStyle(AppColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Text(model.target.whenText)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppColor.textPrimary)
            if let note = model.target.togetherNote {
                Text(note)
                    .font(.subheadline)
                    .foregroundStyle(AppColor.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, AppSpace.s2)
    }

    private var reasons: some View {
        VStack(alignment: .leading, spacing: AppSpace.s1) {
            SectionLabel(text: "Reason for cancelling")
            VStack(spacing: 0) {
                ForEach(CancelReason.choices, id: \.self) { choice in
                    Button {
                        model.choice = choice
                    } label: {
                        HStack {
                            Text(choice)
                                .font(.body)
                                .foregroundStyle(AppColor.textPrimary)
                            Spacer(minLength: AppSpace.s1)
                            if model.choice == choice {
                                Image(systemName: "checkmark")
                                    .font(.body.weight(.bold))
                                    .foregroundStyle(AppColor.accentBlueDeep)
                            }
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.choice == choice ? .isSelected : [])
                    if choice != CancelReason.choices.last {
                        Divider().overlay(AppColor.separator)
                    }
                }
            }
            .cardSurface()
            if model.choice == CancelReason.other {
                TextField("Please tell us why…", text: $model.otherText, axis: .vertical)
                    .font(.body)
                    .padding(AppSpace.s1_5)
                    .background(AppColor.surfaceRaised, in: RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: AppRadius.card, style: .continuous).strokeBorder(AppColor.separator, lineWidth: 1))
                    .accessibilityLabel("Tell us why you're cancelling")
            }
        }
        // Once a request with this reason may have arrived, the reason is fixed so a retry matches it.
        .disabled(model.isReasonLocked || model.isSending)
        .opacity(model.isReasonLocked ? 0.6 : 1)
    }

    @ViewBuilder
    private var outcome: some View {
        if let message = model.message {
            VStack(alignment: .leading, spacing: AppSpace.s1) {
                ErrorNote(message: message)
                if case .done(.unsure) = model.state {
                    Button("Check again") { Task { await model.checkAgain() } }
                        .buttonStyle(TextLinkButtonStyle())
                }
                TextLink(title: "Message us on WhatsApp 🐾", destination: SalonLinks.whatsApp)
                    .font(.footnote.weight(.semibold))
            }
        }
    }

    private var buttons: some View {
        VStack(spacing: AppSpace.s1) {
            Button {
                Task { await model.send() }
            } label: {
                HStack(spacing: AppSpace.s1) {
                    if model.isSending { ProgressView().tint(AppColor.destructive) }
                    Text(sendTitle)
                }
                .font(.body.weight(.semibold))
                .foregroundStyle(AppColor.destructive)
                .padding(.horizontal, AppSpace.s2)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(AppColor.destructiveSoft, in: Capsule())
                .overlay(Capsule().strokeBorder(AppColor.destructive, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .disabled(!model.canSend)
            .opacity(model.canSend || model.isSending ? 1 : 0.5)
            .accessibilityLabel(sendTitle)

            Button("Keep my booking") { dismiss() }
                .buttonStyle(TextLinkButtonStyle())
                .disabled(model.isSending)
        }
    }

    private var sendTitle: String {
        if model.isSending { return "Cancelling…" }
        if case .done(.unsure) = model.state { return "Try again" }
        return "Confirm cancellation"
    }

    private var cancelled: some View {
        VStack(alignment: .leading, spacing: AppSpace.s2) {
            Text("Cancelled.")
                .appHeading(.title2)
                .foregroundStyle(AppColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("Your appointment has been cancelled.")
                .font(.body)
                .foregroundStyle(AppColor.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            PrimaryButton(title: "Done") { dismiss() }
        }
    }
}
