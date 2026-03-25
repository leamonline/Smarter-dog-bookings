import { useState, useCallback, useMemo } from "react";

// ============================================================
// SMARTER DOG GROOMING — SALON DASHBOARD
// Phase 1: Schedule + 2-2-1 Capacity Engine
// ============================================================

// --- Brand Colours ---
const BRAND = {
  blue: "#00B8E0",
  blueDark: "#0099BD",
  blueLight: "#E0F7FC",
  coral: "#E8567F",
  coralLight: "#FDE8EE",
  yellow: "#F5C518",
  yellowLight: "#FFF8E0",
  teal: "#2D8B7A",
  tealLight: "#E6F5F2",
  purple: "#3D2C5E",
  white: "#FFFFFF",
  offWhite: "#F8FAFB",
  grey: "#6B7280",
  greyLight: "#E5E7EB",
  greyDark: "#374151",
  text: "#1F2937",
  textLight: "#6B7280",
  openGreen: "#16A34A",
  openGreenBg: "#DCFCE7",
  closedRed: "#DC2626",
  closedRedBg: "#FEE2E2",
};

// --- Slot Configuration ---
const SALON_SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

const SERVICES = [
  { id: "full_groom", name: "Full Groom", icon: "✂️" },
  { id: "bath_brush", name: "Bath & Brush", icon: "🛁" },
  { id: "bath_deshed", name: "Bath & Deshed", icon: "🧹" },
  { id: "puppy_cut", name: "Puppy Cut", icon: "🐾" },
];

const ALL_DAYS = [
  { key: "mon", label: "Mon", full: "Monday", defaultOpen: true },
  { key: "tue", label: "Tue", full: "Tuesday", defaultOpen: true },
  { key: "wed", label: "Wed", full: "Wednesday", defaultOpen: true },
  { key: "thu", label: "Thu", full: "Thursday", defaultOpen: false },
  { key: "fri", label: "Fri", full: "Friday", defaultOpen: false },
  { key: "sat", label: "Sat", full: "Saturday", defaultOpen: false },
  { key: "sun", label: "Sun", full: "Sunday", defaultOpen: false },
];

// Large dog approved slots and their seat rules
const LARGE_DOG_SLOTS = {
  "08:30": { seats: 1, canShare: true, needsApproval: false },
  "09:00": { seats: 1, canShare: true, needsApproval: false, conditional: true },
  "12:00": { seats: 2, canShare: false, needsApproval: false },
  "12:30": { seats: 2, canShare: false, needsApproval: false },
  "13:00": { seats: 2, canShare: false, needsApproval: false },
};

const PRICING = {
  full_groom: { small: "£42+", medium: "£46+", large: "£60+" },
  bath_brush: { small: "£38+", medium: "£42+", large: "£55+" },
  bath_deshed: { small: "£38+", medium: "£42+", large: "£55+" },
  puppy_cut: { small: "£38", medium: "£38", large: "N/A" },
};

// ============================================================
// 2-2-1 CAPACITY ENGINE
// ============================================================

function getSeatsUsed(bookings, slot) {
  return bookings
    .filter((b) => b.slot === slot)
    .reduce((total, b) => {
      if (b.size === "large") {
        const rule = LARGE_DOG_SLOTS[slot];
        return total + (rule ? rule.seats : 2);
      }
      return total + 1;
    }, 0);
}

function getSeatsUsedMap(bookings, activeSlots) {
  const map = {};
  for (const slot of activeSlots) {
    map[slot] = getSeatsUsed(bookings, slot);
  }
  return map;
}

function hasLargeDog(bookings, slot) {
  return bookings.some((b) => b.slot === slot && b.size === "large");
}

function getMaxSeatsForSlot(slotIndex, seatsMap, activeSlots) {
  function isDouble(idx) {
    if (idx < 0 || idx >= activeSlots.length) return false;
    return seatsMap[activeSlots[idx]] >= 2;
  }

  const prevPrev = isDouble(slotIndex - 2);
  const prev = isDouble(slotIndex - 1);
  const next = isDouble(slotIndex + 1);
  const nextNext = isDouble(slotIndex + 2);

  const wouldViolate =
    (prevPrev && prev) ||
    (prev && next) ||
    (next && nextNext);

  return wouldViolate ? 1 : 2;
}

function computeSlotCapacities(bookings, activeSlots) {
  const seatsMap = getSeatsUsedMap(bookings, activeSlots);
  const capacities = {};

  for (let i = 0; i < activeSlots.length; i++) {
    const slot = activeSlots[i];
    const used = seatsMap[slot];
    const max = getMaxSeatsForSlot(i, seatsMap, activeSlots);
    const available = Math.max(0, max - used);
    const isLargeDogSlot = LARGE_DOG_SLOTS[slot] !== undefined;
    const hasLarge = hasLargeDog(bookings, slot);
    const largeFills = hasLarge && LARGE_DOG_SLOTS[slot] && !LARGE_DOG_SLOTS[slot].canShare;

    capacities[slot] = {
      used,
      max,
      available: largeFills ? 0 : available,
      bookings: bookings.filter((b) => b.slot === slot),
      isConstrained: max < 2,
      isLargeDogApproved: isLargeDogSlot,
      hasLargeDog: hasLarge,
    };
  }

  return capacities;
}

function canBookSlot(bookings, slot, size, activeSlots) {
  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];
  if (!cap) return { allowed: false, reason: "Invalid slot" };

  const seatsNeeded = size === "large" ? (LARGE_DOG_SLOTS[slot]?.seats ?? 2) : 1;

  if (size === "large") {
    const rule = LARGE_DOG_SLOTS[slot];
    if (!rule) {
      return { allowed: false, reason: "Large dogs need Leam's approval for this slot", needsApproval: true };
    }
    if (rule.conditional && slot === "09:00") {
      const seats830 = getSeatsUsed(bookings, "08:30");
      const seats1000 = getSeatsUsed(bookings, "10:00");
      if (seats830 > 0) return { allowed: false, reason: "9:00am conditional: 8:30am must be empty" };
      if (seats1000 > 1) return { allowed: false, reason: "9:00am conditional: 10:00am must have 0–1 seats" };
    }
    if (!rule.canShare && cap.used > 0) return { allowed: false, reason: "Large dog fills this slot — already has bookings" };
    if (rule.canShare && cap.used + seatsNeeded > cap.max) return { allowed: false, reason: "Not enough capacity (2-2-1 rule)" };
    if (!rule.canShare && seatsNeeded > cap.max) return { allowed: false, reason: "Not enough capacity (2-2-1 rule)" };
  } else {
    if (cap.available < 1) return { allowed: false, reason: cap.isConstrained ? "Capped at 1 (2-2-1 rule)" : "Slot is full" };
    if (cap.hasLargeDog) {
      const rule = LARGE_DOG_SLOTS[slot];
      if (rule && !rule.canShare) return { allowed: false, reason: "Large dog fills this slot" };
    }
  }

  return { allowed: true };
}

// ============================================================
// SAMPLE DATA (per-day)
// ============================================================

const SAMPLE_HUMANS = {
  "Sarah Jones": { id: "h1", name: "Sarah", surname: "Jones", phone: "07700 900111", sms: true, whatsapp: true, email: "sarah@example.com", fb: "", insta: "@sarahj", tiktok: "", address: "123 Main St", notes: "Prefers texts", trustedIds: ["Dave Smith"], historyFlag: "1 No-show (Oct 2023)" },
  "Dave Smith": { id: "h2", name: "Dave", surname: "Smith", phone: "07700 900112", sms: true, whatsapp: false, email: "dave@example.com", fb: "davesmith", insta: "", tiktok: "", address: "456 Side St", notes: "", trustedIds: ["Sarah Jones"], historyFlag: "" },
  "Emma Wilson": { id: "h3", name: "Emma", surname: "Wilson", phone: "07700 900113", sms: false, whatsapp: true, email: "emma@example.com", fb: "", insta: "", tiktok: "", address: "789 Park Rd", notes: "", trustedIds: [] },
  "Tom Baker": { id: "h4", name: "Tom", surname: "Baker", phone: "07700 900114", sms: true, whatsapp: true, email: "tom@example.com", fb: "", insta: "", tiktok: "", address: "101 High St", notes: "", trustedIds: [] },
  "Lisa Brown": { id: "h5", name: "Lisa", surname: "Brown", phone: "07700 900115", sms: true, whatsapp: false, email: "lisa@example.com", fb: "", insta: "", tiktok: "", address: "202 Elm St", notes: "", trustedIds: [] },
  "Jenny Taylor": { id: "h6", name: "Jenny", surname: "Taylor", phone: "07700 900116", sms: false, whatsapp: false, email: "jenny@example.com", fb: "", insta: "", tiktok: "", address: "303 Oak St", notes: "", trustedIds: [] },
  "Mark Johnson": { id: "h7", name: "Mark", surname: "Johnson", phone: "07700 900117", sms: true, whatsapp: true, email: "mark@example.com", fb: "", insta: "", tiktok: "", address: "404 Pine St", notes: "", trustedIds: [] },
};

const SAMPLE_DOGS = {
  "Bella": { id: "d1", name: "Bella", breed: "Cockapoo", age: "3 yrs", humanId: "Sarah Jones", alerts: ["Allergic to oatmeal shampoo"], groomNotes: "Teddy bear cut, short on ears." },
  "Max": { id: "d2", name: "Max", breed: "Shih Tzu", age: "5 yrs", humanId: "Dave Smith", alerts: ["Bites / Nips"], groomNotes: "Leave tail long." },
  "Luna": { id: "d3", name: "Luna", breed: "Cavapoo", age: "2 yrs", humanId: "Emma Wilson", alerts: [], groomNotes: "" },
  "Charlie": { id: "d4", name: "Charlie", breed: "Bichon Frise", age: "4 yrs", humanId: "Tom Baker", alerts: [], groomNotes: "" },
  "Daisy": { id: "d5", name: "Daisy", breed: "Poodle", age: "1 yr", humanId: "Lisa Brown" },
  "Milo": { id: "d6", name: "Milo", breed: "Maltese", age: "6 yrs", humanId: "Jenny Taylor" },
  "Rex": { id: "d7", name: "Rex", breed: "Labrador", age: "7 yrs", humanId: "Mark Johnson" },
};

