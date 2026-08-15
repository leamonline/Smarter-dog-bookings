import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTROL_END_MARKER,
  CONTROL_START_MARKER,
  runHumanMergeControl,
} from "../../scripts/human-merge-control.mjs";

const HEAD_SHA = "1".repeat(40);
const BASE_SHA = "2".repeat(40);
const FROZEN_PR_BASE_SHA = "9".repeat(40);
const CI_RUN_ID = 31441718471;
const MIGRATIONS_RUN_ID = 31441718463;
const NOW = new Date("2026-08-11T12:10:00Z");

const tempDirectories: string[] = [];

function body(decision = "MERGE") {
  return [
    CONTROL_START_MARKER,
    `Decision: ${decision}`,
    "Approved by: @leamonline",
    "Migration review: HOLD",
    CONTROL_END_MARKER,
  ].join("\n");
}

function pullRequest(bodyText = body()) {
  return {
    number: 634,
    state: "open",
    draft: false,
    body: bodyText,
    updated_at: "2026-08-11T12:05:05Z",
    changed_files: 1,
    head: { sha: HEAD_SHA },
    base: { ref: "main", sha: FROZEN_PR_BASE_SHA },
  };
}

function checkRun(name: string) {
  const runId = name === "migrations-applied" ? MIGRATIONS_RUN_ID : CI_RUN_ID;
  return {
    id: Number(`${runId}${name.length}`),
    name,
    status: "completed",
    conclusion: "success",
    head_sha: HEAD_SHA,
    completed_at: "2026-08-11T12:04:00Z",
    details_url:
      `https://github.com/leamonline/Smarter-dog-bookings/actions/runs/${runId}/job/${name.length}`,
    app: { slug: "github-actions" },
  };
}

function eventPath(bodyText = body()) {
  const directory = mkdtempSync(join(tmpdir(), "sdb-human-merge-control-"));
  tempDirectories.push(directory);
  const path = join(directory, "event.json");
  writeFileSync(
    path,
    JSON.stringify({
      action: "edited",
      number: 634,
      changes: { body: { from: "old body" } },
      sender: { login: "leamonline", type: "User" },
      pull_request: pullRequest(bodyText),
    }),
  );
  return path;
}

