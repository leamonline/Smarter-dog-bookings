// Locks the iPhone colour and type specification into the asset catalogue,
// the bundled fonts and the sign-in screens. Linux CI cannot compile SwiftUI,
// so this checks the files Xcode will compile.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

function walk(relative: string): string[] {
  const absolute = join(root, relative);
  if (!existsSync(absolute)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === ".build" || entry === "DerivedData" || entry === "node_modules") continue;
    const child = join(relative, entry);
    const stat = statSync(join(root, child));
    if (stat.isDirectory()) found.push(...walk(child));
    else found.push(child.split("\\").join("/"));
  }
  return found;
}

type Paint = { light: string; dark: string; lightAlpha?: number; darkAlpha?: number };

const paints: Record<string, Paint> = {
  BrandPaper: { light: "F7EFE6", dark: "1A1410" },
  BrandInk: { light: "1F1F1F", dark: "F7EFE6" },
  Surface: { light: "F7EFE6", dark: "1A1410" },
  SurfaceRaised: { light: "FDFBF7", dark: "322820" },
  TextPrimary: { light: "1F1F1F", dark: "F7EFE6" },
  TextSecondary: { light: "5C4A3A", dark: "C4B09A" },
  ActionYellow: { light: "FECC13", dark: "FECC13" },
  OnAction: { light: "1F1F1F", dark: "1F1F1F" },
  AccentBlue: { light: "5595DC", dark: "5595DC" },
  AccentBlueDeep: { light: "2A62A8", dark: "6AA3E0" },
  DashNavy: { light: "1B3654", dark: "8AA4C4" },
  Oak: { light: "C19654", dark: "C9A56B" },
  Brass: { light: "C5B05C", dark: "D4C078" },
  Separator: { light: "E5D6C6", dark: "4A3C32" },
  Success: { light: "3A5538", dark: "9CB890" },
  SuccessSoft: { light: "E6EEE4", dark: "2F4034" },
  Warning: { light: "6B4A18", dark: "D8B878" },
  WarningSoft: { light: "F3E8D0", dark: "4A3C20" },
  Destructive: { light: "8B3326", dark: "E8A898" },
  DestructiveSoft: { light: "F3E6E2", dark: "4A2E2A" },
  PolaroidMount: { light: "FFFCFA", dark: "FFFCFA" },
  OnPolaroid: { light: "1F1F1F", dark: "1F1F1F" },
  FocusRing: { light: "1F1F1F", dark: "F7EFE6" },
  Overlay: { light: "1A1410", dark: "1A1410", lightAlpha: 0.56, darkAlpha: 0.72 },
};

function component(value: string): number {
  if (value.startsWith("0x") || value.startsWith("0X")) return Number.parseInt(value.slice(2), 16);
  const parsed = Number(value);
  if (parsed <= 1) return Math.round(parsed * 255);
  return parsed;
}