const SAMPLE_BOOKINGS_BY_DAY = {

  mon: [
    { id: 1, slot: "08:30", dogName: "Bella", breed: "Cockapoo", size: "small", service: "full_groom", owner: "Sarah Jones", status: "Checked In", addons: [], pickupBy: "Dave Smith", payment: "Deposit Paid" },
    { id: 2, slot: "08:30", dogName: "Max", breed: "Shih Tzu", size: "medium", service: "bath_brush", owner: "Dave Smith", status: "Not Arrived", addons: [], pickupBy: "Dave Smith", payment: "Due at Pick-up" },
    { id: 3, slot: "09:00", dogName: "Luna", breed: "Cavapoo", size: "small", service: "full_groom", owner: "Emma Wilson" },
    { id: 4, slot: "09:00", dogName: "Charlie", breed: "Bichon Frise", size: "medium", service: "bath_deshed", owner: "Tom Baker" },
    { id: 5, slot: "10:00", dogName: "Daisy", breed: "Poodle", size: "small", service: "full_groom", owner: "Lisa Brown" },
    { id: 6, slot: "10:00", dogName: "Milo", breed: "Maltese", size: "small", service: "bath_brush", owner: "Jenny Taylor" },
    { id: 7, slot: "12:00", dogName: "Rex", breed: "Labrador", size: "large", service: "bath_deshed", owner: "Mark Johnson" },
  ],
  tue: [
    { id: 101, slot: "08:30", dogName: "Coco", breed: "Pomeranian", size: "small", service: "full_groom", owner: "Amy Clarke" },
    { id: 102, slot: "09:00", dogName: "Teddy", breed: "Goldendoodle", size: "medium", service: "bath_brush", owner: "Rik Patel" },
    { id: 103, slot: "09:30", dogName: "Poppy", breed: "Cocker Spaniel", size: "medium", service: "full_groom", owner: "Helen Wright" },
  ],
  wed: [],
  thu: [], fri: [], sat: [], sun: [],
};

// ============================================================
// COMPONENTS
// ============================================================

function SizeTag({ size, legendMode, headerMode }) {
  const config = {
    small: { colour: "#F5C518", dotSize: headerMode ? 24 : (legendMode ? 12 : 14) },
    medium: { colour: "#2D8B7A", dotSize: headerMode ? 30 : (legendMode ? 18 : 20) },
    large: { colour: "#E8567F", dotSize: headerMode ? 36 : (legendMode ? 24 : 26) },
  };
  const c = config[size];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: c.dotSize, height: c.dotSize, borderRadius: "50%",
      background: c.colour, flexShrink: 0,
    }} />
  );
}

function CapacityBar({ used, max, isConstrained }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[0, 1].map((i) => (
        <div key={i} style={{
          width: 14, height: 20, borderRadius: 3,
          background: i < used ? (i < max ? BRAND.blue : BRAND.coral) : (i < max ? BRAND.greyLight : "transparent"),
          border: i < max ? `1.5px solid ${i < used ? BRAND.blue : BRAND.greyLight}` : `1.5px dashed ${BRAND.greyLight}`,
          transition: "all 0.2s ease",
        }} />
      ))}
      {isConstrained && (
        <span style={{ fontSize: 10, color: BRAND.coral, fontWeight: 600, marginLeft: 2 }}>2-2-1</span>
      )}
    </div>
  );
}

const ICON_COL_STYLE = {
  width: 28, minWidth: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

const S = 18;
const SW = 2;

function IconTick({ size = S, colour = BRAND.blue }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5 6.5-8" /></svg>);
}
function IconBlock({ size = S, colour = BRAND.coral }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round"><circle cx="8" cy="8" r="6" /><line x1="3.5" y1="3.5" x2="12.5" y2="12.5" /></svg>);
}
function IconReopen({ size = S, colour = BRAND.teal }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="11" rx="1.5" /><line x1="2" y1="6.5" x2="14" y2="6.5" /><line x1="5.5" y1="3" x2="5.5" y2="5" /><line x1="10.5" y1="3" x2="10.5" y2="5" /><path d="M6 10l1.5 1.5L10.5 9" /></svg>);
}
function IconEdit({ size = S, colour = BRAND.blue }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 3.5l3 3L5 14H2v-3z" /><path d="M9.5 3.5l1.5-1.5 3 3-1.5 1.5" /></svg>);
}
function IconMessage({ size = S, colour = BRAND.teal }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h12v8H5l-3 3z" /></svg>);
}
function IconPlus({ size = S, colour = BRAND.blue }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>);
}

function IconSearch({ size = S, colour = BRAND.textLight }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5" /><line x1="10.5" y1="10.5" x2="14" y2="14" /></svg>);
}

function HumanCardModal({ humanId, onClose, onOpenHuman, onOpenDog }) {
  const human = SAMPLE_HUMANS[humanId] || { name: humanId, surname: "", phone: "", sms: false, whatsapp: false, email: "", fb: "", insta: "", tiktok: "", address: "", notes: "", trustedIds: [] };
  const humanDogs = Object.values(SAMPLE_DOGS).filter(d => d.humanId === humanId).sort((a,b) => a.name.localeCompare(b.name));
  
  const detailRow = (label, value) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <span style={{ fontSize: 13, color: BRAND.textLight }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: BRAND.white, borderRadius: 16, width: 420, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
        <div style={{ background: `linear-gradient(135deg, ${BRAND.teal}, #1A5E51)`, padding: "20px 20px 16px", color: BRAND.white, position: "relative" }}>
           <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.2)", border: "none", color: BRAND.white, width: 28, height: 28, borderRadius: 8, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
           <button style={{ position: "absolute", top: 12, right: 48, background: "rgba(255,255,255,0.2)", border: "none", color: BRAND.white, height: 28, padding: "0 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
           <div style={{ fontSize: 22, fontWeight: 700 }}>{human.name} {human.surname}</div>
           <div style={{ fontSize: 13, opacity: 0.85 }}>Human Card</div>
        </div>
        
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginBottom: 8 }}>Contact Details</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
            <span style={{ fontSize: 13, color: BRAND.textLight }}>Phone number</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{human.phone || "—"}</span>
              <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={human.sms} readOnly /> SMS</label>
              <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={human.whatsapp} readOnly /> WhatsApp</label>
            </div>
          </div>
          {detailRow("Email", human.email)}
          {detailRow("Address", human.address)}
          {detailRow("Facebook / Insta / TikTok", [human.fb, human.insta, human.tiktok].filter(Boolean).join(" / "))}
          {detailRow("Notes", human.notes)}

          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginTop: 24, marginBottom: 8 }}>Dogs</div>
          {humanDogs.length > 0 ? humanDogs.map(d => (
            <div key={d.id} onClick={() => { onClose(); onOpenDog(d.name); }} style={{ padding: "8px 12px", border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: BRAND.blue }}>{d.name}</span>
              <span style={{ color: BRAND.textLight }}>{d.breed} ({d.age})</span>
            </div>
          )) : <div style={{ fontSize: 13, color: BRAND.textLight }}>No dogs listed.</div>}
          
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginTop: 24, marginBottom: 8 }}>Trusted humans</div>
          {human.trustedIds.length > 0 ? human.trustedIds.map(tid => {
            const tr = SAMPLE_HUMANS[tid] || { name: tid, surname: "", phone: "N/A" };
            return (
              <div key={tid} onClick={() => { onClose(); onOpenHuman(tid); }} style={{ padding: "8px 12px", border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: BRAND.blue }}>{tr.name} {tr.surname}</span>
                <span style={{ color: BRAND.textLight }}>{tr.phone}</span>
              </div>
            );
          }) : <div style={{ fontSize: 13, color: BRAND.textLight }}>No trusted humans listed.</div>}
          <button style={{ marginTop: 6, width: "100%", padding: "8px", borderRadius: 8, border: `1px dashed ${BRAND.blue}`, color: BRAND.blue, background: "transparent", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Add a trusted Human</button>

          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginTop: 24, marginBottom: 8 }}>Appointments</div>
          <div style={{ fontSize: 13, color: BRAND.textLight, fontStyle: "italic" }}>Upcoming: None <br/> Past: 2 visits (Last on 12th Oct)</div>
        </div>
      </div>
    </div>
  );
}

function DogCardModal({ dogId, onClose, onOpenHuman }) {
  const dog = SAMPLE_DOGS[dogId] || { name: dogId, breed: "Unknown", age: "Unknown", humanId: "Unknown" };
  const human = SAMPLE_HUMANS[dog.humanId] || { name: dog.humanId, surname: "", trustedIds: [] };
  
  const detailRow = (label, value) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <span style={{ fontSize: 13, color: BRAND.textLight }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{value}</span>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: BRAND.white, borderRadius: 16, width: 360, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
        <div style={{ background: `linear-gradient(135deg, ${BRAND.yellow}, #D4A911)`, padding: "20px 20px 16px", color: BRAND.white, position: "relative" }}>
           <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.3)", border: "none", color: BRAND.white, width: 28, height: 28, borderRadius: 8, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
           <button style={{ position: "absolute", top: 12, right: 48, background: "rgba(255,255,255,0.3)", border: "none", color: BRAND.white, height: 28, padding: "0 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
           <div style={{ fontSize: 22, fontWeight: 700 }}>{dog.name}</div>
           <div style={{ fontSize: 13, opacity: 0.9 }}>Dog Card</div>
        </div>
        
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginBottom: 8 }}>Dog Info</div>
          {detailRow("Breed", dog.breed)}
          {detailRow("Age", dog.age)}
          
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginTop: 24, marginBottom: 8 }}>Primary Human</div>
          <div onClick={() => { onClose(); onOpenHuman(dog.humanId); }} style={{ padding: "8px 12px", border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
             <span style={{ fontWeight: 600, color: BRAND.blue }}>{human.name} {human.surname}</span>
          </div>

          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginTop: 24, marginBottom: 8 }}>Trusted humans</div>
          {human.trustedIds && human.trustedIds.length > 0 ? human.trustedIds.map(tid => {
            const tr = SAMPLE_HUMANS[tid] || { name: tid, surname: "", phone: "N/A" };
            return (
              <div key={tid} onClick={() => { onClose(); onOpenHuman(tid); }} style={{ padding: "8px 12px", border: `1px solid ${BRAND.greyLight}`, borderRadius: 8, marginBottom: 6, cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: BRAND.blue }}>{tr.name} {tr.surname}</span>
                <span style={{ color: BRAND.textLight }}>{tr.phone}</span>
              </div>
            );
          }) : <div style={{ fontSize: 13, color: BRAND.textLight }}>No trusted humans listed.</div>}

          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.blueDark, marginTop: 24, marginBottom: 8 }}>Appointments</div>
          <div style={{ fontSize: 13, color: BRAND.textLight, fontStyle: "italic" }}>Upcoming: None <br/> Past: 2 visits</div>
        </div>
      </div>
    </div>
  );
}

