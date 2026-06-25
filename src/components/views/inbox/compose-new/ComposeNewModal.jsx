// ============================================================
// src/components/views/inbox/compose-new/ComposeNewModal.jsx
//
// "New message" entry point for the inbox — the missing outbound
// half of the workflow. Two steps:
//
//   1. Pick a customer (search by name / surname / phone / dog name)
//   2. Drop into the existing TemplatePicker with the customer's
//      first name and dog list pre-filled, then send via
//      useWhatsAppInbox.sendOutboundTemplate. The whatsapp-send
//      edge function upserts the conversation by phone_e164 so the
//      outbound message appears in the inbox immediately.
//
// Meta only permits pre-approved templates to start a conversation
// OUTSIDE the 24-hour window. But if the picked customer messaged
// recently they're still INSIDE the window — so we detect any existing
// open-window conversation (findOpenWindowConversation) and route staff
// into that chat to reply free-text, instead of wrongly forcing a
// template. Cold contact (no open window) still uses the TemplatePicker.
// ============================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X, ChevronLeft } from "lucide-react";
import { supabase } from "../../../../supabase/client.js";
import { ModalShell, HeaderIconButton } from "../../../modals/shell/index.js";
import { TemplatePicker } from "../thread/TemplatePicker.jsx";
import { findOpenWindowConversation, windowCountdown } from "../helpers.js";
import { smsSegmentInfo } from "../../../../lib/sms/segments.js";

// Parallel ilike across humans (name / surname / phone) and dogs
// (name), then resolve dogs back to their owner. Mirrors the
// searchHumansByTerm pattern in useHumans but kept local to the
// inbox so this modal doesn't drag the full Humans hook into the
// inbox bundle.
async function searchCustomers(query) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const likeTerm = `%${trimmed}%`;

  const [byName, bySurname, byPhone, dogHits] = await Promise.all([
    supabase.from("humans").select("id, name, surname, phone").ilike("name", likeTerm).limit(10),
    supabase.from("humans").select("id, name, surname, phone").ilike("surname", likeTerm).limit(10),
    supabase.from("humans").select("id, name, surname, phone").ilike("phone", likeTerm).limit(10),
    supabase.from("dogs").select("human_id").ilike("name", likeTerm).limit(20),
  ]);

  // Hydrate the dog→owner rows
  const dogOwnerIds = (dogHits.data ?? []).map((d) => d.human_id).filter(Boolean);
  let dogOwners = [];
  if (dogOwnerIds.length) {
    const { data } = await supabase
      .from("humans")
      .select("id, name, surname, phone")
      .in("id", dogOwnerIds);
    dogOwners = data ?? [];
  }

  // Dedupe by human id; keep first-seen ordering.
  const seen = new Set();
  const merged = [];
  for (const row of [
    ...(byName.data ?? []),
    ...(bySurname.data ?? []),
    ...(byPhone.data ?? []),
    ...dogOwners,
  ]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged.slice(0, 20);
}

async function fetchDogsForHuman(humanId) {
  if (!humanId) return [];
  const { data } = await supabase
    .from("dogs")
    .select("id, name")
    .eq("human_id", humanId)
    .order("name");
  return (data ?? []).map((d) => d.name).filter(Boolean);
}

function SMSComposer({ customerFirstName, dogNames, value, onChange, onSend, sending }) {
  const info = smsSegmentInfo(value);
  const hasText = value.trim().length > 0;
  const firstDog = (dogNames ?? [])[0] ?? "";
  const placeholder = customerFirstName
    ? `Hi ${customerFirstName}${firstDog ? ", just wanted to say " : ", "}…`
    : "Type your SMS…";

  return (
    <div className="flex flex-col gap-2 p-3 bg-sky-50 border border-sky-200 rounded-lg">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5 text-sky-700">📱</span>
        <div className="text-[12px] leading-snug text-sky-900">
          <p className="font-bold">Sending as SMS via Twilio</p>
          <p className="text-sky-800">
            Free-form text — no template gate. Plain text only (no bold,
            italics, or emoji shortcodes). Long messages split into segments,
            each billed separately.
          </p>
        </div>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        maxLength={2000}
        className="w-full text-[14px] p-2 bg-white border border-sky-300 rounded-lg font-[inherit] resize-y"
      />

      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
        <span className="text-sky-900 tabular-nums">
          {info.length} char{info.length === 1 ? "" : "s"} · {info.segments} segment{info.segments === 1 ? "" : "s"} · {info.encoding}
        </span>
        <button
          type="button"
          onClick={onSend}
          disabled={!hasText || sending}
          className="inline-flex items-center h-9 px-4 rounded-full bg-sky-600 text-white text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sky-700 transition-colors font-[inherit]"
        >
          {sending ? "Sending…" : "Send SMS"}
        </button>
      </div>
    </div>
  );
}

