import { describe, expect, it } from "vitest";
import {
  APPROVED_MERGE_ACTORS,
  CONTROL_END_MARKER,
  CONTROL_START_MARKER,
  evaluateHumanMergeControl,
  parseHumanMergeAttestation,
} from "../../scripts/human-merge-control.mjs";

const HEAD_SHA = "1".repeat(40);
const BASE_SHA = "2".repeat(40);
const FROZEN_PR_BASE_SHA = "9".repeat(40);
const NOW = "2026-08-11T12:10:00Z";
const UPDATED_AT = "2026-08-11T12:05:05Z";

const CI_RUN_ID = 31441718471;
const MIGRATIONS_RUN_ID = 31441718463;
const MIGRATIONS_DETAILS_URL =
  `https://github.com/leamonline/Smarter-dog-bookings/actions/runs/${MIGRATIONS_RUN_ID}/job/93627630737`;

function attestation(
  overrides: Partial<
    Record<"decision" | "approvedBy" | "migrationReview", string>
  > = {},
) {
  const values = {
    decision: "MERGE",
    approvedBy: "@leamonline",
    migrationReview: "HOLD",
    ...overrides,
  };

  return [
    CONTROL_START_MARKER,
    `Decision: ${values.decision}`,
    `Approved by: ${values.approvedBy}`,
    `Migration review: ${values.migrationReview}`,
    CONTROL_END_MARKER,
  ].join("\n");
}

function githubActionsCheck(
  name: string,
  overrides: Record<string, unknown> = {},
) {
  const runId = name === "migrations-applied" ? MIGRATIONS_RUN_ID : CI_RUN_ID;
  return {
    id: Number(`${runId}${name.length}`),
    name,
    status: "completed",
    conclusion: "success",
    head_sha: HEAD_SHA,
    completed_at: "2026-08-11T12:04:00Z",
    details_url: name === "migrations-applied"
      ? MIGRATIONS_DETAILS_URL
      : `https://github.com/leamonline/Smarter-dog-bookings/actions/runs/${runId}/job/${name.length}`,
    app: { slug: "github-actions" },
    ...overrides,
  };
}

function validInput(overrides: Record<string, unknown> = {}) {
  const body = attestation();
  const input = {
    action: "edited",
    bodyChanged: true,
    sender: { login: "leamonline", type: "User" },
    actor: "leamonline",
    triggeringActor: "leamonline",
    runAttempt: 1,
    approvers: APPROVED_MERGE_ACTORS,
    now: NOW,
    initialPullRequest: {
      number: 634,
      state: "open",
      draft: false,
      body,
      updatedAt: UPDATED_AT,
      changedFiles: 1,
      head: { sha: HEAD_SHA },
      base: { ref: "main", sha: FROZEN_PR_BASE_SHA },
    },
    finalPullRequest: {
      number: 634,
      state: "open",
      draft: false,
      body,
      updatedAt: UPDATED_AT,
      changedFiles: 1,
      head: { sha: HEAD_SHA },
      base: { ref: "main", sha: FROZEN_PR_BASE_SHA },
    },
    eventPullRequest: {
      number: 634,
      state: "open",
      draft: false,
      body,
      updatedAt: UPDATED_AT,
      changedFiles: 1,
      head: { sha: HEAD_SHA },
      base: { ref: "main", sha: FROZEN_PR_BASE_SHA },
    },
    initialBaseSha: BASE_SHA,
    finalBaseSha: BASE_SHA,
    baseComparison: {
      status: "ahead",
      base_commit: { sha: BASE_SHA },
      merge_base_commit: { sha: BASE_SHA },
    },
    checkRuns: [
      githubActionsCheck("build"),
      githubActionsCheck("agent-tests"),
      githubActionsCheck("pr-production-smoke"),
      githubActionsCheck("migrations-applied"),
    ],
    workflowRuns: [
      {
        id: CI_RUN_ID,
        event: "pull_request",
        status: "completed",
        conclusion: "success",
        head_sha: HEAD_SHA,
        path: ".github/workflows/ci.yml",
      },
      {
        id: MIGRATIONS_RUN_ID,
        event: "pull_request",
        status: "completed",
        conclusion: "success",
        head_sha: HEAD_SHA,
        path: ".github/workflows/check-migrations-applied.yml",
      },
    ],
    statuses: [
      {
        id: 51988483074,
        context: "Vercel",
        state: "success",
        creator: { login: "vercel[bot]" },
        target_url:
          "https://vercel.com/smarterdog/smarter-dogs-smart-humans/deployment-id",
        updated_at: "2026-08-11T12:03:00Z",
      },
      {
        id: 51988482000,
        context: "Vercel",
        state: "pending",
        creator: { login: "vercel[bot]" },
        target_url:
          "https://vercel.com/smarterdog/smarter-dogs-smart-humans/deployment-id",
        updated_at: "2026-08-11T12:01:00Z",
      },
    ],
    files: [{ filename: "src/example.ts", status: "modified" }],
  };
  const merged = { ...input, ...overrides };
  if (!Object.prototype.hasOwnProperty.call(overrides, "eventPullRequest")) {
    merged.eventPullRequest = {
      ...input.eventPullRequest,
      body: merged.initialPullRequest.body,
      updatedAt: merged.initialPullRequest.updatedAt,
      head: { ...merged.initialPullRequest.head },
      base: { ...merged.initialPullRequest.base },
    };
  }
  return merged;
}

