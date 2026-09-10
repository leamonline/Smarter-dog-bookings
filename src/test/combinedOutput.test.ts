import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  mergeRobots,
  findCollisions,
  disallowsEverything,
  BOOKING_DISALLOW_PREFIXES,
} from "../../scripts/lib/combined-output.mjs";

const websiteRobots = readFileSync("website/public/robots.txt", "utf8");
const bookingRobots = readFileSync("public/robots.txt", "utf8");

describe("merged robots.txt", () => {
  it("keeps the marketing site crawlable", () => {
    // The whole point: the booking app's own robots.txt says Disallow: /, and
    // if that reached the merged root Google would drop smarterdog.co.uk.
    expect(disallowsEverything(bookingRobots)).toBe(true);
    expect(disallowsEverything(mergeRobots(websiteRobots))).toBe(false);
    expect(mergeRobots(websiteRobots)).toMatch(/^Allow: \/$/m);
  });

  it("disallows the booking surfaces inside the User-agent: * group", () => {
    const merged = mergeRobots(websiteRobots);
    const starGroup = merged.slice(
      merged.search(/^User-agent:\s*\*$/m),
      // up to the next user-agent block
      merged.indexOf("User-agent: GPTBot"),
    );
    for (const prefix of BOOKING_DISALLOW_PREFIXES) {
      expect(starGroup, prefix).toContain(`Disallow: ${prefix}`);
    }
  });

  it("keeps what the website already published", () => {
    const merged = mergeRobots(websiteRobots);
    expect(merged).toContain("Sitemap: https://smarterdog.co.uk/sitemap.xml");
    for (const bot of ["GPTBot", "Claude-Web", "PerplexityBot"]) {
      expect(merged, bot).toContain(`User-agent: ${bot}`);
    }
  });

  it("leaves the next group's own comment attached to it", () => {
    // "# AI/LLM Crawlers - Explicitly allowed" introduces the GPTBot block.
    // Inserting above it reads as though the disallows were that block's.
    const merged = mergeRobots(websiteRobots);
    expect(merged).toMatch(/# AI\/LLM Crawlers[^\n]*\nUser-agent: GPTBot/);
    expect(merged).toMatch(/Allow: \/\n\n# Booking app surfaces/);
  });

  it("refuses a robots.txt it cannot safely extend", () => {
    expect(() => mergeRobots("Sitemap: https://example.com/sitemap.xml")).toThrow(
      /User-agent: \*/,
    );
  });

  it("does not leave the disallows attached to the last bot block", () => {
    // Appending to the end of the file would put them under PerplexityBot and
    // leave every ordinary crawler unrestricted — the subtle way to get this
    // wrong while the file still "looks right".
    const merged = mergeRobots(websiteRobots);
    const lastBlock = merged.slice(merged.indexOf("User-agent: PerplexityBot"));
    expect(lastBlock).not.toContain("Disallow: /book");
  });
});

describe("collision detection", () => {
  it("reports a file both builds would write", () => {
    expect(findCollisions(["assets/a.js", "favicon.png"], ["assets/a.js"])).toEqual([
      "assets/a.js",
    ]);
  });

  it("stays quiet about the two we resolve deliberately", () => {
    expect(
      findCollisions(["index.html", "robots.txt"], ["index.html", "robots.txt"]),
    ).toEqual([]);
  });

  it("passes the real two builds", () => {
    // Guards the namespacing from step 1: nothing outside the two exclusions
    // may be written by both.
    expect(findCollisions(["index.html", "robots.txt", "assets/x.js"], [
      "index.html",
      "robots.txt",
      "app/assets/x.js",
      "sw.js",
    ])).toEqual([]);
  });
});
