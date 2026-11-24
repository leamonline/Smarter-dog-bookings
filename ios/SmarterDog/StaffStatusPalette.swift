import Foundation

// The booking status colours: one hue per status, as on the website
// (`src/constants/statusPalette.ts`) and the staff dashboard. Kept as data rather
// than asset-catalogue colour sets because they are a mirror of the website's
// palette, not iPhone design colours, and `StaffDayParityTests` checks every value
// here against the website's own file. The app is light only.
//
// Every ink and meta colour clears WCAG AA on its tint (checked on the website).
// The status word is always shown, so colour is never the only signal.

struct StaffStatusTone: Equatable, Sendable {
    /// "expected", "unconfirmed", "reminderFailed", "confirmed", "reconfirmed", "arrived", "ready",
    /// "noShow", "cancelled", "collected" or "unknown".
    let key: String
    /// The word staff read: "Expected", "Ready", "No-show".
    let label: String
    /// Pale fill behind the status word and the row.
    let tint: String
    /// Text on `tint`.
    let ink: String
    /// Secondary text on `tint` (breed, service, timing).
    let meta: String
    /// The saturated edge rule. Never text.
    let edge: String
}

enum StaffStatusPalette {
    enum Confirmation: Equatable, Sendable {
        case unconfirmed, reminderFailed, confirmed
    }

    static let tones: [String: StaffStatusTone] = [
        "expected": StaffStatusTone(key: "expected", label: "Expected", tint: "#F1E9DC", ink: "#3B3226", meta: "#5E5242", edge: "#B8A68A"),
        "unconfirmed": StaffStatusTone(key: "unconfirmed", label: "Unconfirmed", tint: "#FFDDC9", ink: "#5C2408", meta: "#7A3410", edge: "#E0662B"),
        "reminderFailed": StaffStatusTone(key: "reminderFailed", label: "Reminder failed", tint: "#FFDDC9", ink: "#5C2408", meta: "#7A3410", edge: "#E0662B"),
        "confirmed": StaffStatusTone(key: "confirmed", label: "Confirmed", tint: "#E4E4FB", ink: "#26266A", meta: "#3D3D8F", edge: "#7C80DC"),
        "reconfirmed": StaffStatusTone(key: "reconfirmed", label: "Reconfirmed", tint: "#E4E4FB", ink: "#26266A", meta: "#3D3D8F", edge: "#7C80DC"),
        "arrived": StaffStatusTone(key: "arrived", label: "Arrived", tint: "#D5EFE5", ink: "#0F3F2E", meta: "#1C5E46", edge: "#2E9D78"),
        "ready": StaffStatusTone(key: "ready", label: "Ready", tint: "#FCEAB0", ink: "#4A3500", meta: "#6B4D00", edge: "#D49A00"),
        "noShow": StaffStatusTone(key: "noShow", label: "No-show", tint: "#F7D9D2", ink: "#5C1A10", meta: "#80281A", edge: "#C4442D"),
        "cancelled": StaffStatusTone(key: "cancelled", label: "Cancelled", tint: "#F7D9D2", ink: "#5C1A10", meta: "#80281A", edge: "#C4442D"),
        "collected": StaffStatusTone(key: "collected", label: "Collected", tint: "#ECEDEF", ink: "#34383E", meta: "#575C63", edge: "#8E939A"),
    ]

    /// Bad data stands out: an unrecognised status gets its own amber, never a calm tone.
    static func unknown(_ status: String) -> StaffStatusTone {
        let shown = status.trimmingCharacters(in: .whitespacesAndNewlines)
        return StaffStatusTone(
            key: "unknown",
            label: "Unknown: \(shown.isEmpty ? "Not set" : shown)",
            tint: "#FFF7DC", ink: "#5C4600", meta: "#5C4600", edge: "#835D00"
        )
    }

    /// The website's `resolveDayStatus`: which tone a booking wears.
    static func resolve(status: String, cancelReason: String?, confirmation: Confirmation?) -> StaffStatusTone {
        func tone(_ key: String) -> StaffStatusTone { tones[key]! }
        switch status {
        case StaffDayStack.booked:
            switch confirmation {
            case .unconfirmed: return tone("unconfirmed")
            case .reminderFailed: return tone("reminderFailed")
            case .confirmed: return tone("confirmed")
            case nil: return tone("expected")
            }
        case StaffDayStack.reconfirmed: return tone("reconfirmed")
        case StaffDayStack.arrived: return tone("arrived")
        case StaffDayStack.ready: return tone("ready")
        case StaffDayStack.completed: return tone("collected")
        case StaffDayStack.noShow: return tone("noShow")
        case StaffDayStack.cancelled:
            return StaffDayStack.isNoShowReason(cancelReason) ? tone("noShow") : tone("cancelled")
        default: return unknown(status)
        }
    }

    /// "#F1E9DC" to red, green and blue in 0...1, for the view layer.
    static func rgb(_ hex: String) -> (red: Double, green: Double, blue: Double)? {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        return (
            Double((value >> 16) & 0xFF) / 255,
            Double((value >> 8) & 0xFF) / 255,
            Double(value & 0xFF) / 255
        )
    }
}
