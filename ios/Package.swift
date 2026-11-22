// swift-tools-version: 6.0
import PackageDescription

// Sign-in decisions, compiled here so Linux CI can test them.
// The iPhone app compiles the same files. This package does not build the app.
let package = Package(
    name: "SmarterDogAuth",
    targets: [
        .target(
            name: "AuthCore",
            path: "SmarterDog",
            exclude: [
                "Assets.xcassets",
                "Brand.swift",
                "SupabaseConfig.swift",
                "SalonClient.swift",
                "SupabaseSessionClient.swift",
                "SecurityCheckView.swift",
                "SignInView.swift",
                "RootView.swift",
                "SmarterDogApp.swift",
            ],
            sources: [
                "PhoneNumber.swift",
                "AuthModels.swift",
                "SessionClient.swift",
                "AuthService.swift",
            ]
        ),
        .testTarget(
            name: "AuthCoreTests",
            dependencies: ["AuthCore"],
            path: "AuthCoreTests"
        ),
    ]
)
