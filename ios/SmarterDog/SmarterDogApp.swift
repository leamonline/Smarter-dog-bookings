import SwiftUI

@main
struct SmarterDogApp: App {
    @State private var auth = AuthService.connected()

    var body: some Scene {
        WindowGroup {
            RootView(auth: auth)
        }
    }
}
