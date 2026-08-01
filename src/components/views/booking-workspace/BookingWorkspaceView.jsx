import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Inbox,
  PawPrint,
  RotateCcw,
  UserRound,
} from "lucide-react";

import { DAILY_DOG_CAP } from "../../../constants/salon";
import { canBookSlot, findGroupedSlots } from "../../../engine/capacity";
import { excludeCancelled } from "../../../engine/occupancy";
import { buildSlotGrid } from "../../../engine/slotGrid";
import { isDateOpen } from "../../../engine/utils";
import { useSalon } from "../../../contexts/SalonContext";
import { useWhatsAppInbox } from "../../../supabase/hooks/useWhatsAppInbox.js";
import { PageHeader, PageHeaderPill } from "../../ui/PageHeader.jsx";
import { LoadingSpinner } from "../../ui/LoadingSpinner.jsx";
import { InitialsAvatar } from "../inbox/InitialsAvatar.jsx";
import { formatPhoneForDisplay } from "../../../utils/phone.js";
import { previewMessageText } from "../inbox/thread/messageContent";
import { useCustomerContext } from "../inbox/hooks/useCustomerContext.js";
import { useFillViewportHeight } from "../inbox/hooks/useFillViewportHeight.js";
import {
  buildActiveRequestQueue,
  slotChoiceKey,
  toggleDraftSlot,
} from "./bookingWorkspaceModel.js";
import {
  SAMPLE_BOOKING_WORKSPACE_CONTEXT,
  SAMPLE_BOOKING_WORKSPACE_CONVERSATIONS,
  SAMPLE_BOOKING_WORKSPACE_MESSAGES,
} from "./bookingWorkspaceSamples.js";

const STATUS_STYLE = {
  "Ready to confirm": "text-brand-teal-text bg-emerald-50",
  "Needs reply": "text-brand-coral-text bg-brand-coral-light",
  "Needs details": "text-amber-800 bg-amber-50",
  "Waiting for customer": "text-cyan-800 bg-cyan-50",
};

const MOBILE_TABS = [
  { value: "requests", label: "Requests" },
  { value: "diary", label: "Diary" },
];

function parseDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateStr, options = {}) {
  if (!dateStr) return "";
  return parseDate(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...options,
  });
}

function dogSizeLabel(size) {
  if (!size) return "Size not confirmed";
  return size.charAt(0).toUpperCase() + size.slice(1);
}

