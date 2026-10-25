// Has the design system fallen behind the code?
//
// The design system (the "Smarter Dog Grooming Salon" artifact) is a snapshot,
// synced from this repo with /design-sync. Nothing used to say when the repo had
// moved on: its README kept describing a 10px text size and contrast ratios for
// two sessions after both had changed.
//
// This keeps a record of what the design system was last synced from, and
// reports the difference:
//
//   - the CSS custom properties in src/index.css and src/customer-portal.css
//     (colours, type scale, radii, shadows, fonts), and
//   - the shared UI components in src/components/ui.
//
//   npm run check:design-sync                 report drift; exit 1 if there is any
//   npm run check:design-sync -- --update     record the working tree (run it right
//                                             after a /design-sync)
//   npm run check:design-sync -- --from <sha> record a past commit, for the first
//                                             snapshot or if a sync was missed
//
// It is deliberately NOT part of `npm run lint` or CI: tokens change in feature
// PRs, and a red build on every one would be noise. Run it before a release or
// when the design system looks stale.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SNAPSHOT_PATH = join(root, ".design-sync", "token-snapshot.json");
const CSS_FILES = ["src/index.css", "src/customer-portal.css"];
const UI_DIR = "src/components/ui";
const UI_FILE = /\.(jsx|tsx|js|ts)$/;
const NOT_A_COMPONENT = /\.(test|component\.test)\.[jt]sx?$/;

/** Every `--name: value;` declaration, comments removed. Repeats keep every value, in order. */
export function parseCustomProperties(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Map();
  for (const match of clean.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    const value = match[2].trim().replace(/\s+/g, " ");
    const list = found.get(match[1]) ?? [];
    list.push(value);
    found.set(match[1], list);
  }
  return Object.fromEntries([...found].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, v.join(" | ")]));
}

const shortHash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);

export function snapshotOf({ cssSources, componentSources }) {
  const tokens = {};
  for (const css of cssSources) Object.assign(tokens, parseCustomProperties(css));
  const components = Object.fromEntries(
    Object.entries(componentSources)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([file, text]) => [file, shortHash(text)]),
  );
  return { tokens: Object.fromEntries(Object.entries(tokens).sort(([a], [b]) => (a < b ? -1 : 1))), components };
}

function diffMaps(before, after) {
  const added = Object.keys(after).filter((k) => !(k in before));
  const removed = Object.keys(before).filter((k) => !(k in after));
  const changed = Object.keys(after).filter((k) => k in before && before[k] !== after[k]);
  return { added, removed, changed };
}

export function diffSnapshots(recorded, current) {
  return {
    tokens: diffMaps(recorded.tokens, current.tokens),
    components: diffMaps(recorded.components, current.components),
  };
}

export const hasDrift = (diff) =>
  Object.values(diff).some((group) => group.added.length || group.removed.length || group.changed.length);

// --- reading sources ---------------------------------------------------------

function fromWorkingTree() {
  const cssSources = CSS_FILES.map((f) => readFileSync(join(root, f), "utf8"));
  const dir = join(root, UI_DIR);
  const componentSources = {};
  for (const name of readdirSync(dir)) {
    if (UI_FILE.test(name) && !NOT_A_COMPONENT.test(name)) componentSources[name] = readFileSync(join(dir, name), "utf8");
  }
  return { cssSources, componentSources };
}

function fromCommit(sha) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const cssSources = CSS_FILES.map((f) => git("show", `${sha}:${f}`));
  const componentSources = {};
  for (const name of git("ls-tree", "--name-only", sha, `${UI_DIR}/`).split("\n").filter(Boolean)) {
    const base = name.split("/").pop();
    if (UI_FILE.test(base) && !NOT_A_COMPONENT.test(base)) componentSources[base] = git("show", `${sha}:${name}`);
  }
  return { cssSources, componentSources };
}

// --- reporting ---------------------------------------------------------------

const clip = (value) => (value.length > 60 ? `${value.slice(0, 57)}...` : value);

function describe(label, group, before, after) {
  const lines = [];
  for (const k of group.added) lines.push(`    + ${k}  ${clip(after[k])}`);
  for (const k of group.changed) lines.push(`    ~ ${k}  ${clip(before[k])}  ->  ${clip(after[k])}`);
  for (const k of group.removed) lines.push(`    - ${k}`);
  return lines.length ? [`  ${label}: ${group.added.length} added, ${group.changed.length} changed, ${group.removed.length} removed`, ...lines] : [];
}

function main(argv) {
  const fromIndex = argv.indexOf("--from");
  if (argv.includes("--update") || fromIndex !== -1) {
    const sha = fromIndex !== -1 ? argv[fromIndex + 1] : null;
    const snapshot = {
      syncedFrom: sha ?? "working tree",
      recordedOn: new Date().toISOString().slice(0, 10),
      ...snapshotOf(sha ? fromCommit(sha) : fromWorkingTree()),
    };
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`Recorded ${Object.keys(snapshot.tokens).length} tokens and ${Object.keys(snapshot.components).length} components from ${snapshot.syncedFrom}.`);
    return 0;
  }

  if (!existsSync(SNAPSHOT_PATH)) {
    console.error("No snapshot yet. Run: npm run check:design-sync -- --from <commit the design system was synced from>");
    return 2;
  }
  const recorded = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const current = snapshotOf(fromWorkingTree());
  const diff = diffSnapshots(recorded, current);
  if (!hasDrift(diff)) {
    console.log(`Design system is in step with the code (last synced from ${recorded.syncedFrom}).`);
    return 0;
  }
  console.log(`The code has moved on since the design system was synced from ${recorded.syncedFrom} (${recorded.recordedOn}):`);
  for (const line of [
    ...describe("tokens", diff.tokens, recorded.tokens, current.tokens),
    ...describe("components", diff.components, recorded.components, current.components),
  ]) console.log(line);
  console.log("\nRun /design-sync, then: npm run check:design-sync -- --update");
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
