// swift-tools-version: 6.0
import PackageDescription

// Sign-in decisions, compiled here so Linux CI can test them.
// The iPhone app compiles the same files. This package does not build the app.
let package = Package(
    name: "SmarterDogAuth",
    // `AuthService` uses `@Observable`, which needs macOS 14 and iOS 17. Without this,
    // `swift test` on a Mac assumes macOS 12 and fails to compile. Linux ignores the line.
    platforms: [.iOS(.v18), .macOS(.v14)],
    targets: [
        .target(
            name: "AuthCore",
            path: "SmarterDog",
            exclude: [
                "Assets.xcassets",
                "Fonts",
                "AppColor.swift",
                "AppFont.swift",
                "AppMetrics.swift",
                "Decorations.swift",
                "SupabaseConfig.swift",
                "SalonClient.swift",
                "SupabaseSessionClient.swift",
                "SecurityCheckView.swift",
                "SignInView.swift",
                "RootView.swift",
                "SmarterDogApp.swift",
                "SupabaseHomeClient.swift",
                "SupabaseBookingClient.swift",
                "BookingFlowView.swift",
                "LiveBookingDebug.swift",
                "HomeView.swift",
                "SupabaseDogsClient.swift",
                "DogsView.swift",
                "SupabaseStaffDayClient.swift",
                "StaffRootView.swift",
                "StaffTodayView.swift",
            ],
            sources: [
                "PhoneNumber.swift",
                "AuthModels.swift",
                "SessionClient.swift",
                "AuthService.swift",
                "HomeModels.swift",
                "BookingModels.swift",
                "CapacityEngine.swift",
                "BookingWizard.swift",
                "BookingFlowModel.swift",
                "BookingServices.swift",
                "BookingAvailability.swift",
                "BookingTimes.swift",
                "BookingConfirm.swift",
                "DogsModels.swift",
                "StaffDayStack.swift",
                "StaffStatusPalette.swift",
                "StaffDayModels.swift",
                "StaffTodayModel.swift",
            ]
        ),
        .testTarget(
            name: "AuthCoreTests",
            dependencies: ["AuthCore"],
            path: "AuthCoreTests",
            exclude: ["denial-cases.json", "capacity-parity.json", "service-prices.json", "staff-day-parity.json"]
        ),
    ]
)
