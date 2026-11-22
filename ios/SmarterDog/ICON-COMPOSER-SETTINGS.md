# Icon Composer settings — Smarter Dog

> The home-screen icon the phone shows today is `ios/SmarterDog/Assets.xcassets/AppIcon.appiconset`. `SmarterDog.icon` is in the repository so it can be checked in Icon Composer. It is not part of the Xcode target, so Xcode Cloud does not compile it. Do not drag it into the target until Icon Composer has opened it and you have saved. A hand-written icon file can fail the archive.

Leam has Xcode. Open `SmarterDog.icon` in Icon Composer (Xcode > Open Developer Tool > Icon Composer, or drop the file onto the app) and confirm these values. The real Liquid Glass material is rendered by iOS; do not bake highlights into the artwork.

A hand-authored `icon.json` is included in the `.icon` bundle so the file can be opened and inspected. Apple does not publish `icon.json` as a public API; the keys follow the on-disk format written by Icon Composer 2.0 (ships with Xcode 27). After opening, glance at the inspectors — if a control doesn’t match, set it in the UI and re-save.

## Import (if starting from the layer files instead)

1. Create a new Icon Composer file, name it `SmarterDog`, canvas 1024 × 1024 (iPhone / iPad / Mac). Watch is 1088 × 1088 if you add it later; this icon is built for the 1024 square.
2. Document inspector: platforms **iOS** (add macOS later if needed; turn watchOS off unless you want a circular variant).
3. Do **not** import `background.svg` unless you prefer an image background. Use the document Fill instead (Apple’s recommended approach).
4. Drag `layers/dog.svg` (or the white `SmarterDog.icon/Assets/dog.svg`) into the sidebar. It becomes a layer in a group. Rename the group **Dog** and the layer **Dog**.
5. Artwork is already centred on the 1024 canvas. Leave Layout / position at the default (no offset, scale 100%). Turn the Grid on (Light or Dark) and check the mark sits in the middle of the updated iOS grid.

## Color

**Icon document (sidebar: the filename)**

- Color menu: All, then add a Dark variation (canvas: select Dark, then Vary for Dark).
- Default / Light — Fill: **Solid `#FECC13`**.
- Dark — Fill: **Solid `#1C1C1E`** (system dark plate). Do not leave the yellow field in Dark (that would match Light and feel too bright).
- Leave Clear and Tinted fills alone — the system derives them.

**Layer: Dog**

- Default / Light — Fill: **Solid `#1F1F1F`** (or Automatic if you imported the ink SVG).
- Dark — Fill: **Solid `#FECC13`** (vary for Dark). This inverts figure/ground so the dark icon stays recognisably Smarter Dog.
- Opacity: 100%.

## Liquid Glass (select the **Dog group**)

Icon Composer applies Liquid Glass to imported layers by default. Confirm:

- Mode: **Individual** (only one layer, so Combined is equivalent).
- Specular: **Automatic**, or **Outside** if Automatic feels weak. Do **not** use Inside — that tends to read as an inner bevel on a solid silhouette.
- The specular highlight should sit on the top / upper-left edge of the dog.
- Blur: leave at the default, or slightly below default. (Do not add a design-tool blur to the SVG.)
- Refraction: **On**, modest strength — enough to pick up a little of the yellow field, not so much that the silhouette goes soft. Preview with the **27** Effects button (refraction is not visible on system versions earlier than 27).
- Translucency: **On**, about **10–12%**. The dog must stay a solid, readable mark, not a ghost.
- Shadow: **Neutral**, opacity about **30%**. A soft contact shadow onto the field, not a hard drop.

**Layer: Dog**

- Effects (Liquid Glass) toggle: **On**.

## Preview

Below the canvas: platform **iOS**, appearances **Default**, **Dark**, and **Mono** (Mono Options: Light/Dark, Tinted on/off, plus a tint colour). Toggle **Effects** off/on, and compare **26** vs **27**. Turn the **Grid** on and confirm the dog is centred with comfortable margins (about 17% left/right, 14% top/bottom).

## Add to Xcode

The flat light, dark and tinted bitmaps already live in `ios/SmarterDog/Assets.xcassets/AppIcon.appiconset`, and the target’s App Icon name is `AppIcon`. That is what iOS 18 and the current Xcode Cloud archive use.

After Icon Composer has re-saved `SmarterDog.icon`, a later change can drag that file into the project. In the target’s General tab, set App Icon to `SmarterDog` (the filename without `.icon`). Apple’s current documentation says a present Icon Composer file replaces the AppIcon asset catalog: Xcode then generates its own flattened fallbacks for earlier deployments. Do not do that step from this file until the re-saved icon has been checked, because the hand-written `icon.json` has not been opened in Icon Composer.

## Artwork rules already followed

Layers are flat: no baked shadow, blur, specular, or pre-rounded mask. Official path from `dog-mark.svg`, unaltered. Foreground has a sharp edge so system highlights sit cleanly.
