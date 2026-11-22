import SwiftUI

@main
struct SmarterDogApp: App {
    @State private var auth = AuthService.connected()

    init() {
        AppFont.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView(auth: auth)
        }
    }
}
