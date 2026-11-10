import assert from "node:assert/strict";
import test from "node:test";
import { assertLoopbackUrl } from "./localTarget.mjs";

test("accepts loopback targets", () => {
  for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) {
    assert.equal(assertLoopbackUrl(url, "url").href, new URL(url).href);
  }
});

test("refuses every hosted or look-alike target", () => {
  for (const url of [
    "https://nlzhllhkigmsvrzduefz.supabase.co",
    "https://btjnxvgkpdbfrrqxvkfj.supabase.co",
    "http://127.0.0.1.example.com:54321",
    "http://localhost.example.com",
    "http://192.168.1.10:54321",
    "",
    undefined,
    "not a url",
  ]) {
    assert.throws(() => assertLoopbackUrl(url, "url"), /local Supabase stack/, String(url));
  }
});

test("the reset follows the stack's own database, not an assumed port", async () => {
  const { psqlInvocation } = await import("./localStack.mjs");
  const { args, env } = psqlInvocation({
    host: "127.0.0.1", port: "55432", user: "postgres", password: "local-pw", database: "postgres",
  });
  assert.deepEqual(args.slice(0, 8), ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "postgres"]);
  assert.equal(env.PGPASSWORD, "local-pw");
  assert.ok(!args.includes("54322"));
});
