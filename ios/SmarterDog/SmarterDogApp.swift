import SwiftUI

@main
struct SmarterDogApp: App {
    @State private var auth = AuthService()

    var body: some Scene {
        WindowGroup {
            RootView(auth: auth)
        }
    }
}