function expectHold(input: Record<string, unknown>, reason: RegExp) {
  const result = evaluateHumanMergeControl(input);
  expect(result.ok).toBe(false);
  expect(result.summary).toMatch(reason);
}

describe("human merge attestation parser", () => {
  it("parses one complete strict block", () => {
    expect(parseHumanMergeAttestation(attestation())).toEqual({
      decision: "MERGE",
      approvedBy: "leamonline",
      migrationReview: "HOLD",
    });
  });

  it("rejects missing, duplicated and malformed blocks", () => {
    expect(() => parseHumanMergeAttestation("no control here")).toThrow(
      /exactly one human merge-control block/i,
    );
    expect(() =>
      parseHumanMergeAttestation(`${attestation()}\n${attestation()}`)
    ).toThrow(/exactly one human merge-control block/i);
    expect(() =>
      parseHumanMergeAttestation(
        attestation().replace(
          `Approved by: @leamonline`,
          `Approved by: @leamonline\nApproved by: @someone-else`,
        ),
      )
    ).toThrow(/unexpected or duplicated field/i);
  });

  it("rejects placeholder and malformed approver logins", () => {
    expect(() =>
      parseHumanMergeAttestation(attestation({ approvedBy: "@username" }))
    ).toThrow(/placeholder/i);
    expect(() =>
      parseHumanMergeAttestation(attestation({ approvedBy: "leamonline" }))
    ).toThrow(/prefixed with @/i);
  });

  it("rejects a block carrying the retired transcription fields", () => {
    // The evaluator reads the head SHA, current main SHA and approval time from
    // GitHub. A body that still types them has the wrong field count and must
    // fail closed rather than being silently tolerated.
    const withRetiredField = attestation().replace(
      "Decision: MERGE",
      `Decision: MERGE\nApproved head SHA: ${HEAD_SHA}`,
    );
    expect(() => parseHumanMergeAttestation(withRetiredField)).toThrow(
      /unexpected or duplicated field/i,
    );
  });
});

