# Smarter Dog for iPhone

This folder is the iPhone app. A customer signs in with their mobile number, then either their password or a code by text. The salon team signs in with email and password. The app remembers that sign-in until they tap Sign out. After sign-in it opens a simple home for customers or for staff, or a waiting screen if a new customer is not approved yet.

The website and the staff dashboard in the browser are unchanged. The iPhone app uses the same sign-in system as the website.

What the app may call after sign-in, including booking and iPhone notifications, is written in `docs/ios-api-contract.md` (in the folder above this one).

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

This is what lets the app run on your phone. The project records the salon's Apple developer team (`ML5PLXXF9R`) for automatic signing in Debug and Release. This public identifier contains no signing credentials. On the Mac, sign in with an Apple ID that belongs to that team.

1. In Xcode’s menu bar, open **Xcode → Settings → Accounts**.
2. Click **+** and sign in with the Apple ID that is on the developer programme. Close Settings.
3. In the left column, click the blue **SmarterDog** icon.
4. Under TARGETS, click **SmarterDog**.
5. Open the **Signing & Capabilities** tab.
6. Leave **Automatically manage signing** ticked.
7. In **Team**, choose the salon's team. Do not type a team ID into a file.

If you choose a different team for local testing, keep that change local. Xcode Cloud must use the same salon team as the committed project.

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

The icon is a yellow square with the dark dog. On a phone set to Dark Mode the dog is yellow and the corners are clear, so the dark home screen shows through. If the phone is using tinted icons, the dog is grey. The name under it is Smarter Dog.

The first run downloads the Supabase package. The Mac needs to be online for that download. The exact versions are already saved in the project, so Xcode Cloud builds those same copies rather than picking newer ones.

Sign-in is already connected to the salon. A normal Xcode Cloud build uses that connection. You do not add `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` to the workflow.

## 5. The salon connection

The shared file [Config/Config.xcconfig](Config/Config.xcconfig) holds the project address and the publishable key. Both are public. The website already ships the same key in the browser. The database still decides what each signed-in person is allowed to see.

Do **not** put the **service_role** key in the app, in Xcode Cloud, or in a file you commit. That key is a secret. The build refuses it if it is pasted in by mistake.

You only need a local override if you want a different Supabase project on your Mac:

1. In this folder, duplicate [Config/Config.local.xcconfig.example](Config/Config.local.xcconfig.example) and name the copy `Config.local.xcconfig` (same folder).
2. Paste the other project URL and its publishable key into that copy.
3. Keep the odd spelling `:/$()/`. This kind of settings file treats `//` as a comment, and Xcode turns that spelling back into `://`.

`Config.local.xcconfig` is ignored by Git. Do not commit it.

If a TestFlight build must point somewhere else, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the Xcode Cloud workflow. Those override the values in the project. Leave them unset for the normal salon build.

The same config file also holds the public security-check key the website uses (Cloudflare Turnstile). That key is not a secret. Do not add the Turnstile **secret** key anywhere in the app.

### Trying live booking on staging (Debug only)

The booking screens normally show made-up data (`-sampleBooking`). To run the real flow against the **staging** project, signed in as the throwaway test customer, launch a Debug build with `-liveBooking`. It creates real bookings on staging and refuses to run against any other project, so a mistake in the configuration cannot point it at production. It does not exist in Release builds.

1. Point the app at staging in `Config.local.xcconfig` (section 5). The staging project is `btjnxvgkpdbfrrqxvkfj`. Use its public URL and publishable key, never a service-role key.
2. In Xcode choose Product, Scheme, Edit Scheme, Run, Arguments. Under **Arguments Passed On Launch** add `-liveBooking`. Under **Environment Variables** add `STAGING_TEST_EMAIL` and `STAGING_TEST_PASSWORD`. Those values stay in your local scheme and are never committed.
3. The test customer is `ios-staging-test@example.com`. Set its password yourself in the staging dashboard (Authentication, Users) so it is not shared in chat.
4. Run. A red banner reads "LIVE BOOKING · STAGING". Work through the flow to the summary and tap **Confirm booking**. A real booking is made on staging and the booked screen appears. If the customer is tagged as deposit-required, the booked screen says a deposit is due; the app takes no payment.
5. To cancel, tap **My bookings** at the top right. Each upcoming visit that can be cancelled online (every dog in it still "Booked", and before drop-off) has a **Cancel** button. Pick a reason and tap **Confirm cancellation**. A cancel made on the appointment's own day is saved as a No-show for staff (ADR 015); the app shows no warning about that, by the owner's decision. Cancel is not shown anywhere outside this mode.

