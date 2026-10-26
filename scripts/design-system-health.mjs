#!/usr/bin/env node
// One report for every design-system ratchet.
//
//   npm run check:design-system             print each count against its ceiling
//   npm run check:design-system -- --lower  also write lower ceilings back
//
// The counts and ceilings live in src/designSystemHealth/ratchets.ts, the same
// file the ratchet tests read, so this report and the tests cannot disagree.
// Exit 1 if any count is above its ceiling. --lower only ever LOWERS a ceiling to
// the measured count; it never raises one, and it leaves a count above its
// ceiling for a person to fix.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(new URL("../src/designSystemHealth/ratchets.ts", import.meta.url));
const { CEILINGS, RATCHETS, lowerCeilingsInSource } = await import(modulePath);
const lower = process.argv.includes("--lower");

const measured = {};
let over = 0;
let below = 0;
let total = 0;

console.log("Design-system health: every count may only go down.\n");
for (const ratchet of RATCHETS) {
  const result = ratchet.measure();
  measured[ratchet.id] = result.totals;
  console.log(ratchet.title);
  for (const [key, label] of Object.entries(ratchet.keys)) {
    const count = result.totals[key] ?? 0;
    const ceiling = CEILINGS[ratchet.id][key];
    total += count;
    let status = "at ceiling";
    if (count > ceiling) { status = `OVER by ${count - ceiling}`; over++; }
    else if (count < ceiling) { status = `below by ${ceiling - count}: can lower`; below++; }
    console.log(`  ${String(count).padStart(5)} / ${String(ceiling).padEnd(5)} ${label.padEnd(46)} ${status}`);
  }
  console.log();
}

console.log(`${total} items counted in total across ${RATCHETS.length} ratchets.`);

if (lower) {
  const { text, changes } = lowerCeilingsInSource(readFileSync(modulePath, "utf8"), measured);
  if (changes.length === 0) {
    console.log("--lower: nothing to lower.");
  } else {
    writeFileSync(modulePath, text);
    console.log(`--lower: wrote ${changes.length} lower ceiling${changes.length === 1 ? "" : "s"} to src/designSystemHealth/ratchets.ts:`);
    for (const c of changes) console.log(`  ${c.id}.${c.key}: ${c.from} -> ${c.to}`);
    console.log("Review the diff and commit it.");
  }
} else if (below > 0) {
  console.log(`${below} ceiling${below === 1 ? "" : "s"} can be lowered: run with --lower.`);
}

if (over > 0) {
  console.error(`\n${over} count${over === 1 ? " is" : "s are"} OVER a ceiling. Use the shared piece instead of adding more; do not raise a ceiling.`);
  process.exitCode = 1;
}
