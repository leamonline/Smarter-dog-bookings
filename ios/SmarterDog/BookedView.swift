import SwiftUI

/// The flyer's hero moment, shown once a booking exists: "You're booked." with the yellow swash drawn
/// under "booked.", a taped polaroid, "See you soon!" in Caveat and the mascot. The details are plain
/// text, never in the handwriting, and a deposit, if one is due, is said in plain words.
///
/// Motion: the swash draws in (0.42s), the polaroid settles (0.52s), and the mascot bounces once
/// (0.6s, starting at 0.26s). All three are off under Reduce Motion: it simply appears.
/// The picture in the polaroid is a paw until dogs' photos are brought into this flow.
struct BookedView: View {
    let booked: BookedSummary
    let onDone: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var swashDrawn = false
    @State private var polaroidSettled = false
    @State private var mascotBounced = false

    private var mascotAsset: String? { ServiceMascot.assetName(forService: booked.service) }

    var body: some View {
        VStack(spacing: 0) {
            BrandStripe(height: 12)
                .padding(.horizontal, AppSpace.s2)
                .padding(.top, AppSpace.s1)
            ScrollView {
                VStack(alignment: .leading, spacing: AppSpace.s3) {
                    hero
                    polaroid
                    details
                    if let note = booked.deposit.text {
                        Text(note)
                            .font(.body)
                            .foregroundStyle(AppColor.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .cardSurface()
                    }
                }
                .padding(.horizontal, AppSpace.s2)
                .padding(.vertical, AppSpace.s3)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
            PrimaryButton(title: "Done", action: onDone)
                .padding(.horizontal, AppSpace.s2)
                .padding(.vertical, AppSpace.s1_5)
                .frame(maxWidth: 480)
        }
        .background(AppColor.surface.ignoresSafeArea())
        .task { await play() }
    }

    // MARK: pieces

    private var hero: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("You're")
                .appHero()
                .foregroundStyle(AppColor.textPrimary)
            HighlightedWord(text: "booked.", drawn: swashDrawn ? 1 : 0)
                .appHero()
                .foregroundStyle(AppColor.textPrimary)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("You're booked.")
        .accessibilityAddTraits(.isHeader)
    }

    private var polaroid: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(spacing: AppSpace.s1) {
                ZStack {
                    AppColor.surface
                    Image(systemName: "pawprint.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(AppColor.accentBlue)
                }
                .frame(width: 200, height: 200)
                HandwrittenLine(text: "See you soon!")
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(12)
            .padding(.bottom, 8)
            .frame(width: 224)
            .background(AppColor.polaroidMount, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            .appCardShadow()
            .rotationEffect(.degrees(polaroidSettled ? -3 : -8))
            .offset(y: polaroidSettled ? 0 : -16)
            .opacity(polaroidSettled ? 1 : 0)

            if let asset = mascotAsset {
                MascotCircle(assetName: asset, size: 72)
                    .scaleEffect(mascotBounced ? 1 : 0.6)
                    .opacity(mascotBounced ? 1 : 0)
                    .offset(x: 28, y: 12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityHidden(true)
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: AppSpace.s1_5) {
            SummaryRow(label: booked.dogName, value: booked.service)
            SummaryRow(label: "When", value: booked.whenText)
        }
        .cardSurface()
    }

    // MARK: motion

    private func play() async {
        AccessibilityNotification.Announcement("You're booked.").post()
        if reduceMotion {
            swashDrawn = true
            polaroidSettled = true
            mascotBounced = true
            return
        }
        withAnimation(.easeOut(duration: 0.42)) { swashDrawn = true }
        withAnimation(.easeOut(duration: 0.52)) { polaroidSettled = true }
        withAnimation(.spring(response: 0.6, dampingFraction: 0.5).delay(0.26)) { mascotBounced = true }
    }
}

#Preview("Booked, with a deposit") {
    BookedView(
        booked: BookedSummary(
            dogName: "Biscuit", service: "Full Groom",
            whenText: "Tuesday 1 December 2026 at 9:30am",
            deposit: .due(amountPence: 1000), bookingIds: ["preview"]
        ),
        onDone: {}
    )
}

#Preview("Booked, no deposit") {
    BookedView(
        booked: BookedSummary(
            dogName: "Moose", service: "Bath & Brush",
            whenText: "Wednesday 2 December 2026 at 12:00pm",
            deposit: .none, bookingIds: ["preview"]
        ),
        onDone: {}
    )
}
