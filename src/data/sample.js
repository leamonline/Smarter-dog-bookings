export const SAMPLE_HUMANS = {
  "Sarah Jones": { id: "h1", name: "Sarah", surname: "Jones", phone: "07700 900111", sms: true, whatsapp: true, email: "sarah@example.com", fb: "", insta: "@sarahj", tiktok: "", address: "123 Main St", notes: "Prefers texts", trustedIds: ["Dave Smith"], historyFlag: "1 No-show (Oct 2023)" },
  "Dave Smith": { id: "h2", name: "Dave", surname: "Smith", phone: "07700 900112", sms: true, whatsapp: false, email: "dave@example.com", fb: "davesmith", insta: "", tiktok: "", address: "456 Side St", notes: "", trustedIds: ["Sarah Jones"], historyFlag: "" },
  "Emma Wilson": { id: "h3", name: "Emma", surname: "Wilson", phone: "07700 900113", sms: false, whatsapp: true, email: "emma@example.com", fb: "", insta: "", tiktok: "", address: "789 Park Rd", notes: "", trustedIds: [] },
  "Tom Baker": { id: "h4", name: "Tom", surname: "Baker", phone: "07700 900114", sms: true, whatsapp: true, email: "tom@example.com", fb: "", insta: "", tiktok: "", address: "101 High St", notes: "", trustedIds: [] },
  "Lisa Brown": { id: "h5", name: "Lisa", surname: "Brown", phone: "07700 900115", sms: true, whatsapp: false, email: "lisa@example.com", fb: "", insta: "", tiktok: "", address: "202 Elm St", notes: "", trustedIds: [] },
  "Jenny Taylor": { id: "h6", name: "Jenny", surname: "Taylor", phone: "07700 900116", sms: false, whatsapp: false, email: "jenny@example.com", fb: "", insta: "", tiktok: "", address: "303 Oak St", notes: "", trustedIds: [] },
  "Mark Johnson": { id: "h7", name: "Mark", surname: "Johnson", phone: "07700 900117", sms: true, whatsapp: true, email: "mark@example.com", fb: "", insta: "", tiktok: "", address: "404 Pine St", notes: "", trustedIds: [] },
};

export const SAMPLE_DOGS = {
  "Bella": { id: "d1", name: "Bella", breed: "Cockapoo", age: "3 yrs", humanId: "Sarah Jones", alerts: ["Allergic to oatmeal shampoo"], groomNotes: "Teddy bear cut, short on ears." },
  "Max": { id: "d2", name: "Max", breed: "Shih Tzu", age: "5 yrs", humanId: "Dave Smith", alerts: ["Bites / Nips"], groomNotes: "Leave tail long." },
  "Luna": { id: "d3", name: "Luna", breed: "Cavapoo", age: "2 yrs", humanId: "Emma Wilson", alerts: [], groomNotes: "" },
  "Charlie": { id: "d4", name: "Charlie", breed: "Bichon Frise", age: "4 yrs", humanId: "Tom Baker", alerts: [], groomNotes: "" },
  "Daisy": { id: "d5", name: "Daisy", breed: "Poodle", age: "1 yr", humanId: "Lisa Brown" },
  "Milo": { id: "d6", name: "Milo", breed: "Maltese", age: "6 yrs", humanId: "Jenny Taylor" },
  "Rex": { id: "d7", name: "Rex", breed: "Labrador", age: "7 yrs", humanId: "Mark Johnson" },
};

export const SAMPLE_BOOKINGS_BY_DAY = {
  mon: [
    { id: 1, slot: "08:30", dogName: "Bella", breed: "Cockapoo", size: "small", service: "full-groom", owner: "Sarah Jones", status: "Checked in", addons: [], pickupBy: "Dave Smith", payment: "Deposit Paid" },
    { id: 2, slot: "08:30", dogName: "Max", breed: "Shih Tzu", size: "medium", service: "bath-and-brush", owner: "Dave Smith", status: "No-show", addons: [], pickupBy: "Dave Smith", payment: "Due at Pick-up" },
    { id: 3, slot: "09:00", dogName: "Luna", breed: "Cavapoo", size: "small", service: "full-groom", owner: "Emma Wilson" },
    { id: 4, slot: "09:00", dogName: "Charlie", breed: "Bichon Frise", size: "medium", service: "bath-and-deshed", owner: "Tom Baker" },
    { id: 5, slot: "10:00", dogName: "Daisy", breed: "Poodle", size: "small", service: "full-groom", owner: "Lisa Brown" },
    { id: 6, slot: "10:00", dogName: "Milo", breed: "Maltese", size: "small", service: "bath-and-brush", owner: "Jenny Taylor" },
    { id: 7, slot: "12:00", dogName: "Rex", breed: "Labrador", size: "large", service: "bath-and-deshed", owner: "Mark Johnson" },
  ],
  tue: [
    { id: 101, slot: "08:30", dogName: "Coco", breed: "Pomeranian", size: "small", service: "full-groom", owner: "Amy Clarke" },
    { id: 102, slot: "09:00", dogName: "Teddy", breed: "Goldendoodle", size: "medium", service: "bath-and-brush", owner: "Rik Patel" },
    { id: 103, slot: "09:30", dogName: "Poppy", breed: "Cocker Spaniel", size: "medium", service: "full-groom", owner: "Helen Wright" },
  ],
  wed: [],
  thu: [], fri: [], sat: [], sun: [],
};
