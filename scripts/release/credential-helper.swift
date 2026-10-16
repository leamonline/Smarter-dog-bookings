// Build as the signed com.smarterdog.release macOS application described in
// docs/local-production-release.md. Never invoke enrolment from an agent.
import AppKit
import Security
import LocalAuthentication

let service = "com.smarterdog.release.production"
let account = "nlzhllhkigmsvrzduefz"
func refuse(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
let args = CommandLine.arguments
guard args.count >= 2 else { refuse("Use --enrol, --read DIGEST PROJECT or --probe") }
if args[1] == "--probe" {
    // Compile/install probe deliberately never reads the keychain.
    print("macOS data-protection keychain; userPresence; fresh context; no fallback")
    exit(0)
}
guard ProcessInfo.processInfo.environment["CI"] == nil,
      NSWorkspace.shared.frontmostApplication != nil else { refuse("Interactive desktop session required") }
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.activate(ignoringOtherApps: true)
let context = LAContext()
context.touchIDAuthenticationAllowableReuseDuration = 0
context.localizedCancelTitle = "Cancel release"
var query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
    kSecUseDataProtectionKeychain as String: true
]
if args[1] == "--enrol" && args.count == 2 {
    var error: Unmanaged<CFError>?
    guard let access = SecAccessControlCreateWithFlags(nil,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .userPresence, &error)
        else { refuse("Cannot create user-presence access control") }
    let alert = NSAlert()
    alert.messageText = "Enrol production release credential"
    alert.informativeText = "Store the dedicated Supabase token for \(account). Every release requires a new macOS authentication. Existing enrolment is never replaced automatically."
    let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 420, height: 24))
    alert.accessoryView = field
    alert.addButton(withTitle: "Enrol")
    alert.addButton(withTitle: "Cancel")
    guard alert.runModal() == .alertFirstButtonReturn, !field.stringValue.isEmpty else { refuse("Enrolment cancelled") }
    query[kSecAttrAccessControl as String] = access
    query[kSecValueData as String] = Data(field.stringValue.utf8)
    field.stringValue = ""
    guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else { refuse("Enrolment failed; check signing, entitlements or existing item") }
    print("Enrolled; human unlock acceptance must still be rehearsed")
} else if args[1] == "--read" && args.count == 4 {
    guard args[2].range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
          args[3] == account else { refuse("Invalid release digest or target") }
    context.localizedReason = "Approve production \(account), release SHA-256 \(args[2])"
    query[kSecUseAuthenticationContext as String] = context
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    defer { context.invalidate() }
    guard status == errSecSuccess, let data = item as? Data,
          let token = String(data: data, encoding: .utf8),
          token.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil
          else { refuse("Human unlock denied or credential unavailable; no fallback") }
    FileHandle.standardOutput.write(data)
} else { refuse("Unsupported operation") }