// END MODALS

const formatFullDate = (d) => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const getDefaultPickupTime = (startStr) => {
  if (!startStr) return "—";
  let [h, m] = startStr.split(":").map(Number);
  m += 120; // Default 120 mins
  h += Math.floor(m / 60);
  m = m % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
};

const generateTimeOptions = (startStr) => {
  const options = [];
  if (!startStr) return options;
  let [h, m] = startStr.split(":").map(Number);
  const startTotalMins = h * 60 + m;
  const maxTotalMins = 17 * 60; // 17:00 (5:00 pm)

  // Start options 30 mins after drop-off, up to 5:00 pm
  for (let currentMins = startTotalMins + 30; currentMins <= maxTotalMins; currentMins += 10) {
    let currentH = Math.floor(currentMins / 60);
    let currentM = currentMins % 60;
    let ampm = currentH >= 12 ? 'pm' : 'am';
    let h12 = currentH > 12 ? currentH - 12 : (currentH === 0 ? 12 : currentH);
    options.push(`${h12}:${currentM.toString().padStart(2, '0')}${ampm}`);
  }
  return options;
};

// Common groomer alerts colour coded by severity/type
const ALERT_OPTIONS = [
  { label: "Bites / Nips", color: BRAND.coral },
  { label: "Reactive to dogs", color: BRAND.coral },
  { label: "Kennel aggressive", color: BRAND.coral },
  { label: "Nervous / Anxious", color: "#D97706" }, // Brand-aligned deep yellow
  { label: "Fear of dryer", color: "#D97706" },
  { label: "Sensitive paws", color: "#D97706" },
  { label: "Senior (Needs breaks)", color: BRAND.blueDark },
];