function environment(path: string) {
  return {
    GITHUB_EVENT_NAME: "pull_request_target",
    GITHUB_EVENT_PATH: path,
    GITHUB_REPOSITORY: "leamonline/Smarter-dog-bookings",
    GITHUB_API_URL: "https://api.github.test",
    GITHUB_TOKEN: "secret-test-token",
    GITHUB_ACTOR: "leamonline",
    GITHUB_TRIGGERING_ACTOR: "leamonline",
    GITHUB_RUN_ID: "999",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_RUN_ATTEMPT: "1",
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successfulApi(bodyText = body()) {
  const postedStatuses: Array<{
    state: string;
    context: string;
    target_url: string;
  }> = [];
  const checks = [
    checkRun("build"),
    checkRun("agent-tests"),
    checkRun("pr-production-smoke"),
    checkRun("migrations-applied"),
  ];

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";

    if (method === "POST" && url.pathname === `/repos/leamonline/Smarter-dog-bookings/statuses/${HEAD_SHA}`) {
      const payload = JSON.parse(String(init?.body)) as {
        state: string;
        context: string;
        target_url: string;
      };
      postedStatuses.push(payload);
      return jsonResponse({ state: payload.state, context: payload.context }, 201);
    }
    if (method === "GET" && url.pathname === "/repos/leamonline/Smarter-dog-bookings/pulls/634") {
      return jsonResponse(pullRequest(bodyText));
    }
    if (method === "GET" && url.pathname === "/repos/leamonline/Smarter-dog-bookings/commits/main") {
      return jsonResponse({ sha: BASE_SHA });
    }
    if (
      method === "GET" &&
      url.pathname ===
        `/repos/leamonline/Smarter-dog-bookings/compare/${BASE_SHA}...${HEAD_SHA}`
    ) {
      return jsonResponse({
        status: "ahead",
        base_commit: { sha: BASE_SHA },
        merge_base_commit: { sha: BASE_SHA },
      });
    }
    if (method === "GET" && url.pathname.endsWith("/pulls/634/files")) {
      return jsonResponse([{ filename: "src/example.ts", status: "modified" }]);
    }
    if (method === "GET" && url.pathname.endsWith(`/commits/${HEAD_SHA}/check-runs`)) {
      expect(url.searchParams.get("filter")).toBe("latest");
      return jsonResponse({ check_runs: checks });
    }
    if (method === "GET" && url.pathname.endsWith(`/commits/${HEAD_SHA}/statuses`)) {
      return jsonResponse([
        {
          id: 51988483074,
          context: "Vercel",
          state: "success",
          creator: { login: "vercel[bot]" },
          target_url: "https://vercel.com/example/deployment",
          updated_at: "2026-08-11T12:03:00Z",
        },
      ]);
    }
    if (method === "GET" && url.pathname.endsWith(`/actions/runs/${CI_RUN_ID}`)) {
      return jsonResponse({
        id: CI_RUN_ID,
        event: "pull_request",
        status: "completed",
        conclusion: "success",
        head_sha: HEAD_SHA,
        path: ".github/workflows/ci.yml",
      });
    }
    if (method === "GET" && url.pathname.endsWith(`/actions/runs/${MIGRATIONS_RUN_ID}`)) {
      return jsonResponse({
        id: MIGRATIONS_RUN_ID,
        event: "pull_request",
        status: "completed",
        conclusion: "success",
        head_sha: HEAD_SHA,
        path: ".github/workflows/check-migrations-applied.yml",
      });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });

  return { fetchMock, postedStatuses };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("human merge-control GitHub adapter", () => {
  it("publishes pending before a final success on the exact PR head", async () => {
    const { fetchMock, postedStatuses } = successfulApi();
    vi.stubGlobal("fetch", fetchMock);

    await expect(runHumanMergeControl(environment(eventPath()))).resolves.toBe(0);
    expect(
      postedStatuses.map(({ state, context, target_url }) => ({
        state,
        context,
        target_url,
      })),
    ).toEqual([
      {
        state: "pending",
        context: "human-merge-control",
        target_url:
          "https://github.com/leamonline/Smarter-dog-bookings/actions/runs/999",
      },
      {
        state: "success",
        context: "human-merge-control",
        target_url:
          "https://github.com/leamonline/Smarter-dog-bookings/actions/runs/999",
      },
    ]);
  });

  it("leaves the control pending and logs no untrusted data after an API failure", async () => {
    const path = eventPath();
    const postedStates: string[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        const payload = JSON.parse(String(init?.body)) as { state: string; context: string };
        postedStates.push(payload.state);
        return jsonResponse({ state: payload.state, context: payload.context }, 201);
      }
      return jsonResponse({ message: body(), token: "secret-test-token" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runHumanMergeControl(environment(path))).resolves.toBe(1);
    expect(postedStates).toEqual(["pending", "failure"]);
    expect(error.mock.calls.flat().join(" ")).not.toContain("secret-test-token");
    expect(error.mock.calls.flat().join(" ")).not.toContain(CONTROL_START_MARKER);
  });

  it("publishes failure for a policy HOLD while completing the publisher run", async () => {
    const holdBody = body("HOLD");
    const { fetchMock, postedStatuses } = successfulApi(holdBody);
    vi.stubGlobal("fetch", fetchMock);

    await expect(runHumanMergeControl(environment(eventPath(holdBody)))).resolves.toBe(0);
    expect(postedStatuses.map(({ state }) => state)).toEqual(["pending", "failure"]);
  });

  it("returns non-zero and restores failure when final status publication fails", async () => {
    const { fetchMock, postedStatuses } = successfulApi();
    let postCount = 0;
    const finalPublicationFailure = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          postCount += 1;
          if (postCount === 2) return jsonResponse({ message: "unavailable" }, 503);
        }
        return fetchMock(input, init);
      },
    );
    vi.stubGlobal("fetch", finalPublicationFailure);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runHumanMergeControl(environment(eventPath()))).resolves.toBe(1);
    expect(postedStatuses.map(({ state }) => state)).toEqual(["pending", "failure"]);
  });

  it("overwrites an ambiguously committed success with a best-effort failure", async () => {
    const { fetchMock, postedStatuses } = successfulApi();
    let postCount = 0;
    const ambiguousSuccess = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          postCount += 1;
          if (postCount === 2) {
            const payload = JSON.parse(String(init?.body)) as {
              state: string;
              context: string;
              target_url: string;
            };
            postedStatuses.push(payload);
            return jsonResponse({ message: "response lost after commit" }, 503);
          }
        }
        return fetchMock(input, init);
      },
    );
    vi.stubGlobal("fetch", ambiguousSuccess);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runHumanMergeControl(environment(eventPath()))).resolves.toBe(1);
    expect(postedStatuses.map(({ state }) => state)).toEqual([
      "pending",
      "success",
      "failure",
    ]);
  });

  it("publishes failure when GitHub's PR file list is truncated", async () => {
    const { fetchMock, postedStatuses } = successfulApi();
    const truncatedFilesApi = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString());
        if (
          (init?.method ?? "GET") === "GET" &&
          url.pathname === "/repos/leamonline/Smarter-dog-bookings/pulls/634"
        ) {
          return jsonResponse({ ...pullRequest(), changed_files: 3001 });
        }
        return fetchMock(input, init);
      },
    );
    vi.stubGlobal("fetch", truncatedFilesApi);

    await expect(runHumanMergeControl(environment(eventPath()))).resolves.toBe(0);
    expect(postedStatuses.map(({ state }) => state)).toEqual(["pending", "failure"]);
  });

  it("rejects invocation under any other GitHub event", async () => {
    const { fetchMock, postedStatuses } = successfulApi();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runHumanMergeControl({
        ...environment(eventPath()),
        GITHUB_EVENT_NAME: "workflow_dispatch",
      }),
    ).resolves.toBe(1);
    expect(postedStatuses).toEqual([]);
  });
});
