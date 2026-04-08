import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { toDateStr } from "../../supabase/transforms.js";

const SERVICE_LABELS = {
  "full-groom": "Full Groom",
  "bath-and-brush": "Bath & Brush",
  "bath-and-deshed": "Bath & Deshed",
  "puppy-groom": "Puppy Groom",
  "nail-trim": "Nail Trim",
};

const SERVICE_ICONS = {
  "full-groom": "\u2702\uFE0F",
  "bath-and-brush": "\uD83D\uDEC1",
  "bath-and-deshed": "\uD83E\uDDF9",
  "puppy-groom": "\uD83D\uDC3E",
  "nail-trim": "\u2702\uFE0F",
};

const STATUS_COLOURS = {
  "Not Arrived": { bg: "bg-amber-100", text: "text-amber-800" },
  "Checked In": { bg: "bg-emerald-100", text: "text-emerald-800" },
  "In the Bath": { bg: "bg-blue-100", text: "text-blue-800" },
  "Drying": { bg: "bg-indigo-100", text: "text-indigo-800" },
  "On the Table": { bg: "bg-violet-100", text: "text-violet-800" },
  "Finished": { bg: "bg-emerald-100", text: "text-emerald-800" },
  "Completed": { bg: "bg-slate-100", text: "text-slate-700" },
  "Cancelled": { bg: "bg-red-100", text: "text-red-800" },
  "No Show": { bg: "bg-orange-100", text: "text-orange-800" },
};