function paint(name: string, appearance: "light" | "dark"): { hex: string; alpha: number; space: string } {
  const json = JSON.parse(
    read(`ios/SmarterDog/Assets.xcassets/Colors/${name}.colorset/Contents.json`),
  ) as {
    colors: {
      appearances?: { value: string }[];
      color: { "color-space": string; components: Record<string, string> };
    }[];
  };
  const entry = json.colors.find((color) => {
    const dark = (color.appearances ?? []).some((item) => item.value === "dark");
    return appearance === "dark" ? dark : !dark;
  });
  expect(entry, `${name} ${appearance}`).toBeDefined();
  const parts = entry!.color.components;
  const hex = [parts.red, parts.green, parts.blue]
    .map((part) => component(part).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return { hex, alpha: Number(parts.alpha), space: entry!.color["color-space"] };
}

function channel(byte: number): number {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const value = Number.parseInt(hex, 16);
    return (
      0.2126 * channel((value >> 16) & 255) +
      0.7152 * channel((value >> 8) & 255) +
      0.0722 * channel(value & 255)
    );
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function postScriptName(relative: string): string {
  const data = readFileSync(join(root, relative));
  const tables = data.readUInt16BE(4);
  let nameOffset = -1;
  for (let index = 0; index < tables; index += 1) {
    const offset = 12 + index * 16;
    if (data.toString("ascii", offset, offset + 4) === "name") {
      nameOffset = data.readUInt32BE(offset + 8);
      break;
    }
  }
  expect(nameOffset, relative).toBeGreaterThan(0);
  const count = data.readUInt16BE(nameOffset + 2);
  const stringOffset = data.readUInt16BE(nameOffset + 4);
  for (let index = 0; index < count; index += 1) {
    const record = nameOffset + 6 + index * 12;
    const platform = data.readUInt16BE(record);
    const nameId = data.readUInt16BE(record + 6);
    const length = data.readUInt16BE(record + 8);
    const offset = data.readUInt16BE(record + 10);
    if (platform === 3 && nameId === 6) {
      const raw = data.subarray(
        nameOffset + stringOffset + offset,
        nameOffset + stringOffset + offset + length,
      );
      let text = "";
      for (let byte = 0; byte < raw.length; byte += 2) {
        text += String.fromCharCode(raw.readUInt16BE(byte));
      }
      return text;
    }
  }
  throw new Error(`No PostScript name in ${relative}`);
}

describe("iPhone colour catalogue", () => {
  it("stores every semantic paint in sRGB, with light and dark appearances", () => {
    for (const [name, expected] of Object.entries(paints)) {
      for (const appearance of ["light", "dark"] as const) {
        const actual = paint(name, appearance);
        expect(actual.space, name).toBe("srgb");
        expect(actual.hex, `${name} ${appearance}`).toBe(expected[appearance]);
        const alpha = appearance === "light" ? (expected.lightAlpha ?? 1) : (expected.darkAlpha ?? 1);
        expect(actual.alpha, `${name} ${appearance} alpha`).toBeCloseTo(alpha, 3);
      }
    }
  });

  it("keeps the system accent off the yellow action colour", () => {
    const accent = read("ios/SmarterDog/Assets.xcassets/AccentColor.colorset/Contents.json");
    const link = read("ios/SmarterDog/Assets.xcassets/Colors/AccentBlueDeep.colorset/Contents.json");
    expect(JSON.parse(accent)).toEqual(JSON.parse(link));
    expect(accent).not.toContain("0xFE");
  });

  it("does not namespace the colour folder, so Color(\"Surface\") resolves", () => {
    const folder = JSON.parse(read("ios/SmarterDog/Assets.xcassets/Colors/Contents.json")) as {
      properties?: { "provides-namespace"?: boolean };
    };
    expect(folder.properties?.["provides-namespace"]).not.toBe(true);
  });

  it("meets the published contrast pairs", () => {
    const pairs: [string, string, string, number][] = [
      ["light", "TextPrimary", "Surface", 14.48],
      ["light", "TextPrimary", "SurfaceRaised", 15.95],
      ["light", "TextPrimary", "PolaroidMount", 16.13],
      ["light", "TextSecondary", "Surface", 7.39],
      ["light", "OnAction", "ActionYellow", 10.88],
      ["light", "AccentBlueDeep", "Surface", 5.41],
      ["light", "Success", "SuccessSoft", 6.98],
      ["light", "Warning", "WarningSoft", 6.59],
      ["light", "Destructive", "DestructiveSoft", 6.63],
      ["light", "OnPolaroid", "PolaroidMount", 16.13],
      ["dark", "TextPrimary", "Surface", 16.02],
      ["dark", "TextPrimary", "SurfaceRaised", 12.63],
      ["dark", "TextSecondary", "SurfaceRaised", 6.87],
      ["dark", "AccentBlueDeep", "SurfaceRaised", 5.43],
      ["dark", "Success", "SuccessSoft", 5.08],
      ["dark", "Warning", "WarningSoft", 5.64],
      ["dark", "Destructive", "DestructiveSoft", 6.11],
      ["dark", "OnPolaroid", "PolaroidMount", 16.13],
    ];
    for (const [appearance, foreground, background, ratio] of pairs) {
      const mode = appearance as "light" | "dark";
      const actual = contrast(paint(foreground, mode).hex, paint(background, mode).hex);
      expect(actual, `${foreground} on ${background} ${appearance}`).toBeCloseTo(ratio, 1);
      expect(actual).toBeGreaterThanOrEqual(4.5);
    }
    const decoration = contrast(paint("AccentBlue", "light").hex, paint("Surface", "light").hex);
    expect(decoration).toBeLessThan(3);
  });
});

describe("iPhone fonts", () => {
  it("bundles Poppins Bold and SemiBold with the OFL, and not Inter", () => {
    const files = walk("ios");
    expect(files).toContain("ios/SmarterDog/Fonts/Poppins-Bold.ttf");
    expect(files).toContain("ios/SmarterDog/Fonts/Poppins-SemiBold.ttf");
    expect(files).toContain("ios/SmarterDog/Fonts/OFL.txt");
    expect(
      files.some(
        (file) => /(^|\/)Inter[^/]*\.(ttf|otf)$/i.test(file) || file.includes("preview-standin"),
      ),
    ).toBe(false);

    expect(postScriptName("ios/SmarterDog/Fonts/Poppins-Bold.ttf")).toBe("Poppins-Bold");
    expect(postScriptName("ios/SmarterDog/Fonts/Poppins-SemiBold.ttf")).toBe("Poppins-SemiBold");

    const licence = read("ios/SmarterDog/Fonts/OFL.txt");
    expect(licence).toContain("SIL Open Font License");
    expect(licence).toContain("Poppins");
    expect(
      createHash("sha256")
        .update(readFileSync(join(root, "ios/SmarterDog/Fonts/OFL.txt")))
        .digest("hex"),
    ).toBe("6be04893d770899a015649c7aa3b582f871b272f8747a92b78b17c3e5c8b2573");

    const project = read("SmarterDog.xcodeproj/project.pbxproj");
    const fontsPlist = read("ios/SmarterDog/Info.plist");
    const fontArray = fontsPlist.split("<key>UIAppFonts</key>")[1]?.split("</array>")[0] ?? "";
    expect([...fontArray.matchAll(/<string>([^<]+)<\/string>/g)].map((match) => match[1])).toEqual([
      "Poppins-Bold.ttf",
      "Poppins-SemiBold.ttf",
    ]);
    expect(project).not.toContain("INFOPLIST_KEY_UIAppFonts");
    expect(read("ios/SmarterDog/AppFont.swift")).toContain("CTFontManagerRegisterFontsForURL");
    expect(read("ios/SmarterDog/SmarterDogApp.swift")).toContain("AppFont.registerBundledFonts()");
    expect(project).toContain("Poppins-Bold.ttf in Resources");
    expect(project).toContain("Poppins-SemiBold.ttf in Resources");
    expect(project).toContain("OFL.txt in Resources");
    expect(project).not.toContain("Brand.swift");
  });

  it("scales Poppins with Dynamic Type and leaves button labels on SF Pro", () => {
    const font = read("ios/SmarterDog/AppFont.swift");
    expect(font).toContain('.custom("Poppins-Bold", size: size, relativeTo: style)');
    expect(font).toContain('.custom("Poppins-SemiBold", size: size, relativeTo: style)');
    expect(font).toContain("case .largeTitle: return poppinsBold(relativeTo: .largeTitle, size: 34)");
    expect(font).toContain("case .title: return poppinsBold(relativeTo: .title, size: 28)");
    expect(font).toContain("case .title2: return poppinsBold(relativeTo: .title2, size: 22)");
    expect(font).toContain("case .title3: return poppinsSemiBold(relativeTo: .title3, size: 20)");
    expect(font).toContain("case .headline: return poppinsSemiBold(relativeTo: .headline, size: 17)");
    expect(font).toMatch(/case \.largeTitle: -0\.6/);
    expect(font).toMatch(/case \.title: -0\.4/);
    expect(font).toMatch(/case \.title2: -0\.3/);
    expect(font).toMatch(/case \.title3: -0\.15/);

    const swift = walk("ios").filter((file) => file.endsWith(".swift")).map((file) => read(file));
    for (const source of swift) {
      for (const call of source.match(/\.custom\([\s\S]*?\)/g) ?? []) {
        expect(call).toContain("relativeTo:");
      }
    }

    const button = read("ios/SmarterDog/SignInView.swift").split("struct PrimaryButton")[1].split("struct TextLinkButtonStyle")[0];
    expect(button).toContain(".font(.body.weight(.semibold))");
    expect(button).toContain("AppColor.onAction");
    expect(button).toContain("AppColor.actionYellow");
    expect(button).toContain("Capsule()");
    expect(button).not.toContain("appHeading");
    expect(button).not.toContain("Poppins");
  });
});

describe("sign-in screens use the catalogue", () => {
  const screens = [
    "ios/SmarterDog/SignInView.swift",
    "ios/SmarterDog/RootView.swift",
    "ios/SmarterDog/SecurityCheckView.swift",
    "ios/SmarterDog/Decorations.swift",
    "ios/SmarterDog/AppColor.swift",
    "ios/SmarterDog/AppFont.swift",
  ];

  it("keeps hex and the old website colours out of the screens", () => {
    for (const file of screens) {
      const source = read(file);
      expect(source, file).not.toMatch(/Color\(red:/);
      expect(source, file).not.toMatch(/Color\.(white|red|green|orange)\b/);
      expect(source, file).not.toContain("preferredColorScheme");
      expect(source, file).not.toMatch(/#[0-9A-Fa-f]{6}/);
      expect(source, file).not.toContain("Brand.");
      expect(source, file).not.toContain("1F4E8C");
    }
    const signIn = read("ios/SmarterDog/SignInView.swift");
    const error = signIn.split("struct ErrorNote")[1].split("struct PrimaryButton")[0];
    expect(error).toContain("AppColor.destructive");
    expect(error).toContain("AppColor.destructiveSoft");
    expect(error).not.toContain("actionYellow");
    expect(signIn).toContain('Text("Come scruffy.")');
    expect(signIn).toContain('HighlightedWord(text: "gorgeous.")');
    expect(signIn).toContain("DashRibbon()");
    expect(signIn).toContain("CheckerboardEdge()");
    expect(signIn).toContain("DogWordmark()");
    expect(signIn).toContain("WordmarkAccent()");
    expect(read("ios/SmarterDog/RootView.swift")).toContain('IconCircle(systemName: "pawprint.fill")');
    expect(read("ios/SmarterDog/SecurityCheckView.swift")).toContain('data-theme="auto"');
  });

  it("ships the vector decorations as single-scale PDFs", () => {
    const original = ["HighlightUnderline", "HighlightBlob", "HighlightSwoosh"];
    for (const name of original) {
      const json = JSON.parse(
        read(`ios/SmarterDog/Assets.xcassets/${name}.imageset/Contents.json`),
      ) as { images: { scale?: string }[]; properties: Record<string, unknown> };
      expect(json.properties["preserves-vector-representation"]).toBe(true);
      expect(json.properties["template-rendering-intent"]).toBe("original");
      expect(json.images.every((image) => image.scale == null)).toBe(true);
      const pdf = readFileSync(join(root, `ios/SmarterDog/Assets.xcassets/${name}.imageset/${name}.pdf`));
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    }

    const dash = JSON.parse(
      read("ios/SmarterDog/Assets.xcassets/AccentDashStrip.imageset/Contents.json"),
    ) as { images: { filename?: string; appearances?: { value: string }[] }[]; properties: Record<string, unknown> };
    expect(dash.properties["template-rendering-intent"]).toBe("original");
    expect(dash.images.some((image) => image.appearances?.some((item) => item.value === "dark"))).toBe(true);
    expect(dash.images.map((image) => image.filename).sort()).toEqual([
      "AccentDashStrip.pdf",
      "AccentDashStripDark.pdf",
    ]);

    const dog = JSON.parse(read("ios/SmarterDog/Assets.xcassets/DogMark.imageset/Contents.json")) as {
      properties: Record<string, unknown>;
    };
    expect(dog.properties["template-rendering-intent"]).toBe("template");
    expect(dog.properties["preserves-vector-representation"]).toBe(true);
  });

  // The home-screen icon and the public salon connection are pinned by
  // iosProjectIsolation.test.ts. This change must leave both as main has them.
  it("keeps SwiftUI files out of the Linux sign-in package", () => {
    const pkg = read("ios/Package.swift");
    const exclude = pkg.match(/exclude:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const sources = pkg.match(/sources:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const swiftFiles = walk("ios/SmarterDog").filter((file) => file.endsWith(".swift"));
    expect(swiftFiles.length).toBeGreaterThan(0);
    for (const file of swiftFiles) {
      if (!read(file).includes("import SwiftUI")) continue;
      const name = file.split("/").pop()!;
      expect(exclude, name).toContain(`"${name}"`);
      expect(sources, name).not.toContain(`"${name}"`);
    }
  });
});
