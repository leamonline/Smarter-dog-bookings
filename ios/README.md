# Smarter Dog for iPhone

This folder is a small iPhone app. It shows a sign-in screen and nothing else. Continue and Staff sign in do not sign anyone in, and the app does not talk to the salon’s booking system yet.

What a later version is allowed to call is written in `docs/ios-api-contract.md` (in the folder above this one). This version does not call any of it.

It is here so you can connect Apple’s Xcode Cloud and get a first TestFlight build. The website and the staff dashboard are unchanged.

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

The icon is the black square with the white dog, the same mark as the website. The name under it is Smarter Dog. You can type a phone number. Continue does nothing. Staff sign in does nothing. Nothing is sent anywhere.

The first run downloads the Supabase package. The Mac needs to be online for that download. The exact versions are already saved in the project, so Xcode Cloud builds those same copies rather than picking newer ones. The app still does not call Supabase.

## 5. Keys (you can skip this for now)

The app builds without any Supabase key. The committed file `Config/Config.xcconfig` holds obvious placeholders. Xcode Cloud uses those placeholders, which is what we want while nothing on the screen connects.

When a later version actually signs people in:

1. In this folder, duplicate [Config/Config.local.xcconfig.example](Config/Config.local.xcconfig.example) and name the copy `Config.local.xcconfig` (same folder).
2. In Supabase, open the project, then Project Settings → API.
3. Paste the project URL and the **publishable** key into that copy.
4. Do not paste the **service_role** key. That key is a secret and must not go in the app.
5. Keep the odd spelling `:/$()/`. This kind of settings file treats `//` as a comment, and Xcode turns that spelling back into `://`.

`Config.local.xcconfig` is ignored by Git. Do not commit it, and do not paste a real key into `Config.xcconfig` or the example file.

## 6. First TestFlight build with Xcode Cloud

TestFlight is Apple’s app for installing a build that is not on the public App Store yet. Internal testing means only people on your developer team. Use internal testing for this placeholder. Do not send it to outside testers. That path needs an App Review, and this screen is not the real app.

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
3. If App Store Connect asks whether the app uses encryption, answer **No**. The project already records that the app does not add its own encryption. Sign-in will later use the normal secure connection built into the phone.

One archive is enough to prove the pipeline. Apple includes a number of Xcode Cloud hours with the developer programme.

## What merging does not do

Merging these files to `main` publishes the website, because that is what a merge always does. This change does not alter the website, the booking screens, or Supabase.

Merging does **not** put the iPhone app on the App Store, and it does not by itself upload a TestFlight build. The upload happens only when the Xcode Cloud workflow runs (or when you archive by hand from Xcode). Customers cannot see this placeholder unless you add them as testers.

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

## Notes for a developer

`SmarterDog.xcodeproj` is at the repository root on purpose. Xcode Cloud’s workflow stores that file name with no folder in front of it, and it looks for the file in the top of the repository. The Swift sources, the icon and the config files stay in `ios/`. There is no XcodeGen `project.yml`. The project was written by hand so it could be committed from a machine without Xcode. Open it in Xcode to change settings. If Xcode rewrites the project file on open, that rewrite is safe to keep. Do not move the `.xcodeproj` back into `ios/`.

- iOS 18, iPhone only (`TARGETED_DEVICE_FAMILY = 1`), Swift 6 language mode, SwiftUI app lifecycle.
- Automatic signing. `DEVELOPMENT_TEAM` is intentionally absent.
- [`supabase-swift`](https://github.com/supabase/supabase-swift) product `Supabase`, from 2.55.7 up to the next major version. Version 3 is a breaking alpha and is not selected. The app names `SupabaseClient` so the package is linked. It does not construct a client.
- `SmarterDog.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (repository root, not inside `ios/`) is the lockfile Xcode Cloud reads when it opens that project. It pins 2.55.7 and the packages that product links (resolved with Swift 6.4.3). Do not gitignore it. After adding a package, resolve again and commit the updated file.
- `Config.xcconfig` holds placeholders and optionally includes the gitignored local file (`#include?`). The two `INFOPLIST_KEY_` lines come after that include, so a local override wins. Xcode generates Info.plist. There is no checked-in Info.plist.
- Home-screen icon is a byte copy of `public/app/icons/icon-1024.png` (1024×1024, no transparency). After that file changes, copy it again:

```bash
cp public/app/icons/icon-1024.png ios/SmarterDog/Assets.xcassets/AppIcon.appiconset/AppIcon.png
```

- Colours match `src/index.css`: ink `#1F1F1F`, paper `#F7EFE6`, yellow `#FECC13`, cyan-dark `#1F4E8C`.
- Root lint, Vitest and the docs link check ignore `ios/`. Nothing here is built by the Vercel deploy. Linux CI cannot compile this target, so there is no iOS job.
