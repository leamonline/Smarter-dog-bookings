#!/usr/bin/env bash
# Operator build only: this does not enrol, read or install a credential.
set -euo pipefail
test "$(uname -s)" = Darwin
: "${RELEASE_SIGNING_IDENTITY:?Set the approved Developer ID signing identity}"
: "${RELEASE_TEAM_ID:?Set its approved 10-character Apple team ID}"
[[ "$RELEASE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]
output="${1:?Pass a new output directory outside the repository}"
test ! -e "$output"
umask 077
mkdir -p "$output/SmarterDogRelease.app/Contents/MacOS" "$output/SmarterDogRelease.app/Contents/Resources"
source_dir="$(cd "$(dirname "$0")" && pwd)"
app="$output/SmarterDogRelease.app"
cp "$source_dir/credential-helper.swift" "$app/Contents/Resources/credential-helper.swift"
swiftc -O -framework AppKit -framework Security -framework LocalAuthentication \
  "$source_dir/credential-helper.swift" -o "$app/Contents/MacOS/credential-helper"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.smarterdog.release</string>
<key>CFBundleExecutable</key><string>credential-helper</string>
<key>CFBundleName</key><string>Smarter Dog Release</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
cat > "$output/entitlements.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.application-identifier</key><string>$RELEASE_TEAM_ID.com.smarterdog.release</string>
<key>com.apple.developer.team-identifier</key><string>$RELEASE_TEAM_ID</string>
<key>keychain-access-groups</key><array><string>$RELEASE_TEAM_ID.com.smarterdog.release</string></array>
</dict></plist>
PLIST
codesign --force --options runtime --timestamp --sign "$RELEASE_SIGNING_IDENTITY" \
  --entitlements "$output/entitlements.plist" "$app"
codesign --verify --strict --deep -R 'identifier "com.smarterdog.release" and anchor apple generic' "$app"
printf '%s\n' "Built signed helper at $app. Installation, enrolment and unlock acceptance are separate operator steps."
