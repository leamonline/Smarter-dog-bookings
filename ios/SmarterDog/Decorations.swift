import SwiftUI

/// Sitting dog plus the wordmark. The mark is a template, so it follows `TextPrimary`.
struct DogWordmark: View {
    var body: some View {
        HStack(spacing: AppSpace.s1) {
            Image("DogMark")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: AppSpace.s4, height: AppSpace.s4)
                .foregroundStyle(AppColor.textPrimary)
                .accessibilityHidden(true)
            Text("Smarter Dog")
                .appHeading(.headline)
                .foregroundStyle(AppColor.textPrimary)
        }
    }
}

/// Paint and a brush stroke, used as one small accent under a compact header.
/// Not a button, and not a highlight behind body text.
struct WordmarkAccent: View {
    var body: some View {
        ZStack {
            Image("HighlightBlob")
                .resizable()
                .scaledToFit()
                .frame(width: 96, height: AppSpace.s4)
                .rotationEffect(.degrees(-2))
            Image("HighlightSwoosh")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: AppSpace.s2)
        }
        .accessibilityHidden(true)
        .frame(width: 96, height: AppSpace.s4, alignment: .leading)
    }
}

/// The hand-painted underline from the poster, under one word of a Poppins title.
struct HighlightedWord: View {
    let text: String
    @ScaledMetric(relativeTo: .largeTitle) private var stroke: CGFloat = 8

    var body: some View {
        Text(text)
            .background(alignment: .bottom) {
                Image("HighlightUnderline")
                    .resizable()
                    .frame(height: stroke)
                    .offset(y: stroke * 0.35)
                    .accessibilityHidden(true)
            }
    }
}

/// Round illustrated icons: ink on a raised circle, 64pt. A drawn service set
/// can reuse this. The waiting screen uses it for the paw until then.
struct IconCircle: View {
    let systemName: String

    var body: some View {
        Image(systemName: systemName)
            .font(.title2)
            .foregroundStyle(AppColor.textPrimary)
            .frame(width: AppSpace.s8, height: AppSpace.s8)
            .background(AppColor.surfaceRaised, in: Circle())
            .overlay(Circle().strokeBorder(AppColor.separator, lineWidth: 1))
            .accessibilityHidden(true)
    }
}

/// The flyer's segmented stripe: nine rounded segments, two yellow, one navy.
/// Decoration only. 7pt across the top of a screen, 12pt on a hero screen.
/// Never inside content.
struct BrandStripe: View {
    var height: CGFloat = 7

    private let segments: [(weight: CGFloat, colour: Color)] = [
        (1, AppColor.accentBlue), (2.1, AppColor.accentBlue), (1, AppColor.actionYellow),
        (1, AppColor.accentBlue), (1, AppColor.dashNavy), (2.1, AppColor.accentBlue),
        (1, AppColor.accentBlue), (1, AppColor.accentBlue), (1, AppColor.actionYellow),
    ]

    var body: some View {
        GeometryReader { proxy in
            let gaps = CGFloat(segments.count - 1) * 4
            let unit = (proxy.size.width - gaps) / segments.reduce(0) { $0 + $1.weight }
            HStack(spacing: 4) {
                ForEach(segments.indices, id: \.self) { index in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(segments[index].colour)
                        .frame(width: unit * segments[index].weight)
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// Poppins Black hero title, tight tracking. Heroes only.
struct HeroTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .appHero()
            .foregroundStyle(AppColor.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// One handwritten line in Caveat Bold, brand blue, tilted about 3 degrees.
/// Hidden from VoiceOver on purpose: it never carries information.
struct HandwrittenLine: View {
    let text: String

    var body: some View {
        Text(text)
            .font(AppFont.caveatBold(relativeTo: .title2, size: 28))
            .foregroundStyle(AppColor.accentBlueDeep)
            .rotationEffect(.degrees(-3), anchor: .leading)
            .accessibilityHidden(true)
    }
}

/// A service mascot in a circle with the white ring and soft shadow from the
/// style board. Decoration: it sits beside a service name, so VoiceOver skips it.
/// The artwork is 250px, sharp up to about 80pt.
struct MascotCircle: View {
    let assetName: String
    var size: CGFloat = AppSpace.s6

    var body: some View {
        Image(assetName)
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(AppColor.polaroidMount, lineWidth: max(2, size / 16)))
            .appCardShadow()
            .accessibilityHidden(true)
    }
}
