// End to end through the real hook and repository: only supabase.rpc is
// stubbed, so every assertion on what reaches it is what the database gets.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

function setSupabase(value) {
  globalThis.__supabaseMockReenableDialog = value;
}

vi.mock("../../../supabase/client", () => ({
  get supabase() {
    return globalThis.__supabaseMockReenableDialog;
  },
}));

const { ReenableWhatsAppDialog } = await import("./ReenableWhatsAppDialog.jsx");

const SARAH = "11111111-1111-4111-8111-111111111111";
const TOM = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const AUDIT = "44444444-4444-4444-8444-444444444444";
const FIRST_STOP = "2026-10-03T13:05:00.123456+00:00";
const LAST_STOP = "2026-10-10T08:12:00.654321+00:00";
const NEW_STOP = "2026-10-14T13:32:00.000001+00:00";
const NOTE = "Rang the salon on 14 Oct and asked for WhatsApp reminders again.";

const SCOPE = {
  phone_key: "7700900123",
  number_stopped_at: FIRST_STOP,
  last_stop_at: LAST_STOP,
  records: [
    { id: SARAH, name: "Sarah Jones", phone: "07700 900123", reason: "asked_on_whatsapp", opted_out_at: FIRST_STOP },
    { id: TOM, name: "", phone: "+447700900123", reason: "Asked by phone", opted_out_at: "2026-12-01T09:00:00+00:00" },
  ],
};
const EMPTY = { phone_key: "7700900123", number_stopped_at: null, last_stop_at: null, records: [] };
const REENABLED = {
  phone_key: "7700900123",
  human_ids: [SARAH, TOM],
  conversation_ids: [CONVERSATION],
  audit_id: AUDIT,
};

const SCOPE_FN = "staff_whatsapp_number_opt_out_scope";
const REENABLE_FN = "staff_reenable_whatsapp_number";

/** rpc stub: each function answers from its own queue; the last answer repeats. */
function makeClient({ scopes = [{ data: SCOPE, error: null }], reenables = [{ data: REENABLED, error: null }] } = {}) {
  const queues = { [SCOPE_FN]: [...scopes], [REENABLE_FN]: [...reenables] };
  const rpc = vi.fn((fn) => {
    const queue = queues[fn];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return typeof next === "function" ? next() : Promise.resolve(next);
  });
  return { rpc };
}

const callsTo = (client, fn) => client.rpc.mock.calls.filter(([name]) => name === fn);

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderDialog(props = {}, client = makeClient()) {
  setSupabase(client);
  const onClose = vi.fn();
  const onReenabled = vi.fn();
  const view = render(
    <ToastProvider>
      <ReenableWhatsAppDialog
        phone="+447700900123"
        context="profile"
        currentHumanId={SARAH}
        currentHumanName="Sarah Jones"
        onClose={onClose}
        onReenabled={onReenabled}
        {...props}
      />
    </ToastProvider>,
  );
  return { ...view, client, onClose, onReenabled };
}

async function ready(props, client) {
  const rendered = renderDialog(props, client);
  await screen.findByLabelText("How and when did they give permission again?");
  return rendered;
}

const confirm = () => screen.getByRole("button", { name: /^Switch WhatsApp back on$|Switching back on…$/ });
const note = () => screen.getByLabelText("How and when did they give permission again?");
const type = (value) => fireEvent.change(note(), { target: { value } });

beforeEach(() => {
  // Unknown and network failures are reported through the logger, which
  // echoes to the console in development; keep the run quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  setSupabase(undefined);
  vi.restoreAllMocks();
});

