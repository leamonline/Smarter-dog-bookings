// Smoke-level tests for HumanCardModal. The component is 972 LoC with
// 21+ useState; this test locks the entry-point behaviour ahead of
// the planned extraction (HumanForm / HumanBookingHistorySection /
// TrustedContactsEditor / DogPillList).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";
import { BOOKING_STATUS } from "../../constants/index";

// Offline (undefined) for every test but the readback one, which hands the
// real updateHuman a stub client.
vi.mock("../../supabase/client", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumanCardModal;
  },
}));

const trustedRelationshipMocks = vi.hoisted(() => ({
  fetchTrustedContactsForHuman: vi.fn().mockResolvedValue({
    trustedContacts: [],
    trustedIds: [],
  }),
  fetchTrustedOwnerIdsForHuman: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../supabase/hooks/humans/useTrustedContacts", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTrustedContactsForHuman:
    trustedRelationshipMocks.fetchTrustedContactsForHuman,
  fetchTrustedOwnerIdsForHuman:
    trustedRelationshipMocks.fetchTrustedOwnerIdsForHuman,
}));

const { HumanCardModal } = await import("./HumanCardModal.jsx");
const { useHumanMutations } = await import("../../supabase/hooks/humans/useHumanMutations");
const { useHumanLifecycle } = await import("../../supabase/hooks/humans/useHumanLifecycle");

// A completed booking owned by human-1, dated well in the past so it always
// counts as a "last visit" regardless of when the suite runs.
const pastBooking = {
  id: "booking-1",
  _ownerId: "human-1",
  _dogId: "dog-1",
  dogName: "Rex",
  owner: "Sarah Jones",
  service: "full-groom",
  status: BOOKING_STATUS.COMPLETED,
  size: "small",
};
const bookingsWithHistory = { "2020-01-01": [pastBooking] };

const human = {
  id: "human-1",
  fullName: "Sarah Jones",
  name: "Sarah",
  surname: "Jones",
  phone: "07700 900111",
  sms: true,
  whatsapp: true,
  email: "sarah@example.com",
  fb: "",
  insta: "",
  tiktok: "",
  address: "",
  notes: "",
  historyFlag: "",
  reminderHours: 24,
  reminderChannels: ["whatsapp"],
  trustedIds: [],
  trustedContacts: [],
};

