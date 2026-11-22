import Supabase

/// The Supabase Swift package is a real link dependency of this target.
/// `SupabaseClient` is named so the module is used. No client is created.
enum SupabasePackage {
    static let clientTypeName = String(reflecting: SupabaseClient.self)

    static var hasPlaceholderCredentials: Bool {
        SupabaseConfig.isPlaceholder
    }
}