To look at the booked screen without any network or sign-in, launch a Debug build with `-sampleBooked`. It shows the "You're booked." moment with made-up details, including a deposit line. Turn on Reduce Motion in Settings, Accessibility to check it appears without movement.

## 6. First TestFlight build with Xcode Cloud

TestFlight is Apple’s app for installing a build that is not on the public App Store yet. Internal testing means only people on your developer team. Keep this build on internal testing. It signs people in and shows a read-only home. It does not book appointments yet, so it is not ready for outside testers.

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
- An approved customer sees a Home screen: a greeting, their coming-up grooms (today and later, soonest first) and their dogs. It only reads. If the lookup fails it says so and offers Try again, rather than saying nothing is booked.
- Staff see two tabs, **Today** and **More** (below).
- A new customer who has finished Join the Pack but is not approved yet sees a waiting screen, with Check again and Sign out. They do not see the customer home.

## Staff: Today and More

Staff sign in as before and land on **Today**: the day's dogs in appointment order, the same list as Today on the staff website. Tapping a dog (or long-pressing a row) shows its legal next steps: **Check in**, **Reconfirmed**, **Mark ready**, **Confirm booking** / **Unconfirm booking**, **Didn't show** and **They turned up** (for non-grouped no-shows), each with one-tap **Undo** where reversible. Marking a dog ready never messages the owner by itself; it opens an opt-in prompt (or holds the notice automatically while another dog for the same owner is still being groomed). Changes from another till refresh automatically via Realtime. Check-out and taking payment stay on the website until Phase S3. **More** opens the staff website's calendar, messages, customers, dogs, reports and settings in the browser, and has Sign out.

Each row shows the time, the dog, its status in words (Expected, Unconfirmed, Confirmed, Reconfirmed, Arrived, Ready, No-show) in the website's status colours, the most important safety warning with "+N" for the rest, breed · service · owner's surname, and how long the dog has been where it is ("in 30 min", "1 hr late", "No arrival", "waiting 50 min"). Collected dogs and cancellations leave the list; the header counts them.

Two known differences from the website, both for a dog still at Booked: a reminder that failed to reach the owner shows **Expected** here and **Unconfirmed** on the website; an owner who confirmed by typing "yes" in WhatsApp shows **Unconfirmed** here and **Confirmed** on the website. The dog's details say to check the inbox before chasing. Money (the balance due and the day's takings) is not shown yet; it comes with check-out.

### TestFlight checklist for staff Today

Sign in as staff on a day with bookings, with the website's Today open beside it.

1. The dogs are in the same order as the website, two dogs at one time in the same order too.
2. Each dog's status word and colour match the website, apart from the two differences above.
3. A dog with warnings shows the same first warning as the website, and the details list every warning.
4. The timing line matches the website within a minute, and moves on by itself while the screen is open.
5. Check a dog in on the website; pull down on Today. It moves to Arrived.
6. Previous and next day arrows work; Back to today appears away from today. A closed day says Salon closed.
7. Turn on Airplane Mode and pull down: the screen says it could not load the day, never that nothing is booked.
8. With the largest text size (Settings → Accessibility → Display & Text Size → Larger Text), rows grow rather than cut off the warning, and VoiceOver reads time, dog, status, every warning, breed and service, owner and timing.
9. Each More link opens the right staff page in the browser.

## What merging does not do

Merging these files to `main` publishes the website, because that is what a merge always does. This change does not alter the website or the booking screens.