function renderModal(overrides = {}) {
  const onClose = vi.fn();
  const props = {
    humanId: "human-1",
    onClose,
    onOpenHuman: vi.fn(),
    onOpenDog: vi.fn(),
    humans: { "Sarah Jones": human },
    dogs: {},
    onUpdateHuman: vi.fn(),
    onAddHuman: vi.fn(),
    onDeleteHuman: vi.fn(),
    bookingsByDate: {},
    fetchHumanById: vi.fn(() => Promise.resolve(null)),
    findHumanByFullName: vi.fn(() => null),
    searchHumansByTerm: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
  const result = render(
    <ToastProvider>
      <HumanCardModal {...props} />
    </ToastProvider>,
  );
  return { ...result, onClose, props };
}

describe("HumanCardModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trustedRelationshipMocks.fetchTrustedContactsForHuman.mockResolvedValue({
      trustedContacts: [],
      trustedIds: [],
    });
    trustedRelationshipMocks.fetchTrustedOwnerIdsForHuman.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the full name and phone number in the header", () => {
    renderModal();
    expect(screen.getByText("Sarah Jones")).toBeInTheDocument();
    // Phone is rendered both as the visible link text and in the
    // copy-to-clipboard aria label.
    expect(
      screen.getByRole("link", { name: "07700 900111" }),
    ).toBeInTheDocument();
  });

  it("Close button fires onClose", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("entering edit mode reveals first-name + surname inputs prefilled with the current values", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByPlaceholderText("First name")).toHaveValue("Sarah");
    expect(screen.getByPlaceholderText("Surname")).toHaveValue("Jones");
  });

  it("copy-phone button calls navigator.clipboard.writeText with the phone number", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    renderModal();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy phone number 07700 900111" }),
    );
    expect(writeText).toHaveBeenCalledWith("07700 900111");
  });

  it("clicking a booking-history row calls onOpenBooking with the booking id", () => {
    const onOpenBooking = vi.fn();
    renderModal({ bookingsByDate: bookingsWithHistory, onOpenBooking });
    fireEvent.click(
      screen.getByRole("button", { name: "Open booking on 2020-01-01 for Rex" }),
    );
    expect(onOpenBooking).toHaveBeenCalledWith("booking-1");
  });

  it("the Last visit tile opens the most recent booking via onOpenBooking", () => {
    const onOpenBooking = vi.fn();
    renderModal({ bookingsByDate: bookingsWithHistory, onOpenBooking });
    fireEvent.click(screen.getByRole("button", { name: "Open most recent visit" }));
    expect(onOpenBooking).toHaveBeenCalledWith("booking-1");
  });

  it("the Bookings tile scrolls the history section into view", () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderModal({ bookingsByDate: bookingsWithHistory });
    fireEvent.click(
      screen.getByRole("button", { name: "See all bookings (1 lifetime)" }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("the Send message overflow item calls onSendMessage with the human id", () => {
    const onSendMessage = vi.fn();
    renderModal({ onSendMessage });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Send message" }));
    expect(onSendMessage).toHaveBeenCalledWith("human-1");
  });

  it("shows a Book now affordance when there's no next appointment", () => {
    const onNewBookingForHuman = vi.fn();
    renderModal({ onNewBookingForHuman });
    fireEvent.click(
      screen.getByRole("button", { name: "Book a new appointment for this human" }),
    );
    expect(onNewBookingForHuman).toHaveBeenCalledWith("human-1");
  });

  it("the Notes empty state offers Add a note and jumps into edit mode", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    // Edit mode is now active with the notes textarea available to type into.
    expect(screen.getByLabelText("General notes")).toBeInTheDocument();
  });

  it("header shows call + WhatsApp actions, WhatsApp only when whatsapp is on", () => {
    renderModal();
    expect(
      screen.getByRole("link", { name: "Call 07700 900111" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Message 07700 900111 on WhatsApp" }),
    ).toBeInTheDocument();
  });

  it("hides the WhatsApp action when whatsapp is off but keeps the call action", () => {
    renderModal({
      humans: { "Sarah Jones": { ...human, whatsapp: false } },
    });
    expect(
      screen.queryByRole("link", { name: /WhatsApp/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Call 07700 900111" }),
    ).toBeInTheDocument();
  });

  it("contact-row copy buttons copy the value to the clipboard", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    renderModal({
      humans: {
        "Sarah Jones": { ...human, address: "1 Dog Lane", email: "sarah@example.com" },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    expect(writeText).toHaveBeenCalledWith("1 Dog Lane");
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(writeText).toHaveBeenCalledWith("sarah@example.com");
  });

  it("Book again on a history row calls onBookAgain with that booking", () => {
    const onBookAgain = vi.fn();
    renderModal({ bookingsByDate: bookingsWithHistory, onBookAgain });
    fireEvent.click(screen.getByRole("button", { name: "Book Rex again" }));
    expect(onBookAgain).toHaveBeenCalledTimes(1);
    expect(onBookAgain.mock.calls[0][0]).toMatchObject({
      _dogId: "dog-1",
      service: "full-groom",
    });
  });

  it("shows a dog whose owner selected this person as a trusted human", async () => {
    const andy = {
      ...human,
      id: "trusted-1",
      fullName: "Andy",
      name: "Andy",
      surname: "",
      trustedContacts: [],
      trustedIds: [],
    };
    const ruby = {
      id: "ruby-1",
      name: "Ruby",
      breed: "Miniature Schnauzer",
      size: "small",
      _humanId: "owner-1",
      humanId: "Ruby Owner",
    };
    trustedRelationshipMocks.fetchTrustedOwnerIdsForHuman.mockResolvedValueOnce([
      "owner-1",
    ]);

    renderModal({
      humanId: andy.id,
      humans: { Andy: andy },
      dogs: {},
      dogsByHumanId: { "owner-1": [ruby] },
      ensureDogsForHumans: vi.fn().mockResolvedValue(undefined),
    });

    expect(await screen.findByText("Ruby")).toBeInTheDocument();
    expect(screen.getByText(/Trusted to drop off/i)).toBeInTheDocument();
    expect(screen.queryByText(/No dogs linked yet/i)).not.toBeInTheDocument();
  });

  it("links this person to a dog with one owner-to-trusted relationship", async () => {
    const andy = {
      ...human,
      id: "trusted-1",
      fullName: "Andy",
      name: "Andy",
      surname: "",
      trustedContacts: [],
      trustedIds: [],
    };
    const owner = {
      ...human,
      id: "owner-1",
      fullName: "Ruby Owner",
      name: "Ruby",
      surname: "Owner",
      trustedContacts: [],
      trustedIds: [],
    };
    const ruby = {
      id: "ruby-1",
      name: "Ruby",
      breed: "Miniature Schnauzer",
      size: "small",
      _humanId: owner.id,
      humanId: owner.fullName,
    };
    const onUpdateHuman = vi.fn().mockResolvedValue({ id: owner.id });

    renderModal({
      humanId: andy.id,
      humans: { Andy: andy, "Ruby Owner": owner },
      dogs: { Ruby: ruby },
      dogsByHumanId: { [owner.id]: [ruby] },
      ensureDogsForHumans: vi.fn().mockResolvedValue(undefined),
      onUpdateHuman,
    });

    fireEvent.click(screen.getByRole("button", { name: "Link to a dog" }));
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search for a dog to link this person to",
      }),
      { target: { value: "Ruby" } },
    );
    const rubyResult = await screen.findByText("Ruby");
    fireEvent.click(rubyResult.closest("button"));

    expect(await screen.findByText("Linked Andy to Ruby")).toBeInTheDocument();
    expect(onUpdateHuman).toHaveBeenCalledTimes(1);
    expect(onUpdateHuman).toHaveBeenCalledWith("Ruby Owner", {
      trustedContacts: [{ id: "trusted-1", relationship: "" }],
    });
    expect(await screen.findByText("Ruby")).toBeInTheDocument();
  });

  it("Archive asks for confirmation before calling onArchiveHuman", () => {
    const onArchiveHuman = vi.fn(() => Promise.resolve({ id: "human-1" }));
    renderModal({ onArchiveHuman });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    // Confirm dialog is shown; the handler hasn't fired yet.
    expect(screen.getByText("Archive this person?")).toBeInTheDocument();
    expect(onArchiveHuman).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchiveHuman).toHaveBeenCalledWith("human-1");
  });

  // Regression: deep-linking / refreshing straight to /humans/<uuid> for a
  // human whose row sits past the directory's PAGE_SIZE boundary used to leave
  // the card stuck on "Unnamed human / No phone". The map never holds that row
  // at first paint, and the modal threw away fetchHumanById's return value —
  // it relied on the shared map eventually catching up, which on a quiet boot
  // never re-triggered. The card must now hydrate from the fetched row itself,
  // exactly as clicking the same person from the directory does.
  describe("deep-link hydration", () => {
    const deepLinked = {
      ...human,
      id: "human-far-page",
      fullName: "Hazel Wagschal",
      name: "Hazel",
      surname: "Wagschal",
      phone: "07826 094636",
    };

    it("hydrates from fetchHumanById when the human isn't in the humans map", async () => {
      const fetchHumanById = vi.fn(() => Promise.resolve(deepLinked));
      renderModal({
        humanId: "human-far-page",
        humans: {}, // past the paginated window — not in the shared map
        fetchHumanById,
      });

      // First paint: nothing to resolve yet, so the placeholder shows.
      expect(screen.getByText("Unnamed human")).toBeInTheDocument();

      // Once the on-demand fetch lands the card hydrates from the returned
      // row, even though the shared humans map was never updated.
      expect(await screen.findByText("Hazel Wagschal")).toBeInTheDocument();
      expect(fetchHumanById).toHaveBeenCalledWith("human-far-page");
      expect(
        screen.getByRole("link", { name: "07826 094636" }),
      ).toBeInTheDocument();
    });

    it("prefers the live map entry over an on-demand fetch when present", async () => {
      const fetchHumanById = vi.fn(() => Promise.resolve(deepLinked));
      // The same id is already in the map (e.g. opened from the directory):
      // the card resolves it synchronously and never needs the fetch.
      renderModal({
        humanId: "human-far-page",
        humans: { "Hazel Wagschal": deepLinked },
        fetchHumanById,
      });

      expect(screen.getByText("Hazel Wagschal")).toBeInTheDocument();
      await waitFor(() => expect(fetchHumanById).not.toHaveBeenCalled());
    });
  });
});

describe("HumanCardModal — WhatsApp switched off", () => {
  const STOP = "2026-10-03T13:05:00.123456+00:00";
  const stoppedHuman = {
    ...human,
    whatsappOptedOut: true,
    whatsappOptedOutAt: STOP,
    whatsappOptedOutReason: "asked_on_whatsapp",
  };

  afterEach(() => {
    globalThis.__supabaseMockHumanCardModal = undefined;
  });

  it("leads with the notice, badges the header and hides the WA link", () => {
    renderModal({ humans: { "Sarah Jones": stoppedHuman } });
    const notice = screen.getByText("WhatsApp is off — they said STOP.").closest('[role="status"]');
    const glance = screen.getByRole("group", { name: "At a glance" });
    expect(notice.compareDocumentPosition(glance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice).toHaveTextContent("On 3 Oct 2026, 14:05.");
    expect(screen.getByRole("button", { name: "Switch WhatsApp back on…" })).toBeInTheDocument();
    expect(screen.getByText("WhatsApp stopped")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message 07700 900111 on WhatsApp" })).toBeNull();
  });

  it("keeps the notice through a save of something else", async () => {
    // The real updateHuman, reading back the row the database would return.
    // (The event timeline subscribes to realtime once a client exists.)
    const payloads = [];
    const channel = { on: () => channel, subscribe: () => channel };
    globalThis.__supabaseMockHumanCardModal = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      from: vi.fn(() => {
        const builder = {};
        let payload;
        builder.update = vi.fn((value) => {
          payload = value;
          payloads.push(value);
          return builder;
        });
        builder.eq = vi.fn(() => builder);
        builder.select = vi.fn(() => builder);
        builder.single = vi.fn(async () => ({
          data: {
            id: "human-1",
            name: "Sarah",
            surname: "Jones",
            phone: "07700 900111",
            sms: true,
            whatsapp: true,
            // Differs from the cached entry, so the test can tell when the
            // readback (not just the optimistic patch) has landed.
            email: "sarah.jones@example.com",
            whatsapp_opted_out: true,
            whatsapp_opted_out_at: STOP,
            whatsapp_opted_out_reason: "asked_on_whatsapp",
            ...payload,
          },
          error: null,
        }));
        return builder;
      }),
    };

    function Harness() {
      const [humans, setHumans] = useState({ "Sarah Jones": stoppedHuman });
      const [humansById, setHumansById] = useState({ "human-1": stoppedHuman });
      const { updateHuman } = useHumanMutations({
        humans,
        humansById,
        setHumans,
        setHumansById,
        setError: () => {},
        setTotalCount: () => {},
        replaceTrustedLinks: vi.fn(),
      });
      return (
        <HumanCardModal
          humanId="human-1"
          onClose={vi.fn()}
          humans={humans}
          dogs={{}}
          bookingsByDate={{}}
          onUpdateHuman={updateHuman}
          fetchHumanById={vi.fn(() => Promise.resolve(null))}
          findHumanByFullName={vi.fn(() => null)}
          searchHumansByTerm={vi.fn(() => Promise.resolve([]))}
        />
      );
    }

    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "SMS reminders active" }));

    expect(await screen.findByText("sarah.jones@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SMS reminders off" })).toBeInTheDocument();
    expect(payloads).toEqual([{ sms: false }]);
    expect(screen.getByText("WhatsApp is off — they said STOP.")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp stopped")).toBeInTheDocument();
  });

  it("clears the notice, the badge and the hidden WA link once WhatsApp is back on", async () => {
    // The real dialog, hook and repository against a stub client, and the
    // real cache patch (useHumanLifecycle.markWhatsappReenabled) the app
    // wires in through StaffModals: nothing but the RPC answers is faked.
    const rpcCalls = [];
    const channel = { on: () => channel, subscribe: () => channel };
    const anyQuery = () => {
      const builder = {};
      for (const method of ["select", "eq", "in", "is", "order", "limit", "gte", "lte", "neq", "or"]) {
        builder[method] = () => builder;
      }
      builder.single = async () => ({ data: null, error: null });
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.then = (onResolve, onReject) => Promise.resolve({ data: [], error: null }).then(onResolve, onReject);
      return builder;
    };
    globalThis.__supabaseMockHumanCardModal = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      from: vi.fn(anyQuery),
      rpc: vi.fn(async (fn, params) => {
        rpcCalls.push([fn, params]);
        if (fn === "staff_whatsapp_number_opt_out_scope") {
          return {
            data: {
              phone_key: "7700900111",
              number_stopped_at: STOP,
              last_stop_at: STOP,
              records: [
                { id: "11111111-1111-4111-8111-111111111111", name: "Sarah Jones", phone: "07700 900111", reason: "asked_on_whatsapp", opted_out_at: STOP },
              ],
            },
            error: null,
          };
        }
        if (fn === "staff_reenable_whatsapp_number") {
          return {
            data: {
              phone_key: "7700900111",
              human_ids: ["11111111-1111-4111-8111-111111111111"],
              conversation_ids: [],
              audit_id: "44444444-4444-4444-8444-444444444444",
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
    };
    const sarah = { ...stoppedHuman, id: "11111111-1111-4111-8111-111111111111" };
    const reenabled = [];

    function Harness() {
      const [humans, setHumans] = useState({ "Sarah Jones": sarah });
      const [, setHumansById] = useState({ [sarah.id]: sarah });
      const [, setDirectoryHumans] = useState([sarah]);
      const { markWhatsappReenabled } = useHumanLifecycle({
        setHumans,
        setHumansById,
        setTotalCount: () => {},
        setDirectoryHumans,
      });
      return (
        <HumanCardModal
          humanId={sarah.id}
          onClose={vi.fn()}
          humans={humans}
          dogs={{}}
          bookingsByDate={{}}
          onUpdateHuman={vi.fn()}
          fetchHumanById={vi.fn(() => Promise.resolve(null))}
          findHumanByFullName={vi.fn(() => null)}
          searchHumansByTerm={vi.fn(() => Promise.resolve([]))}
          onWhatsappReenabled={(ids) => {
            reenabled.push(ids);
            markWhatsappReenabled(ids);
          }}
        />
      );
    }

    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    expect(screen.queryByRole("link", { name: "Message 07700 900111 on WhatsApp" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch WhatsApp back on…" }));
    fireEvent.change(await screen.findByLabelText("How and when did they give permission again?"), {
      target: { value: "Rang the salon on 14 Oct and asked for reminders again." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch WhatsApp back on" }));

    expect(await screen.findByText("WhatsApp is back on for 07700 900111.")).toBeInTheDocument();
    expect(reenabled).toEqual([["11111111-1111-4111-8111-111111111111"]]);
    // (The cancellation history panel makes its own read once a client exists.)
    expect(rpcCalls.map(([fn]) => fn).filter((fn) => fn.includes("whatsapp"))).toEqual([
      "staff_whatsapp_number_opt_out_scope",
      "staff_reenable_whatsapp_number",
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Switch WhatsApp back on?" })).toBeNull());
    expect(screen.queryByText("WhatsApp is off — they said STOP.")).toBeNull();
    expect(screen.queryByText("WhatsApp stopped")).toBeNull();
    expect(screen.getByRole("link", { name: "Message 07700 900111 on WhatsApp" })).toBeInTheDocument();
  });

  it("keeps a record that moved off the number shown as switched off", async () => {
    // The record's number changed while the dialog was open, so the re-read
    // no longer lists it; but nothing switched it back on (no audit row), so
    // it is still opted out. Absence is never read as "back on": the notice,
    // the badge and the hidden WA link all stay.
    const SARAH_ID = "11111111-1111-4111-8111-111111111111";
    const scopeAnswers = [
      {
        phone_key: "7700900111",
        number_stopped_at: STOP,
        last_stop_at: STOP,
        records: [{ id: SARAH_ID, name: "Sarah Jones", phone: "07700 900111", reason: "asked_on_whatsapp", opted_out_at: STOP }],
      },
      { phone_key: "7700900111", number_stopped_at: STOP, last_stop_at: STOP, records: [] },
    ];
    const auditReads = [];
    const channel = { on: () => channel, subscribe: () => channel };
    const anyQuery = (table) => {
      const builder = {};
      for (const method of ["select", "eq", "in", "is", "order", "limit", "gt", "gte", "lte", "neq", "or"]) {
        builder[method] = () => builder;
      }
      builder.single = async () => ({ data: null, error: null });
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.then = (onResolve, onReject) => {
        if (table === "whatsapp_opt_out_reenables") auditReads.push(table);
        return Promise.resolve({ data: [], error: null }).then(onResolve, onReject);
      };
      return builder;
    };
    globalThis.__supabaseMockHumanCardModal = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      from: vi.fn(anyQuery),
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { user: { id: "99999999-9999-4999-8999-999999999999" } } },
          error: null,
        })),
      },
      rpc: vi.fn(async (fn) => {
        if (fn === "staff_whatsapp_number_opt_out_scope") {
          return { data: scopeAnswers.length > 1 ? scopeAnswers.shift() : scopeAnswers[0], error: null };
        }
        if (fn === "staff_reenable_whatsapp_number") {
          return { data: null, error: { code: "P0001", message: "changed", details: "reenable_scope_changed" } };
        }
        return { data: null, error: null };
      }),
    };
    const sarah = { ...stoppedHuman, id: SARAH_ID };
    const reenabled = [];

    function Harness() {
      const [humans, setHumans] = useState({ "Sarah Jones": sarah });
      const [, setHumansById] = useState({ [sarah.id]: sarah });
      const [, setDirectoryHumans] = useState([sarah]);
      const { markWhatsappReenabled } = useHumanLifecycle({
        setHumans,
        setHumansById,
        setTotalCount: () => {},
        setDirectoryHumans,
      });
      return (
        <HumanCardModal
          humanId={sarah.id}
          onClose={vi.fn()}
          humans={humans}
          dogs={{}}
          bookingsByDate={{}}
          onUpdateHuman={vi.fn()}
          fetchHumanById={vi.fn(() => Promise.resolve(null))}
          findHumanByFullName={vi.fn(() => null)}
          searchHumansByTerm={vi.fn(() => Promise.resolve([]))}
          onWhatsappReenabled={(ids) => {
            reenabled.push(ids);
            markWhatsappReenabled(ids);
          }}
        />
      );
    }

    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch WhatsApp back on…" }));
    fireEvent.change(await screen.findByLabelText("How and when did they give permission again?"), {
      target: { value: "Rang the salon on 14 Oct and asked for reminders again." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch WhatsApp back on" }));

    expect(
      await screen.findByText(
        /Sarah Jones isn’t switched off on this number any more, but WhatsApp hasn’t been switched back on for them\./,
      ),
    ).toBeInTheDocument();
    expect(auditReads.length).toBeGreaterThan(0);
    expect(reenabled).toEqual([]);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Switch WhatsApp back on?" })).getAllByRole("button", { name: "Close" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Switch WhatsApp back on?" })).toBeNull());

    expect(screen.getByText("WhatsApp is off — they said STOP.")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp stopped")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message 07700 900111 on WhatsApp" })).toBeNull();
  });
});
