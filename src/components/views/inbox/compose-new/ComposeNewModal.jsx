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
// outside the 24-hour window — which always applies here because
// there's no inbound history. The TemplatePicker enforces that;
// this modal just wraps it.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../../supabase/client.js";
import { TemplatePicker } from "../thread/TemplatePicker.jsx";

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

export function ComposeNewModal({ onClose, onSent }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [dogNames, setDogNames] = useState([]);
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
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Compose new WhatsApp message"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-brand-paper">
          <div className="flex items-center gap-2">
            {selectedHuman && (
              <button
                type="button"
                onClick={() => { setSelectedHuman(null); setError(null); }}
                aria-label="Back to customer picker"
                className="text-brand-purple w-7 h-7 rounded-full hover:bg-brand-purple/10 transition-colors text-[16px]"
              >
                ←
              </button>
            )}
            <h2 className="text-[15px] font-bold font-display text-brand-purple m-0">
              {selectedHuman
                ? `New message to ${selectedHuman.name ?? ""} ${selectedHuman.surname ?? ""}`.trim()
                : "New WhatsApp message"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-700 w-7 h-7 rounded-full hover:bg-slate-100 transition-colors text-[16px] cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
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
              <TemplatePicker
                customerFirstName={compose?.customerFirstName ?? ""}
                contextKey={compose?.contextKey ?? ""}
                dogNames={dogNames}
                onSend={handleSend}
              />
              {sending && (
                <div className="mt-2 text-[11px] text-slate-500">Sending…</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