describe("human merge-control evaluation", () => {
  it("accepts an exact, fresh, authenticated approval after all evidence", () => {
    expect(evaluateHumanMergeControl(validInput())).toEqual(
      expect.objectContaining({
        ok: true,
        summary: expect.stringMatching(/approved.*1{7}/i),
      }),
    );
  });

  it("keeps the default template on HOLD", () => {
    const body = attestation({
      decision: "HOLD",
      approvedBy: "",
      migrationReview: "HOLD",
    });
    expectHold(
      validInput({
        initialPullRequest: {
          ...validInput().initialPullRequest,
          body,
        },
        finalPullRequest: {
          ...validInput().finalPullRequest,
          body,
        },
      }),
      /HOLD/i,
    );
  });

  it.each(["opened", "reopened", "synchronize", "ready_for_review", "converted_to_draft"])(
    "rejects approval on the %s event",
    (action) => {
      expectHold(validInput({ action }), /fresh pull-request body edit/i);
    },
  );

  it("requires a real body edit from an allow-listed human", () => {
    expectHold(validInput({ bodyChanged: false }), /body edit/i);
    expectHold(
      validInput({ sender: { login: "dependabot[bot]", type: "Bot" } }),
      /human editor/i,
    );
    expectHold(
      validInput({ sender: { login: "someone-else", type: "User" } }),
      /authorised merge approver/i,
    );
  });

  it("binds the typed approver to sender, actor and triggering actor", () => {
    expectHold(validInput({ actor: "someone-else" }), /actor/i);
    expectHold(validInput({ triggeringActor: "someone-else" }), /triggering actor/i);

    const body = attestation({ approvedBy: "@someone-else" });
    expectHold(
      validInput({
        initialPullRequest: { ...validInput().initialPullRequest, body },
        finalPullRequest: { ...validInput().finalPullRequest, body },
      }),
      /Approved by/i,
    );
  });

  it("rejects workflow re-runs of an old edited event", () => {
    expectHold(validInput({ runAttempt: 2 }), /re-run/i);
  });

  it("requires two unchanged, open, non-draft reads targeting main", () => {
    expectHold(
      validInput({
        initialPullRequest: {
          ...validInput().initialPullRequest,
          draft: true,
        },
      }),
      /draft/i,
    );
    expectHold(
      validInput({
        finalPullRequest: {
          ...validInput().finalPullRequest,
          state: "closed",
        },
      }),
      /open/i,
    );
    expectHold(
      validInput({
        finalPullRequest: {
          ...validInput().finalPullRequest,
          head: { sha: "3".repeat(40) },
        },
      }),
      /head.*changed/i,
    );
    expectHold(
      validInput({ finalBaseSha: "4".repeat(40) }),
      /main.*changed/i,
    );
    expectHold(
      validInput({
        finalPullRequest: {
          ...validInput().finalPullRequest,
          updatedAt: "2026-08-11T12:06:00Z",
        },
      }),
      /updated_at.*changed/i,
    );
  });

  it("binds approval to the exact edited event snapshot", () => {
    expectHold(
      validInput({
        eventPullRequest: {
          ...validInput().eventPullRequest,
          updatedAt: "2026-08-11T12:04:00Z",
        },
      }),
      /changed after the edited event/i,
    );
  });

  it("binds approval to the head GitHub reports, with nothing transcribed", () => {
    // The approver no longer types a head SHA. The binding instead comes from
    // the evidence itself: every required check must be attached to the head
    // GitHub reports for this pull request.
    expectHold(
      validInput({
        checkRuns: [
          githubActionsCheck("build", { head_sha: "3".repeat(40) }),
          githubActionsCheck("agent-tests"),
          githubActionsCheck("pr-production-smoke"),
          githubActionsCheck("migrations-applied"),
        ],
      }),
      /build is not attached to the current head/i,
    );

    const approved = evaluateHumanMergeControl(validInput());
    expect(approved.ok).toBe(true);
    expect(approved.summary).toContain(HEAD_SHA.slice(0, 7));
  });

  it("uses current main independently of GitHub's frozen PR base snapshot", () => {
    expect(
      evaluateHumanMergeControl(
        validInput({
          initialPullRequest: {
            ...validInput().initialPullRequest,
            base: { ref: "main", sha: "8".repeat(40) },
          },
          finalPullRequest: {
            ...validInput().finalPullRequest,
            base: { ref: "main", sha: "8".repeat(40) },
          },
        }),
      ).ok,
    ).toBe(true);
  });

  it("requires the approved head to contain the current main commit", () => {
    expectHold(
      validInput({
        baseComparison: {
          status: "diverged",
          base_commit: { sha: BASE_SHA },
          merge_base_commit: { sha: "7".repeat(40) },
        },
      }),
      /contain.*current main/i,
    );
    expectHold(
      validInput({
        baseComparison: {
          status: "ahead",
          base_commit: { sha: BASE_SHA },
          merge_base_commit: { sha: "7".repeat(40) },
        },
      }),
      /contain.*current main/i,
    );
  });

  it("requires the GitHub file list to be complete before migration review", () => {
    expectHold(
      validInput({
        initialPullRequest: {
          ...validInput().initialPullRequest,
          changedFiles: 3001,
        },
        finalPullRequest: {
          ...validInput().finalPullRequest,
          changedFiles: 3001,
        },
      }),
      /file list.*incomplete/i,
    );
    expectHold(
      validInput({
        finalPullRequest: {
          ...validInput().finalPullRequest,
          changedFiles: 2,
        },
      }),
      /file count.*changed/i,
    );
  });

  it("uses GitHub's authenticated body-edit time as the only approval clock", () => {
    // The approver types no timestamp. GitHub's updated_at for the body edit is
    // the approval time, so it cannot be back-dated or skewed by a local clock.
    for (const updatedAt of ["2026-08-11T12:03:59Z", "2026-08-11T12:04:00Z"]) {
      expectHold(
        validInput({
          initialPullRequest: {
            ...validInput().initialPullRequest,
            updatedAt,
          },
          finalPullRequest: {
            ...validInput().finalPullRequest,
            updatedAt,
          },
        }),
        /body edit.*after.*evidence/i,
      );
    }

    const approved = evaluateHumanMergeControl(validInput());
    expect(approved.ok).toBe(true);
    expect(approved.summary).toContain(UPDATED_AT);
  });

  it("applies the documented approval-age and future-skew boundaries", () => {
    // The window is one hour from the authenticated body edit at 12:05:05Z.
    expect(evaluateHumanMergeControl(validInput({ now: "2026-08-11T13:05:05Z" })).ok).toBe(
      true,
    );
    expectHold(validInput({ now: "2026-08-11T13:05:06Z" }), /too old/i);

    // Two minutes of future skew is tolerated against the evaluator's clock.
    const editedAt = "2026-08-11T12:12:00Z";
    expect(
      evaluateHumanMergeControl(
        validInput({
          initialPullRequest: { ...validInput().initialPullRequest, updatedAt: editedAt },
          finalPullRequest: { ...validInput().finalPullRequest, updatedAt: editedAt },
        }),
      ).ok,
    ).toBe(true);

    const excessiveFuture = "2026-08-11T12:12:01Z";
    expectHold(
      validInput({
        initialPullRequest: {
          ...validInput().initialPullRequest,
          updatedAt: excessiveFuture,
        },
        finalPullRequest: {
          ...validInput().finalPullRequest,
          updatedAt: excessiveFuture,
        },
      }),
      /future/i,
    );
  });

  it.each([
    ["missing", null],
    ["pending", { status: "in_progress", conclusion: null }],
    ["skipped", { conclusion: "skipped" }],
    ["neutral", { conclusion: "neutral" }],
    ["failed", { conclusion: "failure" }],
  ])("rejects a %s required Actions check", (_label, replacement) => {
    const checks = validInput().checkRuns as Array<Record<string, unknown>>;
    const build = replacement
      ? { ...checks[0], ...replacement }
      : null;
    expectHold(
      validInput({ checkRuns: build ? [build, ...checks.slice(1)] : checks.slice(1) }),
      /build/i,
    );
  });

  it("rejects duplicate or lookalike Actions checks", () => {
    const checks = validInput().checkRuns as Array<Record<string, unknown>>;
    expectHold(
      validInput({ checkRuns: [...checks, { ...checks[0], id: 999 }] }),
      /ambiguous.*build/i,
    );
    expectHold(
      validInput({
        checkRuns: [
          { ...checks[0], app: { slug: "lookalike-ci" } },
          ...checks.slice(1),
        ],
      }),
      /build.*github-actions/i,
    );
  });

  it("binds Actions checks to successful pull_request runs at exact workflow paths", () => {
    const cases = [
      [{ event: "workflow_dispatch" }, /pull_request/i],
      [{ head_sha: "3".repeat(40) }, /head SHA/i],
      [{ path: ".github/workflows/lookalike.yml" }, /workflow path/i],
      [{ conclusion: "failure" }, /successful/i],
    ] as const;

    for (const [change, reason] of cases) {
      const runs = validInput().workflowRuns as Array<Record<string, unknown>>;
      expectHold(
        validInput({ workflowRuns: [{ ...runs[0], ...change }, runs[1]] }),
        reason,
      );
    }
  });

  it("uses only the newest exact Vercel status from vercel[bot]", () => {
    const statuses = validInput().statuses as Array<Record<string, unknown>>;
    expect(evaluateHumanMergeControl(validInput({ statuses })).ok).toBe(true);
    expectHold(
      validInput({ statuses: [{ ...statuses[0], state: "failure" }, statuses[1]] }),
      /Vercel.*success/i,
    );
    expectHold(
      validInput({ statuses: [{ ...statuses[0], creator: { login: "lookalike" } }] }),
      /vercel\[bot\]/i,
    );
    expectHold(
      validInput({
        statuses: [
          {
            ...statuses[0],
            id: 51988484000,
            creator: { login: "lookalike" },
            updated_at: "2026-08-11T12:06:00Z",
          },
          statuses[0],
        ],
      }),
      /vercel\[bot\]/i,
    );
    expectHold(
      validInput({
        statuses: [{ ...statuses[0], target_url: "https://vercel.com.example.org/deploy" }],
      }),
      /vercel\.com/i,
    );
    expectHold(
      validInput({
        statuses: [
          {
            context: "Vercel Preview Comments",
            state: "success",
            creator: { login: "vercel[bot]" },
            target_url: "https://vercel.com/github",
            updated_at: "2026-08-11T12:06:00Z",
          },
        ],
      }),
      /Vercel/i,
    );
  });

  it("requires an explicit migration disposition and append-only history", () => {
    const addedFile = {
      filename: "supabase/migrations/20260811120000_example.sql",
      status: "added",
    };
    expectHold(validInput({ files: [addedFile] }), /Migration review.*APPLIED/i);

    const appliedBody = attestation({
      migrationReview: `APPLIED: ${MIGRATIONS_DETAILS_URL}`,
    });
    expect(
      evaluateHumanMergeControl(
        validInput({
          files: [addedFile],
          initialPullRequest: {
            ...validInput().initialPullRequest,
            body: appliedBody,
          },
          finalPullRequest: {
            ...validInput().finalPullRequest,
            body: appliedBody,
          },
        }),
      ).ok,
    ).toBe(true);

    expectHold(
      validInput({
        files: [{ ...addedFile, status: "modified" }],
      }),
      /append-only/i,
    );
  });
});

