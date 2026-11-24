import Foundation
import Supabase

/// One Supabase client for the app. The signed-in session is stored in the
/// Keychain by the library's default storage, and it is refreshed while the
/// app is open, so someone stays signed in until they choose Sign out.
enum SalonClient {
    static func make() -> SupabaseClient? {
        guard !SupabaseConfig.isPlaceholder, let url = URL(string: SupabaseConfig.urlString) else {
            return nil
        }
        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: SupabaseConfig.publishableKey,
            options: SupabaseClientOptions(
                auth: .init(emitLocalSessionAsInitialSession: true)
            )
        )
    }
}
