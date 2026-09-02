import { describe, expect, it } from "vitest";
import {
  countInboxFilters,
  filterInboxConversations,
  parseInboxListFilter,
  searchInboxConversations,
  splitByClosed,
  summariseInboxList,
  INBOX_LIST_FILTERS,
} from "./inboxListModel";

// isAwaitingReply(conv) (inbox/helpers.js) is true when the last inbound
// message is newer than the last outbound one; these rows exercise both sides.
const rows = [
  { id: "a", last_inbound_at: "2026-08-10T10:00:00Z", last_outbound_at: null, unread_count: 2, has_failed_message: false, has_pending_draft: false, phone_e164: "+447700900001", last_customer_text: "Can Rex come Monday?", notes: "", humans: { name: "Sarah", surname: "Jones" } },
  { id: "b", last_inbound_at: "2026-08-10T09:00:00Z", last_outbound_at: "2026-08-10T09:30:00Z", unread_count: 0, has_failed_message: true, has_pending_draft: true, phone_e164: "+447700900002", last_customer_text: "Thanks", notes: "prefers mornings", humans: { name: "Dave", surname: "Smith" } },
  { id: "c", last_inbound_at: "2026-08-01T09:00:00Z", last_outbound_at: null, unread_count: 0, has_failed_message: false, has_pending_draft: false, closed_at: "2026-08-01T10:00:00Z", phone_e164: "+447700900003", last_customer_text: "Bye", notes: "", humans: { name: "Zoe", surname: "Brown" } },
];

describe("parseInboxListFilter", () => {
  it("accepts every known mode and falls back to all", () => {
    for (const f of INBOX_LIST_FILTERS) expect(parseInboxListFilter(f)).toBe(f);
    expect(parseInboxListFilter("snoozed")).toBe("all");
    expect(parseInboxListFilter(null)).toBe("all");
    expect(parseInboxListFilter(undefined)).toBe("all");
  });
});

describe("splitByClosed + countInboxFilters", () => {
  it("counts over the active pile only, with done as the closed pile", () => {
    const { active, closed } = splitByClosed(rows);
    expect(active.map((r) => r.id)).toEqual(["a", "b"]);
    expect(closed.map((r) => r.id)).toEqual(["c"]);
    expect(countInboxFilters(active, closed)).toEqual({
      all: 2,
      awaiting_reply: 1,
      failed_sends: 1,
      unread: 1,
      drafts: 1,
      done: 1,
    });
  });
});

describe("filterInboxConversations", () => {
  const { active, closed } = splitByClosed(rows);
  it("returns the pile each mode names", () => {
    expect(filterInboxConversations("all", active, closed).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterInboxConversations("awaiting_reply", active, closed).map((r) => r.id)).toEqual(["a"]);
    expect(filterInboxConversations("failed_sends", active, closed).map((r) => r.id)).toEqual(["b"]);
    expect(filterInboxConversations("unread", active, closed).map((r) => r.id)).toEqual(["a"]);
    expect(filterInboxConversations("drafts", active, closed).map((r) => r.id)).toEqual(["b"]);
    expect(filterInboxConversations("done", active, closed).map((r) => r.id)).toEqual(["c"]);
  });
});

describe("searchInboxConversations", () => {
  it("matches name, phone, preview, note or a server message hit across the whole inbox", () => {
    const none = new Set<string>();
    expect(searchInboxConversations(rows, "", none)).toEqual([]);
    expect(searchInboxConversations(rows, "sarah", none).map((r) => r.id)).toEqual(["a"]);
    expect(searchInboxConversations(rows, "900003", none).map((r) => r.id)).toEqual(["c"]);
    expect(searchInboxConversations(rows, "rex", none).map((r) => r.id)).toEqual(["a"]);
    expect(searchInboxConversations(rows, "mornings", none).map((r) => r.id)).toEqual(["b"]);
    expect(searchInboxConversations(rows, "zzz", new Set(["b"])).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("summariseInboxList", () => {
  const base = {
    isSearching: false,
    searchingMessages: false,
    trimmedQuery: "",
    displayedCount: 0,
    listFilter: "all" as const,
    activeCount: 2,
    closedCount: 1,
    filteredCount: 2,
  };
  it("describes searching, results, the active queue, the closed pile and a filter", () => {
    expect(summariseInboxList({ ...base, isSearching: true, searchingMessages: true, trimmedQuery: "rex" }))
      .toBe("Searching all messages for “rex”…");
    expect(summariseInboxList({ ...base, isSearching: true, trimmedQuery: "rex", displayedCount: 1 }))
      .toBe("1 result for “rex”");
    expect(summariseInboxList(base)).toBe("2 active conversations");
    expect(summariseInboxList({ ...base, activeCount: 1 })).toBe("1 active conversation");
    expect(summariseInboxList({ ...base, listFilter: "done" })).toBe("1 closed conversation");
    expect(summariseInboxList({ ...base, listFilter: "unread", filteredCount: 1 }))
      .toBe("Filtered: unread · 1 of 2");
  });
});
