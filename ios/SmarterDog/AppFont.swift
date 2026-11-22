import SwiftUI

/// Poppins for headings, SF Pro for everything else.
/// PostScript names are the name-table IDs in the bundled files: `Poppins-Bold`
/// and `Poppins-SemiBold`. `relativeTo` keeps Dynamic Type working.
enum AppFont {
    static func poppinsBold(relativeTo style: Font.TextStyle, size: CGFloat) -> Font {
        .custom("Poppins-Bold", size: size, relativeTo: style)
    }

    static func poppinsSemiBold(relativeTo style: Font.TextStyle, size: CGFloat) -> Font {
        .custom("Poppins-SemiBold", size: size, relativeTo: style)
    }

    static func heading(_ style: Font.TextStyle) -> Font {
        switch style {
        case .largeTitle: return poppinsBold(relativeTo: .largeTitle, size: 34)
        case .title: return poppinsBold(relativeTo: .title, size: 28)
        case .title2: return poppinsBold(relativeTo: .title2, size: 22)
        case .title3: return poppinsSemiBold(relativeTo: .title3, size: 20)
        case .headline: return poppinsSemiBold(relativeTo: .headline, size: 17)
        default:
            assertionFailure("Headings only. Use .system for \(style).")
            return .system(style)
        }
    }

    /// SF Pro, at the system size, weight and tracking for that text style.
    static func text(_ style: Font.TextStyle) -> Font {
        .system(style)
    }

    /// Poppins is wider than SF Pro Display, so large titles are tightened.
    /// Headline is left alone. Do not apply this to SF Pro.
    static func tracking(for style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: -0.6
        case .title: -0.4
        case .title2: -0.3
        case .title3: -0.15
        default: 0
        }
    }
}

extension View {
    /// A Poppins heading at the spec size, with its tracking. Body copy stays on `.font(.body)`.
    func appHeading(_ style: Font.TextStyle) -> some View {
        font(AppFont.heading(style))
            .tracking(AppFont.tracking(for: style))
    }
}