function formatSlot(slot) {
  const [h, m] = slot.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, "0")}${suffix}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function CustomerDashboard({ humanRecord, onSignOut }) {
  const navigate = useNavigate();
  const [dogs, setDogs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [trustedHumans, setTrustedHumans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [olderBookings, setOlderBookings] = useState([]);
  const [hasMorePast, setHasMorePast] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOther, setCancelOther] = useState("");
  const [details, setDetails] = useState({
    name: humanRecord?.name || "",
    surname: humanRecord?.surname || "",
    address: humanRecord?.address || "",
    email: humanRecord?.email || "",
    whatsapp: humanRecord?.whatsapp || false,
    fb: humanRecord?.fb || "",
    insta: humanRecord?.insta || "",
    tiktok: humanRecord?.tiktok || "",
  });

  const humanName = `${humanRecord?.name || ""} ${humanRecord?.surname || ""}`.trim();

  // Fetch dogs, bookings, trusted humans
  useEffect(() => {
    if (!supabase || !humanRecord?.id) { setLoading(false); return; }

    async function fetchData() {
      const { data: dogRows } = await supabase
        .from("dogs")
        .select("*")
        .eq("human_id", humanRecord.id)
        .order("name");
      setDogs(dogRows || []);

      const dogIds = (dogRows || []).map(d => d.id);
      if (dogIds.length > 0) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 180); // 6 months
        const pastStr = toDateStr(pastDate);

        const { data: bookingRows } = await supabase
          .from("bookings")
          .select("*, dogs(name, breed, size)")
          .in("dog_id", dogIds)
          .gte("booking_date", pastStr)
          .order("booking_date", { ascending: false })
          .order("slot", { ascending: false });
        setBookings(bookingRows || []);

        // Check if there's anything older (beyond 6 months)
        const { count } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("dog_id", dogIds)
          .lt("booking_date", pastStr);
        setHasMorePast((count || 0) > 0);
      }

      const { data: trustedLinks } = await supabase
        .from("human_trusted_contacts")
        .select("trusted_id, humans!human_trusted_contacts_trusted_id_fkey(id, name, surname, phone)")
        .eq("human_id", humanRecord.id);

      if (trustedLinks) {
        setTrustedHumans(
          trustedLinks
            .map(link => link.humans)
            .filter(Boolean)
        );
      }

      setLoading(false);
    }
    fetchData();
  }, [humanRecord]);

  const handleSave = useCallback(async () => {
    if (!supabase || !humanRecord?.id) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("humans")
      .update({
        name: details.name,
        surname: details.surname,
        address: details.address,
        email: details.email,
        whatsapp: details.whatsapp,
        fb: details.fb,
        insta: details.insta,
        tiktok: details.tiktok,
      })
      .eq("id", humanRecord.id);
    setSaving(false);
    if (!err) setEditing(false);
  }, [humanRecord, details]);

  const handleCancel = useCallback(() => {
    setDetails({
      name: humanRecord?.name || "",
      surname: humanRecord?.surname || "",
      address: humanRecord?.address || "",
      email: humanRecord?.email || "",
      whatsapp: humanRecord?.whatsapp || false,
      fb: humanRecord?.fb || "",
      insta: humanRecord?.insta || "",
      tiktok: humanRecord?.tiktok || "",
    });
    setEditing(false);
  }, [humanRecord]);

  const startCancel = useCallback((bookingId) => {
    setCancellingId(bookingId);
    setCancelReason("");
    setCancelOther("");
  }, []);

  const confirmCancel = useCallback(async () => {
    if (!supabase || !cancellingId) return;
    const reason = cancelReason === "Other" ? cancelOther.trim() : cancelReason;
    if (!reason) return;

    const booking = bookings.find(b => b.id === cancellingId);
    if (!booking) return;

    setSaving(true);

    // If part of a group, cancel all in the group
    if (booking.group_id) {
      const { data: groupBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("group_id", booking.group_id);

      const ids = (groupBookings || []).map(b => b.id);
      const { error: err } = await supabase
        .from("bookings")
        .update({ status: "Cancelled", cancel_reason: reason })
        .in("id", ids);
      if (!err) {
        setBookings(prev => prev.map(b =>
          ids.includes(b.id) ? { ...b, status: "Cancelled", cancel_reason: reason } : b
        ));
      }
    } else {
      const { error: err } = await supabase
        .from("bookings")
        .update({ status: "Cancelled", cancel_reason: reason })
        .eq("id", cancellingId);
      if (!err) {
        setBookings(prev => prev.map(b =>
          b.id === cancellingId ? { ...b, status: "Cancelled", cancel_reason: reason } : b
        ));
      }
    }

    setSaving(false);
    setCancellingId(null);
    setCancelReason("");
    setCancelOther("");
  }, [cancellingId, cancelReason, cancelOther, bookings]);

  const handleLoadMore = useCallback(async () => {
    if (!supabase) return;
    const dogIds = dogs.map(d => d.id);
    if (dogIds.length === 0) return;
    setLoadingMore(true);
    const alreadyLoaded = [...bookings, ...olderBookings];
    const oldestDate = alreadyLoaded.reduce((min, b) => b.booking_date < min ? b.booking_date : min, alreadyLoaded[0]?.booking_date || toDateStr(new Date()));
    const { data: moreRows } = await supabase
      .from("bookings")
      .select("*, dogs(name, breed, size)")
      .in("dog_id", dogIds)
      .lt("booking_date", oldestDate)
      .order("booking_date", { ascending: false })
      .order("slot", { ascending: false })
      .limit(20);
    setOlderBookings(prev => [...prev, ...(moreRows || [])]);
    if (!moreRows || moreRows.length < 20) setHasMorePast(false);
    setLoadingMore(false);
  }, [dogs, bookings, olderBookings]);

  const today = toDateStr(new Date());

  const upcomingBookings = useMemo(() =>
    bookings.filter(b => b.booking_date >= today && b.status !== "Cancelled").sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.slot.localeCompare(b.slot)),
    [bookings, today]
  );

  const pastBookings = useMemo(() =>
    [...bookings.filter(b => b.booking_date < today), ...olderBookings]
      .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.slot.localeCompare(a.slot)),
    [bookings, olderBookings, today]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FFFE] flex items-center justify-center font-[inherit]">
        <div className="text-center text-slate-500">Loading your dashboard...</div>
      </div>
    );
  }

  const detailRow = (label, value, isEditing, editComponent) => (
    <div className="flex justify-between items-center py-2.5 border-b border-slate-200">
      <span className="text-sm text-slate-500 min-w-[100px]">{label}</span>
      {isEditing ? editComponent : (
        <span className="text-sm font-semibold text-slate-800 text-right flex-1 ml-3">{value || "\u2014"}</span>
      )}
    </div>
  );

  const inputCls = "flex-1 ml-3 py-2 px-3 rounded-lg border-[1.5px] border-brand-teal text-sm font-[inherit] box-border outline-none text-slate-800 text-right";

  return (
    <div className="min-h-screen bg-[#F8FFFE] font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">

      {/* Header bar */}
      <div className="bg-gradient-to-br from-brand-teal to-[#236b5d] px-5 pt-5 pb-7 relative">
        <div className="max-w-[600px] mx-auto flex justify-between items-start">
          <div>
            <div className="text-sm font-semibold text-white/70 mb-1">
              Smarter<span className="text-white">Dog</span> Customer Portal
            </div>
            <div className="text-[26px] font-extrabold text-white">{humanName}</div>
            <div className="text-sm text-white/80 mt-1">{humanRecord?.phone || ""}</div>
          </div>
          <button onClick={() => {
            if (editing && !window.confirm("You have unsaved changes. Sign out anyway?")) return;
            onSignOut();
          }} className="bg-white/15 border border-white/30 rounded-lg py-2 px-3.5 text-[13px] font-bold text-white cursor-pointer font-[inherit] backdrop-blur-[4px]">
            Log out
          </button>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto -mt-3 px-4 pb-8 relative z-[1]">

        <button
          onClick={() => navigate("/customer/book")}
          className="w-full py-4 rounded-xl border-none bg-brand-teal text-white text-base font-bold cursor-pointer font-[inherit] mb-5"
        >
          Book a Groom
        </button>

        {/* MY DETAILS */}
        <div className="bg-white rounded-[14px] py-5 px-6 border border-slate-200 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-center mb-1">
            <div className="font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2.5">My Details</div>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="bg-brand-teal border-none rounded-lg py-1.5 px-4 text-[13px] font-bold text-white cursor-pointer font-[inherit]">
                Edit
              </button>
            ) : (
              <div className="flex gap-1.5">
                <button onClick={handleSave} disabled={saving} className={`bg-brand-teal border-none rounded-lg py-1.5 px-4 text-[13px] font-bold text-white cursor-pointer font-[inherit] ${saving ? "opacity-60" : ""}`}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={handleCancel} className="bg-white border border-slate-200 rounded-lg py-1.5 px-3.5 text-[13px] font-semibold text-slate-500 cursor-pointer font-[inherit]">
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* First Name + Surname */}
          {editing ? (
            <div className="flex gap-2.5 py-2.5 border-b border-slate-200">
              <div className="flex-1">
                <div className="text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-1">First Name</div>
                <input value={details.name} onChange={e => setDetails(d => ({ ...d, name: e.target.value }))}
                  className="w-full py-2 px-3 rounded-lg border-[1.5px] border-brand-teal text-sm font-[inherit] box-border outline-none text-slate-800 text-left" />
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-1">Surname</div>
                <input value={details.surname} onChange={e => setDetails(d => ({ ...d, surname: e.target.value }))}
                  className="w-full py-2 px-3 rounded-lg border-[1.5px] border-brand-teal text-sm font-[inherit] box-border outline-none text-slate-800 text-left" />
              </div>
            </div>
          ) : (
            detailRow("Name", `${details.name} ${details.surname}`.trim(), false, null)
          )}

          {detailRow("Address", details.address, editing,
            <input value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))} className={inputCls} />
          )}

          {detailRow("Email", details.email, editing,
            <input type="email" value={details.email} onChange={e => setDetails(d => ({ ...d, email: e.target.value }))} className={inputCls} />
          )}

          {detailRow("Mobile", humanRecord?.phone || "", false, null)}

          {/* WhatsApp toggle */}
          {editing && (
            <div className="flex justify-between items-center py-2.5 border-b border-slate-200">
              <span className="text-sm text-slate-500">WhatsApp</span>
              <button onClick={() => setDetails(d => ({ ...d, whatsapp: !d.whatsapp }))} className={`border-none rounded-[20px] w-12 h-[26px] cursor-pointer relative transition-colors ${details.whatsapp ? "bg-brand-teal" : "bg-slate-200"}`}>
                <div className={`absolute top-[3px] w-5 h-5 rounded-full bg-white transition-[left] shadow-[0_1px_3px_rgba(0,0,0,0.2)] ${details.whatsapp ? "left-[25px]" : "left-[3px]"}`} />
              </button>
            </div>
          )}

          {editing && (
            <div className="flex justify-between items-center py-2.5 border-b border-slate-200">
              <span className="text-sm text-slate-500 min-w-[100px]">Facebook</span>
              <input value={details.fb} onChange={e => setDetails(d => ({ ...d, fb: e.target.value }))} placeholder="facebook.com/..." className={inputCls} />
            </div>
          )}

          {editing && (
            <div className="flex justify-between items-center py-2.5 border-b border-slate-200">
              <span className="text-sm text-slate-500 min-w-[100px]">Instagram</span>
              <input value={details.insta} onChange={e => setDetails(d => ({ ...d, insta: e.target.value }))} placeholder="@handle" className={inputCls} />
            </div>
          )}

          {editing && (
            <div className="flex justify-between items-center py-2.5 border-b border-slate-200">
              <span className="text-sm text-slate-500 min-w-[100px]">TikTok</span>
              <input value={details.tiktok} onChange={e => setDetails(d => ({ ...d, tiktok: e.target.value }))} placeholder="@handle" className={inputCls} />
            </div>
          )}
        </div>

        {/* DOGS */}
        <div className="bg-white rounded-[14px] py-5 px-6 border border-slate-200 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2.5">Dogs</div>
          {dogs.length === 0 ? (
            <div className="text-sm text-slate-500 italic py-2">No dogs on file</div>
          ) : (
            dogs.map(dog => (
              <div key={dog.id} className="flex justify-between items-center py-3 border-b border-slate-200">
                <div>
                  <div className="text-base font-bold text-slate-800">{dog.name}</div>
                  <div className="text-[13px] text-slate-500">
                    {dog.breed}{dog.size ? ` \u00B7 ${dog.size}` : ""}
                  </div>
                  {dog.groom_notes && (
                    <div className="text-xs text-slate-500 mt-1 py-1 px-2 bg-slate-50 rounded">
                      {dog.groom_notes}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {dog.size && (
                    <span className={`text-[11px] font-bold py-[3px] px-2.5 rounded-[20px] ${
                      dog.size === "large" ? "bg-brand-coral-light text-brand-coral" :
                      dog.size === "medium" ? "bg-emerald-100 text-emerald-800" :
                      "bg-amber-100 text-amber-800"
                    }`}>{dog.size}</span>
                  )}
                  {dog.alerts && dog.alerts.length > 0 && (
                    <span className="text-[11px] font-semibold text-brand-coral">{"\u26A0\uFE0F"} {dog.alerts.length} alert{dog.alerts.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* TRUSTED HUMANS */}
        <div className="bg-white rounded-[14px] py-5 px-6 border border-slate-200 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2.5">Trusted Humans</div>
          {trustedHumans.length === 0 ? (
            <div className="text-sm text-slate-500 italic py-2">None listed</div>
          ) : (
            trustedHumans.map(th => (
              <div key={th.id} className="py-2.5 border-b border-slate-200">
                <div className="text-sm font-semibold text-slate-800">{th.name} {th.surname}</div>
                <div className="text-xs text-slate-500">{th.phone}</div>
              </div>
            ))
          )}
          <div className="mt-3 p-2.5 rounded-[10px] border-[1.5px] border-dashed border-brand-teal bg-emerald-50 text-brand-teal text-[13px] font-bold text-center">
            Contact the salon to add a trusted human
          </div>
        </div>

        {/* UPCOMING BOOKINGS */}
        <div className="bg-white rounded-[14px] py-5 px-6 border border-slate-200 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2.5">Upcoming Appointments</div>
          {upcomingBookings.length === 0 ? (
            <div className="text-center py-4">
              <div className="text-[28px] mb-1.5">{"\uD83D\uDC3E"}</div>
              <div className="text-sm font-bold text-slate-800 mb-0.5">No upcoming appointments</div>
              <div className="text-[13px] text-slate-500">Book your next groom using the button above!</div>
            </div>
          ) : (
            upcomingBookings.map(b => {
              const sc = STATUS_COLOURS[b.status] || STATUS_COLOURS["Not Arrived"];
              const canCancel = b.status === "Not Arrived";

              return (
                <div key={b.id} className="py-3 border-b border-slate-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-slate-800">
                          {formatDate(b.booking_date)}
                        </span>
                        <span className="text-[10px] font-bold py-0.5 px-1.5 rounded bg-emerald-50 text-brand-teal">UPCOMING</span>
                      </div>
                      <div className="text-sm text-slate-800 mt-0.5">
                        {b.dogs?.name || "Unknown"}{" "}
                        <span className="text-slate-500">{SERVICE_ICONS[b.service] || ""} {SERVICE_LABELS[b.service] || b.service}</span>
                      </div>
                      {b.slot && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatSlot(b.slot)}
                        </div>
                      )}
                    </div>
                    <span className={`text-[11px] font-bold py-1 px-2.5 rounded-md whitespace-nowrap ${sc.bg} ${sc.text}`}>{b.status}</span>
                  </div>
                  {canCancel && cancellingId !== b.id && (
                    <button onClick={() => startCancel(b.id)} className="mt-2 w-full py-2 rounded-lg border border-brand-coral bg-transparent text-[13px] font-semibold text-brand-coral cursor-pointer font-[inherit]">
                      Cancel appointment
                    </button>
                  )}
                  {cancellingId === b.id && (
                    <div className="mt-2 p-3 rounded-lg border border-brand-coral bg-red-50">
                      <div className="text-[13px] font-semibold text-slate-800 mb-2">Why are you cancelling?</div>
                      <select
                        value={cancelReason}
                        onChange={e => setCancelReason(e.target.value)}
                        className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm font-[inherit] bg-white mb-2"
                      >
                        <option value="">Select a reason...</option>
                        <option value="Changed plans">Changed plans</option>
                        <option value="Dog unwell">Dog unwell</option>
                        <option value="Found another date">Found another date</option>
                        <option value="Other">Other</option>
                      </select>
                      {cancelReason === "Other" && (
                        <input
                          type="text"
                          value={cancelOther}
                          onChange={e => setCancelOther(e.target.value)}
                          placeholder="Please tell us why..."
                          className="w-full py-2 px-3 rounded-lg border border-slate-300 text-sm font-[inherit] mb-2 box-border"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={confirmCancel}
                          disabled={saving || (!cancelReason || (cancelReason === "Other" && !cancelOther.trim()))}
                          className="flex-1 py-2 rounded-lg border-none bg-brand-coral text-white text-[13px] font-bold cursor-pointer font-[inherit] disabled:opacity-50"
                        >
                          {saving ? "Cancelling..." : "Confirm cancellation"}
                        </button>
                        <button
                          onClick={() => setCancellingId(null)}
                          className="py-2 px-4 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-500 cursor-pointer font-[inherit]"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* REBOOK PROMPT — shown when no upcoming bookings but has past completed ones */}
        {upcomingBookings.length === 0 && pastBookings.some(b => b.status === "Completed" || b.status === "Finished") && (
          <div className="bg-gradient-to-br from-emerald-50 to-white rounded-[14px] py-5 px-6 border border-brand-teal/30 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-center">
            <div className="text-[28px] mb-2">{"\u2702\uFE0F"}</div>
            <div className="text-sm font-bold text-slate-800 mb-1">Time for another groom?</div>
            <div className="text-[13px] text-slate-500 mb-3">
              Your last visit was {(() => {
                const lastCompleted = pastBookings.find(b => b.status === "Completed" || b.status === "Finished");
                if (!lastCompleted) return "a while ago";
                const diff = Math.round((new Date() - new Date(lastCompleted.booking_date + "T00:00:00")) / (7 * 24 * 60 * 60 * 1000));
                return diff <= 1 ? "last week" : `${diff} weeks ago`;
              })()}
            </div>
            <button
              onClick={() => navigate("/customer/book")}
              className="py-3 px-8 rounded-xl border-none bg-brand-teal text-white text-sm font-bold cursor-pointer font-[inherit]"
            >
              Book your next appointment
            </button>
          </div>
        )}

        {/* PAST BOOKINGS */}
        <div className="bg-white rounded-[14px] py-5 px-6 border border-slate-200 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <button
            onClick={() => setPastExpanded(p => !p)}
            className="w-full flex justify-between items-center bg-transparent border-none cursor-pointer p-0 font-[inherit] mb-1"
          >
            <div className="font-extrabold text-xs text-brand-teal uppercase tracking-wide">Past Appointments ({pastBookings.length})</div>
            <span className="text-slate-400 text-sm">{pastExpanded ? "▲ Hide" : "▼ Show"}</span>
          </button>

          {pastExpanded && (
            <>
              {pastBookings.length === 0 ? (
                <div className="text-sm text-slate-500 italic py-2">No past appointments yet.</div>
              ) : (
                pastBookings.map(b => {
                  const sc = STATUS_COLOURS[b.status] || STATUS_COLOURS["Completed"];
                  return (
                    <div key={b.id} className="py-3 border-b border-slate-200 opacity-70">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-800">{formatDate(b.booking_date)}</div>
                          <div className="text-sm text-slate-800 mt-0.5">
                            {b.dogs?.name || "Unknown"}{" "}
                            <span className="text-slate-500">{SERVICE_ICONS[b.service] || ""} {SERVICE_LABELS[b.service] || b.service}</span>
                          </div>
                          {b.slot && <div className="text-xs text-slate-500 mt-0.5">{formatSlot(b.slot)}</div>}
                        </div>
                        <span className={`text-[11px] font-bold py-1 px-2.5 rounded-md whitespace-nowrap ${sc.bg} ${sc.text}`}>{b.status}</span>
                      </div>
                    </div>
                  );
                })
              )}

              {hasMorePast && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full mt-3 py-2 rounded-lg border border-slate-200 bg-transparent text-[13px] font-semibold text-slate-500 cursor-pointer font-[inherit]"
                >
                  {loadingMore ? "Loading..." : "Load more past appointments"}
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
