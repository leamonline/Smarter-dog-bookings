import CoreText
import Foundation
import SwiftUI

/// Poppins for headings, SF Pro for everything else.
/// PostScript names are the name-table IDs in the bundled files: `Poppins-Bold`
/// and `Poppins-SemiBold`. `relativeTo` keeps Dynamic Type working.
enum AppFont {
    /// Filenames in `UIAppFonts` and in the app bundle. Each entry is its own
    /// array item, not one space-separated string.
    /// `Poppins-Black.ttf` and `Caveat-Bold.ttf` are skipped quietly until they are in the app.
    static let bundledFileNames = [
        "Poppins-Bold.ttf", "Poppins-SemiBold.ttf", "Poppins-Black.ttf", "Caveat-Bold.ttf",
    ]

    /// Makes Poppins available before the first heading draws. `Info.plist`
    /// lists the same files. Registering again is harmless if the system
    /// already loaded them from that array.
    static func registerBundledFonts() {
        for name in bundledFileNames {
            let file = URL(fileURLWithPath: name)
            guard let url = Bundle.main.url(
                forResource: file.deletingPathExtension().lastPathComponent,
                withExtension: file.pathExtension
            ) else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    static func poppinsBold(relativeTo style: Font.TextStyle, size: CGFloat) -> Font {
        .custom("Poppins-Bold", size: size, relativeTo: style)
    }

    static func poppinsSemiBold(relativeTo style: Font.TextStyle, size: CGFloat) -> Font {
        .custom("Poppins-SemiBold", size: size, relativeTo: style)
    }

    /// Hero titles only (sign-in, step titles, confirmations, done states).
    /// Falls back to the system heavy weight if the font file is not in the app.
    static func poppinsBlack(relativeTo style: Font.TextStyle, size: CGFloat) -> Font {
        .custom("Poppins-Black", size: size, relativeTo: style)
    }

    /// One short handwritten line per hero screen. Never carries information.
    static func caveatBold(relativeTo style: Font.TextStyle, size: CGFloat) -> Font {
        .custom("Caveat-Bold", size: size, relativeTo: style)
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
    /// Hero title: Poppins Black at 40pt with tight tracking. Heroes only
    /// (sign-in, step titles, confirmations, done states).
    func appHero() -> some View {
        font(AppFont.poppinsBlack(relativeTo: .largeTitle, size: 40))
            .tracking(-1.4)
    }

    /// A Poppins heading at the spec size, with its tracking. Body copy stays on `.font(.body)`.
    func appHeading(_ style: Font.TextStyle) -> some View {
        font(AppFont.heading(style))
            .tracking(AppFont.tracking(for: style))
    }
}
