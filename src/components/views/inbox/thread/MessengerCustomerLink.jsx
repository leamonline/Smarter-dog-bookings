// Staff link a Messenger thread to a customer. Nothing here matches a
// phone number, and a Facebook profile name is not a search key.

import { useState } from "react";

export function MessengerCustomerLink({
  linkedName = "",
  onSearch,
  onLink,
  busy = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  async function search(event) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Type at least two letters of the customer's name.");
      setHits([]);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const rows = await onSearch(trimmed);
      setHits(Array.isArray(rows) ? rows : []);
      if (!rows?.length) setError("No customer matched that name.");
    } catch (err) {
      setHits([]);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function choose(humanId) {
    setError("");
    const result = await onLink(humanId);
    if (!result?.ok) {
      setError(result?.reason || "Could not link this customer");
      return;
    }
    setOpen(false);
    setQuery("");
    setHits([]);
  }

  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-slate-600">
        {linkedName ? `Linked to ${linkedName}` : "Messenger · not linked to a customer"}
      </div>
      {!linkedName && (
        <button
          type="button"
          className="mt-0.5 text-xs font-bold text-brand-ink underline-offset-2 hover:underline"
          onClick={() => setOpen((value) => !value)}
        >
          Link to customer
        </button>
      )}
      {open && (
        <form onSubmit={search} className="mt-1 flex flex-col gap-1">
          <p className="m-0 text-xs leading-snug text-slate-500">
            Search by name. This chat is not matched to a phone number.
          </p>
          <div className="flex gap-1">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search customers to link"
              className="h-8 min-w-0 flex-1 rounded-control border border-slate-300 px-2 text-xs"
              disabled={busy || searching}
            />
            <button
              type="submit"
              className="h-8 rounded-full bg-brand-ink px-2 text-xs font-bold text-white disabled:opacity-50"
              disabled={busy || searching}
            >
              Search
            </button>
          </div>
          {error && <p className="m-0 text-xs text-red-700">{error}</p>}
          <ul className="m-0 list-none p-0">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="w-full truncate py-1 text-left text-xs font-semibold text-brand-ink hover:underline"
                  onClick={() => choose(hit.id)}
                  disabled={busy}
                >
                  {[hit.name, hit.surname].filter(Boolean).join(" ") || "Unnamed customer"}
                </button>
              </li>
            ))}
          </ul>
        </form>
      )}
    </div>
  );
}
