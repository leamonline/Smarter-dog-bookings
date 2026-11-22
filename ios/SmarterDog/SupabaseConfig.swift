import Foundation

/// Values baked in from `Config.xcconfig` via Info.plist.
/// Placeholders are enough to compile. Nothing in the app reads them onto the network yet.
enum SupabaseConfig {
    static let urlString = (Bundle.main.object(forInfoDictionaryKey: "SupabaseURL") as? String) ?? ""
    static let publishableKey = (Bundle.main.object(forInfoDictionaryKey: "SupabasePublishableKey") as? String) ?? ""

    static var isPlaceholder: Bool {
        urlString.isEmpty
            || urlString.contains("placeholder")
            || publishableKey.isEmpty
            || publishableKey.contains("placeholder")
            || publishableKey.contains("YOUR_")
    }
}
