import SwiftUI

@main
struct SmarterDogApp: App {
    init() {
        // Touch the linked package and the config keys so neither is stripped.
        // This does not construct a Supabase client and does not open a connection.
        _ = SupabasePackage.clientTypeName
        _ = SupabasePackage.hasPlaceholderCredentials
    }

    var body: some Scene {
        WindowGroup {
            SignInView()
        }
    }
}
