import SwiftUI

/// Semantic paints. The hex lives in the asset catalogue, with a light and a
/// dark appearance, so a screen never writes a colour value of its own.
/// `BrandPaper` and `BrandInk` are the same paints as `Surface` and `TextPrimary`.
enum AppColor {
    static let surface = Color("Surface")
    static let surfaceRaised = Color("SurfaceRaised")
    static let textPrimary = Color("TextPrimary")
    static let textSecondary = Color("TextSecondary")
    static let actionYellow = Color("ActionYellow")
    static let onAction = Color("OnAction")
    /// Decoration only. It fails WCAG AA as text on paper. Links use `accentBlueDeep`.
    static let accentBlue = Color("AccentBlue")
    static let accentBlueDeep = Color("AccentBlueDeep")
    static let dashNavy = Color("DashNavy")
    /// Material. Not for text.
    static let oak = Color("Oak")
    /// Material. Not for text, and not a second action colour.
    static let brass = Color("Brass")
    static let separator = Color("AppSeparator")
    static let success = Color("Success")
    static let successSoft = Color("SuccessSoft")
    static let warning = Color("Warning")
    static let warningSoft = Color("WarningSoft")
    static let destructive = Color("Destructive")
    static let destructiveSoft = Color("DestructiveSoft")
    static let polaroidMount = Color("PolaroidMount")
    /// Captions on a polaroid. Stays ink in dark mode, because the mount stays cream.
    static let onPolaroid = Color("OnPolaroid")
    static let overlay = Color("Overlay")
    static let focusRing = Color("FocusRing")
    static let brandPaper = Color("BrandPaper")
    static let brandInk = Color("BrandInk")
}
