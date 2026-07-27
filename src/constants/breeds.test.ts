import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BREED_SIZE_MAP, getSizeForBreed } from "./breeds";

describe("getSizeForBreed cross-breed rules", () => {
  it.each([
    ["Pug x Shih Tzu", "small"],
    ["Cockapoo X Poodle", "medium"],
    ["Pug × Poodle", "medium"],
    ["  Yorkshire Terrier   x   Pomeranian  ", "small"],
  ])("derives %s from two recognised small or medium parents", (breed, expected) => {
    expect(getSizeForBreed(breed)).toBe(expected);
  });

  it.each([
    "Pug x Labrador",
    "Pug x Mystery Hound",
    "Terrier X",
    "Corgi Cross",
    "Pug x Shih Tzu x Poodle",
  ])("leaves %s unconfirmed", (breed) => {
    expect(getSizeForBreed(breed)).toBeNull();
  });
});

describe("server-owned canonical breed mapping", () => {
  it("matches the application mapping exactly", () => {
    const migrationsDir = join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
      .filter((migration) =>
        /create or replace function public\.canonical_single_breed_size/i.test(
          migration,
        ),
      )
      .at(-1);
    expect(sql, "a server-side canonical breed mapping migration").toBeTruthy();
    const sqlMapping = Object.fromEntries(
      [...sql!.matchAll(/when '([^']+)' then return '(small|medium|large)'/g)]
        .map(([, breed, size]) => [breed, size]),
    );

    expect(sqlMapping).toEqual(BREED_SIZE_MAP);
  });
});
