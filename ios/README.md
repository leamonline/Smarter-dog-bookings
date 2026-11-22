# Smarter Dog for iPhone

This folder is the iPhone app. A customer signs in with their mobile number, then either their password or a code by text. The salon team signs in with email and password. The app remembers that sign-in until they tap Sign out. After sign-in it opens a simple home for customers or for staff, or a waiting screen if a new customer is not approved yet.

The website and the staff dashboard in the browser are unchanged. The iPhone app uses the same sign-in system as the website.

You need a Mac. The rest of this repository can be worked on from other computers. The iPhone app cannot.

## Names

| Where people see it | What to type |
| --- | --- |
| Under the icon on the iPhone | Smarter Dog (already set) |
| On the App Store | Smarter Dog Grooming (you type this at Apple, not in this folder) |
| Bundle ID, a private id Apple uses | `uk.co.smarterdog.app` |

The bundle ID is a placeholder. You can change it. If Apple says that ID is already taken, pick another (for example `uk.co.smarterdog.grooming`) and use that same text everywhere Apple asks for it.

## What you need

1. A Mac with the current Xcode installed from the Mac App Store. The Supabase package needs Xcode 16.3 or newer. The version on the App Store today is fine. Open Xcode once and let it install any extra components it asks for.
2. An iPhone running iOS 18 or later. On the iPhone: Settings → General → About → iOS Version.
3. An Apple ID. A free Apple ID can install the app on your own phone for about a week.
4. For TestFlight and Xcode Cloud, a paid Apple Developer Program membership (the individual one is enough). Join at [developer.apple.com/programs](https://developer.apple.com/programs).

## 1. Open the project

1. Get this repository onto the Mac. GitHub’s green Code button → Download ZIP is enough, or use GitHub Desktop if you already have it.
2. Unzip if you downloaded a ZIP. Stay in the top folder (the one that also contains the website). Do not open the `ios` folder to find the project.
3. Double-click `SmarterDog.xcodeproj` in that top folder. It opens in Xcode. The Swift files it builds still live in `ios/`.
4. If Xcode asks to upgrade the project to the latest recommended settings, click Perform Changes. That only updates Xcode’s project file. It does not change the screen.

The scheme is already called **SmarterDog**. If the scheme menu at the top does not say that, click it and choose SmarterDog.

## 2. Choose your team

This is what lets the app run on your phone. No team ID is saved in the repository. You choose yours on the Mac.

1. In Xcode’s menu bar, open **Xcode → Settings → Accounts**.
2. Click **+** and sign in with the Apple ID that is on the developer programme. Close Settings.
3. In the left column, click the blue **SmarterDog** icon.
4. Under TARGETS, click **SmarterDog**.
5. Open the **Signing & Capabilities** tab.
6. Leave **Automatically manage signing** ticked.
7. In **Team**, choose your name. Do not type a team ID into a file.

Xcode may then show the project file as changed. That change is your team. You do not have to commit it. Xcode Cloud uses the team you pick when you create the workflow.

If Team is empty, the Apple ID in Settings is missing, or that Apple ID has not joined the developer programme.

## 3. Bundle ID

On the same Signing tab, **Bundle Identifier** reads `uk.co.smarterdog.app`.

Leave it if Apple accepts it. If Xcode says the identifier is already in use, change it to something you own, still starting with `uk.co.smarterdog`. Write the new text down. App Store Connect must use the identical text.

## 4. Run it on your iPhone

1. Plug the iPhone into the Mac and unlock the phone. If the phone asks you to Trust This Computer, tap Trust and enter the phone passcode.
2. At the top of Xcode, next to SmarterDog, open the device menu. It may say a simulator name or “Any iOS Device”. Choose your iPhone.
3. Press the play triangle (or Product → Run).
4. The first time, the iPhone often asks for Developer Mode. On the phone: Settings → Privacy & Security → Developer Mode → turn it on, and restart when asked. Then press play in Xcode again.
5. If the phone says the developer is untrusted: Settings → General → VPN & Device Management → your Apple ID → Trust.

The icon is the black square with the white dog, the same mark as the website. The name under it is Smarter Dog.

The first run downloads the Supabase package. The Mac needs to be online for that download. The exact versions are already saved in the project, so Xcode Cloud builds those same copies rather than picking newer ones.

Until the salon connection is filled in (next section), the app opens and says it is not connected. It does not guess a server.

## 5. Connect it to the salon

Sign-in needs two values from Supabase. Both are public. The website already ships the same pair inside the browser app. They are not the secret key.

1. In Supabase, open the salon project, then **Project Settings → API**.
2. Copy the **Project URL**. It looks like `https://` something `.supabase.co`.
3. Copy the **publishable** key. Older projects call this the **anon** key. It is safe to put in the app. Anyone using the website already has it.
4. Do **not** copy the **service_role** key. That one is a secret. It must never go in the app, in Xcode Cloud, or in a file you commit.

### On your Mac

1. In this folder, duplicate [Config/Config.local.xcconfig.example](Config/Config.local.xcconfig.example) and name the copy `Config.local.xcconfig` (same folder).
2. Paste the project URL and the publishable key into that copy.
3. Keep the odd spelling `:/$()/`. This kind of settings file treats `//` as a comment, and Xcode turns that spelling back into `://`.

`Config.local.xcconfig` is ignored by Git. Do not commit it, and do not paste a real key into `Config.xcconfig` or the example file.

The shared `Config.xcconfig` already contains the public security-check key the website uses (Cloudflare Turnstile). That key is not a secret. Do not add the Turnstile **secret** key anywhere in the app.

### For a TestFlight build

Xcode Cloud does not see the file on your Mac. Add the same two values to the workflow, or the TestFlight app will say it is not connected.

1. App Store Connect → your app → **Xcode Cloud** → **Internal TestFlight Build** → edit.
2. Open **Environment** (Xcode’s workflow editor has the same place).
3. Add `SUPABASE_URL` and set it to the project URL, including `https://`.
4. Add `SUPABASE_PUBLISHABLE_KEY` and set it to the publishable or anon key. Mark it secret in Xcode Cloud so the build log does not print it. It is still the public key, not the service_role key.
5. Save, then start a **new** build. A build that already finished does not pick the variables up.

The cloud build writes those two values into the ignored local settings file before it compiles. You do not commit that file.

## 6. First TestFlight build with Xcode Cloud

TestFlight is Apple’s app for installing a build that is not on the public App Store yet. Internal testing means only people on your developer team. Keep this build on internal testing. It signs people in and shows a simple home. It does not book appointments yet, so it is not ready for outside testers.

Apple’s own guide, if a button has moved: [Distributing your Xcode Cloud builds through TestFlight](https://developer.apple.com/documentation/xcode/distributing-your-xcode-cloud-builds-through-testflight). A shorter start is [Getting started with Xcode Cloud](https://developer.apple.com/documentation/xcode/getting-started-with-xcode-cloud).

### Connect this GitHub repository

1. Sign in at [App Store Connect](https://appstoreconnect.apple.com). If a banner asks you to accept an agreement, accept it before continuing.
2. Open **Users and Access → Integrations → Xcode Cloud**.
3. Connect the GitHub account that can see `leamonline/Smarter-dog-bookings`.
4. Grant access to that repository. You do not need to grant every repository you own.

### Create the workflow

1. On the Mac, with `SmarterDog.xcodeproj` open and your team selected, open the **Report navigator** (the speech-bubble icon in the left sidebar) and the **Cloud** tab.
2. Choose **Set Up Distribution**, or **Create Workflow** if that is what you see. The **Integrate** menu has the same commands.
3. If Xcode offers to create the App Store record, check these before you confirm:
   - Name: **Smarter Dog Grooming** (this is the App Store name, not the name under the icon)
   - Bundle ID: the same text as in Signing & Capabilities
   - Primary language: English (U.K.), if it asks
   - SKU, if it asks: `smarter-dog-ios` (customers never see this)
4. If it asks which branch to build, you can use the pull-request branch to try a build before merging, or `main` after the files are on main.
5. The product to build is the **SmarterDog** scheme. It is already shared in the project, which is what Xcode Cloud requires. If Xcode says there is no shared scheme, the checkout is missing `SmarterDog.xcodeproj/xcshareddata/xcschemes/SmarterDog.xcscheme` in the top folder.
6. In the workflow, set the **Archive** action’s deployment to **TestFlight (Internal Testing Only)**.
7. If a **Test** action is included, turn it off. This skeleton has no tests. An archive is the build you want.
8. Add a post-action: **TestFlight Internal Testing**. Add yourself (or the internal group). Internal testers are people already on the App Store Connect team.
9. Start the build.

You can also create the app record yourself before the workflow: App Store Connect → Apps → the **+** button → New App → iOS, with the same name and bundle ID.

### If the build says the project does not exist at the root

That message means the workflow is looking for `SmarterDog.xcodeproj` in the top folder of the GitHub repository. The project is there now. It used to be inside `ios`, which is why the first builds failed, and why typing `ios/SmarterDog.xcodeproj` into the workflow did not stick.

Do this once, after this change is on `main`:

1. On the Mac, get the latest code (GitHub Desktop → Fetch and Pull, or download a new ZIP). The top folder must contain `SmarterDog.xcodeproj`.
2. Double-click that `SmarterDog.xcodeproj`.
3. Open the workflow named **Internal TestFlight Build**. In Xcode: Report navigator (the speech-bubble icon) → **Cloud**, then the workflow. The **Integrate** menu → **Manage Workflows** is the same place.
4. Open **General**.
5. Set **Project or Workspace** to `SmarterDog.xcodeproj`. The name must not start with `ios/`. If a list shows more than one, pick the one in the top folder.
6. Set **Scheme** to `SmarterDog`. Pick it again even if it already says that. The yellow warning next to the scheme clears when the project at the top of the repo is selected. If the warning stays, use the scheme menu at the top of the Xcode window, choose **SmarterDog**, then come back to this workflow and choose **SmarterDog** again.
7. Leave the Archive action on **TestFlight (Internal Testing Only)**. If a Test action is listed, turn it off. This app has no tests.
8. Save the workflow.
9. Start a **new** build. Do not restart the failed one.

If you also edit workflows in the browser, change the same two fields there so they match: App Store Connect → your app → **Xcode Cloud** → **Internal TestFlight Build** → edit → General → Project or Workspace `SmarterDog.xcodeproj`, Scheme `SmarterDog` → save, then start a new build.

### Install it

1. On the iPhone, install Apple’s **TestFlight** app from the App Store.
2. When the build finishes, open TestFlight and accept the invite if one appears. The first processing step at Apple can take a while after Xcode Cloud goes green.
3. If App Store Connect asks whether the app uses encryption, answer **No**. The project already records that the app does not add its own encryption. Sign-in uses the normal secure connection built into the phone.

One archive is enough to prove the pipeline. Apple includes a number of Xcode Cloud hours with the developer programme.

## What you should see when it is connected

- A customer types their mobile number and taps Continue. A number with a password asks for the password. A number that is on file but has no password offers a text code. A number the salon does not know yet is sent to Join the Pack on the website. No text is sent to that number.
- Before a password or a text, the same security check as the website has to finish. Sometimes it completes on its own. Sometimes it asks you to tick a box.
- The salon team uses Staff sign in, with the email and password they already use on the dashboard.
- Closing the app does not sign you out. Sign out does.
- An approved customer sees a Home tab with their name and the word Customer. Staff see their name and Owner or Staff.
- A new customer who has finished Join the Pack but is not approved yet sees a waiting screen, with Check again and Sign out. They do not see the customer home.

## What merging does not do

Merging these files to `main` publishes the website, because that is what a merge always does. This change does not alter the website or the booking screens.

Merging does **not** put the iPhone app on the App Store. A TestFlight build is uploaded only when the Xcode Cloud workflow runs (or when you archive by hand from Xcode). After this version is on `main`, start a new Internal TestFlight build. Put the two Supabase values on the workflow first, or the phone will say the app is not connected.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| “Signing for SmarterDog requires a development team” | Signing & Capabilities → Team → your name. Automatically manage signing stays on. |
| Bundle ID already in use | Change the bundle ID (section 3) and use the new text in App Store Connect. |
| No such module 'Supabase' | The Mac must be online. In Xcode: File → Packages → Resolve Package Versions. You need Xcode 16.3 or newer. |
| Xcode Cloud cannot find a scheme | Product → Scheme → SmarterDog. The shared scheme file named above has to be in the checkout Xcode Cloud builds. |
| Cloud build fails on signing | In the workflow, keep automatic signing on and choose the same team as on the Mac. The team ID does not have to be committed. |
| Test action failed and there are no tests | Edit the workflow and remove the Test action. Keep Archive. |
| The phone will not install the app | Developer Mode, then Trust the developer certificate. The phone must be on iOS 18 or later. |
| The app says it isn't connected | The Supabase URL and publishable key are missing from this build. On your Mac, fill in `Config.local.xcconfig`. For TestFlight, add the two Xcode Cloud variables and start a new build. |
| The security check never finishes | Check the phone is online. The check is the same one as the website. Do not turn it off in Supabase, and do not put the Turnstile secret key in the app. |

## Notes for a developer

`SmarterDog.xcodeproj` is at the repository root on purpose. Xcode Cloud’s workflow stores that file name with no folder in front of it, and it looks for the file in the top of the repository. The Swift sources, the icon and the config files stay in `ios/`. There is no XcodeGen `project.yml`. The project was written by hand so it could be committed from a machine without Xcode. Open it in Xcode to change settings. If Xcode rewrites the project file on open, that rewrite is safe to keep. Do not move the `.xcodeproj` back into `ios/`.

- iOS 18, iPhone only (`TARGETED_DEVICE_FAMILY = 1`), Swift 6 language mode, SwiftUI app lifecycle.
- Automatic signing. `DEVELOPMENT_TEAM` is intentionally absent.
- [`supabase-swift`](https://github.com/supabase/supabase-swift) product `Supabase`, from 2.55.7 up to the next major version. Version 3 is a breaking alpha and is not selected. `SalonClient` constructs `SupabaseClient` with the 2.55.7 calls (`signIn(phone:password:captchaToken:)`, `signInWithOTP(phone:channel:shouldCreateUser:captchaToken:)`, `verifyOTP(phone:token:type:)`, `functions.invoke`, `rpc`, `from`). The library's default storage is the Keychain, which is what keeps the session. `ci_scripts/ci_post_clone.sh` (repository root, next to the xcodeproj) fills `Config.local.xcconfig` on Xcode Cloud from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- `SmarterDog.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (repository root, not inside `ios/`) is the lockfile Xcode Cloud reads when it opens that project. It pins 2.55.7 and the packages that product links (resolved with Swift 6.4.3). Do not gitignore it. After adding a package, resolve again and commit the updated file.
- `Config.xcconfig` holds Supabase placeholders, the public Turnstile site key, and optionally includes the gitignored local file (`#include?`). The `INFOPLIST_KEY_` lines come after that include, so a local override wins. Xcode still generates the rest of Info.plist. `ios/SmarterDog/Info.plist` is merged in and contains only `UIAppFonts`: `Poppins-Bold.ttf` and `Poppins-SemiBold.ttf`, each as its own entry. The app also registers those two files at launch. The SIL Open Font License is `ios/SmarterDog/Fonts/OFL.txt`, and that file is copied into the app as well.
- Colours are named sets in `ios/SmarterDog/Assets.xcassets/Colors`, each with a light and a dark appearance. Screens use those names (`Surface`, `TextPrimary`, `ActionYellow`, and the rest). Headings are Poppins Bold or SemiBold and scale with Dynamic Type. Button labels, body and captions stay on the system font. The yellow button is a capsule with ink text. The phone's light or dark setting is followed. Do not add Inter, and do not copy website teal, coral or neon green into this app.
- Home-screen icon is a byte copy of `public/app/icons/icon-1024.png` (1024×1024, no transparency). After that file changes, copy it again:

```bash
cp public/app/icons/icon-1024.png ios/SmarterDog/Assets.xcassets/AppIcon.appiconset/AppIcon.png
```

- Root lint, Vitest and the docs link check ignore `ios/`. Nothing here is built by the Vercel deploy. Linux CI cannot compile the iPhone app. It can run the sign-in decisions, which do not use the iPhone UI: `swift test --package-path ios`. The Xcode scheme still has no test action, so leave that action off in Xcode Cloud.