Merging does **not** put the iPhone app on the App Store. A TestFlight build is uploaded only when the Xcode Cloud workflow runs (or when you archive by hand from Xcode). After this version is on `main`, start a new Internal TestFlight build. Sign-in is already connected. You do not add the Supabase values to the workflow.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| “Signing for SmarterDog requires a development team” | Signing & Capabilities → Team → your name. Automatically manage signing stays on. |
| Bundle ID already in use | Change the bundle ID (section 3) and use the new text in App Store Connect. |
| No such module 'Supabase' | The Mac must be online. In Xcode: File → Packages → Resolve Package Versions. You need Xcode 16.3 or newer. |
| Xcode Cloud cannot find a scheme | Product → Scheme → SmarterDog. The shared scheme file named above has to be in the checkout Xcode Cloud builds. |
| Cloud build fails on signing | In the workflow, keep automatic signing on and choose the same team as on the Mac. Use the team recorded in the project. |
| Test action failed and there are no tests | Edit the workflow and remove the Test action. Keep Archive. |
| The phone will not install the app | Developer Mode, then Trust the developer certificate. The phone must be on iOS 18 or later. |
| The app says it isn't connected | A local override or an Xcode Cloud variable has replaced the public salon connection with a placeholder. Remove that override, or put the public project URL and publishable key back, then start a new build. |
| The security check never finishes | Check the phone is online. The check is the same one as the website. Do not turn it off in Supabase, and do not put the Turnstile secret key in the app. |

## Notes for a developer

`SmarterDog.xcodeproj` is at the repository root on purpose. Xcode Cloud’s workflow stores that file name with no folder in front of it, and it looks for the file in the top of the repository. The Swift sources, the icon and the config files stay in `ios/`. There is no XcodeGen `project.yml`. The project was written by hand so it could be committed from a machine without Xcode. Open it in Xcode to change settings. If Xcode rewrites the project file on open, put the quoted `ios/` paths back before you commit (`path = "ios/SmarterDog"`, `path = "ios/Config"` and `path = "ios/README.md"`). Keep the committed salon signing team and the Xcode Cloud workflow aligned. Do not move the `.xcodeproj` back into `ios/`.