describe("ReenableWhatsAppDialog", () => {
  it("is a dialog named for what it does, and puts the scope before the note", async () => {
    await ready();
    const dialog = screen.getByRole("dialog", { name: "Switch WhatsApp back on?" });
    expect(within(dialog).getByText("07700 900123")).toBeInTheDocument();
    // Nothing is autofocused: React Aria focuses the dialog itself, so a
    // screen reader announces the title, and Close is the first tab stop.
    expect(document.activeElement).toBe(dialog);
    expect(document.activeElement).not.toBe(note());
    await userEvent.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    // The records come before the form in reading and tab order.
    const records = screen.getByRole("region", { name: /Switched off on this number/ });
    expect(records.compareDocumentPosition(note()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("asks once for the scope, with the phone it was given", async () => {
    const { client } = await ready();
    expect(callsTo(client, SCOPE_FN)).toEqual([[SCOPE_FN, { p_phone: "+447700900123" }]]);
    expect(callsTo(client, REENABLE_FN)).toEqual([]);
  });

  it("lists every switched-off record with its name, number, reason and London time", async () => {
    await ready();
    const list = screen.getByRole("region", { name: "Switched off on this number (2)" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Sarah Jones");
    expect(rows[0]).toHaveTextContent("This customer");
    expect(rows[0]).toHaveTextContent("Saved as 07700 900123");
    expect(rows[0]).toHaveTextContent("Said STOP on WhatsApp · since 3 Oct 2026, 14:05");
    expect(rows[1]).toHaveTextContent("Unnamed record");
    expect(rows[1]).not.toHaveTextContent("This customer");
    expect(rows[1]).toHaveTextContent("Saved as 07700 900123");
    expect(rows[1]).toHaveTextContent("Switched off: Asked by phone · since 1 Dec 2026, 09:00");
    expect(
      within(list).getByText(/They’re all switched back on together — the number can’t be on for one record and off for another\./),
    ).toBeInTheDocument();
  });

  it("opens another record's profile: closes first, then opens", async () => {
    const order = [];
    const onOpenHuman = vi.fn((id) => order.push(["open", id]));
    const { onClose } = await ready({ onOpenHuman });
    onClose.mockImplementation(() => order.push(["close"]));

    const buttons = screen.getAllByRole("button", { name: "Open profile" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(order).toEqual([["close"], ["open", TOM]]);
  });

  it("keeps the profile buttons from closing it mid-request", async () => {
    const pending = deferred();
    const onOpenHuman = vi.fn();
    const { onClose } = await ready(
      { context: "inbox", linkedElsewhere: { id: "77777777-7777-4777-8777-777777777777", name: "Bea Smith" }, onOpenHuman },
      makeClient({ reenables: [() => pending.promise] }),
    );
    type(NOTE);
    act(() => fireEvent.click(confirm()));
    await screen.findByRole("button", { name: /Switching back on…$/ });

    const openProfile = screen.getByRole("button", { name: "Open profile" });
    const openLinked = screen.getByRole("button", { name: "Open Bea Smith’s profile" });
    expect(openProfile).toBeDisabled();
    expect(openLinked).toBeDisabled();
    fireEvent.click(openProfile);
    fireEvent.click(openLinked);
    expect(onClose).not.toHaveBeenCalled();
    expect(onOpenHuman).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ data: REENABLED, error: null }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenHuman).not.toHaveBeenCalled();
  });

  it("offers no profile button without onOpenHuman", async () => {
    await ready();
    expect(screen.queryByRole("button", { name: "Open profile" })).toBeNull();
  });

  it("shows the first and latest STOP, and the caution", async () => {
    await ready();
    expect(
      screen.getByText("This number said STOP on 3 Oct 2026, 14:05. It said STOP again on 10 Oct 2026, 09:12."),
    ).toBeInTheDocument();
    expect(screen.getByText(/A message from them since their STOP isn’t permission on its own\./)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is sent now\. The assistant stays on drafts for staff to approve/)).toBeInTheDocument();
    expect(screen.queryByText(/Anything waiting for approval in this chat/)).toBeNull();
  });

  it("explains a number that never said STOP", async () => {
    await ready({}, makeClient({ scopes: [{ data: { ...SCOPE, number_stopped_at: null, last_stop_at: null }, error: null }] }));
    expect(
      screen.getByText("This number hasn’t said STOP, but WhatsApp is switched off on the records below."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/isn’t permission on its own/)).toBeNull();
  });

  it("handles a stopped number with no customer record, sending no records", async () => {
    const client = makeClient({
      scopes: [{ data: { ...SCOPE, last_stop_at: FIRST_STOP, records: [] }, error: null }],
      reenables: [{ data: { ...REENABLED, human_ids: [] }, error: null }],
    });
    const { onReenabled } = await ready({ context: "inbox", currentHumanId: null }, client);
    expect(screen.getByText("This number said STOP on 3 Oct 2026, 14:05.")).toBeInTheDocument();
    expect(
      screen.getByText("No customer record uses this number. Only the WhatsApp chat is switched back on."),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Switched off on this number (0)" })).toBeInTheDocument();

    type(NOTE);
    await act(async () => fireEvent.click(confirm()));
    expect(callsTo(client, REENABLE_FN)[0][1]).toMatchObject({ p_human_ids: [], p_last_stop_at: FIRST_STOP });
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [], conversationIds: [CONVERSATION], auditId: AUDIT });
  });

  it("holds confirm until ten characters, and shows the short-note error only after typing", async () => {
    await ready();
    expect(confirm()).toBeDisabled();
    expect(screen.queryByText("Add a little more — at least 10 characters.")).toBeNull();
    expect(screen.getByText("Write how they gave permission again to switch WhatsApp back on.")).toBeVisible();
    expect(confirm()).toHaveAccessibleDescription("Write how they gave permission again to switch WhatsApp back on.");
    expect(note()).not.toHaveAttribute("aria-invalid");

    type("   123456789   ");
    expect(screen.getByText("Add a little more — at least 10 characters.")).toBeInTheDocument();
    expect(note()).toHaveAttribute("aria-invalid", "true");
    expect(note()).toHaveAccessibleDescription(/At least 10 characters\..*Add a little more/s);
    expect(confirm()).toBeDisabled();

    type("1234567890");
    expect(screen.queryByText("Add a little more — at least 10 characters.")).toBeNull();
    expect(screen.queryByText("Write how they gave permission again to switch WhatsApp back on.")).toBeNull();
    expect(confirm()).toBeEnabled();
    expect(note()).toHaveAttribute("maxLength", "500");
  });

  it("sends the verbatim STOP and the trimmed note, then toasts, reports and closes", async () => {
    const order = [];
    const { client, onClose, onReenabled } = await ready();
    onReenabled.mockImplementation(() => order.push("reenabled"));
    onClose.mockImplementation(() => order.push("close"));

    type(`  ${NOTE}\n`);
    await act(async () => fireEvent.click(confirm()));

    expect(callsTo(client, REENABLE_FN)).toEqual([
      [
        REENABLE_FN,
        {
          p_phone: "+447700900123",
          p_human_ids: [SARAH, TOM],
          p_last_stop_at: "2026-10-10T08:12:00.654321+00:00",
          p_permission_note: NOTE,
        },
      ],
    ]);
    const toast = await screen.findByText("WhatsApp is back on for 07700 900123.");
    const toastRow = toast.closest('[role="status"]');
    expect(within(toastRow).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Dismiss notification",
    ]);
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH, TOM], conversationIds: [CONVERSATION], auditId: AUDIT });
    expect(order).toEqual(["reenabled", "close"]);
  });

  it("cannot be dismissed while it is switching back on", async () => {
    const pending = deferred();
    const { onClose } = await ready({}, makeClient({ reenables: [() => pending.promise] }));
    type(NOTE);
    act(() => fireEvent.click(confirm()));

    const busyButton = await screen.findByRole("button", { name: /Switching back on…$/ });
    expect(busyButton).toHaveTextContent("Switching back on…");
    expect(busyButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep it off" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("dialog").parentElement);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ data: REENABLED, error: null }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from Keep it off, Escape and Close when idle", async () => {
    const { onClose } = await ready();
    fireEvent.click(screen.getByRole("button", { name: "Keep it off" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("shows what changed, reads the scope once more and never re-sends", async () => {
    const tom = { id: "55555555-5555-4555-8555-555555555555", name: "Tom Jones", phone: "07700900123", reason: null, opted_out_at: null };
    const client = makeClient({
      scopes: [
        { data: SCOPE, error: null },
        { data: { ...SCOPE, records: [SCOPE.records[1], tom] }, error: null },
      ],
      reenables: [{ data: null, error: { code: "P0001", message: "changed", details: "reenable_scope_changed" } }],
    });
    await ready({}, client);
    type(NOTE);
    await act(async () => fireEvent.click(confirm()));

    const alert = await screen.findByText(/Something changed on this number while you were looking, so nothing was switched on\./);
    const box = alert.closest('[role="alert"]');
    expect(box).toHaveTextContent("Now also switched off: Tom Jones.");
    expect(box).toHaveTextContent("No longer switched off: Sarah Jones.");
    expect(callsTo(client, SCOPE_FN)).toHaveLength(2);
    expect(callsTo(client, REENABLE_FN)).toHaveLength(1);
    expect(note()).toHaveValue(NOTE);
    expect(screen.getByRole("region", { name: "Switched off on this number (2)" })).toHaveTextContent("Tom Jones");
  });

  it("clears the note after a new STOP", async () => {
    const client = makeClient({
      scopes: [{ data: SCOPE, error: null }, { data: { ...SCOPE, last_stop_at: NEW_STOP }, error: null }],
      reenables: [{ data: null, error: { code: "P0001", message: "changed", details: "reenable_scope_changed" } }],
    });
    await ready({}, client);
    type(NOTE);
    await act(async () => fireEvent.click(confirm()));

    expect(
      await screen.findByText(
        "This number said STOP again on 14 Oct 2026, 14:32, after you opened this. Nothing was switched on. Only switch it back on if they’ve given permission since then.",
      ),
    ).toBeInTheDocument();
    expect(note()).toHaveValue("");
    expect(confirm()).toBeDisabled();
    expect(screen.queryByText("Add a little more — at least 10 characters.")).toBeNull();
  });

  it("explains a failed check and tries again", async () => {
    const client = makeClient({
      scopes: [{ data: null, error: { code: "", message: "Failed to fetch", details: null } }, { data: SCOPE, error: null }],
    });
    renderDialog({}, client);
    expect(await screen.findByText("Couldn’t check this number — give it another go?")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("How and when did they give permission again?")).toBeInTheDocument();
  });

  it("shows the loading state while it checks", async () => {
    const pending = deferred();
    renderDialog({}, makeClient({ scopes: [() => pending.promise] }));
    expect(screen.getByRole("status")).toHaveTextContent("Checking everything on this number…");
    await act(async () => pending.resolve({ data: SCOPE, error: null }));
  });

  it.each([
    [{ code: "42501", details: null }, "profile", "Only signed-in staff can switch WhatsApp back on. Sign out and back in, then try again."],
    [{ code: "PGRST202", details: null }, "profile", "Switching WhatsApp back on isn’t ready yet — the database update it needs hasn’t gone live. Let the owner know."],
    [{ code: "42883", details: null }, "inbox", "Switching WhatsApp back on isn’t ready yet — the database update it needs hasn’t gone live. Let the owner know."],
    [{ code: "P0001", details: "invalid_phone" }, "profile", "This number doesn’t look right, so it can’t be checked. Fix the number on the customer’s record first."],
    [{ code: "P0001", details: "invalid_phone" }, "inbox", "This chat’s number doesn’t look right, so it can’t be checked."],
  ])("explains a blocked check (%j, %s)", async (error, context, copy) => {
    renderDialog({ context }, makeClient({ scopes: [{ data: null, error: { message: "refused", ...error } }] }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByLabelText("How and when did they give permission again?")).toBeNull();
  });

  it("explains that it needs the live database on sample data", () => {
    setSupabase(undefined);
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <ReenableWhatsAppDialog phone="+447700900123" context="profile" onClose={onClose} />
      </ToastProvider>,
    );
    expect(
      screen.getByText("Switching WhatsApp back on needs the live database — you’re on sample data. Nothing has been changed."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("explains a number that is already on", async () => {
    renderDialog({}, makeClient({ scopes: [{ data: EMPTY, error: null }] }));
    expect(
      await screen.findByText("WhatsApp is already on for this number — there’s nothing to switch back on."),
    ).toBeInTheDocument();
  });

  it("explains when someone else switched it back on first", async () => {
    const client = makeClient({
      scopes: [{ data: SCOPE, error: null }, { data: EMPTY, error: null }],
      reenables: [{ data: null, error: { code: "P0001", message: "changed", details: "reenable_scope_changed" } }],
    });
    const { onReenabled, onClose } = await ready({}, client);
    type(NOTE);
    await act(async () => fireEvent.click(confirm()));
    expect(
      await screen.findByText("Someone has already switched WhatsApp back on for this number. There’s nothing left to do."),
    ).toBeInTheDocument();
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH, TOM], conversationIds: [] });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("names a profile record that is no longer in scope, and holds confirm", async () => {
    const { client } = await ready({ currentHumanId: "66666666-6666-4666-8666-666666666666", currentHumanName: "Bea Smith" });
    expect(screen.getByText(/Bea Smith isn’t switched off on this number any more/)).toBeInTheDocument();
    type(NOTE);
    expect(confirm()).toBeDisabled();
    expect(confirm()).toHaveAccessibleDescription("Refresh to see this customer’s current number first.");
    fireEvent.click(confirm());
    expect(callsTo(client, REENABLE_FN)).toHaveLength(0);
  });

  it("stays on the number it opened with when the profile's number changes", async () => {
    const view = await ready();
    type(NOTE);
    expect(confirm()).toBeEnabled();

    view.rerender(
      <ToastProvider>
        <ReenableWhatsAppDialog
          phone="07700 900456"
          context="profile"
          currentHumanId={SARAH}
          currentHumanName="Sarah Jones"
          onClose={view.onClose}
          onReenabled={view.onReenabled}
        />
      </ToastProvider>,
    );

    // Never a quiet read of another number: one scope call, for the first one.
    expect(callsTo(view.client, SCOPE_FN)).toEqual([[SCOPE_FN, { p_phone: "+447700900123" }]]);
    expect(within(screen.getByRole("dialog")).getByText("07700 900123")).toBeInTheDocument();
    expect(screen.getByText(/Sarah Jones isn’t switched off on this number any more/)).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
    expect(confirm()).toHaveAccessibleDescription("Refresh to see this customer’s current number first.");
  });

  it("in the inbox, mentions waiting drafts and a linked customer saved elsewhere", async () => {
    const onOpenHuman = vi.fn();
    const { onClose } = await ready({
      context: "inbox",
      currentHumanId: null,
      linkedElsewhere: { id: TOM, name: "Sarah Jones" },
      onOpenHuman,
    });
    expect(
      screen.getByText(/Anything waiting for approval in this chat stays waiting\. If the automatic STOP reply is still there, reject it/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sarah Jones is linked to this chat but saved with a different number, so this won’t switch them back on\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Sarah Jones’s profile" }));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenHuman).toHaveBeenCalledWith(TOM);
  });

  it("holds confirm while the chat shows a newer STOP, until Reload", async () => {
    const client = makeClient({
      scopes: [{ data: SCOPE, error: null }, { data: { ...SCOPE, last_stop_at: NEW_STOP }, error: null }],
    });
    const view = await ready({ context: "inbox", observedLastStopAt: LAST_STOP }, client);
    type(NOTE);
    expect(confirm()).toBeEnabled();

    view.rerender(
      <ToastProvider>
        <ReenableWhatsAppDialog
          phone="+447700900123"
          context="inbox"
          observedLastStopAt={NEW_STOP}
          onClose={view.onClose}
          onReenabled={view.onReenabled}
        />
      </ToastProvider>,
    );
    expect(
      screen.getByText("This number has just said STOP again. Reload to see the latest before switching it back on."),
    ).toBeInTheDocument();
    expect(confirm()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await screen.findByText(/said STOP again on 14 Oct 2026, 14:32, after you opened this/);
    expect(screen.queryByText(/has just said STOP again/)).toBeNull();
    expect(callsTo(client, SCOPE_FN)).toHaveLength(2);
    expect(note()).toHaveValue("");
    type(NOTE);
    expect(confirm()).toBeEnabled();
  });

  it("verifies after a dropped connection, holds confirm, and Check again finds it went through", async () => {
    const client = makeClient({
      scopes: [
        { data: SCOPE, error: null },
        { data: null, error: { code: "", message: "Failed to fetch", details: null } },
        { data: EMPTY, error: null },
      ],
      reenables: [{ data: null, error: { code: "", message: "Failed to fetch", details: null } }],
    });
    const order = [];
    const { onClose, onReenabled } = await ready({}, client);
    onReenabled.mockImplementation(() => order.push("reenabled"));
    onClose.mockImplementation(() => order.push("close"));
    type(NOTE);
    await act(async () => fireEvent.click(confirm()));

    expect(
      await screen.findByText("We couldn’t confirm whether WhatsApp was switched back on. Check again before doing anything else."),
    ).toBeInTheDocument();
    // The outcome is unknown, so confirm waits for Check again.
    expect(confirm()).toBeDisabled();
    expect(note()).toHaveValue(NOTE);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Check again" })));

    // An empty number now means this request went through, not someone else's.
    expect(await screen.findByText("WhatsApp is back on for 07700 900123.")).toBeInTheDocument();
    expect(screen.queryByText(/Someone has already switched WhatsApp back on/)).toBeNull();
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH, TOM], conversationIds: [] });
    expect(order).toEqual(["reenabled", "close"]);
    expect(callsTo(client, SCOPE_FN)).toHaveLength(3);
    expect(callsTo(client, REENABLE_FN)).toHaveLength(1);
  });

  it("Check again that finds nothing changed says so, and gives confirm back", async () => {
    const client = makeClient({
      scopes: [
        { data: SCOPE, error: null },
        { data: null, error: { code: "", message: "Failed to fetch", details: null } },
        { data: SCOPE, error: null },
      ],
      reenables: [{ data: null, error: { code: "", message: "Failed to fetch", details: null } }],
    });
    const { onReenabled } = await ready({}, client);
    type(NOTE);
    await act(async () => fireEvent.click(confirm()));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Check again" })));

    expect(
      await screen.findByText("Nothing was switched on — we couldn’t reach the database. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    expect(onReenabled).not.toHaveBeenCalled();
  });

  it("Try again after a failed re-read that finds the number cleared tells the host", async () => {
    const client = makeClient({
      scopes: [
        { data: SCOPE, error: null },
        { data: null, error: { code: "57014", message: "timeout", details: null } },
        { data: EMPTY, error: null },
      ],
      reenables: [{ data: null, error: { code: "P0001", message: "changed", details: "reenable_scope_changed" } }],
    });
    const { onReenabled, onClose } = await ready({}, client);
    type(NOTE);
    await act(async () => fireEvent.click(confirm()));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Try again" })));

    expect(
      await screen.findByText("Someone has already switched WhatsApp back on for this number. There’s nothing left to do."),
    ).toBeInTheDocument();
    expect(onReenabled).toHaveBeenCalledWith({ humanIds: [SARAH, TOM], conversationIds: [] });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets the body scroll rather than squeezing the record list", async () => {
    // jsdom has no layout: this pins the class that stops the flex body
    // shrinking the panel (PanelShell carries min-h-0) under the text below.
    await ready();
    const panel = screen.getByRole("region", { name: "Switched off on this number (2)" });
    expect(panel).toHaveClass("shrink-0");
    expect(panel.parentElement).toHaveClass("overflow-y-auto");
  });

  it("keeps small text on the paper surface at AA contrast", async () => {
    // slate-400 (2.3:1) and slate-500 (4.2:1) fail on #F7EFE6; slate-600 passes.
    await ready();
    const hint = screen.getByText("Write how they gave permission again to switch WhatsApp back on.");
    const helper = screen.getByText(/At least 10 characters\. It’s kept in the audit log/);
    const subtitle = within(screen.getByRole("dialog")).getByText("07700 900123");
    for (const element of [hint, helper, subtitle]) {
      expect(element).toHaveClass("text-slate-600");
      expect(element.className).not.toMatch(/text-slate-(300|400|500)\b/);
    }
  });

  describe("focus", () => {
    const dialog = () => screen.getByRole("dialog", { name: "Switch WhatsApp back on?" });

    it("stays in the dialog while it switches back on", async () => {
      const pending = deferred();
      await ready({}, makeClient({ reenables: [() => pending.promise] }));
      type(NOTE);
      confirm().focus();
      act(() => fireEvent.click(confirm()));
      await screen.findByRole("button", { name: /Switching back on…$/ });
      expect(document.activeElement).toBe(dialog());
      await act(async () => pending.resolve({ data: REENABLED, error: null }));
    });

    it("moves to the message when a submit ends without the form", async () => {
      await ready({}, makeClient({ reenables: [{ data: null, error: { code: "42501", message: "no", details: null } }] }));
      type(NOTE);
      confirm().focus();
      await act(async () => fireEvent.click(confirm()));

      const message = screen.getByText("Only signed-in staff can switch WhatsApp back on. Sign out and back in, then try again.");
      expect(document.activeElement).toBe(message);
      expect(dialog()).toContainElement(document.activeElement);
      await userEvent.tab();
      expect(dialog()).toContainElement(document.activeElement);
    });

    it("moves to the message when someone else switched it back on first", async () => {
      const client = makeClient({
        scopes: [{ data: SCOPE, error: null }, { data: EMPTY, error: null }],
        reenables: [{ data: null, error: { code: "P0001", message: "changed", details: "reenable_scope_changed" } }],
      });
      await ready({}, client);
      type(NOTE);
      confirm().focus();
      await act(async () => fireEvent.click(confirm()));
      expect(document.activeElement).toHaveTextContent("Someone has already switched WhatsApp back on for this number.");
    });

    it("moves to the notice when a submit is refused", async () => {
      const client = makeClient({
        scopes: [{ data: SCOPE, error: null }, { data: { ...SCOPE, last_stop_at: NEW_STOP }, error: null }],
        reenables: [{ data: null, error: { code: "P0001", message: "changed", details: "reenable_scope_changed" } }],
      });
      await ready({}, client);
      type(NOTE);
      confirm().focus();
      await act(async () => fireEvent.click(confirm()));
      expect(document.activeElement).toHaveAttribute("role", "alert");
      expect(document.activeElement).toHaveTextContent(/said STOP again on 14 Oct 2026, 14:32, after you opened this/);
    });

    it("does not pull focus from the note when a STOP shows up on the live list", async () => {
      const view = await ready({ context: "inbox", observedLastStopAt: LAST_STOP });
      note().focus();
      view.rerender(
        <ToastProvider>
          <ReenableWhatsAppDialog
            phone="+447700900123"
            context="inbox"
            observedLastStopAt={NEW_STOP}
            onClose={view.onClose}
            onReenabled={view.onReenabled}
          />
        </ToastProvider>,
      );
      expect(screen.getByText(/has just said STOP again/)).toBeInTheDocument();
      expect(document.activeElement).toBe(note());
    });
  });

  it("explains a refusal that rolled back, and a note the server wanted longer", async () => {
    const client = makeClient({
      reenables: [
        { data: null, error: { code: "P0001", message: "short", details: "permission_note_required" } },
        { data: null, error: { code: "23514", message: "check", details: null } },
      ],
    });
    await ready({}, client);
    type(NOTE);
    await act(async () => fireEvent.click(confirm()));
    expect(await screen.findByText("Add how they gave permission again — at least 10 characters.")).toBeInTheDocument();
    await act(async () => fireEvent.click(confirm()));
    expect(
      await screen.findByText("Couldn’t switch WhatsApp back on. Nothing was changed — give it another go?"),
    ).toBeInTheDocument();
    expect(note()).toHaveValue(NOTE);
  });
});