describe("documentation-only exemption", () => {
  const docsFile = { filename: "docs/research/2026-08-14-note.md", status: "modified" };

  it("approves prose-only changes with no human attestation", () => {
    // No body edit, and the event is a plain push to the branch.
    const result = evaluateHumanMergeControl(
      validInput({ action: "synchronize", bodyChanged: false, files: [docsFile] }),
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/documentation-only/i);
  });

  it("still demands complete, green machine evidence", () => {
    expectHold(
      validInput({
        action: "synchronize",
        files: [docsFile],
        checkRuns: (validInput().checkRuns as Array<Record<string, unknown>>).slice(1),
      }),
      /build.*missing/i,
    );
    expectHold(
      validInput({
        action: "synchronize",
        files: [docsFile],
        baseComparison: {
          status: "diverged",
          base_commit: { sha: BASE_SHA },
          merge_base_commit: { sha: "7".repeat(40) },
        },
      }),
      /contain.*current main/i,
    );
  });

  it("cannot be faked by an incomplete file list", () => {
    expectHold(
      validInput({
        action: "synchronize",
        files: [docsFile],
        initialPullRequest: { ...validInput().initialPullRequest, changedFiles: 2 },
        finalPullRequest: { ...validInput().finalPullRequest, changedFiles: 2 },
      }),
      /file list.*incomplete/i,
    );
  });

  it.each([
    [".github/pull_request_template.md", "control-plane Markdown"],
    ["scripts/human-merge-control.mjs", "evaluator source"],
    ["src/engine/capacity.ts", "application code"],
    ["supabase/migrations/20260811120000_example.sql", "migration SQL"],
  ])("does not exempt %s (%s)", (filename) => {
    expectHold(
      validInput({
        action: "synchronize",
        files: [{ filename, status: filename.endsWith(".sql") ? "added" : "modified" }],
      }),
      /fresh pull-request body edit/i,
    );
  });

  it("does not exempt a change that mixes prose with code", () => {
    expectHold(
      validInput({
        action: "synchronize",
        files: [docsFile, { filename: "src/engine/capacity.ts", status: "modified" }],
        initialPullRequest: { ...validInput().initialPullRequest, changedFiles: 2 },
        finalPullRequest: { ...validInput().finalPullRequest, changedFiles: 2 },
      }),
      /fresh pull-request body edit/i,
    );
  });

  it("does not exempt prose renamed out of a code path", () => {
    expectHold(
      validInput({
        action: "synchronize",
        files: [
          {
            filename: "docs/moved.md",
            previous_filename: "src/engine/capacity.ts",
            status: "renamed",
          },
        ],
      }),
      /fresh pull-request body edit/i,
    );
  });
});