function BookingDetailModal({ booking, onClose, onRemove, onOpenHuman, onUpdate, currentDayKey, currentDateObj, bookingsByDay, dayOpenState }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  const dogData = Object.values(SAMPLE_DOGS).find(d => d.name === booking.dogName) || {};
  const AVAILABLE_ADDONS = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"];

  // Evaluate the initial base price safely before editData is initialized
  const initialDefaultPriceNum = parseInt((PRICING[booking.service]?.[booking.size] || "0").replace(/\D/g, '')) || 0;
  const initialBasePrice = dogData.customPrice !== undefined ? dogData.customPrice : initialDefaultPriceNum;

  const [editData, setEditData] = useState({
    service: booking.service,
    pickupBy: booking.pickupBy || booking.owner,
    payment: booking.payment || "Due at Pick-up",
    groomNotes: dogData.groomNotes || "",
    alerts: [...(dogData.alerts || [])],
    addons: [...(booking.addons || [])],
    date: currentDateObj,
    slot: booking.slot,
    customPrice: initialBasePrice
  });

  const currentService = isEditing ? (editData?.service || booking.service) : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);

  const [allergyInput, setAllergyInput] = useState(() => {
    const allergy = dogData.alerts?.find(a => a.startsWith("Allergic to "));
    return allergy ? allergy.replace("Allergic to ", "") : "";
  });
  const [hasAllergy, setHasAllergy] = useState(() => dogData.alerts?.some(a => a.startsWith("Allergic to ")));

  const primaryHuman = SAMPLE_HUMANS[booking.owner];
  const trustedHumans = primaryHuman?.trustedIds || [];

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit", color: BRAND.text };
  const headerSelectStyle = { background: "rgba(255,255,255,0.2)", color: BRAND.white, border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "6px 10px", fontSize: 13, fontWeight: 600, outline: "none", cursor: "pointer", fontFamily: "inherit" };

  // Determine available slots for the chosen Date
  const editDayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][editData.date.getDay()];
  const editDayBookings = bookingsByDay[editDayKey] || [];
  // Filter out the *current* booking from capacities so it doesn't block its own spot
  const otherBookings = editDayBookings.filter(b => b.id !== booking.id);
  const editDayCapacities = computeSlotCapacities(otherBookings, SALON_SLOTS);

  const availableSlots = useMemo(() => {
    return SALON_SLOTS.filter(s => {
      const cap = editDayCapacities[s];
      // Note: we still use booking.size here for logic, even though it's hidden from the UI.
      const needed = booking.size === "large" ? (LARGE_DOG_SLOTS[s]?.seats ?? 2) : 1;
      if (booking.size === "large" && LARGE_DOG_SLOTS[s] && !LARGE_DOG_SLOTS[s].canShare && cap.used > 0) return false;
      return cap && cap.available >= needed;
    });
  }, [editDayCapacities, booking.size]);

  const LogisticsLabel = ({ text }) => (
    <span style={{ color: BRAND.blueDark, textTransform: "uppercase", fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>{text}</span>
  );

  const FinanceLabel = ({ text }) => (
    <span style={{ color: BRAND.openGreen, textTransform: "uppercase", fontWeight: 800, fontSize: 12, letterSpacing: 0.5 }}>{text}</span>
  );

  const detailRow = (label, value, editNode = null, verticalEdit = false) => (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isEditing && editNode && !verticalEdit ? "center" : "flex-start" }}>
        <span style={{ fontSize: 13, color: BRAND.textLight, flexShrink: 0, paddingRight: 12, paddingTop: isEditing && editNode && !verticalEdit ? 0 : 2 }}>{label}</span>
        {isEditing && editNode && !verticalEdit ? (
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", maxWidth: "65%" }}>{editNode}</div>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
        )}
      </div>
      {isEditing && editNode && verticalEdit && (
        <div style={{ marginTop: 8 }}>{editNode}</div>
      )}
    </div>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontWeight: 800, fontSize: 12, color: BRAND.blueDark, marginTop: 24, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {children}
    </div>
  );

  const handleCloseAttempt = () => {
    if (isEditing) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (!editData.slot) return;

    let finalNotes = editData.groomNotes;
    const originalDateStr = formatFullDate(currentDateObj);
    const newDateStr = formatFullDate(editData.date);

    if (originalDateStr !== newDateStr || booking.slot !== editData.slot) {
      const stamp = `\n\n[Booking moved by Staff from ${originalDateStr} at ${booking.slot} to ${newDateStr} at ${editData.slot}]`;
      finalNotes += stamp;
    }

    // Save alerts back to dog prototype data
    const finalAlerts = editData.alerts.filter(a => !a.startsWith("Allergic to "));
    if (hasAllergy && allergyInput.trim()) {
      finalAlerts.push(`Allergic to ${allergyInput.trim()}`);
    }
    dogData.alerts = finalAlerts;
    dogData.groomNotes = finalNotes;
    
    dogData.customPrice = editData.customPrice;

    const newDayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][editData.date.getDay()];

    onUpdate({
      ...booking,
      service: editData.service,
      addons: editData.addons,
      pickupBy: editData.pickupBy,
      payment: editData.payment,
      slot: editData.slot
    }, currentDayKey, newDayKey);

    setIsEditing(false);
  };

  const activePrice = isEditing ? editData.customPrice : initialBasePrice;
  const activeAddons = isEditing ? editData.addons : (booking.addons || []);
  const activePayment = isEditing ? editData.payment : (booking.payment || "Due at Pick-up");

  let amountDue = activePrice;
  if (activeAddons.includes("Flea Bath")) amountDue += 10;
  
  if (activePayment === "Deposit Paid") amountDue -= 10;
  else if (activePayment === "Paid in Full") amountDue = 0;

  const ageYo = dogData.age ? dogData.age.replace(' yrs', 'yo') : '';

  return (
    <div onClick={handleCloseAttempt} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 16, width: 420, maxWidth: "95vw",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)", overflow: "hidden", display: "flex", flexDirection: "column"
      }}>
        {/* Dynamic Header */}
        <div style={{
          background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
          padding: "24px 20px", color: BRAND.white, position: "relative", flexShrink: 0
        }}>
          <button onClick={handleCloseAttempt} style={{
            position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.2)",
            border: "none", color: BRAND.white, width: 32, height: 32, borderRadius: 8,
            fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s"
          }} onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.3)"} onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.2)"}>&times;</button>
          
          <div style={{ display: "flex", alignItems: "center", gap: 16, paddingRight: 32 }}>
            <SizeTag size={booking.size} headerMode={true} />
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Dog Row */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{booking.dogName}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>
                  {booking.breed} {ageYo ? ` • ${ageYo}` : ''}
                </span>
              </div>
              
              {/* Human Row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
                <span
                  style={{ cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 4, fontWeight: 700, fontSize: 16 }}
                  onClick={(e) => { e.stopPropagation(); onClose(); onOpenHuman && onOpenHuman(booking.owner); }}
                >
                  {booking.owner}
                </span>
                {primaryHuman?.phone && (
                  <span style={{ background: "rgba(0,0,0,0.2)", padding: "4px 10px", borderRadius: 12, color: "#4ADE80", fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}>
                    {primaryHuman.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Quick Actions Bar */}
          <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 12, marginTop: 24, background: "rgba(0,0,0,0.15)", padding: "12px 16px", borderRadius: 12, boxSizing: "border-box" }}>
            <div style={{ flex: 1, display: "flex" }}>
              <select value={booking.status || "Not Arrived"} onChange={(e) => onUpdate({ ...booking, status: e.target.value }, currentDayKey, currentDayKey)} style={{ ...headerSelectStyle, width: "100%" }}>
                <option value="Not Arrived" style={{ color: BRAND.text }}>Not Arrived</option>
                <option value="Checked In" style={{ color: BRAND.text }}>Checked In</option>
                <option value="In the Bath" style={{ color: BRAND.text }}>In the Bath</option>
                <option value="Ready for Pick-up" style={{ color: BRAND.text }}>Ready for Pick-up</option>
                <option value="Completed" style={{ color: BRAND.text }}>Completed</option>
              </select>
            </div>
            
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)", flexShrink: 0 }}></div>
            
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap" }}>Pick-up:</span>
              <select value={booking.pickupTime || getDefaultPickupTime(booking.slot)} onChange={(e) => onUpdate({ ...booking, pickupTime: e.target.value }, currentDayKey, currentDayKey)} style={{ ...headerSelectStyle, width: "100%" }}>
                {generateTimeOptions(booking.slot).map(t => <option key={t} value={t} style={{ color: BRAND.text }}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

      {/* Details (Scrollable) */}
      <div style={{ padding: "0 24px 16px", maxHeight: "60vh", overflowY: "auto" }}>
        
        {isEditing ? (
          <div style={{ padding: "24px 0 16px", borderBottom: `1px solid ${BRAND.greyLight}`, width: "100%" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 8, width: "100%" }}>
              {ALERT_OPTIONS.map(opt => {
                const isSelected = editData.alerts.includes(opt.label);
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (isSelected) setEditData({...editData, alerts: editData.alerts.filter(a => a !== opt.label)});
                      else setEditData({...editData, alerts: [...editData.alerts, opt.label]});
                    }}
                    style={{
                      background: isSelected ? BRAND.coral : BRAND.white,
                      color: isSelected ? BRAND.white : BRAND.coral,
                      border: `2px solid ${BRAND.coral}`,
                      padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
                      display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center"
                    }}
                  >
                    ⚠️ {opt.label} ⚠️
                  </button>
                )
              })}
              {/* Allergy Button */}
              <button
                type="button"
                onClick={() => setHasAllergy(!hasAllergy)}
                style={{
                  background: hasAllergy ? BRAND.coral : BRAND.white,
                  color: hasAllergy ? BRAND.white : BRAND.coral,
                  border: `2px solid ${BRAND.coral}`,
                  padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center"
                }}
              >
                ⚠️ Allergy ⚠️
              </button>
            </div>
            
            {hasAllergy && (
              <div style={{ marginTop: 12, width: "100%", display: "flex", justifyContent: "center" }}>
                <input type="text" placeholder="What is the dog allergic to? (e.g. oatmeal shampoo)" value={allergyInput} onChange={e => setAllergyInput(e.target.value)} style={{...inputStyle, textAlign: "center", borderColor: BRAND.coral, borderWidth: 2, padding: "10px", width: "100%"}} />
              </div>
            )}
          </div>
        ) : (
          ((dogData.alerts && dogData.alerts.length > 0) || (hasAllergy && allergyInput)) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, marginTop: 28, justifyContent: "center", width: "100%" }}>
               {editData.alerts.filter(a => !a.startsWith("Allergic to ")).map(alertLabel => {
                 return (
                   <div key={alertLabel} style={{ background: BRAND.coral, color: BRAND.white, padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(232,86,127,0.25)", textAlign: "center" }}>
                     ⚠️ {alertLabel} ⚠️
                   </div>
                 );
               })}
               {hasAllergy && allergyInput && (
                 <div style={{ background: BRAND.coral, color: BRAND.white, padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(232,86,127,0.25)", textAlign: "center" }}>
                   ⚠️ Allergic to {allergyInput} ⚠️
                 </div>
               )}
            </div>
          )
        )}

        {detailRow(<LogisticsLabel text="Grooming Notes" />, 
          <span style={{ whiteSpace: "pre-wrap" }}>{editData.groomNotes || "Standard groom (no specific notes)"}</span>,
          <textarea value={editData.groomNotes} onChange={e => setEditData({...editData, groomNotes: e.target.value})} style={{...inputStyle, resize: "vertical", minHeight: 44, textAlign: "right"}} />
        )}

        {detailRow(<LogisticsLabel text="Date" />, formatFullDate(isEditing ? editData.date : currentDateObj),
          <button onClick={() => setShowDatePicker(true)} style={{...inputStyle, flex: 1, textAlign: "left", background: BRAND.white, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center"}}>
            <span style={{ fontWeight: 600 }}>{formatFullDate(editData.date)}</span> <span style={{fontSize: 14}}>📅</span>
          </button>,
          true // Display vertically underneath when editing
        )}

        {detailRow(<LogisticsLabel text="Drop-off time" />, isEditing ? (editData.slot || <span style={{color: BRAND.coral}}>None selected</span>) : booking.slot,
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 6, width: "100%" }}>
            {availableSlots.length > 0 ? availableSlots.map(s => (
               <button key={s} onClick={() => setEditData({...editData, slot: s})} style={{
                 padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                 background: editData.slot === s ? BRAND.blue : BRAND.white,
                 color: editData.slot === s ? BRAND.white : BRAND.text,
                 border: `1.5px solid ${editData.slot === s ? BRAND.blue : BRAND.greyLight}`,
                 textAlign: "center"
               }}>{s}</button>
            )) : <span style={{fontSize: 13, color: BRAND.coral, fontWeight: 600, gridColumn: "1 / -1"}}>No available slots on this date</span>}
          </div>,
          true // Display vertically underneath when editing
        )}
        
        {detailRow(<LogisticsLabel text="Service" />, `${serviceObj?.icon || ""} ${serviceObj?.name || currentService}`,
          <select value={editData.service} onChange={e => setEditData({...editData, service: e.target.value})} style={inputStyle}>
            {SERVICES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
        )}
        
        {isEditing ? (
          <div style={{ padding: "10px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
            <div style={{ marginBottom: 8 }}><LogisticsLabel text="Add-ons" /></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {AVAILABLE_ADDONS.map(addon => (
                <label key={addon} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                  <input type="checkbox" style={{ accentColor: BRAND.blue, width: 18, height: 18, cursor: "pointer" }}
                    checked={editData.addons.includes(addon)}
                    onChange={(e) => {
                      if (e.target.checked) setEditData({...editData, addons: [...editData.addons, addon]});
                      else setEditData({...editData, addons: editData.addons.filter(a => a !== addon)});
                    }}
                  /> {addon}
                </label>
              ))}
            </div>
          </div>
        ) : (
          (editData.addons && editData.addons.length > 0) ? detailRow(<LogisticsLabel text="Add-ons" />, editData.addons.join(", ")) : null
        )}

        {detailRow(<LogisticsLabel text="Pick-up Human" />, isEditing ? editData.pickupBy : (booking.pickupBy || booking.owner),
          <select value={editData.pickupBy} onChange={e => setEditData({...editData, pickupBy: e.target.value})} style={inputStyle}>
            {[booking.owner, ...[...trustedHumans].sort()].map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        )}

        {/* 3. Financial & Admin */}
        <div style={{ height: 24 }}></div>
        
        {detailRow(<FinanceLabel text="Base Price" />, 
          isEditing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>£</span>
              <input type="number" value={editData.customPrice} onChange={e => setEditData({...editData, customPrice: Number(e.target.value)})} style={{...inputStyle, width: 80}} />
            </div>
          ) : `£${activePrice}`
        )}

        {detailRow(<FinanceLabel text="Payment Status" />, isEditing ? editData.payment : (booking.payment || "Due at Pick-up"),
          <select value={editData.payment} onChange={e => setEditData({...editData, payment: e.target.value})} style={inputStyle}>
            <option value="Due at Pick-up">Due at Pick-up</option>
            <option value="Deposit Paid">Deposit Paid</option>
            <option value="Paid in Full">Paid in Full</option>
          </select>
        )}

        {detailRow(<FinanceLabel text="Amount Due" />, <span style={{ fontWeight: 800, color: amountDue > 0 ? BRAND.coral : BRAND.openGreen, fontSize: 16 }}>£{Math.max(0, amountDue)}</span>)}

        {primaryHuman?.historyFlag && (
           <div style={{ fontSize: 13, color: BRAND.coral, marginTop: 12, textAlign: "right", fontWeight: 700, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8, display: "inline-block", float: "right" }}>
             Flag: {primaryHuman.historyFlag}
           </div>
        )}
        <div style={{ clear: "both" }} />
      </div>

        {/* Actions */}
      {isEditing ? (
        <div style={{ padding: "16px 24px 20px", display: "flex", gap: 10, background: BRAND.offWhite, borderTop: `1px solid ${BRAND.greyLight}` }}>
          <button onClick={handleSave} disabled={!editData.slot} style={{
            flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
            cursor: !editData.slot ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: !editData.slot ? BRAND.greyLight : BRAND.blue, color: !editData.slot ? BRAND.textLight : BRAND.white,
            transition: "background 0.15s"
          }}><IconTick size={16} colour={BRAND.white} /> Save Changes</button>
          <button onClick={() => {
            setEditData({ service: booking.service, pickupBy: booking.pickupBy || booking.owner, payment: booking.payment || "Due at Pick-up", groomNotes: dogData.groomNotes || "", alerts: [...(dogData.alerts || [])], addons: [...(booking.addons || [])], date: currentDateObj, slot: booking.slot, customPrice: initialBasePrice });
            setIsEditing(false);
          }} style={{
            flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`, fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: BRAND.white, color: BRAND.textLight, transition: "background 0.15s"
          }} onMouseEnter={e => e.currentTarget.style.background = BRAND.offWhite} onMouseLeave={e => e.currentTarget.style.background = BRAND.white}>Cancel</button>
        </div>
      ) : (
          <div style={{ padding: "16px 24px 20px", display: "flex", gap: 10, background: BRAND.offWhite, borderTop: `1px solid ${BRAND.greyLight}` }}>
            <button onClick={() => setIsEditing(true)} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.blue, color: BRAND.white, transition: "background 0.15s"
            }} onMouseEnter={e => e.currentTarget.style.background = BRAND.blueDark} onMouseLeave={e => e.currentTarget.style.background = BRAND.blue}><IconEdit size={16} colour={BRAND.white} /> Edit</button>
            <button onClick={onClose} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.teal, color: BRAND.white, transition: "background 0.15s"
            }} onMouseEnter={e => e.currentTarget.style.background = "#236b5d"} onMouseLeave={e => e.currentTarget.style.background = BRAND.teal}><IconMessage size={16} colour={BRAND.white} /> Message</button>
            <button onClick={() => { onRemove(booking.id); onClose(); }} style={{
              flex: 1, padding: "12px 0", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: BRAND.coralLight, color: BRAND.coral, transition: "background 0.15s"
            }} onMouseEnter={e => e.currentTarget.style.background = "#fbd4df"} onMouseLeave={e => e.currentTarget.style.background = BRAND.coralLight}><IconBlock size={16} colour={BRAND.coral} /> Cancel</button>
          </div>
        )}
      </div>

    {showDatePicker && (
      <DatePickerModal
        currentDate={editData.date}
        dayOpenState={dayOpenState}
        onSelectDate={(newDate) => {
          setEditData(prev => ({...prev, date: newDate}));
          setShowDatePicker(false);
            
            // Check if current slot is still available on the newly selected day
            const newDayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][newDate.getDay()];
            const dayBookings = bookingsByDay[newDayKey] || [];
            const filteredBookings = dayBookings.filter(b => b.id !== booking.id);
            const dayCapacities = computeSlotCapacities(filteredBookings, SALON_SLOTS);
            
            const needed = booking.size === "large" ? (LARGE_DOG_SLOTS[editData.slot]?.seats ?? 2) : 1;
            const cap = dayCapacities[editData.slot];
            
            let canKeepSlot = false;
            if (cap && cap.available >= needed) {
               if (booking.size === "large" && LARGE_DOG_SLOTS[editData.slot] && !LARGE_DOG_SLOTS[editData.slot].canShare && cap.used > 0) {
                   canKeepSlot = false;
               } else {
                   canKeepSlot = true;
               }
            }
            if (!canKeepSlot) {
                setEditData(prev => ({...prev, slot: ""})); // Force them to pick a new slot
            }
          }}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300,
        }}>
          <div style={{
            background: BRAND.white, padding: "24px", borderRadius: 16, width: 300, textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: 8
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.blueDark }}>Are you sure?</div>
            <div style={{ fontSize: 14, color: BRAND.textLight, marginBottom: 12 }}>You have unsaved changes. Are you sure you want to exit?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => onClose()} style={{
                flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: BRAND.coralLight, color: BRAND.coral, fontWeight: 700, cursor: "pointer", transition: "background 0.15s"
              }} onMouseEnter={e => e.currentTarget.style.background = "#fbd4df"} onMouseLeave={e => e.currentTarget.style.background = BRAND.coralLight}>Yes, exit</button>
              <button onClick={() => setShowExitConfirm(false)} style={{
                flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: BRAND.blue, color: BRAND.white, fontWeight: 700, cursor: "pointer", transition: "background 0.15s"
              }} onMouseEnter={e => e.currentTarget.style.background = BRAND.blueDark} onMouseLeave={e => e.currentTarget.style.background = BRAND.blue}>No</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BookingCard({ booking, onRemove, onOpenHuman, onOpenDog, onUpdate, currentDayKey, currentDateObj, bookingsByDay, dayOpenState }) {
  const [showDetail, setShowDetail] = useState(false);
  const service = SERVICES.find((s) => s.id === booking.service);
  return (
    <>
      <div onClick={() => setShowDetail(true)} style={{
        display: "flex", alignItems: "center", gap: 8, background: BRAND.white,
        border: `1px solid ${BRAND.greyLight}`, borderRadius: 10, padding: "6px 10px",
        fontSize: 13, cursor: "pointer", minHeight: 42, boxSizing: "border-box",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,184,224,0.15)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.boxShadow = "none"; }}>
        <div style={ICON_COL_STYLE}><SizeTag size={booking.size} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: BRAND.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ cursor: "pointer", borderBottom: `1px dashed ${BRAND.blue}`, color: BRAND.blueDark }} onClick={(e) => { e.stopPropagation(); onOpenDog && onOpenDog(booking.dogName); }}>{booking.dogName}</span>
          <span style={{ fontWeight: 400, color: BRAND.textLight, marginLeft: 4, fontSize: 12 }}>({booking.breed})</span>
        </div>
        <div style={{ fontSize: 11, color: BRAND.textLight }}>{service?.icon} {service?.name} · <span style={{ cursor: "pointer", borderBottom: `1px dashed ${BRAND.blue}`, color: BRAND.blueDark }} onClick={(e) => { e.stopPropagation(); onOpenHuman && onOpenHuman(booking.owner); }}>{booking.owner}</span></div>
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <StaffIconBtn icon={<IconEdit />} title="Edit appointment" onClick={(e) => { e.stopPropagation(); setShowDetail(true); }} />
        <StaffIconBtn icon={<IconMessage />} title="Message owner" onClick={(e) => { e.stopPropagation(); }} />
      </div>
    </div>
    {showDetail && <BookingDetailModal booking={booking} onClose={() => setShowDetail(false)} onRemove={onRemove} onOpenHuman={onOpenHuman} onUpdate={onUpdate} currentDayKey={currentDayKey} currentDateObj={currentDateObj} bookingsByDay={bookingsByDay} dayOpenState={dayOpenState} />}
  </>
  );
}

function AddBookingForm({ slot, onAdd, onCancel, bookings, activeSlots }) {
  const [dogName, setDogName] = useState("");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState("small");
  const [service, setService] = useState("full_groom");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dogName.trim() || !breed.trim() || !owner.trim()) { setError("Fill in all fields"); return; }
    const check = canBookSlot(bookings, slot, size, activeSlots);
    if (!check.allowed) { setError(check.reason); return; }
    onAdd({ id: Date.now(), slot, dogName: dogName.trim(), breed: breed.trim(), size, service, owner: owner.trim() });
  };

  const inputStyle = {
    padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input placeholder="Dog name" value={dogName} onChange={(e) => { setDogName(e.target.value); setError(""); }} style={inputStyle} autoFocus
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
        <input placeholder="Breed" value={breed} onChange={(e) => { setBreed(e.target.value); setError(""); }} style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input placeholder="Human name" value={owner} onChange={(e) => { setOwner(e.target.value); setError(""); }} style={inputStyle}
          onFocus={(e) => (e.target.style.borderColor = BRAND.blue)} onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)} />
        <select value={size} onChange={(e) => { setSize(e.target.value); setError(""); }} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
        </select>
      </div>
      <select value={service} onChange={(e) => setService(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
        {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name} — {PRICING[s.id]?.[size] || "N/A"}</option>)}
      </select>
      {error && <div style={{ fontSize: 12, color: BRAND.coral, fontWeight: 500, padding: "2px 0" }}>{error}</div>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" style={{
          flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: BRAND.blue,
          color: BRAND.white, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }} onMouseEnter={(e) => (e.target.style.background = BRAND.blueDark)} onMouseLeave={(e) => (e.target.style.background = BRAND.blue)}>
          Confirm
        </button>
        <button type="button" onClick={onCancel} style={{
          padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
          background: BRAND.white, color: BRAND.textLight, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>Cancel</button>
      </div>
    </form>
  );
}

function StaffIconBtn({ icon, title, onClick }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "none", border: "none", width: 26, height: 26, display: "flex",
      alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
      transition: "all 0.15s", borderRadius: 4,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.transform = "scale(1.12)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1)"; }}>
      {icon}
    </button>
  );
}

const SEAT_ROW_STYLE = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  borderRadius: 10, padding: "6px 10px", minHeight: 42, boxSizing: "border-box",
};

function AvailableSeat({ onAddBooking, onBlock }) {
  return (
    <div style={{ ...SEAT_ROW_STYLE, background: BRAND.blueLight, border: `1.5px solid #8AD8EE` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={ICON_COL_STYLE}><IconTick size={16} /></div>
        <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.blueDark }}>Available</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconBlock />} title="Block appointment" onClick={onBlock} />
      </div>
    </div>
  );
}

function BlockedSeat({ onOpen, onAddBooking }) {
  return (
    <div style={{ ...SEAT_ROW_STYLE, background: BRAND.offWhite, border: `1.5px solid ${BRAND.greyLight}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={ICON_COL_STYLE}><IconBlock size={16} /></div>
        <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.coral }}>Blocked</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconReopen />} title="Re-open appointment" onClick={onOpen} />
      </div>
    </div>
  );
}

function SlotRow({ slot, slotIndex, capacity, bookings, onAdd, onRemove, overrides, onOverride, activeSlots, onOpenHuman, onOpenDog, onUpdate, currentDayKey, currentDateObj, bookingsByDay, dayOpenState }) {
  const [showForm, setShowForm] = useState(false);
  const [formSeat, setFormSeat] = useState(null);
  const hour = parseInt(slot.split(":")[0]);
  const min = parseInt(slot.split(":")[1]);
  const displayTime = `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;

  const slotBookings = capacity.bookings;
  const maxSeats = capacity.max;
  const slotOverrides = overrides || {};

  // Build an array of 2 seats
  const seats = [];
  for (let i = 0; i < 2; i++) {
    if (i < slotBookings.length) {
      seats.push({ type: "booking", booking: slotBookings[i] });
    } else if (slotOverrides[i] === "blocked") {
      // Staff manually blocked this seat
      seats.push({ type: "blocked", seatIndex: i, staffBlocked: true });
    } else if (slotOverrides[i] === "open" && i >= maxSeats) {
      // Staff manually opened a 2-2-1 blocked seat
      seats.push({ type: "available", seatIndex: i, staffOpened: true });
    } else if (i < maxSeats) {
      seats.push({ type: "available", seatIndex: i });
    } else {
      seats.push({ type: "blocked", seatIndex: i });
    }
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "72px 1fr", gap: 12,
      padding: "10px 16px", borderBottom: `1px solid ${BRAND.greyLight}`,
      background: BRAND.white, alignItems: "start",
    }}>
      {/* Time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.text, fontVariantNumeric: "tabular-nums" }}>{displayTime}</div>
      </div>

      {/* Both seats stacked */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {seats.map((seat, i) => (
          <div key={i}>
        {seat.type === "booking" ? (
          <BookingCard booking={seat.booking} onRemove={onRemove} onOpenHuman={onOpenHuman} onOpenDog={onOpenDog} onUpdate={onUpdate} currentDayKey={currentDayKey} currentDateObj={currentDateObj} bookingsByDay={bookingsByDay} dayOpenState={dayOpenState} />
        ) : seat.type === "available" ? (
          showForm && formSeat === i ? (
                <AddBookingForm slot={slot} bookings={bookings} activeSlots={activeSlots} onAdd={(b) => { onAdd(b); setShowForm(false); setFormSeat(null); }} onCancel={() => { setShowForm(false); setFormSeat(null); }} />
              ) : (
                <AvailableSeat
                  onAddBooking={() => { setShowForm(true); setFormSeat(i); }}
                  onBlock={() => onOverride(slot, i, "blocked")}
                />
              )
            ) : (
              showForm && formSeat === i ? (
                <AddBookingForm slot={slot} bookings={bookings} activeSlots={activeSlots} onAdd={(b) => { onAdd(b); setShowForm(false); setFormSeat(null); }} onCancel={() => { setShowForm(false); setFormSeat(null); }} />
              ) : (
                <BlockedSeat
                  onAddBooking={() => { setShowForm(true); setFormSeat(i); }}
                  onOpen={() => onOverride(slot, i, "open")}
                />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DatePickerModal({ currentDate, onSelectDate, onClose, dayOpenState }) {
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const isToday = (d) => {
    const t = new Date();
    return d === t.getDate() && viewMonth === t.getMonth() && viewYear === t.getFullYear();
  };
  const isSelected = (d) => {
    return d === currentDate.getDate() && viewMonth === currentDate.getMonth() && viewYear === currentDate.getFullYear();
  };

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, // Higher than other modals
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 16, width: 320, overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        {/* Month navigation header */}
        <div style={{
          background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
          padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <button onClick={prevMonth} style={{
            background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 6,
            width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={BRAND.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10 3l-5 5 5 5" /></svg>
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.white }}>{monthName}</div>
          <button onClick={nextMonth} style={{
            background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 6,
            width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={BRAND.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
          </button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "10px 12px 4px" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: BRAND.textLight, padding: "4px 0" }}>{d}</div>
          ))}
        </div>

        {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 12px 14px", gap: 2 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          
          const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(viewYear, viewMonth, d).getDay()];
          const isOpen = dayOpenState ? dayOpenState[dayKey] : true;
          const disabled = dayOpenState && !isOpen;
          
          return (
            <button key={d} onClick={() => { if (!disabled) onSelectDate(new Date(viewYear, viewMonth, d)); }} disabled={disabled} style={{
              width: "100%", aspectRatio: "1", border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: isSelected(d) ? 800 : 600, 
              cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
              background: isSelected(d) ? BRAND.blue : isToday(d) ? BRAND.blueLight : "transparent",
              color: disabled ? BRAND.greyLight : (isSelected(d) ? BRAND.white : isToday(d) ? BRAND.blue : BRAND.text),
              transition: "all 0.1s",
              opacity: disabled ? 0.5 : 1
            }}
            onMouseEnter={(e) => { if (!isSelected(d) && !disabled) e.currentTarget.style.background = BRAND.offWhite; }}
            onMouseLeave={(e) => { if (!isSelected(d) && !disabled) e.currentTarget.style.background = isToday(d) ? BRAND.blueLight : "transparent"; }}>
              {d}
            </button>
          );
        })}
      </div>

      {/* Today shortcut */}
        <div style={{ padding: "0 12px 14px", textAlign: "center" }}>
          <button onClick={() => { onSelectDate(new Date()); }} style={{
            background: "none", border: `1.5px solid ${BRAND.blue}`, borderRadius: 8,
            padding: "8px 20px", fontSize: 13, fontWeight: 600, color: BRAND.blue,
            cursor: "pointer", fontFamily: "inherit",
          }}>Today</button>
        </div>
      </div>
    </div>
  );
}

function CalendarDate({ dayName, dayNum, monthShort, year, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 62, borderRadius: 8, overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)", flexShrink: 0,
      cursor: "pointer", transition: "transform 0.15s",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
      {/* Day name header */}
      <div style={{
        background: BRAND.coral, padding: "4px 0", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color: BRAND.white, letterSpacing: 1.2, textTransform: "uppercase",
      }}>{dayName}</div>
      {/* Day number + month */}
      <div style={{
        background: BRAND.white, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "6px 0 5px",
      }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.text, lineHeight: 1 }}>{dayNum}</div>
        <div style={{ fontSize: 9, color: BRAND.textLight, fontWeight: 700, marginTop: 2, letterSpacing: 0.5 }}>{monthShort} {year}</div>
      </div>
    </div>
  );
}

function DayHeader({ day, date, dogCount, maxDogs, isOpen, onToggleOpen, onCalendarClick }) {
  const progress = dogCount / maxDogs;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px",
      background: isOpen ? `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})` : `linear-gradient(135deg, #9CA3AF, #6B7280)`,
      borderRadius: "14px 14px 0 0", color: BRAND.white,
    }}>
      <CalendarDate dayName={day} dayNum={date.dayNum} monthShort={date.monthShort} year={date.year} onClick={onCalendarClick} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {isOpen ? (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{dogCount}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>appointments</div>
            <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.3)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, progress * 100)}%`, height: "100%", background: progress > 0.85 ? BRAND.coral : BRAND.yellow, borderRadius: 2, transition: "width 0.3s ease" }} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.9 }}>Closed</div>
        )}
        <button onClick={onToggleOpen} title={isOpen ? "Close this day" : "Open this day"} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          transition: "transform 0.2s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
          <svg width={isOpen ? 78 : 90} height={68} viewBox={isOpen ? "0 0 78 68" : "0 0 90 68"}>
            {/* Nail */}
            <circle cx={isOpen ? 32 : 38} cy="4" r="3.5" fill="rgba(255,255,255,0.7)" />
            {/* Strings — right string shorter to tilt the other way */}
            <line x1={isOpen ? 32 : 38} y1="7" x2={isOpen ? 14 : 14} y2="28" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            <line x1={isOpen ? 32 : 38} y1="7" x2={isOpen ? 66 : 78} y2="22" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
            {/* Sign board — tilted */}
            <g transform={`rotate(-5, ${isOpen ? 39 : 45}, 40)`}>
              <rect x={isOpen ? 5 : 5} y="22" width={isOpen ? 68 : 80} height="36" rx="4" fill={isOpen ? BRAND.openGreen : BRAND.closedRed} />
              <rect x={isOpen ? 8 : 8} y="25" width={isOpen ? 62 : 74} height="30" rx="3" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <text x={isOpen ? 39 : 45} y="46" textAnchor="middle" fill="white" fontSize="16" fontWeight="800" fontFamily="inherit" letterSpacing="2">{isOpen ? "OPEN" : "CLOSED"}</text>
            </g>
          </svg>
        </button>
      </div>
    </div>
  );
}

function ClosedDayView({ onOpen }) {
  return (
    <div style={{
      padding: "48px 16px", textAlign: "center",
      background: BRAND.offWhite, borderRadius: "0 0 14px 14px",
      border: `1px solid ${BRAND.greyLight}`, borderTop: "none",
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🐾</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>Salon closed</div>
      <div style={{ fontSize: 13, color: BRAND.textLight, lineHeight: 1.5, marginBottom: 16 }}>
        No appointments on this day.
      </div>
      <button onClick={onOpen} style={{
        background: BRAND.blue, color: BRAND.white, border: "none", borderRadius: 10,
        padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
        fontFamily: "inherit", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}>
        Open this day
      </button>
    </div>
  );
}


function Legend() {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 14, padding: "10px 16px",
      background: BRAND.offWhite, borderRadius: 10, marginBottom: 16, fontSize: 12, color: BRAND.textLight,
      alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><SizeTag size="small" legendMode /> Small</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><SizeTag size="medium" legendMode /> Medium</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><SizeTag size="large" legendMode /> Large</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconTick /> Available</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconBlock /> Blocked</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconReopen /> Re-open</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconEdit /> Edit</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><IconMessage /> Message</div>
    </div>
  );
}

// ============================================================
// WEEK NAV
// ============================================================

function WeekArrowBtn({ direction, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 28, display: "flex", alignItems: "center", justifyContent: "center",
      background: BRAND.blue, border: "none", borderRadius: 8, cursor: "pointer",
      transition: "all 0.15s", flexShrink: 0,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={BRAND.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M10 3l-5 5 5 5" /> : <path d="M6 3l5 5-5 5" />}
      </svg>
    </button>
  );
}

function WeekNav({ selectedDay, onSelectDay, bookingsByDay, dayOpenState, onPrevWeek, onNextWeek }) {
  return (
    <div style={{ display: "flex", gap: 4, background: BRAND.offWhite, borderRadius: 12, padding: 4 }}>
      <WeekArrowBtn direction="left" onClick={onPrevWeek} />
      {ALL_DAYS.map((day, i) => {
        const isSelected = selectedDay === i;
        const isOpen = dayOpenState[day.key];
        const count = (bookingsByDay[day.key] || []).length;

        let bg, labelColor, countColor;
        if (isSelected) {
          bg = isOpen ? BRAND.blue : "#9CA3AF";
          labelColor = BRAND.white;
          countColor = "rgba(255,255,255,0.85)";
        } else {
          bg = "transparent";
          labelColor = isOpen ? BRAND.text : BRAND.textLight;
          countColor = isOpen
            ? (count > 0 ? BRAND.blue : BRAND.textLight)
            : BRAND.closedRed;
        }

        return (
          <button
            key={day.key}
            onClick={() => onSelectDay(i)}
            style={{
              flex: 1,
              padding: "6px 4px 8px",
              borderRadius: 8,
              border: "none",
              background: bg,
              color: labelColor,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            <span>{day.label}</span>
            <span style={{
              fontSize: 11,
              fontWeight: 800,
              color: countColor,
              lineHeight: 1,
            }}>
              {isOpen ? count : "—"}
            </span>
          </button>
        );
      })}
      <WeekArrowBtn direction="right" onClick={onNextWeek} />
    </div>
  );
}

// ============================================================
// HUMANS VIEW (ROLODEX)
// ============================================================

function HumansView({ onOpenHuman }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredHumans = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const allHumans = Object.values(SAMPLE_HUMANS).sort((a, b) => a.name.localeCompare(b.name));
    if (!query) return allHumans;

    return allHumans.filter(human => {
      const fullName = `${human.name} ${human.surname}`.toLowerCase();
      const dogs = Object.values(SAMPLE_DOGS).filter(d => d.humanId === `${human.name} ${human.surname}`);
      const dogSearchString = dogs.map(d => `${d.name} ${d.breed}`).join(" ").toLowerCase();
      const searchString = `${fullName} ${human.phone} ${human.email} ${human.address} ${human.notes} ${human.historyFlag} ${human.trustedIds.join(" ")} ${dogSearchString}`;
      
      return searchString.includes(query);
    });
  }, [searchQuery]);

  return (
    <div style={{ animation: "fadeIn 0.2s ease-in" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: BRAND.text }}>Humans Directory</h2>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Search by name, phone, address, dog, or notes.</div>
        </div>
        
        <div style={{ position: "relative", width: "100%", maxWidth: 320 }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
            <IconSearch size={16} colour={BRAND.textLight} />
          </div>
          <input 
            type="text" 
            placeholder="Search rolodex..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10,
              border: `1.5px solid ${BRAND.greyLight}`, fontSize: 14, fontFamily: "inherit",
              boxSizing: "border-box", outline: "none", color: BRAND.text,
              transition: "border-color 0.15s"
            }}
            onFocus={e => e.target.style.borderColor = BRAND.teal}
            onBlur={e => e.target.style.borderColor = BRAND.greyLight}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {filteredHumans.map(human => {
          const fullName = `${human.name} ${human.surname}`;
          const dogs = Object.values(SAMPLE_DOGS).filter(d => d.humanId === fullName);
          
          return (
            <div 
              key={human.id} 
              onClick={() => onOpenHuman(fullName)}
              style={{
                background: BRAND.white, borderRadius: 12, border: `1px solid ${BRAND.greyLight}`,
                overflow: "hidden", cursor: "pointer", transition: "all 0.15s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND.teal; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(45,139,122,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.03)"; }}
            >
              <div style={{ background: BRAND.tealLight, padding: "14px 16px", borderBottom: `1px solid ${BRAND.greyLight}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1F6659" }}>{fullName}</div>
                  <div style={{ fontSize: 13, color: BRAND.text, fontWeight: 600, marginTop: 4 }}>{human.phone || "No phone"}</div>
                </div>
                {human.historyFlag && (
                  <span title={human.historyFlag} style={{ fontSize: 16 }}>⚠️</span>
                )}
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: BRAND.textLight, marginBottom: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Dogs</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {dogs.length > 0 ? dogs.map(d => (
                    <span key={d.id} style={{ background: BRAND.offWhite, border: `1px solid ${BRAND.greyLight}`, padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, color: BRAND.text }}>
                      {d.name} <span style={{ color: BRAND.textLight, fontWeight: 500 }}>({d.breed})</span>
                    </span>
                  )) : <span style={{ fontSize: 13, color: BRAND.textLight, fontStyle: "italic" }}>None listed</span>}
                </div>
              </div>
            </div>
          );
        })}
        
        {filteredHumans.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: BRAND.textLight }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No humans found matching "{searchQuery}"</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Try searching by phone number or dog breed instead.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS VIEW
// ============================================================

function SettingsView({ onBack }) {
  const SectionTitle = ({ children, description }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: BRAND.blueDark, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </div>
      {description && <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>{description}</div>}
    </div>
  );

  const Card = ({ children }) => (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.greyLight}`, borderRadius: 14, padding: "24px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.03)" }}>
      {children}
    </div>
  );

  const SettingRow = ({ label, control, border = true }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: border ? `1px solid ${BRAND.greyLight}` : "none" }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>{label}</span>
      <div>{control}</div>
    </div>
  );

  const inputStyle = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${BRAND.greyLight}`, fontSize: 13, outline: "none", fontFamily: "inherit", color: BRAND.text, width: 100, textAlign: "right" };

  return (
    <div style={{ animation: "fadeIn 0.2s ease-in" }}>
      {/* Settings Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: BRAND.text }}>Salon Settings</h2>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 4 }}>Manage operations, pricing, and capacity rules.</div>
        </div>
        <button onClick={onBack} style={{
          background: BRAND.blueLight, color: BRAND.blueDark, border: "none", borderRadius: 8,
          padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 8
        }} onMouseEnter={e => e.currentTarget.style.background = "#cbf0fa"} onMouseLeave={e => e.currentTarget.style.background = BRAND.blueLight}>
          <IconTick size={16} colour={BRAND.blueDark} /> Back to Dashboard
        </button>
      </div>

      {/* Category 1: Operations */}
      <Card>
        <SectionTitle description="Default time allocations for new appointments.">Salon Operations</SectionTitle>
        <SettingRow label="Default estimated pick-up offset (minutes)" control={<input type="number" defaultValue={120} style={inputStyle} readOnly />} border={false} />
      </Card>

      {/* Category 2: Services & Pricing */}
      <Card>
        <SectionTitle description="Base prices applied when booking a dog based on their size profile.">Services & Pricing</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND.greyLight}` }}>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700 }}>Service</th>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700, textAlign: "right" }}>Small</th>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700, textAlign: "right" }}>Medium</th>
                <th style={{ padding: "12px 0", color: BRAND.textLight, fontWeight: 700, textAlign: "right" }}>Large</th>
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((s, index) => (
                <tr key={s.id} style={{ borderBottom: index === SERVICES.length - 1 ? "none" : `1px solid ${BRAND.greyLight}` }}>
                  <td style={{ padding: "16px 0", fontWeight: 600 }}>{s.icon} {s.name}</td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}><input type="text" defaultValue={PRICING[s.id].small} style={{...inputStyle, width: 70}} readOnly /></td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}><input type="text" defaultValue={PRICING[s.id].medium} style={{...inputStyle, width: 70}} readOnly /></td>
                  <td style={{ padding: "16px 0", textAlign: "right" }}><input type="text" defaultValue={PRICING[s.id].large} style={{...inputStyle, width: 70}} readOnly /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Category 3: Capacity Engine */}
      <Card>
        <SectionTitle description="Rules governing how many dogs can be booked at once.">Capacity Engine (2-2-1 Rule)</SectionTitle>
        <SettingRow label="Enforce 2-2-1 strict capacity rules" control={
          <div style={{ width: 44, height: 24, background: BRAND.openGreen, borderRadius: 12, position: "relative", cursor: "pointer" }}>
            <div style={{ width: 20, height: 20, background: BRAND.white, borderRadius: 10, position: "absolute", right: 2, top: 2 }}></div>
          </div>
        } />
        <div style={{ padding: "16px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>Large Dog approved slots</div>
            <div style={{ fontSize: 12, color: BRAND.textLight, maxWidth: 300 }}>Slots where large dogs are permitted. Slots requiring Leam's manual approval will block direct booking.</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 300 }}>
            {Object.keys(LARGE_DOG_SLOTS).map(time => (
              <span key={time} style={{ background: BRAND.coralLight, color: BRAND.coral, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                {time}
              </span>
            ))}
            <button style={{ background: BRAND.offWhite, border: `1px dashed ${BRAND.grey}`, color: BRAND.textLight, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Add Slot</button>
          </div>
        </div>
      </Card>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================


export default function App() {
  const [activeView, setActiveView] = useState("dashboard"); // "dashboard" | "settings" | "humans"
  const [selectedHumanId, setSelectedHumanId] = useState(null);
  const [selectedDogId, setSelectedDogId] = useState(null);

  const [bookingsByDay, setBookingsByDay] = useState(SAMPLE_BOOKINGS_BY_DAY);
  const [selectedDay, setSelectedDay] = useState(0);
  // Staff overrides: { dayKey: { slot: { seatIndex: "blocked" | "open" } } }
  const [overridesByDay, setOverridesByDay] = useState({});
  // Admin day open/close overrides: { dayKey: true/false }
  const defaultOpenState = {};
  ALL_DAYS.forEach((d) => { defaultOpenState[d.key] = d.defaultOpen; });
  const [dayOpenState, setDayOpenState] = useState(defaultOpenState);
  
  // Extra slots added by staff: { dayKey: ["13:30", "14:00", ...] }
  const [extraSlotsByDay, setExtraSlotsByDay] = useState({});

  const toggleDayOpen = useCallback((dayKey) => {
    setDayOpenState((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
  }, []);

  const currentDayConfig = ALL_DAYS[selectedDay];
  
  const handleAddSlot = useCallback(() => {
    setExtraSlotsByDay((prev) => {
      const dayKey = currentDayConfig.key;
      const existing = prev[dayKey] || [];
      const lastSlot = existing.length > 0 ? existing[existing.length - 1] : SALON_SLOTS[SALON_SLOTS.length - 1];
      let [h, m] = lastSlot.split(":").map(Number);
      m += 30;
      if (m >= 60) { h += 1; m -= 60; }
      const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      return { ...prev, [dayKey]: [...existing, newSlot] };
    });
  }, [currentDayConfig.key]);

  const isOpen = dayOpenState[currentDayConfig.key];
  const dayBookings = bookingsByDay[currentDayConfig.key] || [];
  const dayOverrides = overridesByDay[currentDayConfig.key] || {};

  const handleRemoveSlot = useCallback(() => {
    const dayKey = currentDayConfig.key;
    const existing = extraSlotsByDay[dayKey] || [];
    if (existing.length === 0) return;
    
    const slotToRemove = existing[existing.length - 1];
    const hasBookings = dayBookings.some((b) => b.slot === slotToRemove);
    if (hasBookings) {
      alert(`Cannot remove ${slotToRemove} because it has active appointments. Please move or cancel them first.`);
      return;
    }

    setExtraSlotsByDay((prev) => {
      const updated = existing.slice(0, -1);
      return { ...prev, [dayKey]: updated };
    });
  }, [currentDayConfig.key, extraSlotsByDay, dayBookings]);

  const activeSlots = useMemo(() => [...SALON_SLOTS, ...(extraSlotsByDay[currentDayConfig.key] || [])], [extraSlotsByDay, currentDayConfig.key]);

  const capacities = useMemo(() => computeSlotCapacities(dayBookings, activeSlots), [dayBookings, activeSlots]);
  const dogCount = dayBookings.length;

  const handleUpdate = useCallback((updatedBooking, oldDayKey, newDayKey) => {
    setBookingsByDay((prev) => {
      if (!oldDayKey || !newDayKey || oldDayKey === newDayKey) {
        const dayKey = oldDayKey || currentDayConfig.key;
        const updatedDayBookings = (prev[dayKey] || []).map(b => b.id === updatedBooking.id ? updatedBooking : b);
        return { ...prev, [dayKey]: updatedDayBookings };
      } else {
        // Cross-day move
        const oldDayBookings = (prev[oldDayKey] || []).filter(b => b.id !== updatedBooking.id);
        const newDayBookings = [...(prev[newDayKey] || []), updatedBooking];
        newDayBookings.sort((a, b) => a.slot.localeCompare(b.slot));
        return { ...prev, [oldDayKey]: oldDayBookings, [newDayKey]: newDayBookings };
      }
    });
  }, [currentDayConfig.key]);

  const handleAdd = useCallback((booking) => {
    setBookingsByDay((prev) => ({
      ...prev,
      [currentDayConfig.key]: [...(prev[currentDayConfig.key] || []), booking],
    }));
    // Clear any override on that seat when a booking is added
  }, [currentDayConfig.key]);

  const handleRemove = useCallback((id) => {
    setBookingsByDay((prev) => ({
      ...prev,
      [currentDayConfig.key]: (prev[currentDayConfig.key] || []).filter((b) => b.id !== id),
    }));
  }, [currentDayConfig.key]);

  const handleOverride = useCallback((slot, seatIndex, action) => {
    setOverridesByDay((prev) => {
      const dayKey = currentDayConfig.key;
      const dayOvr = { ...(prev[dayKey] || {}) };
      const slotOvr = { ...(dayOvr[slot] || {}) };

      if (action === "blocked") {
        slotOvr[seatIndex] = "blocked";
      } else if (action === "open") {
        // If it was staff-blocked, just remove the override
        if (slotOvr[seatIndex] === "blocked") {
          delete slotOvr[seatIndex];
        } else {
          // Opening a 2-2-1 blocked seat
          slotOvr[seatIndex] = "open";
        }
      }

      dayOvr[slot] = slotOvr;
      return { ...prev, [dayKey]: dayOvr };
    });
  }, [currentDayConfig.key]);

  // Week navigation — weekStart is always a Monday
  const getMonday = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const goToPrevWeek = useCallback(() => {
    setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; });
  }, []);
  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; });
  }, []);

  const handleDatePick = useCallback((pickedDate) => {
    const newMonday = getMonday(pickedDate);
    setWeekStart(newMonday);
    const dayIndex = (pickedDate.getDay() + 6) % 7; // Mon=0 ... Sun=6
    setSelectedDay(dayIndex);
  }, []);

  const dates = ALL_DAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return {
      full: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      dayNum: d.getDate(),
      monthShort: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
      year: d.getFullYear(),
      dateObj: d,
    };
  });

  const currentDateObj = dates[selectedDay]?.dateObj || new Date();

  return (
    <div style={{
      maxWidth: 900, margin: "0 auto",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: BRAND.text, padding: "20px 16px",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ cursor: "pointer" }} onClick={() => setActiveView("dashboard")}>
          <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.text }}>
            Smarter<span style={{ color: BRAND.blue }}>Dog</span>
          </div>
          <div style={{ fontSize: 13, color: BRAND.textLight, marginTop: 2 }}>Salon Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={{
            background: BRAND.white, border: `1px solid ${BRAND.greyLight}`, borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600, color: BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.color = BRAND.blue; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; }}>
            Dogs
          </button>
          
          <button 
          onClick={() => setActiveView("humans")}
          style={{
            background: activeView === "humans" ? BRAND.tealLight : BRAND.white, 
            border: `1px solid ${activeView === "humans" ? BRAND.teal : BRAND.greyLight}`, 
            borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600, 
            color: activeView === "humans" ? "#1F6659" : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "humans") { e.currentTarget.style.borderColor = BRAND.teal; e.currentTarget.style.color = BRAND.teal; } }}
          onMouseLeave={(e) => { if (activeView !== "humans") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>
            Humans
          </button>

          <button 
          onClick={() => setActiveView("settings")}
          style={{
            background: activeView === "settings" ? BRAND.blueLight : BRAND.white, 
            border: `1px solid ${activeView === "settings" ? BRAND.blue : BRAND.greyLight}`, 
            borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600, 
            color: activeView === "settings" ? BRAND.blueDark : BRAND.text,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { if (activeView !== "settings") { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.color = BRAND.blue; } }}
          onMouseLeave={(e) => { if (activeView !== "settings") { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.text; } }}>
            Settings
          </button>
          <button style={{
            background: BRAND.coralLight, border: "none", borderRadius: 8,
            padding: "9px 16px", fontSize: 13, fontWeight: 700, color: BRAND.coral,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.coralLight; e.currentTarget.style.color = BRAND.coral; }}>
            Log out
          </button>
        </div>
      </div>

      {activeView === "settings" ? (
        <SettingsView onBack={() => setActiveView("dashboard")} />
      ) : activeView === "humans" ? (
        <HumansView onOpenHuman={setSelectedHumanId} />
      ) : (
        <>
          {/* Week navigation */}
          <div style={{ marginBottom: 16 }}>
            <WeekNav selectedDay={selectedDay} onSelectDay={setSelectedDay} bookingsByDay={bookingsByDay} dayOpenState={dayOpenState} onPrevWeek={goToPrevWeek} onNextWeek={goToNextWeek} />
          </div>

          {/* Day content */}
          {isOpen ? (
            <>
              <Legend />
              <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${BRAND.greyLight}`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                <DayHeader day={currentDayConfig.full} date={dates[selectedDay]} dogCount={dogCount} maxDogs={16} isOpen={true} onToggleOpen={() => toggleDayOpen(currentDayConfig.key)} onCalendarClick={() => setShowDatePicker(true)} />
                {activeSlots.map((slot, i) => (
                  <SlotRow key={slot} slot={slot} slotIndex={i} capacity={capacities[slot]} bookings={dayBookings} onAdd={handleAdd} onRemove={handleRemove} overrides={dayOverrides[slot]} onOverride={handleOverride} activeSlots={activeSlots} onOpenHuman={setSelectedHumanId} onOpenDog={setSelectedDogId} onUpdate={handleUpdate} currentDayKey={currentDayConfig.key} currentDateObj={currentDateObj} bookingsByDay={bookingsByDay} dayOpenState={dayOpenState} />
                ))}
                <div style={{ padding: "12px 16px", borderTop: `1px solid ${BRAND.greyLight}`, background: BRAND.white, display: "flex", flexDirection: "column", gap: 8 }}>
                  {(extraSlotsByDay[currentDayConfig.key] || []).length > 0 && (
                    <button onClick={handleRemoveSlot} style={{
                      width: "100%", padding: "10px", borderRadius: 10, border: "none",
                      background: BRAND.blue, color: BRAND.white, fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueDark; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.blue; }}>
                      Remove added timeslot
                    </button>
                  )}
                  <button onClick={handleAddSlot} style={{
                    width: "100%", padding: "10px", borderRadius: 10, border: "none",
                    background: BRAND.coral, color: BRAND.white, fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#D9466F"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.coral; }}>
                    Add another timeslot
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <DayHeader day={currentDayConfig.full} date={dates[selectedDay]} dogCount={0} maxDogs={16} isOpen={false} onToggleOpen={() => toggleDayOpen(currentDayConfig.key)} onCalendarClick={() => setShowDatePicker(true)} />
              <ClosedDayView onOpen={() => toggleDayOpen(currentDayConfig.key)} />
            </div>
          )}

          {showDatePicker && (
            <DatePickerModal
              currentDate={currentDateObj}
              dayOpenState={dayOpenState}
              onSelectDate={handleDatePick}
              onClose={() => setShowDatePicker(false)}
            />
          )}
        </>
      )}
      
      {selectedHumanId && <HumanCardModal humanId={selectedHumanId} onClose={() => setSelectedHumanId(null)} onOpenHuman={setSelectedHumanId} onOpenDog={setSelectedDogId} />}
      {selectedDogId && <DogCardModal dogId={selectedDogId} onClose={() => setSelectedDogId(null)} onOpenHuman={setSelectedHumanId} />}
    </div>
  );
}