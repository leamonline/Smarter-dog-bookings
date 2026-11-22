import SwiftUI

/// 8pt grid. 4pt is the half-step. Prefer 8, 16, 24 and 32 in layout.
enum AppSpace {
    static let half: CGFloat = 4
    static let s1: CGFloat = 8
    static let s1_5: CGFloat = 12
    static let s2: CGFloat = 16
    static let s3: CGFloat = 24
    static let s4: CGFloat = 32
    static let s5: CGFloat = 40
    static let s6: CGFloat = 48
    static let s8: CGFloat = 64
}

enum AppRadius {
    static let chip: CGFloat = 8
    static let control: CGFloat = 12
    static let card: CGFloat = 16
    static let sheet: CGFloat = 24
    /// Almost sharp, like a print. Text on the mount uses `OnPolaroid`.
    static let polaroid: CGFloat = 2
}

extension View {
    /// Warm card shadow from the colour spec. Light uses espresso at a low alpha.
    /// Dark uses black. A 1pt `Separator` stroke still belongs on the card.
    func appCardShadow() -> some View {
        modifier(CardShadow())
    }

    /// Text field chrome: raised fill, 12pt corners, hairline, and a 3pt focus ring 2pt outside.
    func appControlChrome(focused: Bool) -> some View {
        modifier(ControlChrome(focused: focused))
    }
}

private struct CardShadow: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let espresso = Color(red: 26.0 / 255.0, green: 20.0 / 255.0, blue: 16.0 / 255.0)
        let tight = colorScheme == .dark ? Color.black.opacity(0.30) : espresso.opacity(0.05)
        let soft = colorScheme == .dark ? Color.black.opacity(0.45) : espresso.opacity(0.08)
        // CSS blur 2 / 10 (light) and 2 / 12 (dark), drawn as two SwiftUI shadows.
        let softRadius: CGFloat = colorScheme == .dark ? 12 : 10
        content
            .shadow(color: tight, radius: 2, x: 0, y: 1)
            .shadow(color: soft, radius: softRadius, x: 0, y: 2)
    }
}

private struct ControlChrome: ViewModifier {
    var focused: Bool

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: AppRadius.control, style: .continuous)
        content
            .padding(.horizontal, AppSpace.s2)
            .frame(maxWidth: .infinity, minHeight: AppSpace.s6, alignment: .leading)
            .background(AppColor.surfaceRaised, in: shape)
            .overlay(shape.strokeBorder(AppColor.separator, lineWidth: 1))
            .overlay(
                RoundedRectangle(cornerRadius: AppRadius.control + 2, style: .continuous)
                    .strokeBorder(AppColor.focusRing, lineWidth: focused ? 3 : 0)
                    .padding(-2)
            )
    }
}
