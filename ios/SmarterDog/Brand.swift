import SwiftUI

/// Salon colours from the web app (`src/index.css`).
/// SF Pro stands in for Poppins until a font is bundled.
enum Brand {
    /// `--color-brand-ink` #1F1F1F
    static let ink = Color(red: 31 / 255, green: 31 / 255, blue: 31 / 255)
    /// `--color-brand-paper` #F7EFE6
    static let paper = Color(red: 247 / 255, green: 239 / 255, blue: 230 / 255)
    /// `--color-brand-paper-line` #ECE7E0
    static let paperLine = Color(red: 236 / 255, green: 231 / 255, blue: 224 / 255)
    /// `--color-brand-yellow` #FECC13
    static let yellow = Color(red: 254 / 255, green: 204 / 255, blue: 19 / 255)
    /// `--color-brand-cyan-dark` #1F4E8C
    static let cyanDark = Color(red: 31 / 255, green: 78 / 255, blue: 140 / 255)
}
