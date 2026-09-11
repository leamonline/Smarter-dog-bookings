/**
 * Pure helpers for merging the two applications' build output into one
 * deployment. Kept separate from the script that does the copying so the
 * decisions can be tested without touching a filesystem.
 */

/**
 * Booking surfaces that must not be crawled. They are private (auth-gated) and
 * were never indexed, so there is no stale listing that needs a `noindex` meta
 * tag to be read in order to be removed — disallowing is the simpler guard.
 */
export const BOOKING_DISALLOW_PREFIXES = [
  "/book",
  "/staff",
  "/stafflogin",
  "/customer",
  "/reset-password",
  "/app/",
];

/** Files the booking build must not contribute to the merged root. */
export const BOOKING_ROOT_EXCLUSIONS = new Set([
  // "/" is the marketing site. The booking shell has its own home at
  // /app/index.html, which vercel.json rewrites the booking routes to.
  "index.html",
  // The booking app's own robots.txt says `Disallow: /`. At the merged root
  // that would tell Google to drop the entire marketing site.
  "robots.txt",
]);

/**
 * The merged robots.txt: the website's, with the booking surfaces disallowed.
 *
 * The disallow lines go INSIDE the `User-agent: *` group. Appending them to the
 * end of the file would silently attach them to whichever user-agent block
 * happens to be last, leaving `*` — every ordinary crawler — unrestricted.
 */
export function mergeRobots(websiteRobots, prefixes = BOOKING_DISALLOW_PREFIXES) {
  const lines = websiteRobots.replace(/\r\n/g, "\n").split("\n");
  const disallow = prefixes.map((p) => `Disallow: ${p}`);

  const start = lines.findIndex((l) => /^user-agent:\s*\*\s*$/i.test(l.trim()));
  if (start === -1) {
    throw new Error("website robots.txt has no `User-agent: *` group to extend");
  }

  // End of that group: the next User-agent line, or the first blank line
  // followed by something that is not a directive.
  let end = start + 1;
  while (end < lines.length && !/^user-agent:/i.test(lines[end].trim())) end += 1;

  // Insert straight after the group's last directive. Walking back over the
  // trailing blanks AND comments matters: the next group is introduced by its
  // own comment ("# AI/LLM Crawlers"), and inserting above that would read as
  // if the disallows belonged to it.
  let insertAt = end;
  while (
    insertAt > start + 1 &&
    (lines[insertAt - 1].trim() === "" || lines[insertAt - 1].trim().startsWith("#"))
  ) {
    insertAt -= 1;
  }

  return [
    ...lines.slice(0, insertAt),
    "",
    "# Booking app surfaces — private, not for crawling.",
    ...disallow,
    // Only add a separator if the file does not already have one here.
    ...(lines[insertAt]?.trim() === "" ? [] : [""]),
    ...lines.slice(insertAt),
  ].join("\n");
}

/**
 * Paths present in both builds. Anything here would have one app silently
 * overwrite the other, so the build refuses unless it is a known exclusion.
 */
export function findCollisions(websitePaths, bookingPaths) {
  const website = new Set(websitePaths);
  return bookingPaths
    .filter((p) => website.has(p))
    .filter((p) => !BOOKING_ROOT_EXCLUSIONS.has(p))
    .sort();
}

/** True if this robots.txt would de-index the marketing site. */
export function disallowsEverything(robots) {
  return robots
    .replace(/\r\n/g, "\n")
    .split("\n")
    .some((l) => /^disallow:\s*\/\s*$/i.test(l.trim()));
}