function RequestRow({ request, selected, draftCount, onSelect }) {
  const summary = [request.dogName || "Dog details needed", request.serviceLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onSelect(request.id)}
      aria-current={selected ? "true" : undefined}
      className={`relative w-full border-b border-slate-100 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple ${
        selected
          ? "bg-brand-yellow/15 shadow-[inset_4px_0_0_var(--color-brand-yellow)]"
          : "bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <InitialsAvatar
          name={request.customerName}
          seed={request.conversation.human_id || request.conversation.phone_e164 || request.id}
          size={38}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="truncate font-display text-sm font-extrabold text-brand-purple">
              {request.customerName}
            </span>
            <span className="shrink-0 text-micro font-semibold text-slate-500">
              {request.ageLabel}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">
            {summary}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span
              className={`inline-flex min-h-6 items-center rounded-full px-2 text-micro font-bold ${
                STATUS_STYLE[request.status] || "bg-slate-100 text-slate-600"
              }`}
            >
              {request.status}
            </span>
            {draftCount > 0 ? (
              <span className="text-micro font-bold text-brand-teal-text">
                {draftCount} draft time{draftCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          {request.latestMessage ? (
            <div className="mt-2 flex min-w-0 items-center gap-1.5 text-caption text-slate-600">
              <span aria-hidden="true">“</span>
              <span className="truncate">{previewMessageText(request.latestMessage)}</span>
              <span aria-hidden="true">”</span>
            </div>
          ) : null}
        </div>
        <ChevronRight aria-hidden="true" className="mt-3 shrink-0 text-slate-400" size={16} />
      </div>
    </button>
  );
}

function RequestQueue({ requests, selectedId, choicesByRequest, onSelect, loading, error }) {
  if (loading) {
    return <div className="p-5"><LoadingSpinner label="Loading requests…" /></div>;
  }
  if (error) {
    return (
      <div role="alert" className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        Booking requests could not be loaded. Inbox remains available.
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
        <Inbox aria-hidden="true" size={24} className="text-slate-300" />
        <p className="mt-3 text-sm font-bold text-brand-purple">No active appointment requests</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Booking conversations will appear here; general messages stay in Inbox.
        </p>
      </div>
    );
  }
  return (
    <div className="min-h-0 overflow-y-auto">
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          selected={request.id === selectedId}
          draftCount={(choicesByRequest[request.id] || []).length}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function DateStrip({ dates, currentDateStr, daySettings, bookingsByDate, onPickDate }) {
  return (
    <div role="tablist" aria-label="Diary dates" className="grid grid-cols-5 border-y border-slate-200 bg-white">
      {dates.slice(0, 5).map((date) => {
        const active = date.dateStr === currentDateStr;
        const open = isDateOpen(date.dateStr, null, daySettings);
        const count = excludeCancelled(bookingsByDate[date.dateStr] || []).length;
        return (
          <button
            key={date.dateStr}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onPickDate(date.dateObj)}
            className={`min-h-[66px] border-r border-slate-100 px-1 py-2 text-center transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple ${
              active ? "bg-brand-coral-light text-brand-purple" : "hover:bg-slate-50"
            }`}
          >
            <span className="block text-micro font-bold uppercase tracking-wide text-slate-500">
              {date.dateObj.toLocaleDateString("en-GB", { weekday: "short" })}
            </span>
            <span className={`mt-0.5 block font-display text-lg font-black ${active ? "text-brand-coral-text" : "text-brand-purple"}`}>
              {date.dateObj.getDate()}
            </span>
            <span className="mt-0.5 block text-micro font-semibold text-slate-500">
              {open ? `${count} booked` : "Closed"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DiaryPanel({
  request,
  dates,
  currentDateStr,
  daySettings,
  bookingsByDate,
  dailyDogCap,
  choices,
  onToggleChoice,
  onPickDate,
  atLimit,
}) {
  const currentDate = parseDate(currentDateStr);
  const settings = daySettings[currentDateStr] || {};
  const open = isDateOpen(currentDateStr, null, daySettings);
  const activeSlots = useMemo(
    () => buildSlotGrid(settings.extraSlots || []),
    [settings.extraSlots],
  );
  const dayBookings = useMemo(
    () => excludeCancelled(bookingsByDate[currentDateStr] || []),
    [bookingsByDate, currentDateStr],
  );
  const choicesSet = useMemo(
    () => new Set(choices.map(slotChoiceKey)),
    [choices],
  );
  const bookableSlots = useMemo(() => {
    if (!open || !request?.size || !request.dogName) return new Set();
    const allocations = findGroupedSlots(
      [{ id: request.dog?.id || `${request.id}-dog`, size: request.size }],
      dayBookings,
      activeSlots,
      dailyDogCap,
      settings.overrides || {},
    );
    return new Set(
      allocations.flatMap((allocation) =>
        allocation.assignments.map((assignment) => assignment.slot),
      ),
    );
  }, [activeSlots, dailyDogCap, dayBookings, open, request, settings.overrides]);

  function moveDay(delta) {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + delta);
    onPickDate(next);
  }

  return (
    <section aria-labelledby="booking-desk-diary" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex min-h-[62px] items-center justify-between gap-2 px-3 py-2">
        <div>
          <h2 id="booking-desk-diary" className="font-display text-lg font-extrabold text-brand-purple">Diary</h2>
          <p className="text-caption text-slate-500">Read-only · choose up to 3 draft times</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => moveDay(-1)} aria-label="Previous day" className="inline-flex size-11 items-center justify-center rounded-control border border-slate-200 text-brand-purple hover:bg-slate-50">
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <div className="min-w-[128px] text-center font-display text-sm font-extrabold text-brand-purple sm:min-w-[150px]">
            {formatDate(currentDateStr, { year: "numeric" })}
          </div>
          <button type="button" onClick={() => moveDay(1)} aria-label="Next day" className="inline-flex size-11 items-center justify-center rounded-control border border-slate-200 text-brand-purple hover:bg-slate-50">
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <DateStrip
        dates={dates}
        currentDateStr={currentDateStr}
        daySettings={daySettings}
        bookingsByDate={bookingsByDate}
        onPickDate={onPickDate}
      />

      {!request ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-slate-500">
          <PawPrint aria-hidden="true" size={28} className="text-slate-300" />
          <p className="mt-3 text-sm font-bold text-brand-purple">Choose a request first</p>
          <p className="mt-1 text-xs">The diary will then check capacity for that recorded dog size.</p>
        </div>
      ) : !request.size ? (
        <div className="m-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <CircleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          Capacity cannot be checked until the dog has an authoritative size on file.
        </div>
      ) : !open ? (
        <div className="m-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <CalendarDays aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          The salon is closed on this date. Existing appointments remain visible for context.
        </div>
      ) : atLimit ? (
        <div role="status" className="m-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <CircleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          Three draft times are already selected. Remove one before choosing another.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeSlots.map((slot) => {
          const slotBookings = dayBookings.filter((booking) => booking.slot === slot);
          const choice = { dateStr: currentDateStr, slot };
          const selected = choicesSet.has(slotChoiceKey(choice));
          const bookable = bookableSlots.has(slot);
          const capacityCheck = request?.size
            ? canBookSlot(dayBookings, slot, request.size, activeSlots, {
                overrides: settings.overrides?.[slot] || {},
                dogId: request.dog?.id || null,
              })
            : null;
          const disabled = !selected && (!open || !request?.size || !bookable || choices.length >= 3);
          const bookingLabel = slotBookings.length
            ? slotBookings.map((booking) => booking.dogName || "Unknown dog").join(" · ")
            : "Available slot";
          const detailLabel = slotBookings.length
            ? slotBookings.map((booking) => `${booking.breed || booking.size || "Dog"}`).join(" · ")
            : request?.size
              ? "Fits the current request"
              : "Size needed to check";

          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onClick={() => onToggleChoice(choice)}
              aria-pressed={selected}
              title={disabled && capacityCheck?.reason ? capacityCheck.reason : undefined}
              className={`grid min-h-[58px] w-full grid-cols-[58px_minmax(0,1fr)_auto] items-center border-b border-slate-100 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple ${
                selected
                  ? "bg-brand-yellow/15"
                  : bookable && open
                    ? "bg-white hover:bg-cyan-50/60"
                    : "bg-slate-50/70"
              } disabled:cursor-not-allowed`}
            >
              <span className="px-2 text-center font-display text-sm font-extrabold text-brand-purple">{slot}</span>
              <span className="min-w-0 border-l border-slate-100 px-3 py-2">
                <span className={`block truncate text-xs font-bold ${selected ? "text-brand-teal-text" : slotBookings.length ? "text-brand-purple" : bookable ? "text-brand-teal-text" : "text-slate-500"}`}>
                  {selected ? `${formatDate(currentDateStr)} · ${slot}` : bookingLabel}
                </span>
                <span className="mt-0.5 block truncate text-micro text-slate-500">{detailLabel}</span>
              </span>
              <span className="px-3 text-right">
                {selected ? (
                  <span className="inline-flex min-h-7 items-center rounded-full bg-brand-yellow px-2 text-micro font-black text-brand-purple">Draft</span>
                ) : bookable && open ? (
                  <span className="inline-flex min-h-7 items-center rounded-full border border-brand-teal/30 bg-white px-2 text-micro font-bold text-brand-teal-text">Choose</span>
                ) : (
                  <span className="text-micro font-semibold text-slate-400">{open ? "No space" : "Closed"}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DraftOffer({ choices, onClear, compact = false }) {
  return (
    <div className={compact ? "" : "border-t border-slate-200 pt-3"}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-extrabold text-brand-purple">Draft offer ({choices.length})</h3>
          <p className="mt-0.5 text-micro text-slate-500">Not saved or sent</p>
        </div>
        {choices.length > 0 ? (
          <button type="button" onClick={onClear} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-caption font-bold text-brand-teal-text hover:bg-emerald-50">
            <RotateCcw aria-hidden="true" size={13} /> Clear choices
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {choices.length ? choices.map((choice) => (
          <span key={slotChoiceKey(choice)} className="inline-flex min-h-8 items-center rounded-control bg-brand-yellow/20 px-2.5 text-caption font-bold text-brand-purple">
            {formatDate(choice.dateStr)} · {choice.slot}
          </span>
        )) : (
          <span className="text-caption text-slate-500">Choose two or three suitable times from the diary.</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-200 px-4 text-xs font-bold text-slate-500">
          Send options
        </button>
        <span className="text-caption font-semibold text-slate-500">Sending is not enabled yet</span>
      </div>
    </div>
  );
}

function CustomerContext({ request, context, messages, choices, onClear, onOpenInbox }) {
  if (!request) {
    return (
      <section aria-labelledby="booking-desk-context" className="flex flex-1 flex-col items-center justify-center px-6 text-center text-slate-500">
        <UserRound aria-hidden="true" size={28} className="text-slate-300" />
        <h2 id="booking-desk-context" className="mt-3 text-sm font-bold text-brand-purple">Customer & booking</h2>
        <p className="mt-1 text-xs">Select a request to keep the customer, dog and conversation beside the diary.</p>
      </section>
    );
  }

  const dog = context.dogs?.find(
    (candidate) => candidate.id === request.dog?.id || candidate.name === request.dogName,
  ) || context.dogs?.[0] || request.dog || null;
  const latestMessages = [...(messages || [])].slice(-3).reverse();
  const preferred = [request.preferredDay, request.preferredTime].filter(Boolean).join(" ");

  return (
    <section aria-labelledby="booking-desk-context" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <h2 id="booking-desk-context" className="font-display text-lg font-extrabold text-brand-purple">Customer & booking</h2>

        <div className="mt-3 flex items-start gap-3 border-b border-slate-200 pb-3">
          <InitialsAvatar name={request.customerName} seed={request.id} size={46} />
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-extrabold text-brand-purple">{request.customerName}</h3>
            <p className="mt-1 truncate text-caption text-slate-600">{context.human?.email || "No email on file"}</p>
            <p className="mt-1 text-caption text-slate-600">{formatPhoneForDisplay(context.human?.phone || request.conversation.phone_e164)}</p>
          </div>
        </div>

        <div className="border-b border-slate-200 py-3">
          <div className="flex items-start gap-2.5">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-purple/5 text-brand-purple"><PawPrint aria-hidden="true" size={18} /></span>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-extrabold text-brand-purple">{request.dogName || "Dog details needed"}</h3>
              <p className="mt-0.5 text-caption text-slate-600">
                {[dog?.breed, dogSizeLabel(request.size), dog?.age ? `Age ${dog.age}` : null].filter(Boolean).join(" · ")}
              </p>
              {dog?.groomNotes ? <p className="mt-2 text-caption leading-relaxed text-slate-600">{dog.groomNotes}</p> : null}
              {dog?.alerts?.length ? (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-brand-coral-light px-2 py-1.5 text-micro font-semibold text-brand-coral-text">
                  <CircleAlert aria-hidden="true" size={13} className="mt-0.5 shrink-0" />
                  {dog.alerts.join(" · ")}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 py-3">
          <h3 className="text-xs font-extrabold text-brand-purple">Recent messages</h3>
          <div className="mt-2 space-y-2">
            {latestMessages.length ? latestMessages.map((message) => (
              <div key={message.id} className="flex items-start gap-2 text-caption leading-relaxed">
                <span className={`mt-1 size-1.5 shrink-0 rounded-full ${message.direction === "inbound" ? "bg-brand-whatsapp" : "bg-brand-purple-light"}`} />
                <span className="line-clamp-2 flex-1 text-slate-700">{previewMessageText(message.content)}</span>
                <span className="shrink-0 text-micro text-slate-400">{message.direction === "inbound" ? "Customer" : "Staff"}</span>
              </div>
            )) : <p className="text-caption text-slate-500">Open Inbox to read the full conversation.</p>}
          </div>
        </div>

        <div className="border-b border-slate-200 py-3">
          <h3 className="text-xs font-extrabold text-brand-purple">Booking requirement</h3>
          <p className="mt-1 text-caption font-semibold text-slate-700">
            {request.serviceLabel}{preferred ? ` · ${preferred}` : ""}
          </p>
        </div>

        <div className="py-3">
          <DraftOffer choices={choices} onClear={onClear} />
          <button type="button" onClick={onOpenInbox} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full text-caption font-bold text-brand-purple underline decoration-brand-yellow decoration-2 underline-offset-4">
            <Inbox aria-hidden="true" size={14} /> Open in Inbox
          </button>
        </div>
      </div>
    </section>
  );
}

function MobileSelectedRequest({ request, onViewRequests }) {
  if (!request) return null;
  return (
    <div className="flex min-h-[60px] items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <InitialsAvatar name={request.customerName} seed={request.id} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-extrabold text-brand-purple">{request.customerName} · {request.dogName || "Dog details needed"}</p>
        <p className="truncate text-micro font-semibold text-slate-500">{request.serviceLabel} · {request.status}</p>
      </div>
      <button type="button" onClick={onViewRequests} className="inline-flex min-h-10 items-center rounded-control border border-slate-200 px-3 text-caption font-bold text-brand-purple">
        Requests
      </button>
    </div>
  );
}

export function BookingWorkspaceView({
  isOnline,
  dates,
  currentDateStr,
  onPickDate,
  dailyDogCap = DAILY_DOG_CAP,
}) {
  const navigate = useNavigate();
  const salon = useSalon();
  const inbox = useWhatsAppInbox({ includeBookingWorkspaceData: true });
  const rootRef = useRef(null);
  const fillHeight = useFillViewportHeight(rootRef);
  const [offlineSelectedId, setOfflineSelectedId] = useState(null);
  const [mobileTab, setMobileTab] = useState("requests");
  const [choicesByRequest, setChoicesByRequest] = useState({});

  const conversations = isOnline
    ? inbox.conversations
    : SAMPLE_BOOKING_WORKSPACE_CONVERSATIONS;
  const requests = useMemo(
    () => buildActiveRequestQueue(conversations),
    [conversations],
  );
  const selectedId = isOnline ? inbox.selectedId : offlineSelectedId;
  const selectedRequest = requests.find((request) => request.id === selectedId) || null;

  const selectRequest = useCallback((requestId, { openDiary = false } = {}) => {
    if (isOnline) inbox.selectConversation(requestId, { markRead: false });
    else setOfflineSelectedId(requestId);
    if (openDiary) setMobileTab("diary");
  }, [inbox, isOnline]);

  useEffect(() => {
    if (requests.length === 0) return;
    if (selectedId && requests.some((request) => request.id === selectedId)) return;
    selectRequest(requests[0].id);
  }, [requests, selectRequest, selectedId]);

  const liveContext = useCustomerContext(selectedRequest?.conversation.human_id || null);
  const customerContext = isOnline
    ? liveContext
    : SAMPLE_BOOKING_WORKSPACE_CONTEXT[selectedId] || {
        human: null,
        dogs: [],
        lastBooking: null,
        trustedContacts: [],
        loading: false,
        error: null,
      };
  const messages = isOnline
    ? inbox.messages
    : SAMPLE_BOOKING_WORKSPACE_MESSAGES[selectedId] || [];
  const choices = selectedId ? choicesByRequest[selectedId] || [] : [];

  const toggleChoice = useCallback((choice) => {
    if (!selectedId) return;
    setChoicesByRequest((current) => {
      const result = toggleDraftSlot(current[selectedId] || [], choice, 3);
      return result.choices === current[selectedId]
        ? current
        : { ...current, [selectedId]: result.choices };
    });
  }, [selectedId]);

  const clearChoices = useCallback(() => {
    if (!selectedId) return;
    setChoicesByRequest((current) => ({ ...current, [selectedId]: [] }));
  }, [selectedId]);

  const openInbox = useCallback(() => {
    if (!selectedId) return;
    navigate(`/inbox?conversation=${encodeURIComponent(selectedId)}`);
  }, [navigate, selectedId]);

  const diaryProps = {
    request: selectedRequest,
    dates,
    currentDateStr,
    daySettings: salon.daySettings,
    bookingsByDate: salon.bookingsByDate,
    dailyDogCap,
    choices,
    onToggleChoice: toggleChoice,
    onPickDate,
    atLimit: choices.length >= 3,
  };

  return (
    <div
      ref={rootRef}
      style={fillHeight ? { height: `${fillHeight}px` } : undefined}
      className="flex min-h-[60dvh] flex-col gap-3 h-[calc(100dvh-180px)]"
    >
      <PageHeader title="Booking Desk" className="mb-0 shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0">
            <div aria-hidden="true" className="font-display text-xl font-extrabold text-brand-purple">Booking Desk</div>
            <p className="truncate text-caption font-semibold text-slate-500">Requests, diary and booking context together</p>
          </div>
          <PageHeaderPill tone="closed">{requests.length} active request{requests.length === 1 ? "" : "s"}</PageHeaderPill>
        </div>
        <div className="hidden items-center gap-1.5 text-caption font-semibold text-slate-500 sm:flex">
          <Clock3 aria-hidden="true" size={15} /> Draft choices only
        </div>
      </PageHeader>

      <div className="hidden min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-resting lg:grid lg:grid-cols-[minmax(225px,0.82fr)_minmax(410px,1.45fr)_minmax(270px,1fr)]">
        <section aria-labelledby="booking-desk-requests" className="flex min-h-0 flex-col border-r border-slate-200">
          <div className="flex min-h-[62px] items-center justify-between px-3 py-2">
            <div>
              <h2 id="booking-desk-requests" className="font-display text-lg font-extrabold text-brand-purple">Requests</h2>
              <p className="text-caption text-slate-500">Active appointment conversations</p>
            </div>
            <span className="text-xs font-bold text-slate-500">{requests.length} active</span>
          </div>
          <RequestQueue
            requests={requests}
            selectedId={selectedId}
            choicesByRequest={choicesByRequest}
            onSelect={selectRequest}
            loading={isOnline && inbox.loadingList}
            error={isOnline ? inbox.listError : null}
          />
        </section>

        <div className="flex min-h-0 flex-col border-r border-slate-200">
          <DiaryPanel {...diaryProps} />
        </div>

        <div className="flex min-h-0 flex-col">
          <CustomerContext
            request={selectedRequest}
            context={customerContext}
            messages={messages}
            choices={choices}
            onClear={clearChoices}
            onOpenInbox={openInbox}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-resting lg:hidden">
        <div role="tablist" aria-label="Booking Desk views" className="grid shrink-0 grid-cols-2 border-b border-slate-200 bg-white">
          {MOBILE_TABS.map((tab) => {
            const active = mobileTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileTab(tab.value)}
                className={`min-h-12 border-b-[3px] text-sm font-extrabold transition-colors ${active ? "border-brand-coral text-brand-purple" : "border-transparent text-slate-500"}`}
              >
                {tab.label}{tab.value === "requests" ? ` (${requests.length})` : ""}
              </button>
            );
          })}
        </div>

        {mobileTab === "requests" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RequestQueue
              requests={requests}
              selectedId={selectedId}
              choicesByRequest={choicesByRequest}
              onSelect={(id) => selectRequest(id, { openDiary: true })}
              loading={isOnline && inbox.loadingList}
              error={isOnline ? inbox.listError : null}
            />
            {selectedRequest ? (
              <div className="border-t-4 border-brand-paper">
                <CustomerContext
                  request={selectedRequest}
                  context={customerContext}
                  messages={messages}
                  choices={choices}
                  onClear={clearChoices}
                  onOpenInbox={openInbox}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <MobileSelectedRequest request={selectedRequest} onViewRequests={() => setMobileTab("requests")} />
            <DiaryPanel {...diaryProps} />
            <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-5px_20px_rgba(45,0,75,0.08)]">
              <DraftOffer choices={choices} onClear={clearChoices} compact />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
