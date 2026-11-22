import Foundation

/// UK mobile numbers in the form Supabase Auth expects (`+447` and nine digits).
/// Same rules as `normaliseUkMobile` in `src/utils/phone.js`.
enum PhoneNumber {
    static func normaliseUKMobile(_ raw: String) -> String {
        var phone = stripFormatCharacters(raw)
        phone = String(phone.unicodeScalars.filter { scalar in
            if CharacterSet.whitespacesAndNewlines.contains(scalar) { return false }
            if CharacterSet(charactersIn: "-().").contains(scalar) { return false }
            return true
        })

        if phone.hasPrefix("00") {
            phone = "+" + String(phone.dropFirst(2))
        }
        if phone.hasPrefix("+440") {
            phone = "+44" + String(phone.dropFirst(4))
        }
        if wholeMatch("^447\\d{9}$", phone) {
            phone = "+" + phone
        }
        if wholeMatch("^07\\d{9}$", phone) {
            phone = "+44" + String(phone.dropFirst(1))
        }
        return wholeMatch("^\\+447\\d{9}$", phone) ? phone : ""
    }

    /// `+447700900123` becomes `07700 900123`. Anything else is returned unchanged.
    static func nationalDisplay(from e164: String) -> String {
        guard e164.hasPrefix("+44"), e164.count == 13 else { return e164 }
        let local = Array("0" + e164.dropFirst(3))
        guard local.count == 11 else { return e164 }
        return String(local.prefix(5)) + " " + String(local.suffix(6))
    }

    private static func stripFormatCharacters(_ raw: String) -> String {
        String(raw.unicodeScalars.filter { $0.properties.generalCategory != .format })
    }

    private static func wholeMatch(_ pattern: String, _ value: String) -> Bool {
        value.range(of: pattern, options: .regularExpression) != nil
    }
}
