// ios/ is a SwiftUI skeleton for a later iPhone app. Linux CI cannot compile it,
// and the web pipeline must not start treating it as part of the booking app.
// This file locks that boundary and the project settings Xcode Cloud needs.
// It does not, and cannot, run xcodebuild.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { excludedMarkdownPrefixes } from "../../scripts/check-doc-links.mjs";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

function walk(relative: string): string[] {
  const absolute = join(root, relative);
  if (!existsSync(absolute)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(absolute)) {
    const child = join(relative, entry);
    const stat = statSync(join(root, child));
    if (stat.isDirectory()) found.push(...walk(child));
    else found.push(child.split("\\").join("/"));
  }
  return found;
}

describe("root tooling ignores the iPhone skeleton", () => {
  it("ESLint ignores ios/**", () => {
    const ignoresBlock = read("eslint.config.js").match(/ignores:\s*\[([\s\S]*?)\]/);
    expect(ignoresBlock).not.toBeNull();
    expect(ignoresBlock![1]).toMatch(/["']ios\/\*\*["']/);
  });

  it("Vitest excludes ios/** from both projects", () => {
    const config = read("vitest.config.ts");
    const excludes = [...config.matchAll(/exclude:\s*\[([^\]]*)\]/g)].map((match) => match[1]);
    const withIos = excludes.filter((list) => /["']ios\/\*\*["']/.test(list));
    expect(withIos.length).toBeGreaterThanOrEqual(2);
  });

  it("the docs link check does not govern ios/", () => {
    expect(excludedMarkdownPrefixes).toContain("ios/");
  });

  it("gitignores the local Supabase config and does not ignore the example", () => {
    execFileSync("git", ["check-ignore", "-q", "ios/Config/Config.local.xcconfig"], {
      cwd: root,
      stdio: "ignore",
    });
    expect(() =>
      execFileSync("git", ["check-ignore", "-q", "ios/Config/Config.local.xcconfig.example"], {
        cwd: root,
        stdio: "ignore",
      }),
    ).toThrow();
  });
});

describe("the Xcode project is the committed skeleton", () => {
  const projectPath = "SmarterDog.xcodeproj/project.pbxproj";
  const schemePath = "SmarterDog.xcodeproj/xcshareddata/xcschemes/SmarterDog.xcscheme";

  it("has a shared scheme Xcode Cloud can archive", () => {
    expect(existsSync(join(root, projectPath))).toBe(true);
    expect(existsSync(join(root, "SmarterDog.xcodeproj/project.xcworkspace/contents.xcworkspacedata"))).toBe(
      true,
    );
    expect(existsSync(join(root, "ios/SmarterDog.xcodeproj"))).toBe(false);
    const scheme = read(schemePath);
    const project = read(projectPath);
    const target = project.match(
      /([A-F0-9]{24}) \/\* SmarterDog \*\/ = \{\n\t\t\tisa = PBXNativeTarget;/,
    );
    expect(target).not.toBeNull();
    expect(scheme).toContain(`BlueprintIdentifier = "${target![1]}"`);
    expect(scheme).toContain('BuildableName = "SmarterDog.app"');
    expect(scheme).toContain('buildForArchiving = "YES"');
    const archive = scheme.split("<ArchiveAction")[1]?.split("</ArchiveAction>")[0] ?? "";
    expect(archive).toContain('buildConfiguration = "Release"');
    // Sources stay under ios/. The project file is at the repo root so Xcode
    // Cloud's saved name, SmarterDog.xcodeproj, resolves.
    expect(project).toContain('path = "ios/SmarterDog";');
    expect(project).toContain('path = "ios/Config";');
    expect(project).toContain('path = "ios/README.md";');
  });

  it("targets iOS 18, iPhone, Swift 6, and the placeholder bundle id", () => {
    const project = read(projectPath);
    expect(project).toContain("IPHONEOS_DEPLOYMENT_TARGET = 18.0;");
    expect(project).toContain("SWIFT_VERSION = 6.0;");
    expect(project).toContain("TARGETED_DEVICE_FAMILY = 1;");
    expect(project).not.toContain('TARGETED_DEVICE_FAMILY = "1,2"');
    expect(project).not.toContain("UISupportedInterfaceOrientations_iPad");
    expect(project).toContain("PRODUCT_BUNDLE_IDENTIFIER = uk.co.smarterdog.app;");
    expect(project).toContain('INFOPLIST_KEY_CFBundleDisplayName = "Smarter Dog";');
    expect(project).toContain("CODE_SIGN_STYLE = Automatic;");
    expect(project).not.toContain("DEVELOPMENT_TEAM");
    expect(project).toContain("GENERATE_INFOPLIST_FILE = YES;");
    // A fonts-only plist is merged into the generated one. It must not replace
    // generation, and it must not be copied as a second resource.
    expect(project.match(/INFOPLIST_FILE = ios\/SmarterDog\/Info\.plist;/g)).toHaveLength(2);
    expect(project).not.toContain("INFOPLIST_KEY_UIAppFonts");
    expect(project).not.toContain("Info.plist in Resources");
    const fontsPlist = read("ios/SmarterDog/Info.plist");
    const fontArray = fontsPlist.split("<key>UIAppFonts</key>")[1]?.split("</array>")[0] ?? "";
    expect([...fontArray.matchAll(/<string>([^<]+)<\/string>/g)].map((match) => match[1])).toEqual([
      "Poppins-Bold.ttf",
      "Poppins-SemiBold.ttf",
      "Poppins-Black.ttf",
      "Caveat-Bold.ttf",
    ]);
    // Xcode ignores custom INFOPLIST_KEY_ entries, so the three connection keys
    // live in this plist as references to Config.xcconfig. Never literal values.
    expect(fontsPlist.match(/<key>/g)).toHaveLength(4);
    expect(fontsPlist).toContain("<string>$(SUPABASE_URL)</string>");
    expect(fontsPlist).toContain("<string>$(SUPABASE_PUBLISHABLE_KEY)</string>");
    expect(fontsPlist).toContain("<string>$(TURNSTILE_SITE_KEY)</string>");
    expect(fontsPlist).not.toContain("supabase.co");
    expect(fontsPlist).not.toContain("sb_publishable_");
  });

  it("links supabase-swift 2.x and signs in with that client", () => {
    const project = read(projectPath);
    expect(project).toContain('repositoryURL = "https://github.com/supabase/supabase-swift.git";');
    expect(project).toContain("minimumVersion = 2.55.7;");
    expect(project).toContain("kind = upToNextMajorVersion;");
    expect(project).toContain("productName = Supabase;");
    // Xcode Cloud does not resolve packages itself. The lockfile has to be
    // committed at the path Apple documents, with the Supabase product and
    // the packages that product links.
    const resolvedPath =
      "SmarterDog.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved";
    expect(() =>
      execFileSync("git", ["check-ignore", "-q", resolvedPath], { cwd: root, stdio: "ignore" }),
    ).toThrow();
    const resolved = JSON.parse(read(resolvedPath)) as {
      version: number;
      pins: { identity: string; state: { revision: string; version: string } }[];
    };
    expect(resolved.version).toBe(3);
    const pins = new Map(resolved.pins.map((pin) => [pin.identity, pin.state]));
    expect(pins.get("supabase-swift")).toEqual({
      revision: "ed28cff9d3d246f54ebe75e52a7334e0a2f366de",
      version: "2.55.7",
    });
    for (const identity of [
      "swift-asn1",
      "swift-clocks",
      "swift-concurrency-extras",
      "swift-crypto",
      "swift-http-types",
      "swift-issue-reporting",
      "xctest-dynamic-overlay",
    ]) {
      const state = pins.get(identity);
      expect(state, identity).toBeDefined();
      expect(state!.revision, identity).toMatch(/^[0-9a-f]{40}$/);
    }
    const swiftFiles = walk("ios/SmarterDog").filter((file) => file.endsWith(".swift"));
    for (const file of swiftFiles) {
      const name = file.split("/").pop();
      expect(project, name).toContain(`${name} in Sources`);
    }
    const swift = swiftFiles.map((file) => read(file)).join("\n");
    expect(swift).toContain("SupabaseClient(");
    expect(swift).not.toContain("URLSession");
    expect(swift).toContain('Text("Smarter Dog")');
    expect(swift).toContain("Continue");
    expect(swift).toContain("Staff sign in");
    expect(swift).toContain("Phone number");
    expect(swift).toContain("Sign out");
    expect(swift).toContain("link_customer_to_human");
    expect(swift).toContain('from("staff_profiles")');
    expect(swift).toContain("customer-phone-on-file");
    expect(swift).toContain('staff.role == "owner" || staff.role == "staff"');
    expect(swift).toContain("approved_at");
    expect(swift).toContain("signup_submitted_at");
  });

  it("fills the public Supabase config on Xcode Cloud without committing it", () => {
    const scriptPath = "ci_scripts/ci_post_clone.sh";
    expect(existsSync(join(root, scriptPath))).toBe(true);
    const script = read(scriptPath);
    expect(script).toContain("SUPABASE_URL");
    expect(script).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(script).toContain("ios/Config/Config.local.xcconfig");
    expect(script).not.toContain("supabase.co");
    expect(script).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(script).not.toMatch(/sb_secret_/);
    expect(script).toContain("jwt_payload_has_service_role");
  });

  it("refuses a service-role JWT and keeps a public anon JWT", () => {
    const directory = mkdtempSync(join(tmpdir(), "sdb-ios-config-"));
    mkdirSync(join(directory, "ios", "Config"), { recursive: true });
    const script = join(root, "ci_scripts/ci_post_clone.sh");
    const token = (payload: object) => {
      const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${part({ alg: "none" })}.${part(payload)}.sig`;
    };
    const env = {
      ...process.env,
      CI_PRIMARY_REPOSITORY_PATH: directory,
      SUPABASE_URL: "https://example.invalid",
    };
    expect(() =>
      execFileSync(script, {
        env: { ...env, SUPABASE_PUBLISHABLE_KEY: token({ role: "service_role" }) },
        stdio: "pipe",
      }),
    ).toThrow();
    expect(existsSync(join(directory, "ios", "Config", "Config.local.xcconfig"))).toBe(false);

    const anon = token({ role: "anon" });
    execFileSync(script, {
      env: { ...env, SUPABASE_PUBLISHABLE_KEY: anon },
      stdio: "pipe",
    });
    const written = readFileSync(join(directory, "ios", "Config", "Config.local.xcconfig"), "utf8");
    expect(written).toContain(anon);
    expect(written).not.toContain("service_role");
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps secrets out of the committed config", () => {
    const config = read("ios/Config/Config.xcconfig");
    const placeholder = config.indexOf("SUPABASE_URL");
    const include = config.indexOf('#include? "Config.local.xcconfig"');
    const infoKey = config.indexOf("INFOPLIST_KEY_SupabaseURL");
    expect(placeholder).toBeGreaterThanOrEqual(0);
    expect(placeholder).toBeLessThan(include);
    expect(include).toBeLessThan(infoKey);
    // The live project URL is public and is committed on purpose. No other
    // Supabase host belongs in this file.
    const hosts = [...config.matchAll(/[a-z0-9-]+\.supabase\.co/g)].map((match) => match[0]);
    expect(hosts).toEqual(["nlzhllhkigmsvrzduefz.supabase.co"]);
    expect(config).not.toContain("service_role");

    // The README names service_role so the owner does not paste it. A real
    // secret (a JWT, or an sb_secret_ token) must not appear in any committed
    // file. The publishable key below is public by design — the website ships
    // the same value — so the scan allow-lists this exact string and nothing else.
    const publicPublishableKey = "sb_publishable_-Uyblq9H8Ji_qbeZHwOZTw_9YIW6Mfk";
    expect(config).toContain(publicPublishableKey);
    const textFiles = [...walk("ios"), ...walk("SmarterDog.xcodeproj")].filter(
      (file) =>
        file.endsWith("Package.resolved") ||
        /\.(swift|plist|json|md|xcconfig|pbxproj|xcscheme|xcworkspacedata|gitignore)$/.test(file),
    );
    expect(textFiles).toEqual(
      expect.arrayContaining([
        "SmarterDog.xcodeproj/project.pbxproj",
        "SmarterDog.xcodeproj/xcshareddata/xcschemes/SmarterDog.xcscheme",
        "SmarterDog.xcodeproj/project.xcworkspace/contents.xcworkspacedata",
        "SmarterDog.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved",
      ]),
    );
    for (const file of textFiles) {
      if (file.endsWith("Config.local.xcconfig")) continue;
      const source = read(file);
      expect(source, file).not.toMatch(/sb_secret_/);
      expect(source, file).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
      // Public by design. Any other sb_publishable_ value is still refused.
      expect(source.replaceAll(publicPublishableKey, ""), file).not.toMatch(/sb_publishable_/);
    }
  });

  it("ships the approved iOS 18 icon and leaves Icon Composer out of the build", () => {
    const project = read(projectPath);
    expect(project.match(/ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/g)).toHaveLength(2);
    expect(project).not.toContain("SmarterDog.icon");
    expect(project).not.toContain("ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS");

    const setDir = "ios/SmarterDog/Assets.xcassets/AppIcon.appiconset";
    const contents = JSON.parse(read(`${setDir}/Contents.json`)) as {
      images: {
        filename?: string;
        idiom?: string;
        platform?: string;
        size?: string;
        appearances?: { appearance: string; value: string }[];
      }[];
      info: { author: string; version: number };
    };
    expect(contents.info).toEqual({ author: "xcode", version: 1 });
    expect(contents.images.map((image) => image.filename)).toEqual([
      "SmarterDog-iOS-Default-1024@1x.png",
      "SmarterDog-iOS-Dark-1024@1x.png",
      "AppIcon-Tinted.png",
    ]);
    for (const image of contents.images) {
      expect(image.idiom).toBe("universal");
      expect(image.platform).toBe("ios");
      expect(image.size).toBe("1024x1024");
      expect(image).not.toHaveProperty("scale");
    }
    expect(contents.images[0].appearances).toBeUndefined();
    expect(contents.images[1].appearances).toEqual([{ appearance: "luminosity", value: "dark" }]);
    expect(contents.images[2].appearances).toEqual([{ appearance: "luminosity", value: "tinted" }]);

    // PNG IHDR: width at byte 16, height at 20, bit depth at 24, colour type at 25.
    // Colour type 2 is RGB with no alpha. Type 6 is RGBA. App Store rejects an
    // alpha channel on the light 1024 icon.
    const approved = [
      ["SmarterDog-iOS-Default-1024@1x.png", 2, "3221446cf17f3f9b8cca99dea964a806f0926696483dae973926c5032315cab5"],
      ["SmarterDog-iOS-Dark-1024@1x.png", 6, "9ae9093586eb58e103dac507749fef75fa945639f1a6e1313627d3d4e51d132b"],
      ["AppIcon-Tinted.png", 2, "bbe53a8f9e9f73ba7c5283d9b4dfb02c85c3d5fd896bdd29ee26931c291d5a76"],
    ] as const;
    for (const [name, colourType, sha256] of approved) {
      const png = readFileSync(join(root, setDir, name));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16), name).toBe(1024);
      expect(png.readUInt32BE(20), name).toBe(1024);
      expect(png[24], name).toBe(8);
      expect(png[25], name).toBe(colourType);
      expect(createHash("sha256").update(png).digest("hex"), name).toBe(sha256);
    }

    const composer = "ios/SmarterDog/SmarterDog.icon";
    expect(existsSync(join(root, composer, "icon.json"))).toBe(true);
    expect(existsSync(join(root, composer, "Assets/dog.svg"))).toBe(true);
    // icon.json names dog.svg. dog.png is not part of this package.
    expect(read(`${composer}/icon.json`)).toContain('"image-name" : "dog.svg"');
    expect(read(`${composer}/icon.json`)).not.toContain("dog.png");
    const iconDocument = JSON.parse(read(`${composer}/icon.json`)) as {
      groups?: unknown[];
      "supported-platforms"?: { squares?: string[] };
    };
    expect(iconDocument.groups?.length).toBeGreaterThan(0);
    expect(iconDocument["supported-platforms"]?.squares).toEqual(["iOS"]);
    expect(existsSync(join(root, "ios/SmarterDog/ICON-COMPOSER-SETTINGS.md"))).toBe(true);
  });
});
