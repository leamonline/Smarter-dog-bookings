import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createInternalInvoker } from "./internalInvoker.ts";

Deno.test("internal invoker preserves the request and response contract", async () => {
  const invoke = createInternalInvoker({
    supabaseUrl: "https://example.invalid",
    serviceRoleKey: "test-key",
    internalSecret: "test-secret",
  });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assertEquals(input, "https://example.invalid/functions/v1/sms-send");
      assertEquals(init, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": "test-secret",
          Authorization: "Bearer test-key",
        },
        body: '{"text":"hello"}',
      });
      return Response.json({ ok: true }, { status: 201 });
    };
    assertEquals(await invoke("sms-send", { text: "hello" }), {
      ok: true,
      status: 201,
      body: { ok: true },
    });

    globalThis.fetch = async () => new Response("Bad gateway", { status: 502 });
    assertEquals(await invoke("sms-send", {}), { ok: false, status: 502, body: {} });

    const connectionError = new TypeError("connection failed");
    globalThis.fetch = async () => { throw connectionError; };
    assertStrictEquals(
      await assertRejects(() => invoke("sms-send", {})),
      connectionError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