- iOS 18, iPhone only (`TARGETED_DEVICE_FAMILY = 1`), Swift 6 language mode, SwiftUI app lifecycle.
- Automatic signing. Debug and Release record the salon `DEVELOPMENT_TEAM`. Keep personal signing overrides local.
- [`supabase-swift`](https://github.com/supabase/supabase-swift) product `Supabase`, from 2.55.7 up to the next major version. Version 3 is a breaking alpha and is not selected. `SalonClient` constructs `SupabaseClient` with the 2.55.7 calls (`signIn(phone:password:captchaToken:)`, `signInWithOTP(phone:channel:shouldCreateUser:captchaToken:)`, `verifyOTP(phone:token:type:)`, `functions.invoke`, `rpc`, `from`). The library's default storage is the Keychain, which is what keeps the session. `Config.xcconfig` commits the public project URL and publishable key. `ci_scripts/ci_post_clone.sh` (repository root, next to the xcodeproj) writes `Config.local.xcconfig` only when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are both set, and that file overrides the committed values. It still refuses a service-role key.
- `SmarterDog.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (repository root, not inside `ios/`) is the lockfile Xcode Cloud reads when it opens that project. It pins 2.55.7 and the packages that product links (resolved with Swift 6.4.3). Do not gitignore it. After adding a package, resolve again and commit the updated file.
- `Config.xcconfig` holds the public Supabase URL and publishable key, the public Turnstile site key, and optionally includes the gitignored local file (`#include?`). The `INFOPLIST_KEY_` lines come after that include, so a local or Xcode Cloud override wins. Xcode still generates the rest of Info.plist. `ios/SmarterDog/Info.plist` is merged in and holds `UIAppFonts` plus three connection keys, `SupabaseURL`, `SupabasePublishableKey` and `TurnstileSiteKey`, written as `$(SUPABASE_URL)`-style references to `Config.xcconfig` (Xcode ignores custom `INFOPLIST_KEY_` entries, so they cannot live only in the project). The fonts are: `Poppins-Bold.ttf`, `Poppins-SemiBold.ttf`, `Poppins-Black.ttf` (hero titles) and `Caveat-Bold.ttf` (one handwritten line per hero screen), each as its own entry. The app also registers those files at launch. The SIL Open Font Licences are `ios/SmarterDog/Fonts/OFL.txt` (Poppins) and `OFL-Caveat.txt`, and both are copied into the app.
- Flyer look (style board of 22 November 2026): every `PaperScreen` has the segmented stripe across the top (12pt on the sign-in hero, 7pt elsewhere). The checkerboard edge and dash ribbon are gone. Hero titles use `appHero()` (Poppins Black); one `HandwrittenLine` per hero screen (Caveat Bold). The four service mascots are the `Mascot*` image sets (the website's 250px artwork as PNG, sharp up to about 80pt), shown with `MascotCircle` on sign-in and on a coming-up groom card. Walk-in services have no mascot. `AccentDashStrip` is kept in the asset catalogue but unused.
- Staff Today mirrors the website's day stack in `StaffDayStack.swift`, with its status colours in `StaffStatusPalette.swift` (the website's palette as data: the one deliberate home of hex in the app). `src/engine/staffDayParity.ios.test.ts` writes the website's own answers to `ios/AuthCoreTests/staff-day-parity.json` and fails when that file is stale; `StaffDayParityTests` checks the Swift copy against it. After a deliberate website change, run `UPDATE_IOS_STAFF_DAY_FIXTURES=1 npx vitest run src/engine/staffDayParity.ios.test.ts` and then `swift test --package-path ios`.
- Colours are named sets in `ios/SmarterDog/Assets.xcassets/Colors`, each with a light and a dark appearance. Screens use those names (`Surface`, `TextPrimary`, `ActionYellow`, and the rest). Headings are Poppins Bold or SemiBold and scale with Dynamic Type. Button labels, body and captions stay on the system font. The yellow button is a capsule with ink text. The app is light only: `UIUserInterfaceStyle` is `Light` in `Info.plist`, so a phone in Dark Mode still shows the cream paper. The dark values in the colour sets are unused and kept for now. The home-screen icon has its own dark version, which is separate. Do not add Inter, and do not copy website teal, coral or neon green into this app.
- Home-screen icon is `ios/SmarterDog/Assets.xcassets/AppIcon.appiconset`, a single 1024×1024 iOS set. `SmarterDog-iOS-Default-1024@1x.png` is opaque RGB (no alpha). `SmarterDog-iOS-Dark-1024@1x.png` may have a clear background. `AppIcon-Tinted.png` is the greyscale icon used when the home screen is tinted. Both the Debug and Release configurations set `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`, which is the name Xcode’s App Icon field reads. Do not copy `public/app/icons/icon-1024.png` over it.
- `ios/SmarterDog/SmarterDog.icon` is the Icon Composer package (hand-written `icon.json`, plus `Assets/dog.svg`). `icon.json` names `dog.svg`. It is not a member of the Xcode target, so the Internal TestFlight Build does not compile it. The inspectors to check are in `ios/SmarterDog/ICON-COMPOSER-SETTINGS.md`. Apple’s documentation says adding a `.icon` replaces the asset-catalog icon and Xcode generates the older-OS fallbacks itself. Leave this file out of the target until Icon Composer has re-saved it.

- Root lint, Vitest and the docs link check ignore `ios/`. Nothing here is built by the Vercel deploy. Linux CI cannot compile the iPhone app. It can run the sign-in decisions, which do not use the iPhone UI: `swift test --package-path ios`. The Xcode scheme still has no test action, so leave that action off in Xcode Cloud.
- The iPhone auth workflow imports Swift's official release keys before `setup-swift` verifies the Swiftly bootstrap archive. Installing GPG alone does not populate its keyring. Keep signature verification enabled; a key download, import or verification failure must stop setup before tests run.
