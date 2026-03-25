/**
 * Seed script for Supabase.
 * Run: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node src/supabase/seed.js
 *
 * Requires: npm install @supabase/supabase-js (already installed)
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// -- Sample data (inline to avoid ESM import issues with Vite paths) --

const SAMPLE_HUMANS = {
  "Sarah Jones": { name: "Sarah", surname: "Jones", phone: "07700 900111", sms: true, whatsapp: true, email: "sarah@example.com", fb: "", insta: "@sarahj", tiktok: "", address: "123 Main St", notes: "Prefers texts", trustedIds: ["Dave Smith"], historyFlag: "1 No-show (Oct 2023)" },
  "Dave Smith": { name: "Dave", surname: "Smith", phone: "07700 900112", sms: true, whatsapp: false, email: "dave@example.com", fb: "davesmith", insta: "", tiktok: "", address: "456 Side St", notes: "", trustedIds: ["Sarah Jones"], historyFlag: "" },
  "Emma Wilson": { name: "Emma", surname: "Wilson", phone: "07700 900113", sms: false, whatsapp: true, email: "emma@example.com", fb: "", insta: "", tiktok: "", address: "789 Park Rd", notes: "", trustedIds: [], historyFlag: "" },
  "Tom Baker": { name: "Tom", surname: "Baker", phone: "07700 900114", sms: true, whatsapp: true, email: "tom@example.com", fb: "", insta: "", tiktok: "", address: "101 High St", notes: "", trustedIds: [], historyFlag: "" },
  "Lisa Brown": { name: "Lisa", surname: "Brown", phone: "07700 900115", sms: true, whatsapp: false, email: "lisa@example.com", fb: "", insta: "", tiktok: "", address: "202 Elm St", notes: "", trustedIds: [], historyFlag: "" },
  "Jenny Taylor": { name: "Jenny", surname: "Taylor", phone: "07700 900116", sms: false, whatsapp: false, email: "jenny@example.com", fb: "", insta: "", tiktok: "", address: "303 Oak St", notes: "", trustedIds: [], historyFlag: "" },
  "Mark Johnson": { name: "Mark", surname: "Johnson", phone: "07700 900117", sms: true, whatsapp: true, email: "mark@example.com", fb: "", insta: "", tiktok: "", address: "404 Pine St", notes: "", trustedIds: [], historyFlag: "" },
  // Extra humans referenced in bookings but not in main sample
  "Amy Clarke": { name: "Amy", surname: "Clarke", phone: "", sms: false, whatsapp: false, email: "", fb: "", insta: "", tiktok: "", address: "", notes: "", trustedIds: [], historyFlag: "" },
  "Rik Patel": { name: "Rik", surname: "Patel", phone: "", sms: false, whatsapp: false, email: "", fb: "", insta: "", tiktok: "", address: "", notes: "", trustedIds: [], historyFlag: "" },
  "Helen Wright": { name: "Helen", surname: "Wright", phone: "", sms: false, whatsapp: false, email: "", fb: "", insta: "", tiktok: "", address: "", notes: "", trustedIds: [], historyFlag: "" },
};

const SAMPLE_DOGS = {
  "Bella": { name: "Bella", breed: "Cockapoo", age: "3 yrs", humanId: "Sarah Jones", alerts: ["Allergic to oatmeal shampoo"], groomNotes: "Teddy bear cut, short on ears." },
  "Max": { name: "Max", breed: "Shih Tzu", age: "5 yrs", humanId: "Dave Smith", alerts: ["Bites / Nips"], groomNotes: "Leave tail long." },
  "Luna": { name: "Luna", breed: "Cavapoo", age: "2 yrs", humanId: "Emma Wilson", alerts: [], groomNotes: "" },
  "Charlie": { name: "Charlie", breed: "Bichon Frise", age: "4 yrs", humanId: "Tom Baker", alerts: [], groomNotes: "" },
  "Daisy": { name: "Daisy", breed: "Poodle", age: "1 yr", humanId: "Lisa Brown", alerts: [], groomNotes: "" },
  "Milo": { name: "Milo", breed: "Maltese", age: "6 yrs", humanId: "Jenny Taylor", alerts: [], groomNotes: "" },
  "Rex": { name: "Rex", breed: "Labrador", age: "7 yrs", humanId: "Mark Johnson", alerts: [], groomNotes: "" },
  // Extra dogs from bookings
  "Coco": { name: "Coco", breed: "Pomeranian", age: "", humanId: "Amy Clarke", alerts: [], groomNotes: "" },
  "Teddy": { name: "Teddy", breed: "Goldendoodle", age: "", humanId: "Rik Patel", alerts: [], groomNotes: "" },
  "Poppy": { name: "Poppy", breed: "Cocker Spaniel", age: "", humanId: "Helen Wright", alerts: [], groomNotes: "" },
};

const SAMPLE_BOOKINGS_BY_DAY = {
  mon: [
    { slot: "08:30", dogName: "Bella", size: "small", service: "full_groom", status: "Checked In", addons: [], pickupBy: "Dave Smith", payment: "Deposit Paid" },
    { slot: "08:30", dogName: "Max", size: "medium", service: "bath_brush", status: "Not Arrived", addons: [], pickupBy: "Dave Smith", payment: "Due at Pick-up" },
    { slot: "09:00", dogName: "Luna", size: "small", service: "full_groom" },
    { slot: "09:00", dogName: "Charlie", size: "medium", service: "bath_deshed" },
    { slot: "10:00", dogName: "Daisy", size: "small", service: "full_groom" },
    { slot: "10:00", dogName: "Milo", size: "small", service: "bath_brush" },
    { slot: "12:00", dogName: "Rex", size: "large", service: "bath_deshed" },
  ],
  tue: [
    { slot: "08:30", dogName: "Coco", size: "small", service: "full_groom" },
    { slot: "09:00", dogName: "Teddy", size: "medium", service: "bath_brush" },
    { slot: "09:30", dogName: "Poppy", size: "medium", service: "full_groom" },
  ],
};

const PRICING = {
  full_groom: { small: "\u00A342+", medium: "\u00A346+", large: "\u00A360+" },
  bath_brush: { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  bath_deshed: { small: "\u00A338+", medium: "\u00A342+", large: "\u00A355+" },
  puppy_cut: { small: "\u00A338", medium: "\u00A338", large: "N/A" },
};

const LARGE_DOG_SLOTS = {
  "08:30": { seats: 1, canShare: true, needsApproval: false },
  "09:00": { seats: 1, canShare: true, needsApproval: false, conditional: true },
  "12:00": { seats: 2, canShare: false, needsApproval: false },
  "12:30": { seats: 2, canShare: false, needsApproval: false },
  "13:00": { seats: 2, canShare: false, needsApproval: false },
};

// --- Seed logic ---

async function seed() {
  console.log("Seeding Supabase...");

  // 1. Insert humans
  const humanNameToUuid = {};
  for (const [fullName, h] of Object.entries(SAMPLE_HUMANS)) {
    const { data, error } = await supabase.from("humans").insert({
      name: h.name, surname: h.surname, phone: h.phone,
      sms: h.sms, whatsapp: h.whatsapp, email: h.email,
      fb: h.fb, insta: h.insta, tiktok: h.tiktok,
      address: h.address, notes: h.notes, history_flag: h.historyFlag,
    }).select("id").single();
    if (error) { console.error(`Human ${fullName}:`, error.message); continue; }
    humanNameToUuid[fullName] = data.id;
    console.log(`  Human: ${fullName} -> ${data.id}`);
  }

  // 2. Insert trusted contacts
  for (const [fullName, h] of Object.entries(SAMPLE_HUMANS)) {
    for (const trustedName of h.trustedIds) {
      const humanId = humanNameToUuid[fullName];
      const trustedId = humanNameToUuid[trustedName];
      if (humanId && trustedId) {
        await supabase.from("human_trusted_contacts").insert({
          human_id: humanId, trusted_id: trustedId,
        });
      }
    }
  }
  console.log("  Trusted contacts inserted");

  // 3. Insert dogs
  const dogNameToUuid = {};
  for (const [dogName, d] of Object.entries(SAMPLE_DOGS)) {
    const humanUuid = humanNameToUuid[d.humanId];
    if (!humanUuid) { console.error(`  Dog ${dogName}: owner "${d.humanId}" not found`); continue; }
    const { data, error } = await supabase.from("dogs").insert({
      name: d.name, breed: d.breed, age: d.age,
      human_id: humanUuid, alerts: d.alerts, groom_notes: d.groomNotes,
    }).select("id").single();
    if (error) { console.error(`Dog ${dogName}:`, error.message); continue; }
    dogNameToUuid[dogName] = data.id;
    console.log(`  Dog: ${dogName} -> ${data.id}`);
  }

  // 4. Insert bookings with actual dates (this week)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const dayToOffset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

  for (const [dayKey, bookings] of Object.entries(SAMPLE_BOOKINGS_BY_DAY)) {
    const bookingDate = new Date(monday);
    bookingDate.setDate(monday.getDate() + dayToOffset[dayKey]);
    const dateStr = bookingDate.toISOString().split("T")[0];

    for (const b of bookings) {
      const dogUuid = dogNameToUuid[b.dogName];
      if (!dogUuid) { console.error(`  Booking: dog "${b.dogName}" not found`); continue; }

      const pickupUuid = b.pickupBy ? humanNameToUuid[b.pickupBy] : null;

      const { error } = await supabase.from("bookings").insert({
        booking_date: dateStr, slot: b.slot, dog_id: dogUuid,
        size: b.size, service: b.service,
        status: b.status || "Not Arrived",
        addons: b.addons || [],
        pickup_by_id: pickupUuid,
        payment: b.payment || "Due at Pick-up",
      });
      if (error) console.error(`  Booking ${b.dogName} ${dateStr}:`, error.message);
    }
    console.log(`  Bookings for ${dayKey} (${dateStr}): ${bookings.length}`);
  }

  // 5. Insert salon config
  const { error: configErr } = await supabase.from("salon_config").insert({
    default_pickup_offset: 120,
    pricing: PRICING,
    enforce_capacity: true,
    large_dog_slots: LARGE_DOG_SLOTS,
  });
  if (configErr) console.error("Salon config:", configErr.message);
  else console.log("  Salon config inserted");

  console.log("Seed complete!");
}

seed().catch(console.error);
