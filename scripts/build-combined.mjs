#!/usr/bin/env node
/**
 * Builds both applications and merges them into one deployment.
 *
 * The two apps keep their own toolchains (ADR 009) — they are combined only as
 * static output, here, at the end. The marketing site owns "/", the booking app
 * owns /app/ plus the routes vercel.json rewrites to its shell.
 *
 * Every assertion below is about one of the two ways this can go quietly wrong:
 * one build overwriting the other's file, or the booking app's `Disallow: /`
 * robots.txt reaching the root and de-indexing the salon's website.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  BOOKING_ROOT_EXCLUSIONS, disallowsEverything, findCollisions, mergeRobots,
} from "./lib/combined-output.mjs";

const root = resolve(import.meta.dirname, "..");
const websiteDist = join(root, "website", "dist");
const bookingDist = join(root, "dist");
const outDir = join(root, "dist-combined");

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", env: process.env });

function filesIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  walk(dir);
  return out;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n✗ combined build refused: ${message}\n`);
    process.exit(1);
  }
}

// 1. Build both. The website has its own lockfile and node_modules.
if (!process.env.SKIP_BUILDS) {
  if (!existsSync(join(root, "website", "node_modules"))) {
    run("npm", ["ci", "--prefix", "website"]);
  }
  run("npm", ["run", "website:build"]);
  run("npm", ["run", "build"]);
}

assert(existsSync(join(websiteDist, "index.html")), "website/dist/index.html is missing");
assert(existsSync(join(bookingDist, "app", "index.html")), "dist/app/index.html is missing — the booking shell must have a home the marketing site cannot take");

// 2. Refuse if the two builds would fight over a file.
const websitePaths = filesIn(websiteDist);
const bookingPaths = filesIn(bookingDist);
const collisions = findCollisions(websitePaths, bookingPaths);
assert(
  collisions.length === 0,
  `both builds write these files:\n    ${collisions.join("\n    ")}\n  Namespace the booking app's copy, or add it to BOOKING_ROOT_EXCLUSIONS with a reason.`,
);

// 3. Merge: the website first, then the booking app minus what it must not own.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(websiteDist, outDir, { recursive: true });
cpSync(bookingDist, outDir, {
  recursive: true,
  filter: (src) => {
    if (statSync(src).isDirectory()) return true;
    return !BOOKING_ROOT_EXCLUSIONS.has(relative(bookingDist, src));
  },
});

// 4. robots.txt: the website's, extended to keep crawlers off the booking app.
const merged = mergeRobots(readFileSync(join(websiteDist, "robots.txt"), "utf8"));
writeFileSync(join(outDir, "robots.txt"), `${merged}\n`);

// 5. Prove the two failure modes did not happen.
const publishedRobots = readFileSync(join(outDir, "robots.txt"), "utf8");
assert(!disallowsEverything(publishedRobots), "the published robots.txt disallows everything — this would de-index smarterdog.co.uk");
assert(/^Allow: \/$/m.test(publishedRobots), "the published robots.txt no longer allows the marketing site");
assert(
  readFileSync(join(outDir, "index.html"), "utf8") ===
    readFileSync(join(websiteDist, "index.html"), "utf8"),
  "/ is not the marketing site's page",
);
assert(existsSync(join(outDir, "app", "index.html")), "the booking shell did not survive the merge");

console.log(`\n✓ combined build → ${relative(root, outDir)} (${filesIn(outDir).length} files)`);