// Shown when the picked customer already has a WhatsApp conversation
// inside the 24-hour window. No template needed — route staff into the
// open chat where the normal free-text composer handles the reply.
function WindowOpenPanel({ firstName, countdown, onOpenChat }) {
  return (
    <div className="flex flex-col gap-2.5 p-3 bg-brand-green-50 border border-brand-green-200 rounded-lg">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-0.5">✅</span>
        <div className="text-[12px] leading-snug text-brand-green-800">
          <p className="font-bold">
            {firstName ? `${firstName} is` : "This customer is"} still inside the
            24-hour reply window.
          </p>
          <p>
            You can reply with free text — no template needed.
            {countdown ? ` ${countdown}.` : ""}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenChat}
        className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-brand-green-600 text-white text-[13px] font-bold cursor-pointer hover:bg-brand-green-700 transition-colors font-[inherit]"
      >
        Open chat to reply
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

function CustomerRow({ human, onSelect }) {
  const full = `${human.name ?? ""} ${human.surname ?? ""}`.trim() || "(no name)";
  return (
    <button
      type="button"
      onClick={() => onSelect(human)}
      className="w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-brand-yellow/10 transition-colors cursor-pointer font-[inherit]"
    >
      <div className="text-[13px] font-semibold text-brand-purple">{full}</div>
      {human.phone && (
        <div className="text-[11px] text-slate-500 tabular-nums">{human.phone}</div>
      )}
    </button>
  );
}

export function ComposeNewModal({
  onClose,
  onSent,
  onSentSMS,
  conversations,
  onOpenConversation,
}) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [dogNames, setDogNames] = useState([]);
  const [channel, setChannel] = useState("whatsapp"); // 'whatsapp' | 'sms'
  const [smsText, setSmsText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Debounced search. 250ms feels snappy without hammering the API.
  // controllerRef cancels the prior search when a fresher keystroke
  // arrives, so out-of-order responses can't clobber the visible list.
  const controllerRef = useRef(null);
  useEffect(() => {
    if (selectedHuman) return; // search is paused once we've picked
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const rows = await searchCustomers(query);
        if (!controller.signal.aborted) setResults(rows);
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error("compose-new search:", e);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, selectedHuman]);

  // When a human is picked, fetch their dogs so the TemplatePicker
  // can pre-fill the dog_name_select param (or show a dropdown).
  useEffect(() => {
    if (!selectedHuman) {
      setDogNames([]);
      return;
    }
    let cancelled = false;
    fetchDogsForHuman(selectedHuman.id).then((names) => {
      if (!cancelled) setDogNames(names);
    });
    return () => { cancelled = true; };
  }, [selectedHuman]);

  // Build the synthetic "conversation context" the TemplatePicker
  // wants: customerFirstName + a stable contextKey so the picker's
  // auto-fill effect re-runs when staff picks a different customer.
  const compose = useMemo(() => {
    if (!selectedHuman) return null;
    return {
      customerFirstName: selectedHuman.name ?? "",
      contextKey: `human:${selectedHuman.id}`,
    };
  }, [selectedHuman]);

  // If this customer already has a WhatsApp chat inside the 24-hour
  // window, we skip the template gate and route staff into that chat to
  // reply free-text. (Found from the already-loaded conversation list —
  // an open-window conversation is always an active one.)
  const openConversation = useMemo(
    () => findOpenWindowConversation(conversations, selectedHuman),
    [conversations, selectedHuman],
  );

  const handleSend = useCallback(
    async (template, paramValues) => {
      if (!selectedHuman?.phone) {
        throw new Error("No phone number on file for this customer.");
      }
      setSending(true);
      setError(null);
      try {
        const res = await onSent({
          humanId: selectedHuman.id,
          phoneE164: selectedHuman.phone,
          template,
          paramValues,
        });
        if (!res?.ok) {
          throw new Error(res?.reason ?? "Send failed");
        }
        // Success — let parent close the modal.
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        throw e; // TemplatePicker shows this inline too
      } finally {
        setSending(false);
      }
    },
    [selectedHuman, onSent],
  );

  return (
    <ModalShell
      onClose={() => onClose?.()}
      titleId={titleId}
      accent="var(--color-brand-teal)"
      widthClass="w-[min(560px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      zIndex={50}
      rootClassName="bm-fields"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {selectedHuman && (
              <HeaderIconButton
                label="Back to customer picker"
                onClick={() => { setSelectedHuman(null); setError(null); }}
              >
                <ChevronLeft size={18} strokeWidth={2.5} aria-hidden="true" />
              </HeaderIconButton>
            )}
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                New message
              </span>
              <h2
                id={titleId}
                className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1 truncate"
              >
                {selectedHuman
                  ? `New message to ${selectedHuman.name ?? ""} ${selectedHuman.surname ?? ""}`.trim()
                  : "New WhatsApp message"}
              </h2>
            </div>
          </div>
          <HeaderIconButton label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
    >
        <div>
          {!selectedHuman ? (
            <div className="flex flex-col">
              <div className="px-4 py-3">
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, surname, phone, or dog name…"
                  className="w-full text-[13px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-brand-yellow font-[inherit]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Type at least 2 characters. Meta only lets you send approved templates when starting a thread.
                </p>
              </div>
              {searching && (
                <div className="px-4 pb-2 text-[11px] text-slate-500">Searching…</div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div className="px-4 py-6 text-center text-[12px] text-slate-500">
                  No customers found.
                </div>
              )}
              <div>
                {results.map((h) => (
                  <CustomerRow key={h.id} human={h} onSelect={setSelectedHuman} />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3">
              {!selectedHuman.phone && (
                <div role="alert" className="mb-3 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
                  No phone number on file for this customer. Add one on their profile first, then come back.
                </div>
              )}
              {error && (
                <div role="alert" className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-900">
                  {error}
                </div>
              )}

              {/* Channel toggle. WhatsApp is the default for first contact
                  (cheaper, richer formatting, customer's preferred channel
                  for most under-50s) but SMS is one click away when
                  WhatsApp doesn't apply. */}
              <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
                <div
                  role="radiogroup"
                  aria-label="Send channel"
                  className="inline-flex items-center bg-slate-100 rounded-full p-0.5 gap-0.5"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={channel === "whatsapp"}
                    onClick={() => setChannel("whatsapp")}
                    title="Send via WhatsApp. Meta requires an approved template for first contact."
                    className={[
                      "inline-flex items-center h-7 px-3 rounded-full text-[12px] font-semibold cursor-pointer font-[inherit]",
                      channel === "whatsapp"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "bg-transparent text-slate-600 hover:text-emerald-700",
                    ].join(" ")}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={channel === "sms"}
                    onClick={() => setChannel("sms")}
                    title="Send via SMS (Twilio). Free-form text, no template gate. Each segment ≤ 160 GSM chars; longer messages are billed per segment."
                    className={[
                      "inline-flex items-center h-7 px-3 rounded-full text-[12px] font-semibold cursor-pointer font-[inherit]",
                      channel === "sms"
                        ? "bg-white text-sky-700 shadow-sm"
                        : "bg-transparent text-slate-600 hover:text-sky-700",
                    ].join(" ")}
                  >
                    SMS
                  </button>
                </div>
                <span className="text-[10px] text-slate-500">
                  {channel === "whatsapp"
                    ? "Free for the first 24h after a customer replies; template required for cold contact."
                    : "Twilio-billed per segment (~£0.04 / segment in UK)."}
                </span>
              </div>

              {channel === "whatsapp" ? (
                openConversation ? (
                  <WindowOpenPanel
                    firstName={selectedHuman.name ?? ""}
                    countdown={windowCountdown(openConversation.last_inbound_at)}
                    onOpenChat={() => onOpenConversation?.(openConversation.id)}
                  />
                ) : (
                  <TemplatePicker
                    customerFirstName={compose?.customerFirstName ?? ""}
                    contextKey={compose?.contextKey ?? ""}
                    dogNames={dogNames}
                    onSend={handleSend}
                  />
                )
              ) : (
                <SMSComposer
                  customerFirstName={compose?.customerFirstName ?? ""}
                  dogNames={dogNames}
                  value={smsText}
                  onChange={setSmsText}
                  onSend={async () => {
                    setSending(true);
                    setError(null);
                    try {
                      const res = await onSentSMS?.({
                        humanId: selectedHuman.id,
                        phoneE164: selectedHuman.phone,
                        text: smsText.trim(),
                      });
                      if (!res?.ok) {
                        throw new Error(res?.reason ?? "SMS send failed");
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setSending(false);
                    }
                  }}
                  sending={sending}
                />
              )}

              {sending && (
                <div className="mt-2 text-[11px] text-slate-500">Sending…</div>
              )}
            </div>
          )}
        </div>
    </ModalShell>
  );
}
