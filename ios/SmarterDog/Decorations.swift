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

/// Navy and yellow dashes, 8pt tall. The dark appearance is a second PDF.
struct DashRibbon: View {
    var body: some View {
        Image("AccentDashStrip")
            .resizable(resizingMode: .tile)
            .frame(height: AppSpace.s1)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }
}

/// 8×8 squares of ink and paper, so the edge inverts in dark mode. Not a bitmap.
struct CheckerboardEdge: View {
    var body: some View {
        Canvas { context, size in
            let tile = AppSpace.s1
            let columns = Int((size.width / tile).rounded(.up))
            for column in 0..<max(columns, 1) {
                let colour = column.isMultiple(of: 2) ? AppColor.brandInk : AppColor.brandPaper
                let rect = CGRect(x: CGFloat(column) * tile, y: 0, width: tile, height: tile)
                context.fill(Path(rect), with: .color(colour))
            }
        }
        .frame(height: AppSpace.s1)
        .accessibilityHidden(true)
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
