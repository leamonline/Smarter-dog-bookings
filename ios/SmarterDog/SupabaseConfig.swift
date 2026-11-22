import Foundation

/// Values baked in from `Config.xcconfig` via Info.plist.
/// Placeholders compile and show a "not connected" screen. A real URL and the
/// public anon key are what let sign-in talk to the salon.
enum SupabaseConfig {
    static let urlString = (Bundle.main.object(forInfoDictionaryKey: "SupabaseURL") as? String) ?? ""
    static let publishableKey = (Bundle.main.object(forInfoDictionaryKey: "SupabasePublishableKey") as? String) ?? ""

    /// Cloudflare's always-passes test key. A token from it cannot pass the live check.
    private static let turnstileTestKey = "1x00000000000000000000AA"

    static var isPlaceholder: Bool {
        urlString.isEmpty
            || urlString.contains("placeholder")
            || publishableKey.isEmpty
            || publishableKey.contains("placeholder")
            || publishableKey.contains("YOUR_")
    }

    /// Public Turnstile site key. Nil when it is missing or is the test key.
    static var turnstileSiteKey: String? {
        let raw = ((Bundle.main.object(forInfoDictionaryKey: "TurnstileSiteKey") as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty, !raw.contains("placeholder"), raw != turnstileTestKey else { return nil }
        guard raw.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else { return nil }
        return raw
    }
}
