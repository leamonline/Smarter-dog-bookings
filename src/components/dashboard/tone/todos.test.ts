import { describe, it, expect } from "vitest";
import { resolveTodosTone } from "./todos";

const NOW = new Date("2026-05-22T12:00:00Z");
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const isoOffset = (msAgo: number) =>
  new Date(NOW.getTime() - msAgo).toISOString();

describe("resolveTodosTone", () => {
  it("is calm with an empty list", () => {
    const r = resolveTodosTone({ todos: [], now: NOW });
    expect(r.tone).toBe("calm");
    expect(r.primaryLine).toBe("All tasks sorted");
    expect(r.ariaSummary).toBe("To-do list, no open tasks");
  });

  it("is calm when every task is done", () => {
    const r = resolveTodosTone({
      todos: [
        { done: true, created_at: isoOffset(0) },
        { done: true, created_at: isoOffset(SEVEN_DAYS * 2) },
      ],
      now: NOW,
    });
    expect(r.tone).toBe("calm");
  });

  it("is active when open tasks are all younger than 7 days", () => {
    const r = resolveTodosTone({
      todos: [
        { done: false, created_at: isoOffset(SEVEN_DAYS - 1000) },
        { done: false, created_at: isoOffset(SEVEN_DAYS - 5000) },
      ],
      now: NOW,
    });
    expect(r.tone).toBe("active");
    expect(r.pillLabel).toBe("Pending");
    expect(r.primaryNumber).toBe(2);
    expect(r.subtitle).toBe("open tasks");
  });

  it("singularises 'open task' when only one is open", () => {
    const r = resolveTodosTone({
      todos: [{ done: false, created_at: isoOffset(1000) }],
      now: NOW,
    });
    expect(r.subtitle).toBe("open task");
    expect(r.ariaSummary).toBe("To-do list, 1 open task");
  });

  it("escalates to attention at exactly the 7-day boundary", () => {
    const r = resolveTodosTone({
      todos: [{ done: false, created_at: isoOffset(SEVEN_DAYS) }],
      now: NOW,
    });
    expect(r.tone).toBe("attention");
    expect(r.pillLabel).toBe("Action");
    expect(r.primaryNumber).toBe(1);
    expect(r.subtitle).toBe("overdue (of 1 total)");
  });

  it("reports overdue count vs total open count", () => {
    const r = resolveTodosTone({
      todos: [
        { done: false, created_at: isoOffset(SEVEN_DAYS * 2) },
        { done: false, created_at: isoOffset(SEVEN_DAYS * 3) },
        { done: false, created_at: isoOffset(1000) },
        { done: true, created_at: isoOffset(SEVEN_DAYS * 5) },
      ],
      now: NOW,
    });
    expect(r.tone).toBe("attention");
    expect(r.primaryNumber).toBe(2);
    expect(r.subtitle).toBe("overdue (of 3 total)");
    expect(r.ariaSummary).toBe("To-do list, 2 overdue of 3 open tasks");
    expect(r.urgency).toBe(2);
  });

  it("ignores tasks with missing created_at when computing overdue", () => {
    const r = resolveTodosTone({
      todos: [
        { done: false, created_at: null },
        { done: false, created_at: isoOffset(1000) },
      ],
      now: NOW,
    });
    expect(r.tone).toBe("active");
    expect(r.primaryNumber).toBe(2);
  });
});
